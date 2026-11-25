// The tray icon: shows the countdown and offers the main actions in its menu.
import { Tray, type MenuItemConfig } from "electrobun/main";
import type { Snapshot } from "../../../core/timer/timer";
import { trayLabel } from "../../../core/atmosphere/tray-label";
import { dndLine } from "../../../core/atmosphere/hold-copy";
import type { AppUpdateState } from "../../../core/settings/app-update";

// What the menu can ask the app to do.
export type TrayAction =
	| "toggle" | "breakNow" | "skip" | "hideBreak" | "showBreak"
	| "show" | "quit" | "dnd30" | "dnd60" | "dndOn" | "dndOff"
	| "checkUpdate" | "applyUpdate";

// Windows needs an .ico file; on macOS the title text alone shows in the menu bar.
const ICON = process.platform === "win32" ? "views://tray.ico" : "";

// The menu for the current state. "Start" becomes "Pause" while working.
function menuFor(snap: Snapshot, appUpdate?: AppUpdateState): MenuItemConfig[] {
	const toggle = { ready: "Start coding", working: "Pause", paused: "Resume", break: "Pause" }[snap.mode];
	const breakToggle: MenuItemConfig[] = snap.canHideBreak
		? [snap.breakHidden
			? { type: "normal", label: "Show break screen", action: "showBreak" }
			: { type: "normal", label: "Close break window (keep timer)", action: "hideBreak" }]
		: [];
	const updateItem: MenuItemConfig =
		appUpdate?.status === "ready"
			? {
				type: "normal",
				label: appUpdate.latestVersion ? `Restart to update (v${appUpdate.latestVersion})` : "Restart to update",
				action: "applyUpdate",
			}
			: {
				type: "normal",
				label: appUpdate?.status === "checking" ? "Checking for updates…" : "Check for updates",
				action: "checkUpdate",
				enabled: appUpdate?.status !== "checking" && appUpdate?.status !== "downloading",
			};
	return [
		{ type: "normal", label: toggle, action: "toggle", enabled: snap.mode !== "break" },
		{ type: "normal", label: "Take a break now", action: "breakNow", enabled: snap.mode !== "break" },
		...breakToggle,
		{ type: "normal", label: "Skip break", action: "skip", enabled: snap.mode === "break" && !snap.rule.strict },
		{ type: "divider" },
		...dndMenu(snap),
		{ type: "divider" },
		updateItem,
		{ type: "normal", label: "Show window", action: "show" },
		{ type: "normal", label: "Quit Pebni", action: "quit" },
	];
}

// Do Not Disturb: the three choices while it is off, a way out (with the time left) while on.
function dndMenu(snap: Snapshot): MenuItemConfig[] {
	if (snap.dnd.on) {
		return [
			{ type: "normal", label: dndLine(snap.dnd), enabled: false },
			{ type: "normal", label: "Turn off Do Not Disturb", action: "dndOff" },
		];
	}
	const submenu: MenuItemConfig[] = [
		{ type: "normal", label: "For 30 minutes", action: "dnd30" },
		{ type: "normal", label: "For 1 hour", action: "dnd60" },
		{ type: "normal", label: "Until I turn it off", action: "dndOn" },
	];
	return [{ type: "normal", label: "Do Not Disturb", submenu }];
}

// Create the tray. Clicking the icon itself (no menu item) shows the window.
export function createTray(onAction: (action: TrayAction) => void) {
	const tray = new Tray({ title: "Pebni", image: ICON, template: false, width: 16, height: 16 });
	let label = "";
	let menuKey = "";
	let lastSnap: Snapshot | undefined;
	let lastUpdate: AppUpdateState | undefined;

	tray.on("tray-clicked", (event) => {
		const action = (event as { data?: { action?: string } }).data?.action;
		onAction((action || "show") as TrayAction);
	});

	// Redraw only what changed: the label (once a minute, or a second near the end)
	// and the menu (when the mode, break visibility, Do Not Disturb or update state changes).
	function refreshMenu(snap: Snapshot) {
		const key = `${snap.mode} ${snap.canHideBreak} ${snap.breakHidden} ${dndLine(snap.dnd)} ${lastUpdate?.status ?? ""} ${lastUpdate?.latestVersion ?? ""}`;
		if (key !== menuKey) {
			menuKey = key;
			tray.setMenu(menuFor(snap, lastUpdate));
		}
	}

	function update(snap: Snapshot) {
		lastSnap = snap;
		const next = trayLabel(snap);
		if (next !== label) tray.setTitle((label = next));
		refreshMenu(snap);
	}

	function setAppUpdate(next: AppUpdateState) {
		lastUpdate = next;
		if (lastSnap) refreshMenu(lastSnap);
	}

	return { update, setAppUpdate, remove: () => tray.remove() };
}
