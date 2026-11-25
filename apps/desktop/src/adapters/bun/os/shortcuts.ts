// Global keyboard shortcuts, so the timer can be driven from any app.
// The keys come from the user's prefs; changing them unregisters the old ones first.
import { GlobalShortcut } from "electrobun/main";
import type { Command } from "../../../core/timer/engine";
import { type ShortcutKeys, commandFor, shortcutList } from "../../../core/settings/shortcuts";

let registered: string[] = []; // the keys this app holds right now

// Register every shortcut. Returns the keys that another app already holds.
export function registerShortcuts(keys: ShortcutKeys, run: (command: Command) => void): string[] {
	unregisterShortcuts();
	const failed: string[] = [];
	for (const { keys: accel, command } of shortcutList(keys)) {
		if (GlobalShortcut.register(accel, () => run(commandFor(command)))) registered.push(accel);
		else failed.push(accel);
	}
	return failed;
}

// Remove every shortcut this app registered.
export function unregisterShortcuts() {
	for (const accel of registered) GlobalShortcut.unregister(accel);
	registered = [];
}
