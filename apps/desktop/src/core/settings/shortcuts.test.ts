import { expect, test } from "bun:test";
import {
	DEFAULT_SHORTCUTS, acceleratorFor, actionUsing, cleanShortcuts, isAccelerator, shortcutList,
} from "./shortcuts";
import { cleanPrefs } from "./prefs";

const press = (code: string, mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean }> = {}) => ({
	code, ctrl: false, alt: false, shift: false, ...mods,
});

test("a key press with Ctrl or Alt and a letter, digit or F-key becomes a shortcut", () => {
	expect(acceleratorFor(press("KeyK", { ctrl: true, alt: true }))).toBe("Control+Alt+K");
	expect(acceleratorFor(press("Digit5", { ctrl: true, shift: true }))).toBe("Control+Shift+5");
	expect(acceleratorFor(press("F9", { alt: true }))).toBe("Alt+F9");
});

test("presses that would get in the way of typing are refused", () => {
	expect(acceleratorFor(press("KeyK"))).toBeUndefined(); // no modifier
	expect(acceleratorFor(press("KeyK", { shift: true }))).toBeUndefined(); // Shift alone types capitals
	expect(acceleratorFor(press("Space", { ctrl: true }))).toBeUndefined(); // not a supported key
	expect(acceleratorFor(press("F13", { ctrl: true }))).toBeUndefined();
});

test("saved keys are checked: broken or duplicated ones fall back to the defaults", () => {
	expect(isAccelerator("Control+Alt+K")).toBe(true);
	expect(isAccelerator("Alt+Control+K")).toBe(false); // not in our order
	expect(isAccelerator("K")).toBe(false);
	expect(cleanShortcuts({ toggle: "Control+Alt+K" })).toEqual({ ...DEFAULT_SHORTCUTS, toggle: "Control+Alt+K" });
	expect(cleanShortcuts({ toggle: "nonsense" as string })).toEqual(DEFAULT_SHORTCUTS);
	const twice = cleanShortcuts({ toggle: "Control+Alt+K", breakNow: "Control+Alt+K" });
	expect(twice.toggle).toBe("Control+Alt+K");
	expect(twice.breakNow).toBe(DEFAULT_SHORTCUTS.breakNow);
});

test("the action already using some keys is found, so the window can say so", () => {
	expect(actionUsing("Control+Alt+S", DEFAULT_SHORTCUTS, "toggle")?.label).toBe("Skip the break");
	expect(actionUsing("Control+Alt+P", DEFAULT_SHORTCUTS, "toggle")).toBeUndefined();
});

test("prefs carry the user's keys, and the list follows them", () => {
	expect(cleanPrefs().shortcuts).toEqual(DEFAULT_SHORTCUTS);
	const prefs = cleanPrefs({ shortcuts: { ...DEFAULT_SHORTCUTS, breakNow: "Control+Alt+9" } });
	expect(shortcutList(prefs.shortcuts).map((s) => s.keys)).toEqual([
		"Control+Alt+P", "Control+Alt+9", "Control+Alt+S",
	]);
});
