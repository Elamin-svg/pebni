import { expect, test } from "bun:test";
import { DEFAULT_RULE } from "./rule";
import * as timer from "./timer";
import { createEngine } from "./engine";
import { trayLabel } from "../atmosphere/tray-label";
import { SHORTCUTS, keyCaps } from "../settings/shortcuts";
import { cleanPrefs, DEFAULT_PREFS } from "../settings/prefs";
import { inputSince } from "./first-input";
import { formatMinutes } from "../analytics/format";

const rule = DEFAULT_RULE; // 20 min work, 20 s rest
const MIN = 60_000;

// Shorthand: the snapshot of a state at a time.
const snap = (s: timer.TimerState, now: number) => timer.snapshot(s, now);

test("waiting for input holds in ready, then the first input starts the round", () => {
	let s = timer.waitForInput(timer.createTimer(rule));
	expect(snap(s, 0)).toMatchObject({ mode: "ready", waiting: true });
	s = timer.tick(s, 60 * MIN);
	expect(s.mode).toBe("ready"); // time passing alone does not start it
	s = timer.noticeInput(s, 60 * MIN);
	expect(snap(s, 60 * MIN)).toMatchObject({ mode: "working", waiting: false, leftMs: 20 * MIN });
});

test("input does nothing when not waiting", () => {
	const ready = timer.createTimer(rule);
	expect(timer.noticeInput(ready, 0)).toBe(ready);
	const paused = timer.pause(timer.start(ready, 0), MIN);
	expect(timer.noticeInput(paused, 2 * MIN).mode).toBe("paused");
});

test("waiting only applies while ready, and starting by hand clears it", () => {
	const working = timer.start(timer.createTimer(rule), 0);
	expect(timer.waitForInput(working).waiting).toBe(false);
	const started = timer.start(timer.waitForInput(timer.createTimer(rule)), 0);
	expect(started.waiting).toBe(false);
});

test("a new rule while waiting keeps waiting", () => {
	const s = timer.setRule(timer.waitForInput(timer.createTimer(rule)), { ...rule, workMin: 30 });
	expect(snap(s, 0)).toMatchObject({ waiting: true, leftMs: 30 * MIN });
});

test("the engine waits and starts on input", () => {
	let t = 0;
	const engine = createEngine(rule, () => {}, () => t);
	engine.waitForInput();
	expect(engine.snapshot().waiting).toBe(true);
	t = 5000;
	engine.noticeInput();
	expect(engine.snapshot()).toMatchObject({ mode: "working", leftMs: 20 * MIN });
	engine.stop();
});

test("input counts only when it came after the moment we started waiting", () => {
	expect(inputSince(1000, 5000, 4500)).toBe(false); // last input at 500, before 1000
	expect(inputSince(1000, 5000, 200)).toBe(true); // last input at 4800
});

test("tray label shows minutes, then seconds in the last minute", () => {
	const working = timer.start(timer.createTimer(rule), 0);
	expect(trayLabel(snap(working, 0))).toBe("Break in 20 min");
	expect(trayLabel(snap(working, 5 * MIN + 1))).toBe("Break in 15 min");
	expect(trayLabel(snap(working, 19 * MIN))).toBe("Break in 1:00");
	expect(trayLabel(snap(working, 19 * MIN + 18_000))).toBe("Break in 0:42");
});

test("tray label for the other modes", () => {
	const ready = timer.createTimer(rule);
	expect(trayLabel(snap(ready, 0))).toBe("Ready");
	expect(trayLabel(snap(timer.waitForInput(ready), 0))).toBe("Starts when you type");
	const paused = timer.pause(timer.start(ready, 0), 6 * MIN);
	expect(trayLabel(snap(paused, 6 * MIN))).toBe("Paused · 14 min left");
	const onBreak = timer.beginBreak(ready, 0);
	expect(trayLabel(snap(onBreak, 5000))).toBe("Eye break · 0:15");
});

test("formatMinutes rounds up", () => {
	expect(formatMinutes(14 * MIN)).toBe("14 min");
	expect(formatMinutes(14 * MIN + 1)).toBe("15 min");
});

test("default shortcuts map to toggle, break now and skip", () => {
	const map = Object.fromEntries(SHORTCUTS.map((s) => [s.keys, s.command]));
	expect(map).toEqual({
		"Control+Alt+P": "toggle",
		"Control+Alt+B": "breakNow",
		"Control+Alt+S": "skip",
	});
	expect(keyCaps("Control+Alt+P")).toEqual(["Ctrl", "Alt", "P"]);
});

test("cleanPrefs keeps booleans and fills in defaults", () => {
	expect(cleanPrefs()).toEqual(DEFAULT_PREFS);
	expect(cleanPrefs({ startAtLogin: true })).toEqual({ ...DEFAULT_PREFS, startAtLogin: true });
	expect(cleanPrefs({ shortcutsOn: "no" as unknown as boolean }).shortcutsOn).toBe(true);
});

test("theme is dark by default and only takes known values", () => {
	expect(cleanPrefs().theme).toBe("dark");
	expect(cleanPrefs({ theme: "light" }).theme).toBe("light");
	expect(cleanPrefs({ theme: "system" }).theme).toBe("system");
	expect(cleanPrefs({ theme: "pink" as never }).theme).toBe("dark");
});
