// Native Electrobun auto-updater adapter: checks GitHub Releases silently on startup & every 6 hours,
// downloads delta/full bundles automatically when available, and applies updates transactionally on restart.
import { Updater } from "electrobun/main";
import type { AppUpdateState } from "../../../core/settings/app-update";

const STARTUP_DELAY_MS = 10_000;
const CHECK_EVERY_MS = 6 * 60 * 60_000;

let state: AppUpdateState = { status: "idle", currentVersion: "0.1.2" };
let listener: ((next: AppUpdateState) => void) | undefined;
let beforeApply: (() => void) | undefined;
let startupTimer: ReturnType<typeof setTimeout> | undefined;
let periodicTimer: ReturnType<typeof setInterval> | undefined;

// Publish a new update state to the main window and tray menu.
function setState(next: AppUpdateState) {
	state = next;
	listener?.(state);
}

// Current update state snapshot for new windows or tray menus.
export function currentUpdateState(): AppUpdateState {
	return state;
}

// Read the packaged version/channel safely (dev mode may not have a remote baseUrl).
async function readLocalInfo() {
	try {
		return await Updater.getLocalInfo();
	} catch {
		return null;
	}
}

// Check for a newer release and download it in the background when available.
export async function checkAndDownloadUpdate(silent = false): Promise<AppUpdateState> {
	const local = await readLocalInfo();
	const currentVersion = local?.version || state.currentVersion;
	if (!local || local.channel === "dev" || !local.baseUrl) {
		const next: AppUpdateState = {
			status: "up-to-date",
			currentVersion,
			message: "Automatic updates run in packaged releases.",
		};
		if (!silent) setState(next);
		return next;
	}

	setState({ status: "checking", currentVersion });
	try {
		const info = await Updater.checkForUpdate();
		if (info.error) {
			const next: AppUpdateState = {
				status: silent ? "idle" : "error",
				currentVersion,
				message: info.error,
			};
			setState(next);
			return next;
		}
		if (!info.updateAvailable) {
			const next: AppUpdateState = { status: "up-to-date", currentVersion };
			setState(next);
			return next;
		}

		const latestVersion = info.version || undefined;
		setState({ status: "downloading", currentVersion, latestVersion });
		await Updater.downloadUpdate();
		const ready = Updater.updateInfo();
		if (ready.updateReady) {
			const next: AppUpdateState = { status: "ready", currentVersion, latestVersion: ready.version || latestVersion };
			setState(next);
			return next;
		}
		const next: AppUpdateState = {
			status: silent ? "idle" : "error",
			currentVersion,
			latestVersion,
			message: ready.error || "Update download did not complete.",
		};
		setState(next);
		return next;
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		const next: AppUpdateState = { status: silent ? "idle" : "error", currentVersion, message: msg };
		setState(next);
		return next;
	}
}

// Apply a downloaded update: cleanly release OS hooks, allow window close, and let Electrobun relaunch.
export async function installPendingUpdate(): Promise<void> {
	if (state.status !== "ready" && !Updater.updateInfo().updateReady) return;
	beforeApply?.();
	await Updater.applyUpdate();
}

// Start silent background update checks once the app has settled.
export function startUpdater(onChange: (next: AppUpdateState) => void, onBeforeApply: () => void) {
	listener = onChange;
	beforeApply = onBeforeApply;
	void readLocalInfo().then((local) => {
		if (local?.version) setState({ ...state, currentVersion: local.version });
	});
	startupTimer = setTimeout(() => void checkAndDownloadUpdate(true), STARTUP_DELAY_MS);
	periodicTimer = setInterval(() => void checkAndDownloadUpdate(true), CHECK_EVERY_MS);
	return () => {
		if (startupTimer) clearTimeout(startupTimer);
		if (periodicTimer) clearInterval(periodicTimer);
	};
}
