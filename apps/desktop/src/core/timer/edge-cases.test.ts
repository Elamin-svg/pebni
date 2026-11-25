// Edge-case tests across the domain layer: guards, invalid inputs, state-machine boundaries,
// shortcut collisions, audio/library parsing, focus apps, formatting and full engine lifecycles.
import { expect, test } from "bun:test";
import { DEFAULT_RULE, cleanRule, workMs } from "./rule";
import { DEFAULT_PREFS, cleanPrefs } from "../settings/prefs";
import { DEFAULT_SHORTCUTS, SHORTCUT_ACTIONS, acceleratorFor, cleanShortcuts, isAccelerator } from "../settings/shortcuts";
import * as timer from "./timer";
import { createEngine } from "./engine";
import { BREAK_KINDS, LONG_BREAK_MS, breakLength, locksScreen } from "./breaks";
import { FLOW_AFTER_MS, FLOW_GAP_MS, FLOW_HOLD_CAP_MS, NO_STREAK, SNOOZE_MS, WARNING_MS, followStreak, inFlow } from "./flow";
import { DND_FOREVER, heldBy, noticeActivity, startDnd, stopDnd } from "./hold";
import { closeNotice, noticeShows } from "./notice";
import { NO_STATS, cleanStats, countEnded, countOffered } from "../analytics/stats";
import { formatClock, formatMinutes, formatSeconds } from "../analytics/format";
import { meditationPlan, pickListening, pickRecording, type Recording } from "../audio/break-audio";
import { cleanLibrary, parseLength, recordingsFrom } from "../audio/library";
import { appFromInput, appLabel, appSuggestions } from "../settings/app-names";
import { cleanAppName, cleanFocusApps, focusAppRunning } from "../settings/focus-apps";
import { breakScene } from "../atmosphere/scenes";
import { applyPreset, matchingPreset } from "./presets";

const SEC = 1000;
const MIN = 60_000;
const T0 = new Date(2026, 10, 25, 10, 0).getTime();

// --- Timer state machine guards ---

test("skipBreak and endBreak do nothing unless currently on a break", () => {
	const ready = timer.createTimer(DEFAULT_RULE);
	expect(timer.skipBreak(ready, T0)).toBe(ready);
	expect(timer.endBreak(ready, T0)).toBe(ready);

	const working = timer.start(ready, T0);
	expect(timer.skipBreak(working, T0 + 5 * MIN)).toBe(working);
	expect(timer.endBreak(working, T0 + 5 * MIN)).toBe(working);

	const paused = timer.pause(working, T0 + 5 * MIN);
	expect(timer.skipBreak(paused, T0 + 6 * MIN)).toBe(paused);
	expect(timer.endBreak(paused, T0 + 6 * MIN)).toBe(paused);
});

test("snooze is refused while held by DND, call or fullscreen, or when maxSnoozes is 0", () => {
	let s = timer.start(timer.createTimer(DEFAULT_RULE), T0);
	s = startDnd(s, T0, 30 * MIN);
	s = timer.tick(s, T0 + 20 * MIN); // held back to now + 30s
	expect(heldBy(s, T0 + 20 * MIN)).toBe("dnd");
	expect(timer.snooze(s, T0 + 20 * MIN)).toBe(s);

	let onCall = noticeActivity(timer.start(timer.createTimer(DEFAULT_RULE), T0), "call");
	onCall = timer.tick(onCall, T0 + 20 * MIN);
	expect(timer.snooze(onCall, T0 + 20 * MIN)).toBe(onCall);

	const noSnoozeRule = { ...DEFAULT_RULE, maxSnoozes: 0 };
	const nearBreak = timer.start(timer.createTimer(noSnoozeRule), T0);
	expect(timer.snooze(nearBreak, T0 + 19 * MIN + 40 * SEC)).toBe(nearBreak);
});

test("beginBreak does nothing if already on break, and ready->break does not increment inRow", () => {
	const ready = timer.createTimer(DEFAULT_RULE);
	const fromReady = timer.beginBreak(ready, T0);
	expect(fromReady.mode).toBe("break");
	expect(fromReady.inRow).toBe(0);
	// Calling beginBreak again while already on break is a no-op
	expect(timer.beginBreak(fromReady, T0 + 5 * SEC)).toBe(fromReady);
	expect(fromReady.stats.offered).toBe(1);
});

test("acceptCoffee and declineCoffee are no-ops outside an active coffee offer", () => {
	const working = timer.start(timer.createTimer(DEFAULT_RULE), T0);
	expect(timer.acceptCoffee(working, T0 + MIN)).toBe(working);
	expect(timer.declineCoffee(working)).toBe(working);

	const onShortBreak = timer.beginBreak(working, T0 + 20 * MIN);
	expect(onShortBreak.coffeeOffer).toBe(false);
	expect(timer.acceptCoffee(onShortBreak, T0 + 20 * MIN)).toBe(onShortBreak);
});

test("long and coffee breaks are never shorter than the user's configured short rest", () => {
	const longShortRest = { ...DEFAULT_RULE, restSec: 600 }; // 10 min short rest
	expect(breakLength("coffee", longShortRest)).toBe(600 * SEC);
	expect(breakLength("long", longShortRest)).toBe(600 * SEC);
	expect(breakLength("coffee", DEFAULT_RULE)).toBe(LONG_BREAK_MS);
});

test("locksScreen never locks the OS session on any break kind", () => {
	const lockWithLong = { ...DEFAULT_RULE, lockOnLong: true, longAfter: 3 };
	for (const kind of BREAK_KINDS) {
		expect(locksScreen(kind, lockWithLong)).toBe(false);
	}
});

test("closeNotice is ignored when not working, and snooze resets notice visibility", () => {
	const ready = timer.createTimer(DEFAULT_RULE);
	expect(closeNotice(ready)).toBe(ready);

	let s = timer.start(ready, T0);
	const warnAt = T0 + workMs(DEFAULT_RULE) - WARNING_MS + SEC;
	s = closeNotice(s);
	expect(noticeShows(s, true, WARNING_MS - SEC)).toBe(false);

	s = timer.snooze(s, warnAt);
	const nextWarn = s.endsAt - WARNING_MS + SEC;
	expect(timer.snapshot(s, nextWarn).notice).toBe(true);
});

// --- Cleaning & resilience against broken or null saved JSON ---

test("cleanRule, cleanPrefs, cleanStats and cleanShortcuts survive null and malformed values", () => {
	expect(cleanRule(null)).toEqual(DEFAULT_RULE);
	expect(cleanRule({
		workMin: Number.NaN,
		restSec: -999,
		feet: Infinity,
		maxSnoozes: 99,
		longAfter: -5,
		longMin: 0,
		focus: "invalid" as unknown as "eyes",
		flowGuard: "yes" as unknown as boolean,
		strict: 1 as unknown as boolean,
		lockOnLong: null as unknown as boolean,
	})).toEqual({
		workMin: DEFAULT_RULE.workMin,
		restSec: 5,
		feet: DEFAULT_RULE.feet,
		maxSnoozes: 3,
		longAfter: 0,
		longMin: 1,
		focus: "eyes",
		flowGuard: true,
		strict: false,
		lockOnLong: false,
		idleReset: true,
		idleResetMin: 3,
		customTitle: "",
		customNote: "",
	});

	expect(cleanPrefs(null)).toEqual(DEFAULT_PREFS);
	expect(cleanPrefs({
		theme: "neon" as unknown as "dark",
		audio: "podcast" as unknown as "off",
		heard: [123 as unknown as string, "ok"],
	}).heard).toEqual(["ok"]);

	expect(cleanStats(null)).toEqual(NO_STATS);
	expect(cleanStats({ offered: -5, taken: Number.NaN, skipped: Infinity })).toEqual(NO_STATS);
});

test("cleanShortcuts guarantees unique valid accelerators even when defaults collide", () => {
	expect(cleanShortcuts(null)).toEqual(DEFAULT_SHORTCUTS);

	// toggle steals breakNow's default, and breakNow duplicates it
	const collided = cleanShortcuts({
		toggle: DEFAULT_SHORTCUTS.breakNow,
		breakNow: DEFAULT_SHORTCUTS.breakNow,
		skip: "not-a-key",
	});
	const values = SHORTCUT_ACTIONS.map(({ action }) => collided[action]);
	expect(new Set(values).size).toBe(SHORTCUT_ACTIONS.length);
	for (const v of values) expect(isAccelerator(v)).toBe(true);

	// All three try to steal the same key
	const triple = cleanShortcuts({
		toggle: "Control+Alt+S",
		breakNow: "Control+Alt+S",
		skip: "Control+Alt+S",
	});
	const tripleValues = SHORTCUT_ACTIONS.map(({ action }) => triple[action]);
	expect(new Set(tripleValues).size).toBe(SHORTCUT_ACTIONS.length);
	expect(acceleratorFor({ code: "Space", ctrl: true, alt: false, shift: false })).toBeUndefined();
});

// --- Flow streak & clock jumps ---

test("followStreak resets on backward clock jumps and respects exact boundaries", () => {
	let streak = followStreak(NO_STREAK, T0, 500);
	expect(streak).toEqual({ since: T0, seen: T0 });

	// Clock jumps backward by 1 minute (NTP / DST)
	const jumped = followStreak(streak, T0 - MIN, 500);
	expect(jumped).toEqual({ since: T0 - MIN, seen: T0 - MIN });

	// Exact 30s quiet ends the streak
	expect(followStreak(streak, T0 + 10 * SEC, FLOW_GAP_MS)).toEqual(NO_STREAK);

	// Exact 10 min steady typing reaches flow
	expect(inFlow(T0, T0 + FLOW_AFTER_MS - 1)).toBe(false);
	expect(inFlow(T0, T0 + FLOW_AFTER_MS)).toBe(true);

	// Flow hold cap forces break at exactly 5 min overdue (with steady typing watched every 15s)
	let s = timer.start(timer.createTimer({ ...DEFAULT_RULE, workMin: 15 }), T0);
	for (let elapsed = 0; elapsed < 15 * MIN + FLOW_HOLD_CAP_MS; elapsed += 15 * SEC) {
		s = timer.tick(s, T0 + elapsed, 200);
	}
	expect(timer.snapshot(s, T0 + 15 * MIN + FLOW_HOLD_CAP_MS - SEC).flow).toBe(true);
	s = timer.tick(s, T0 + 15 * MIN + FLOW_HOLD_CAP_MS - SEC, 200);
	expect(s.mode).toBe("working"); // still waiting for pause
	s = timer.tick(s, T0 + 15 * MIN + FLOW_HOLD_CAP_MS, 200);
	expect(s.mode).toBe("break"); // forced at cap
});

// --- Formatting edge cases ---

test("format helpers handle zero, negative, non-finite and large durations safely", () => {
	expect(formatClock(0)).toBe("0:00");
	expect(formatClock(1)).toBe("0:01");
	expect(formatClock(-5000)).toBe("0:00");
	expect(formatClock(Number.NaN)).toBe("0:00");
	expect(formatClock(Infinity)).toBe("0:00");
	expect(formatClock(60 * MIN)).toBe("60:00");

	expect(formatMinutes(0)).toBe("0 min");
	expect(formatMinutes(1)).toBe("1 min");
	expect(formatMinutes(-100)).toBe("0 min");
	expect(formatMinutes(Number.NaN)).toBe("0 min");

	expect(formatSeconds(0)).toBe("0s");
	expect(formatSeconds(1)).toBe("1s");
	expect(formatSeconds(-50)).toBe("0s");
	expect(formatSeconds(Number.NaN)).toBe("0s");
});

// --- Audio, library & scene edge cases ---

test("pickRecording and meditationPlan handle boundary lengths and extreme roll values", () => {
	const rec: Recording = { id: "a", title: "Poem", author: "Author", collection: "Col", seconds: 30 };
	expect(pickRecording([rec], 34, [], -1)).toEqual(rec);
	expect(pickRecording([rec], 34, [], 1)).toEqual(rec);
	expect(pickRecording([rec], 34, [], Number.NaN)).toEqual(rec);
	expect(pickRecording([rec], 33, [], 0.5)).toBeNull(); // needs 4s slack
	expect(pickListening([], [], 600, [], 0.5)).toBeNull();

	expect(meditationPlan(20)).toEqual({ track: null, loop: true });
	expect(meditationPlan(184)).toEqual({ track: "meditation-3", loop: false });
	expect(meditationPlan(185)).toEqual({ track: "meditation-3", loop: true });
	expect(meditationPlan(605)).toEqual({ track: "meditation-10", loop: true });
});

test("parseLength and cleanLibrary reject malformed durations and unsafe URLs", () => {
	expect(parseLength("")).toBe(0);
	expect(parseLength(":30")).toBe(0);
	expect(parseLength("02:")).toBe(0);
	expect(parseLength("02:-5")).toBe(0);
	expect(parseLength("02:20.5")).toBe(141);
	expect(parseLength(" 140.4 ")).toBe(140);
	expect(parseLength(null)).toBe(0);

	const cleaned = cleanLibrary([
		null,
		{ id: "https://evil.example/a.mp3", title: "X", author: "Y", collection: "Z", seconds: 60 },
		{ id: "https://archive.org/download/col/a_64kb.mp3", title: "Good", author: "", collection: "C", seconds: 0 },
		{ id: "https://archive.org/download/col/b_64kb.mp3", title: "Good", author: "", collection: "C", seconds: 45 },
	]);
	expect(cleaned).toHaveLength(1);
	expect(cleaned[0]!.title).toBe("Good");

	expect(recordingsFrom({})).toEqual([]);
});

test("breakScene never returns undefined even on negative offered counts", () => {
	for (const part of ["morning", "day", "evening", "night"] as const) {
		expect(breakScene(part, -1)).toBeDefined();
		expect(breakScene(part, -100)).toBeDefined();
		expect(breakScene(part, 0)).toBeDefined();
	}
});

// --- Focus apps & presets ---

test("focus apps enforce length limits, illegal character filtering and 20-app cap", () => {
	expect(cleanAppName("   ")).toBe("");
	expect(cleanAppName("C:\\Program Files\\zoom.exe")).toBe("");
	expect(cleanAppName("a".repeat(61))).toBe("");
	expect(cleanAppName("  Slack.EXE  ")).toBe("slack.exe");

	const many = Array.from({ length: 30 }, (_, i) => `app${i}.exe`);
	expect(cleanFocusApps(many)).toHaveLength(20);
	expect(cleanFocusApps("not-an-array")).toEqual(["zoom.exe", "ms-teams.exe", "teams.exe"]);
	expect(focusAppRunning(["zoom.exe"], ["ZOOM.EXE"])).toBe(true);

	expect(appFromInput("  ZOOM  ", [])).toBe("zoom.exe");
	expect(appFromInput("figma", ["Figma.exe"])).toBe("figma.exe");
	expect(appLabel("my-tool.exe")).toBe("My-tool");
	expect(appSuggestions(["svchost.exe", "zoom.exe", "zoom.exe"], ["zoom.exe"])).toEqual([]);
});

test("presets round-trip cleanly and ignore unknown preset ids", () => {
	const pomo = applyPreset(DEFAULT_RULE, "pomodoro");
	expect(matchingPreset(pomo)).toBe("pomodoro");
	const unknown = applyPreset(DEFAULT_RULE, "nope" as unknown as "twenty");
	expect(unknown).toBe(DEFAULT_RULE);
});

// --- End-to-end engine lifecycle ---

test("full engine lifecycle: start, warning, snooze, break, coffee, skip, DND and reset", () => {
	let now = T0;
	const seen: timer.Snapshot[] = [];
	const engine = createEngine(DEFAULT_RULE, (snap) => seen.push(snap), () => now, () => Infinity);

	engine.run("toggle"); // ready -> working
	expect(engine.snapshot().mode).toBe("working");

	engine.run("toggle"); // working -> paused
	expect(engine.snapshot().mode).toBe("paused");

	engine.run("toggle"); // paused -> working
	expect(engine.snapshot().mode).toBe("working");

	// Pressing skip while working must NOT disturb the working session
	const beforeSkip = engine.snapshot().leftMs;
	engine.run("skip");
	expect(engine.snapshot().mode).toBe("working");
	expect(engine.snapshot().leftMs).toBe(beforeSkip);

	// Enter warning window, close notice, then snooze (notice comes back on next warning)
	now += 19 * MIN + 35 * SEC;
	expect(engine.snapshot().notice).toBe(true);
	engine.run("closeNotice");
	expect(engine.snapshot().notice).toBe(false);
	engine.run("snooze");
	expect(engine.snapshot().snoozes).toBe(1);
	expect(engine.snapshot().leftMs).toBe(SNOOZE_MS);

	// Jump to break now and skip it
	engine.run("breakNow");
	expect(engine.snapshot().mode).toBe("break");
	expect(engine.snapshot().stats.offered).toBe(1);
	engine.run("skip");
	expect(engine.snapshot().mode).toBe("working");
	expect(engine.snapshot().stats.skipped).toBe(1);

	// DND forever, then off, then reset
	engine.run("dndOn");
	expect(engine.snapshot().dnd).toEqual({ on: true, leftMs: null });
	expect(engine.snapshot().held).toBe("dnd");
	engine.run("dndOff");
	expect(engine.snapshot().dnd).toEqual({ on: false, leftMs: null });

	engine.run("reset");
	expect(engine.snapshot().mode).toBe("ready");
	expect(engine.snapshot().leftMs).toBe(workMs(DEFAULT_RULE));
	engine.stop();
});

test("DND expires cleanly at exact boundary and stats never exceed offered", () => {
	let s = startDnd(timer.start(timer.createTimer(DEFAULT_RULE), T0), T0, 30 * MIN);
	expect(heldBy(s, T0 + 30 * MIN - 1)).toBe("dnd");
	expect(heldBy(s, T0 + 30 * MIN)).toBe("none");
	expect(stopDnd(stopDnd(s)).dndUntil).toBe(0);

	const forever = startDnd(s, T0, null);
	expect(forever.dndUntil).toBe(DND_FOREVER);

	const stats = countEnded(countEnded(countOffered(NO_STATS, T0), true, T0 + SEC), false, T0 + 2 * SEC);
	expect(stats.offered).toBe(1);
	expect(stats.taken).toBe(1);
	expect(stats.skipped).toBe(0);
});
