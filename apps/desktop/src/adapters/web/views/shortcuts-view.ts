// The shortcut list in "In the background": click a shortcut, press the new keys, done.
// Escape or clicking elsewhere cancels. The rules for valid keys live in core/shortcuts.ts.
import type { Bridge } from "../../../ports/bridge";
import type { PrefsView } from "../../../core/settings/prefs";
import {
	DEFAULT_SHORTCUTS, SHORTCUT_ACTIONS, type ShortcutAction, type ShortcutKeys,
	acceleratorFor, actionUsing, keyCaps,
} from "../../../core/settings/shortcuts";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const MODIFIER_KEYS = ["Control", "Alt", "Shift", "Meta"];
const IDLE_HINT = "Select a shortcut to change it.";

export function createShortcutsView(bridge: Bridge, onPrefs: (prefs: PrefsView) => void) {
	const list = $<HTMLUListElement>("shortcut-list");
	const hint = $("shortcut-hint");
	const restore = $<HTMLButtonElement>("shortcut-restore");
	let prefs: PrefsView | undefined;
	let recording: ShortcutAction | undefined;

	// One row per action, built once so the focused button survives every redraw.
	const rows = SHORTCUT_ACTIONS.map(({ action, label }) => {
		const row = document.createElement("li");
		const name = document.createElement("span");
		const button = document.createElement("button");
		button.type = "button";
		button.className = "shortcut-keys";
		button.onclick = () => (recording === action ? stop(IDLE_HINT) : start(action));
		button.onkeydown = (e) => onKey(e, action, label);
		button.onblur = () => recording === action && stop(IDLE_HINT);
		row.append(name, button);
		list.append(row);
		return { action, label, row, name, button };
	});

	// Save new keys; the answer says what applied (and which keys another app holds).
	function save(keys: ShortcutKeys, message: string) {
		recording = undefined;
		hint.textContent = message;
		bridge.setPrefs({ shortcuts: keys }).then(onPrefs);
	}

	function start(action: ShortcutAction) {
		recording = action;
		hint.textContent = "Press the new keys, for example Ctrl + Alt + P. Press Escape to cancel.";
		draw();
	}

	function stop(message: string) {
		recording = undefined;
		hint.textContent = message;
		draw();
	}

	// While recording, every key press is a candidate; plain modifiers wait for the main key.
	function onKey(e: KeyboardEvent, action: ShortcutAction, label: string) {
		if (recording !== action || !prefs) return;
		if (e.key === "Tab") return stop(IDLE_HINT); // leave the keyboard path open
		e.preventDefault();
		if (e.key === "Escape") return stop("Shortcut unchanged.");
		if (MODIFIER_KEYS.includes(e.key)) return;
		const keys = acceleratorFor({ code: e.code, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey });
		if (!keys) {
			hint.textContent = "Use Ctrl or Alt together with a letter, a number or F1 to F12.";
			return;
		}
		const other = actionUsing(keys, prefs.shortcuts, action);
		if (other) {
			hint.textContent = `${keyCaps(keys).join(" + ")} is already used for "${other.label}". Try other keys.`;
			return;
		}
		save({ ...prefs.shortcuts, [action]: keys }, `${label}: ${keyCaps(keys).join(" + ")}.`);
	}

	restore.onclick = () => save({ ...DEFAULT_SHORTCUTS }, "Default shortcuts restored.");

	// Key caps for each row, "Press keys" on the one being recorded.
	function draw() {
		if (!prefs) return;
		for (const r of rows) {
			const keys = prefs.shortcuts[r.action];
			const taken = prefs.taken.includes(keys);
			r.name.textContent = taken ? `${r.label} (used by another app)` : r.label;
			r.row.classList.toggle("taken", taken);
			const caps = keyCaps(keys);
			const active = recording === r.action;
			r.button.classList.toggle("recording", active);
			r.button.setAttribute("aria-label", active
				? `Press new keys for ${r.label}`
				: `Change shortcut for ${r.label}, now ${caps.join(" ")}`);
			r.button.replaceChildren(...(active ? [text("Press keys")] : caps.map(kbd)));
		}
		const isDefault = SHORTCUT_ACTIONS.every(({ action }) => prefs!.shortcuts[action] === DEFAULT_SHORTCUTS[action]);
		restore.hidden = isDefault;
		list.classList.toggle("off", !prefs.shortcutsOn);
	}

	if (!hint.textContent) hint.textContent = IDLE_HINT;

	return function render(next: PrefsView) {
		prefs = next;
		draw();
	};
}

// A key cap.
function kbd(cap: string): HTMLElement {
	const el = document.createElement("kbd");
	el.className = "kbd kbd-sm";
	el.textContent = cap;
	return el;
}

// Plain text inside the button while recording.
function text(value: string): HTMLElement {
	const el = document.createElement("span");
	el.textContent = value;
	return el;
}
