// The global keyboard shortcuts: which action each one runs, and the keys the user picked.
// Keys are accelerators as Electrobun's GlobalShortcut expects them, for example "Control+Alt+P".
import type { Command } from "../timer/engine";

export type ShortcutAction = "toggle" | "breakNow" | "skip";
export type ShortcutKeys = Record<ShortcutAction, string>;

export type Shortcut = {
	keys: string; // accelerator
	command: ShortcutAction;
	label: string; // what it does, for the settings list
};

export const DEFAULT_SHORTCUTS: ShortcutKeys = {
	toggle: "Control+Alt+P",
	breakNow: "Control+Alt+B",
	skip: "Control+Alt+S",
};

// Each action with its label, in the order the settings list shows them.
export const SHORTCUT_ACTIONS: { action: ShortcutAction; label: string }[] = [
	{ action: "toggle", label: "Start or pause" },
	{ action: "breakNow", label: "Take a break now" },
	{ action: "skip", label: "Skip the break" },
];

// The shortcuts with the user's keys, as a list.
export function shortcutList(keys: ShortcutKeys = DEFAULT_SHORTCUTS): Shortcut[] {
	return SHORTCUT_ACTIONS.map(({ action, label }) => ({ keys: keys[action], command: action, label }));
}

// The default shortcuts (kept for callers that do not need the user's keys).
export const SHORTCUTS: Shortcut[] = shortcutList();

// A key press, as the window sees it (KeyboardEvent.code and the modifiers).
export type KeyPress = { code: string; ctrl: boolean; alt: boolean; shift: boolean };

// The main key from KeyboardEvent.code: letters, digits and F1 to F12. Undefined for others.
function mainKey(code: string): string | undefined {
	if (/^Key[A-Z]$/.test(code)) return code.slice(3);
	if (/^Digit[0-9]$/.test(code)) return code.slice(5);
	if (/^F([1-9]|1[0-2])$/.test(code)) return code;
	return undefined;
}

// The accelerator for a key press, or undefined when it cannot be a global shortcut:
// it needs Ctrl or Alt (so normal typing never triggers it) and a letter, digit or F-key.
export function acceleratorFor(press: KeyPress): string | undefined {
	const key = mainKey(press.code);
	if (!key || !(press.ctrl || press.alt)) return undefined;
	const mods = [press.ctrl && "Control", press.alt && "Alt", press.shift && "Shift"].filter(Boolean);
	return [...mods, key].join("+");
}

// Is the text an accelerator we could have made ourselves?
export function isAccelerator(keys: unknown): keys is string {
	if (typeof keys !== "string") return false;
	const parts = keys.split("+");
	const key = parts.pop() ?? "";
	const code = /^[A-Z]$/.test(key) ? `Key${key}` : /^[0-9]$/.test(key) ? `Digit${key}` : key;
	const press = {
		code, ctrl: parts.includes("Control"), alt: parts.includes("Alt"), shift: parts.includes("Shift"),
	};
	return acceleratorFor(press) === keys;
}

// Turn any (possibly partial or broken) input into valid keys. A broken or duplicated
// entry falls back to its default, or another unused default if that one was taken.
export function cleanShortcuts(input?: Partial<ShortcutKeys> | null): ShortcutKeys {
	const src = input && typeof input === "object" ? input : {};
	const out = { ...DEFAULT_SHORTCUTS };
	const used = new Set<string>();
	const defaults = SHORTCUT_ACTIONS.map(({ action }) => DEFAULT_SHORTCUTS[action]);
	for (const { action } of SHORTCUT_ACTIONS) {
		const wanted = src[action];
		const fallback = used.has(DEFAULT_SHORTCUTS[action])
			? defaults.find((d) => !used.has(d))!
			: DEFAULT_SHORTCUTS[action];
		out[action] = isAccelerator(wanted) && !used.has(wanted) ? wanted : fallback;
		used.add(out[action]);
	}
	return out;
}

// The action that already uses these keys, if any (other than `except`).
export function actionUsing(keys: string, all: ShortcutKeys, except?: ShortcutAction) {
	return SHORTCUT_ACTIONS.find(({ action }) => action !== except && all[action] === keys);
}

// "Control+Alt+P" -> ["Ctrl", "Alt", "P"], for showing as key caps.
export function keyCaps(keys: string): string[] {
	return keys.split("+").map((k) => (k === "Control" ? "Ctrl" : k));
}

// The command a shortcut action runs (they share their names).
export const commandFor = (action: ShortcutAction): Command => action;
