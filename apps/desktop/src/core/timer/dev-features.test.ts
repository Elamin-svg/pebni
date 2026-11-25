// Tests for developer-focused features: Natural Idle Reset, 7-day quiet rhythm history & active
// coding time, custom/preset break copy, chime prefs, and long-break OS lock safety guards.
import { expect, test } from "bun:test";
import { DEFAULT_RULE, cleanRule, workMs } from "./rule";
import { DEFAULT_PREFS, cleanPrefs } from "../settings/prefs";
import { applyPreset } from "./presets";
import * as timer from "./timer";
import { createEngine } from "./engine";
import { idleThresholdMs, isSteppedAway } from "./idle-reset";
import {
	breakMsForDay,
	cleanHistory,
	lastSevenDays,
	recordBreakMs,
	recordWorkTick,
	syncStatsToHistory,
	weekTotals,
	workMsForDay,
} from "../analytics/history";
import { CUSTOM_PROMPT_PRESETS, breakCopy } from "../atmosphere/break-copy";
import { formatBreakMinutes, formatHoursMinutes } from "../analytics/format";
import { trayLabel } from "../atmosphere/tray-label";
import { dayKey } from "../analytics/stats";

const SEC = 1000;
const MIN = 60_000;
const T0 = new Date(2026, 10, 25, 10, 0).getTime();

// --- Natural Idle Reset ---

test("idleThresholdMs uses at least idleResetMin and never less than restSec", () => {
	expect(idleThresholdMs(DEFAULT_RULE)).toBe(3 * MIN);
	expect(idleThresholdMs({ ...DEFAULT_RULE, idleResetMin: 2, restSec: 300 })).toBe(5 * MIN);
	expect(idleThresholdMs({ ...DEFAULT_RULE, idleResetMin: 5, restSec: 20 })).toBe(5 * MIN);
});

test("isSteppedAway requires a finite OS idle reading and idleReset enabled", () => {
	expect(isSteppedAway(DEFAULT_RULE, Infinity)).toBe(false); // browser preview / no OS idle
	expect(isSteppedAway(DEFAULT_RULE, 3 * MIN - 1)).toBe(false);
	expect(isSteppedAway(DEFAULT_RULE, 3 * MIN)).toBe(true);
	expect(isSteppedAway({ ...DEFAULT_RULE, idleReset: false }, 10 * MIN)).toBe(false);
});

test("stepping away pauses cleanly without firing a break, and returning starts a fresh round", () => {
	let s = timer.start(timer.createTimer(DEFAULT_RULE), T0);
	// Work for 18 minutes (2 minutes left before break)
	s = timer.tick(s, T0 + 18 * MIN, 500);
	expect(timer.snapshot(s, T0 + 18 * MIN).leftMs).toBe(2 * MIN);

	// Step away for 4 minutes (past both the 3-min away threshold AND the original 20-min deadline)
	s = timer.tick(s, T0 + 22 * MIN, 4 * MIN);
	expect(s.mode).toBe("working");
	expect(s.away).toBe(true);
	const awaySnap = timer.snapshot(s, T0 + 22 * MIN);
	expect(awaySnap.away).toBe(true);
	expect(awaySnap.warning).toBe(false);
	expect(trayLabel(awaySnap)).toBe("Stepped away");

	// Snooze does nothing while stepped away
	expect(timer.snooze(s, T0 + 22 * MIN)).toBe(s);

	// Sit back down and touch the keyboard: fresh 20-minute round starts automatically!
	s = timer.tick(s, T0 + 22 * MIN + 5 * SEC, 100);
	expect(s.mode).toBe("working");
	expect(s.away).toBe(false);
	const backSnap = timer.snapshot(s, T0 + 22 * MIN + 5 * SEC);
	expect(backSnap.leftMs).toBe(workMs(DEFAULT_RULE));
	expect(backSnap.recentIdleReset).toBe(true);
	// Banner fades after 30 seconds
	expect(timer.snapshot(s, T0 + 22 * MIN + 36 * SEC).recentIdleReset).toBe(false);
});

// --- Quiet 7-Day Rhythm History & Active Screen Time ---

test("active work time accumulates while coding and caps sleep/suspend jumps", () => {
	let h = recordWorkTick([], T0, 1000);
	h = recordWorkTick(h, T0 + 1000, 1000);
	expect(workMsForDay(h, T0)).toBe(2000);

	// A 2-hour laptop sleep jump is capped to 5 s so screen time never inflates falsely
	h = recordWorkTick(h, T0 + 2 * 60 * MIN, 2 * 60 * MIN);
	expect(workMsForDay(h, T0)).toBe(7000);

	// Negative or NaN deltas are ignored
	expect(recordWorkTick(h, T0, -500)).toBe(h);
	expect(recordWorkTick(h, T0, Number.NaN)).toBe(h);
});

test("lastSevenDays returns 7 ordered days ending Today with honest zeros", () => {
	const today = dayKey(T0);
	const threeDaysAgo = dayKey(T0 - 3 * 24 * 60 * MIN);
	const hist = cleanHistory([
		{ day: threeDaysAgo, offered: 5, taken: 4, skipped: 1, workMs: 90 * MIN },
		{ day: today, offered: 3, taken: 2, skipped: 1, workMs: 45 * MIN },
		{ day: "not-a-date", offered: 9, taken: 9, skipped: 0, workMs: 1000 },
		null as unknown as never,
	]);

	const week = lastSevenDays(hist, T0);
	expect(week).toHaveLength(7);
	expect(week[6]!.isToday).toBe(true);
	expect(week[6]!.label).toBe("Today");
	expect(week[6]!.taken).toBe(2);
	expect(week[3]!.taken).toBe(4);
	expect(week[0]!.taken).toBe(0); // honest zero
	expect(week[0]!.workMs).toBe(0);
});

test("engine persists active coding minutes and break history in snapshots", () => {
	let now = T0;
	const engine = createEngine(DEFAULT_RULE, () => {}, () => now, () => 200);
	engine.run("start");
	// Simulate 65 seconds of active coding in 1-second ticks
	let s = timer.start(timer.createTimer(DEFAULT_RULE), T0);
	for (let i = 1; i <= 65; i++) {
		s = timer.tick(s, T0 + i * SEC, 200);
	}
	const snap = timer.snapshot(s, T0 + 65 * SEC);
	expect(snap.workMsToday).toBe(MIN); // floored to whole minutes in snapshot
	expect(snap.week).toHaveLength(7);
	expect(syncStatsToHistory([], { day: dayKey(T0), offered: 2, taken: 1, skipped: 1 }, T0)[0]!.taken).toBe(1);
	engine.stop();
});

test("formatHoursMinutes and formatBreakMinutes format durations honestly", () => {
	expect(formatHoursMinutes(0)).toBe("0m");
	expect(formatHoursMinutes(42 * MIN)).toBe("42m");
	expect(formatHoursMinutes(120 * MIN)).toBe("2h");
	expect(formatHoursMinutes(135 * MIN)).toBe("2h 15m");
	expect(formatHoursMinutes(-100)).toBe("0m");
	expect(formatHoursMinutes(Number.NaN)).toBe("0m");

	expect(formatBreakMinutes(0)).toBe("0 min");
	expect(formatBreakMinutes(20 * SEC)).toBe("<1 min");
	expect(formatBreakMinutes(60 * SEC)).toBe("1 min");
	expect(formatBreakMinutes(12 * MIN)).toBe("12 min");
	expect(formatBreakMinutes(-50)).toBe("0 min");
});

test("completed breaks record capped breakMs and reconcile with 7-day weekTotals", () => {
	// Completed 20s break records 20s; skipped break records 0ms
	let s = timer.start(timer.createTimer(DEFAULT_RULE), T0);
	s = timer.tick(s, T0 + 20 * MIN);
	s = timer.tick(s, T0 + 20 * MIN + 20 * SEC); // completed on time
	expect(breakMsForDay(s.history, T0)).toBe(20 * SEC);

	s = timer.beginBreak(s, T0 + 25 * MIN);
	s = timer.endBreak(s, T0 + 25 * MIN + 5 * SEC); // skipped early
	expect(breakMsForDay(s.history, T0)).toBe(20 * SEC);

	// Completed 5-min Pomodoro break with a 2-hour sleep jump caps at 5 min
	const pomo = applyPreset(DEFAULT_RULE, "pomodoro");
	let p = timer.beginBreak(timer.start(timer.createTimer(pomo), T0), T0 + 25 * MIN);
	p = timer.tick(p, T0 + 145 * MIN); // 2 hours later after sleep
	expect(breakMsForDay(p.history, T0)).toBe(5 * MIN);

	// weekTotals sums every day cleanly
	const yesterday = dayKey(T0 - 24 * 60 * MIN);
	const today = dayKey(T0);
	const hist = recordBreakMs(
		cleanHistory([
			{ day: yesterday, offered: 3, taken: 3, skipped: 0, workMs: 120 * MIN, breakMs: 10 * MIN },
			{ day: today, offered: 2, taken: 2, skipped: 0, workMs: 60 * MIN, breakMs: 4 * MIN },
		]),
		T0,
		2 * MIN,
	);
	const week = lastSevenDays(hist, T0);
	expect(weekTotals(week)).toEqual({ breaks: 5, breakMs: 16 * MIN, workMs: 180 * MIN });
});

// --- Developer Break Prompts & Custom Copy ---

test("breakCopy supports eyes, away, stretch and custom developer messages", () => {
	const stretch = breakCopy("eyes", { ...DEFAULT_RULE, focus: "stretch" });
	expect(stretch.title).toContain("hands");

	const custom = breakCopy("eyes", {
		...DEFAULT_RULE,
		focus: "custom",
		customTitle: "Push your branch & breathe",
		customNote: "Drink water before opening the next PR.",
	});
	expect(custom.title).toBe("Push your branch & breathe");
	expect(custom.note).toBe("Drink water before opening the next PR.");

	// Blank custom fields fall back cleanly
	const blankCustom = breakCopy("long", { ...DEFAULT_RULE, focus: "custom", customTitle: "", customNote: "" });
	expect(blankCustom.label).toBe("Long break");
	expect(blankCustom.title.length).toBeGreaterThan(0);
	expect(blankCustom.note.length).toBeGreaterThan(0);
	expect(CUSTOM_PROMPT_PRESETS.length).toBeGreaterThanOrEqual(3);
});

// --- Closeable Long-Break Window (Never Logs Out PC) & Chime Pref ---

test("lockOnLong is always forced false so Pebni never logs you out of Windows", () => {
	expect(cleanRule({ longAfter: 0, lockOnLong: true }).lockOnLong).toBe(false);
	expect(cleanRule({ longAfter: 3, lockOnLong: true }).lockOnLong).toBe(false);

	const armed = { ...DEFAULT_RULE, longAfter: 3, lockOnLong: true };
	expect(applyPreset(armed, "pomodoro").lockOnLong).toBe(false);
	expect(applyPreset(armed, "twenty").lockOnLong).toBe(false);
});

test("long and coffee break overlays can be closed/hidden while the timer keeps running", () => {
	// Long break via strict Pomodoro (even with strict on, user can close window to watch YouTube)
	const strictLong = { ...DEFAULT_RULE, workMin: 60, strict: true };
	let s = timer.start(timer.createTimer(strictLong), T0);
	s = timer.tick(s, T0 + 60 * MIN);
	expect(s).toMatchObject({ mode: "break", kind: "long", breakHidden: false });
	expect(timer.snapshot(s, T0 + 60 * MIN)).toMatchObject({ canHideBreak: true, breakHidden: false });

	// Close window: break keeps counting down in background
	s = timer.hideBreak(s);
	expect(s.mode).toBe("break");
	expect(s.breakHidden).toBe(true);
	expect(timer.snapshot(s, T0 + 61 * MIN)).toMatchObject({ mode: "break", breakHidden: true, leftMs: 4 * MIN });

	// Reopen overlay, then hide again and let it finish naturally
	s = timer.showBreak(s);
	expect(s.breakHidden).toBe(false);
	s = timer.hideBreak(s);
	s = timer.tick(s, T0 + 65 * MIN);
	expect(s.mode).toBe("working");
	expect(s.breakHidden).toBe(false);
	expect(s.stats.taken).toBe(1);

	// Short 20s eye break is not hideable (user can skip it instead)
	const shortBreak = timer.beginBreak(timer.start(timer.createTimer(DEFAULT_RULE), T0), T0 + 20 * MIN);
	expect(timer.hideBreak(shortBreak)).toBe(shortBreak);
});

test("chime preference defaults to true and sanitizes non-boolean values", () => {
	expect(DEFAULT_PREFS.chime).toBe(true);
	expect(cleanPrefs({ chime: false }).chime).toBe(false);
	expect(cleanPrefs({ chime: "loud" as unknown as boolean }).chime).toBe(true);
});
