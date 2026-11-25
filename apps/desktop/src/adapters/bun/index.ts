// Entry point of the Bun process: wires the engine, the windows, the tray,
// the shortcuts, start at login, settings and today's break stats together.
import { BrowserView, Utils, type BrowserWindow } from "electrobun/main";
import type { PebniRPC } from "../../ports/rpc";
import { createEngine } from "../../core/timer/engine";
import { cleanRule } from "../../core/timer/rule";
import { cleanPrefs, type Prefs, type PrefsView } from "../../core/settings/prefs";
import { inputSince } from "../../core/timer/first-input";
import { loadHistory, loadPrefs, loadRule, loadStats, saveHistory, savePrefs, saveRule, saveStats } from "./storage/settings";
import { allowClose, createMainWindow, setBreakMode, showWindow } from "./ui/window";
import { createNoticeWindow, setNoticeShown } from "./ui/notice";
import { runningProcesses } from "./os/processes";
import { libraryRecordings, startLibrary } from "./storage/library";
import { pickListening, rememberHeard, shouldMuteBackgroundApps } from "../../core/audio/break-audio";
import { STORIES } from "../../core/audio/story-list";
import { createTray, type TrayAction } from "./ui/tray";
import { registerShortcuts, unregisterShortcuts } from "./os/shortcuts";
import type { ShortcutKeys } from "../../core/settings/shortcuts";
import { isLoginEnabled, launchedAtLogin, setLoginEnabled } from "./os/login";
import { getIdleMs } from "./os/idle";
import { closeBreakScreens, openBreakScreens, sendToBreakScreens } from "./ui/screens";
import { memoryMb, watchMemory } from "./os/usage";
import { watchActivity } from "./os/activity";
import { scheduleTestBreak } from "./storage/test-hooks";
import { useOwnTaskbarIdentity } from "./os/app-icon";
import { restoreBackgroundAudioSync, setBackgroundAudioMuted } from "./os/system-audio";
import { checkAndDownloadUpdate, currentUpdateState, installPendingUpdate, startUpdater } from "./os/updater";

useOwnTaskbarIdentity(); // before any window opens, so the taskbar shows Pebni, not Bun

// Requests coming from a window. Each window gets its own RPC link with the same handlers.
function createRpc() {
	return BrowserView.defineRPC<PebniRPC>({
		handlers: {
			requests: {
				command: ({ command }) => engine.run(command),
				setRule: ({ rule }) => {
					const clean = cleanRule(rule);
					saveRule(clean);
					engine.setRule(clean);
				},
				getState: () => engine.snapshot(),
				getUsage: () => ({ memoryMb: memoryMb() }),
				getPrefs: () => currentPrefs(),
				setPrefs: ({ prefs }) => applyPrefs(prefs),
				getRunningApps: () => ({ names: runningProcesses() }),
				pickRecording: ({ seconds }) => pickForBreak(seconds),
				getUpdateState: () => currentUpdateState(),
				checkForUpdate: () => checkAndDownloadUpdate(false),
				applyUpdate: () => installPendingUpdate(),
			},
			messages: {},
		},
	});
}

const rpc = createRpc(); // the main window
const noticeRpc = createRpc(); // the "Break in 30s" notice

// Set once the windows exist (the engine may tick before that).
let win: BrowserWindow | undefined;
let notice: BrowserWindow | undefined;

// Tray menu actions
const tray = createTray((action: TrayAction) => {
	if (action === "show") return win && showWindow(win);
	if (action === "quit") return quit();
	if (action === "checkUpdate") return void checkAndDownloadUpdate(false);
	if (action === "applyUpdate") return void installPendingUpdate();
	engine.run(action);
});

// The timer lives here, so it keeps running when the window is hidden.
// It gets the OS idle time on every tick, so a due break can wait for a pause in typing.
// Today's stats are loaded at launch and saved whenever they change.
const startStats = loadStats();
const startHistory = loadHistory();
let covering = false; // true while the fullscreen break overlay is covering the display(s)

// Keep OS-level background app muting aligned with the current break state and user preferences.
function syncBackgroundAudioMute(snap: ReturnType<typeof engine.snapshot>, prefs = loadPrefs()) {
	setBackgroundAudioMuted(
		shouldMuteBackgroundApps({
			onBreak: snap.mode === "break",
			breakHidden: snap.breakHidden,
			kind: snap.kind,
			muteOtherAudio: prefs.muteOtherAudio,
			muteOtherAudioShort: prefs.muteOtherAudioShort,
			muteOtherAudioLong: prefs.muteOtherAudioLong,
		}),
	);
}

const engine = createEngine(
	loadRule(),
	(snap) => {
		tray.update(snap);
		saveStats(snap.stats);
		saveHistory(engine.history());
		syncBackgroundAudioMute(snap);
		if (notice) {
			noticeRpc.send.state(snap);
			setNoticeShown(notice, snap.notice); // 30 s before the break, for 10 s or until closed
		}
		if (!win) return;
		rpc.send.state(snap);

		// Entering, hiding or leaving the fullscreen break overlay across all monitors.
		// Long breaks can be closed/hidden to watch YouTube etc. without ever logging out the PC.
		const cover = snap.mode === "break" && !snap.breakHidden;
		if (cover !== covering) {
			covering = cover;
			const hidingLongBreak = !cover && snap.mode === "break" && snap.breakHidden;
			setBreakMode(win, cover, hidingLongBreak);
			if (cover) void openBreakScreens(win, createRpc);
			else closeBreakScreens();
		}
		sendToBreakScreens(snap);
	},
	Date.now,
	getIdleMs,
	startStats,
	startHistory,
);

// The quiet memory line in the timer window, updated when the number of MB changes.
const memory = watchMemory((memoryMb) => rpc.send.usage({ memoryMb }));

// A focus app running or a fullscreen app in front holds a due break back (see core/hold.ts).
const stopActivity = watchActivity(() => loadPrefs().focusApps, engine.setActivity);

// Background auto-updater: checks GitHub Releases silently and prepares updates in the background.
const stopUpdater = startUpdater(
	(next) => {
		tray.setAppUpdate(next);
		if (win) rpc.send.appUpdate(next);
	},
	() => {
		restoreBackgroundAudioSync();
		allowClose();
		unregisterShortcuts();
		tray.remove();
	},
);

// Quit for real: restore any muted background apps, drop the tray, stop the timer.
function quit() {
	stopUpdater();
	restoreBackgroundAudioSync();
	allowClose();
	unregisterShortcuts();
	tray.remove();
	engine.stop();
	memory.stop();
	stopActivity();
	closeBreakScreens();
	Utils.quit();
}

// Shortcuts that another app already holds (empty while shortcuts are off).
let taken: string[] = [];

// Prefs as they are now. Start at login comes from the OS, so it is always true to it.
function currentPrefs(): PrefsView {
	return { ...loadPrefs(), startAtLogin: isLoginEnabled(), taken };
}

// Apply a change from the settings area, save it, and answer with the result.
function applyPrefs(change: Partial<Prefs>): PrefsView {
	const next = cleanPrefs({ ...currentPrefs(), ...change });
	if (change.startAtLogin !== undefined) next.startAtLogin = setLoginEnabled(next.startAtLogin);
	if (change.shortcutsOn !== undefined || change.shortcuts !== undefined) {
		useShortcuts(next.shortcutsOn, next.shortcuts);
	}
	savePrefs(next);
	syncBackgroundAudioMute(engine.snapshot(), next);
	return { ...next, taken };
}

// A recording for this break that has not been heard lately; remembered as heard.
function pickForBreak(seconds: number) {
	const prefs = loadPrefs();
	const pick = pickListening(STORIES, libraryRecordings(), seconds, prefs.heard, Math.random());
	if (pick) savePrefs({ ...prefs, heard: rememberHeard(prefs.heard, pick.id) });
	return pick;
}

// Turn the global shortcuts on or off, with the user's keys.
function useShortcuts(on: boolean, keys: ShortcutKeys) {
	if (!on) {
		unregisterShortcuts();
		taken = [];
		return;
	}
	taken = registerShortcuts(keys, (command) => engine.run(command));
	if (taken.length) console.warn("Shortcuts held by another app:", taken.join(", "));
}

// Launched at login: wait in "ready" until the user first touches the keyboard or mouse.
function waitForFirstInput() {
	const since = Date.now();
	console.log("Launched at login: waiting for the first keypress or mouse move");
	engine.waitForInput();
	const poll = setInterval(() => {
		if (!engine.snapshot().waiting) return clearInterval(poll); // started by hand
		if (inputSince(since, Date.now(), getIdleMs())) {
			console.log("First input after login: starting the timer");
			engine.noticeInput();
			clearInterval(poll);
		}
	}, 1000);
}

useShortcuts(loadPrefs().shortcutsOn, loadPrefs().shortcuts);
startLibrary(); // the audiobook list, fetched in the background when it is old
const atLogin = launchedAtLogin();
if (atLogin) waitForFirstInput();

// At login the app starts quietly in the tray; otherwise the window opens.
win = await createMainWindow(rpc, atLogin);
notice = await createNoticeWindow(noticeRpc);
scheduleTestBreak(engine.run);
