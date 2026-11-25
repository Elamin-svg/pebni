// The contract between the Bun process and the window.
// The window sends commands; Bun owns the timer and pushes its state back.
// Windows that use this contract: the main window, the small "Break in 30s" notice, and
// during a break one extra break screen per other monitor (the page opened with #screen).
// - Command includes "snooze" ("Snooze 2 min", see core/flow.ts) and "closeNotice" (the x on
//   the notice, see core/notice.ts). Snapshot carries notice: the notice window is on screen.
// - Snapshot carries warning, holding, snoozes, snoozesLeft and disappointed (see core/timer.ts).
// - Command includes "coffee" and "noCoffee", the answers to Pip's coffee offer (see core/breaks.ts).
// - Snapshot carries kind, copy and coffeeOffer for the break (coming or under way), and
//   today's stats (see core/snapshot.ts). Bun saves the stats with the settings.
// - Command includes "dnd30", "dnd60", "dndOn" and "dndOff" (Do Not Disturb, see core/hold.ts).
// - Snapshot carries held (why a due break waits: "call", "fullscreen", "dnd" or "none") and
//   dnd (on, and minutes left or null for "until turned off").
// - Prefs carry focusApps, the process names that hold breaks while they run (core/focus-apps.ts).
import type { Command } from "../core/timer/engine";
import type { Rule } from "../core/timer/rule";
import type { Prefs, PrefsView } from "../core/settings/prefs";
import type { AppUpdateState } from "../core/settings/app-update";
import type { Snapshot } from "../core/timer/timer";
import type { Recording } from "../core/audio/break-audio";

export type PebniRPC = {
	bun: {
		requests: {
			command: { params: { command: Command }; response: void };
			setRule: { params: { rule: Rule }; response: void };
			getState: { params: {}; response: Snapshot };
			// The memory line, at once when a window opens (after that it comes as "usage").
			getUsage: { params: {}; response: { memoryMb: number } };
			// Start at login and shortcuts. setPrefs answers with what actually applied.
			getPrefs: { params: {}; response: PrefsView };
			setPrefs: { params: { prefs: Partial<Prefs> }; response: PrefsView };
			// The programs running right now, to suggest as focus apps (process names).
			getRunningApps: { params: {}; response: { names: string[] } };
			// A poem or story that fits the seconds left in the break (null: none fits or no
			// library yet). Bun remembers it as heard. See core/break-audio.ts.
			pickRecording: { params: { seconds: number }; response: Recording | null };
			// Auto-updater controls (Electrobun Updater in main process).
			getUpdateState: { params: {}; response: AppUpdateState };
			checkForUpdate: { params: {}; response: AppUpdateState };
			applyUpdate: { params: {}; response: void };
		};
		messages: {};
	};
	webview: {
		requests: {};
		messages: {
			// Sent to every window when what the screens show changes: a new second, a new mode,
			// an answered offer (see core/updates.ts). Not on every 250 ms check.
			state: Snapshot;
			// The Bun process's memory in whole MB, for the quiet line in the timer window.
			// Sent to the main window when the number changes (checked every few seconds).
			usage: { memoryMb: number };
			// Sent to the main window when the desktop auto-updater changes state.
			appUpdate: AppUpdateState;
		};
	};
};
