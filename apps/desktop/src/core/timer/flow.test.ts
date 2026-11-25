import { expect, test } from "bun:test";
import { DEFAULT_RULE } from "./rule";
import * as timer from "./timer";
import { createEngine } from "./engine";
import { trayLabel } from "../atmosphere/tray-label";
import { formatSeconds } from "../analytics/format";

const rule = DEFAULT_RULE; // 20 min work, 2 snoozes per round
const MIN = 60_000;
const BUSY = 0; // idle time while the user is typing
const IDLE = 5000; // idle time after a pause

// A round started at 0, so the break is due at 20 min.
const round = () => timer.start(timer.createTimer(rule), 0);
const snap = (s: timer.TimerState, now: number) => timer.snapshot(s, now);

test("the warning starts 30 s before the break", () => {
	const s = round();
	expect(snap(s, 20 * MIN - 30_001).warning).toBe(false);
	expect(snap(s, 20 * MIN - 30_000)).toMatchObject({ warning: true, leftMs: 30_000 });
	expect(snap(timer.pause(s, 20 * MIN - 10_000), 20 * MIN).warning).toBe(false); // paused: no notice
});

test("a snooze moves the break to 2 minutes from now and counts", () => {
	const now = 20 * MIN - 20_000;
	const s = timer.snooze(round(), now);
	expect(snap(s, now)).toMatchObject({ leftMs: 2 * MIN, warning: false, snoozes: 1, snoozesLeft: 1 });
	expect(timer.tick(s, 20 * MIN, IDLE).mode).toBe("working"); // the old break time passes
});

test("snooze only works while the notice shows", () => {
	const s = round();
	expect(timer.snooze(s, 10 * MIN)).toBe(s);
	expect(timer.snooze(timer.createTimer(rule), 0).snoozes).toBe(0);
});

test("the third snooze is refused, and Pip is disappointed after the second", () => {
	let s = timer.snooze(round(), 20 * MIN - 10_000); // break now at 21:50
	expect(snap(s, 0).disappointed).toBe(false);
	s = timer.snooze(s, 21 * MIN + 30_000); // break now at 23:30
	expect(snap(s, 0)).toMatchObject({ snoozes: 2, snoozesLeft: 0, disappointed: true });
	const refused = timer.snooze(s, 23 * MIN + 10_000);
	expect(refused).toBe(s);
	expect(timer.tick(refused, 23 * MIN + 30_000, IDLE).mode).toBe("break");
});

test("the snooze limit comes from the rule, and a new round starts fresh", () => {
	const none = timer.start(timer.createTimer({ ...rule, maxSnoozes: 0 }), 0);
	expect(timer.snooze(none, 20 * MIN - 5000)).toBe(none);
	const snoozed = timer.snooze(round(), 20 * MIN - 5000);
	const next = timer.endBreak(timer.beginBreak(snoozed, 22 * MIN), 22 * MIN + 20_000);
	expect(next.snoozes).toBe(0);
});

test("a due break waits for 3 s without input", () => {
	let s = round();
	s = timer.tick(s, 20 * MIN, BUSY);
	expect(snap(s, 20 * MIN)).toMatchObject({ mode: "working", holding: true, warning: true });
	s = timer.tick(s, 20 * MIN + 10_000, 2999);
	expect(s.mode).toBe("working");
	s = timer.tick(s, 20 * MIN + 11_000, 3000);
	expect(s.mode).toBe("break");
});

test("the break never waits longer than the cap", () => {
	const s = round();
	expect(timer.tick(s, 20 * MIN + 59_999, BUSY).mode).toBe("working");
	expect(timer.tick(s, 20 * MIN + 60_000, BUSY).mode).toBe("break");
});

test("a snooze is allowed while holding, and pausing while holding keeps no negative time", () => {
	const s = round();
	const snoozed = timer.snooze(s, 20 * MIN + 5000);
	expect(snap(snoozed, 20 * MIN + 5000)).toMatchObject({ leftMs: 2 * MIN, holding: false });
	expect(timer.pause(s, 20 * MIN + 5000).leftMs).toBe(0);
});

test("the engine runs the snooze command", () => {
	let t = 0;
	const engine = createEngine(rule, () => {}, () => t, () => BUSY);
	engine.run("start");
	t = 20 * MIN - 10_000;
	engine.run("snooze");
	expect(engine.snapshot()).toMatchObject({ snoozes: 1, leftMs: 2 * MIN });
	engine.stop();
});

test("tray label while holding, and the short notice format", () => {
	const s = round();
	expect(trayLabel(snap(s, 20 * MIN - 25_000))).toBe("Break in 0:25");
	expect(trayLabel(snap(s, 20 * MIN + 1000))).toBe("Break when you stop typing");
	expect(formatSeconds(29_400)).toBe("30s");
});
