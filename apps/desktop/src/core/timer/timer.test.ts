import { expect, test } from "bun:test";
import { DEFAULT_RULE, cleanRule } from "./rule";
import * as timer from "./timer";
import { formatClock } from "../analytics/format";

const rule = DEFAULT_RULE; // 20 min work, 20 s rest
const MIN = 60_000;

test("starts ready with the full work time", () => {
	const s = timer.createTimer(rule);
	expect(timer.snapshot(s, 0)).toMatchObject({ mode: "ready", leftMs: 20 * MIN });
});

test("work ends in a break, and the break starts the next round", () => {
	let s = timer.start(timer.createTimer(rule), 0);
	s = timer.tick(s, 20 * MIN);
	expect(s.mode).toBe("break");
	s = timer.tick(s, 20 * MIN + 20_000);
	expect(s.mode).toBe("working");
	expect(timer.snapshot(s, 20 * MIN + 20_000).leftMs).toBe(20 * MIN);
});

test("pause keeps the time left, resume continues from it", () => {
	let s = timer.start(timer.createTimer(rule), 0);
	s = timer.pause(s, 5 * MIN);
	expect(timer.snapshot(s, 9 * MIN).leftMs).toBe(15 * MIN);
	s = timer.start(s, 9 * MIN);
	expect(timer.snapshot(s, 10 * MIN).leftMs).toBe(14 * MIN);
});

test("a new rule applies at once only when ready", () => {
	const ready = timer.setRule(timer.createTimer(rule), { ...rule, workMin: 30 });
	expect(timer.snapshot(ready, 0).leftMs).toBe(30 * MIN);
	const running = timer.setRule(timer.start(timer.createTimer(rule), 0), { ...rule, workMin: 30 });
	expect(timer.snapshot(running, 0).leftMs).toBe(20 * MIN);
});

test("cleanRule clamps and fills in defaults", () => {
	expect(cleanRule({ workMin: 0, restSec: 9999, maxSnoozes: 7, longAfter: -2, longMin: 500 })).toEqual({
		workMin: 1,
		feet: 20,
		restSec: 1800,
		maxSnoozes: 3,
		longAfter: 0,
		longMin: 60,
		focus: "eyes",
		flowGuard: true,
		strict: false,
		lockOnLong: false,
		idleReset: true,
		idleResetMin: 3,
		customTitle: "",
		customNote: "",
	});
	expect(cleanRule({ focus: "away", flowGuard: false })).toMatchObject({ focus: "away", flowGuard: false });
	expect(cleanRule({ focus: "nap" as never, flowGuard: "yes" as never })).toMatchObject({ focus: "eyes", flowGuard: true });
	// A settings file from before long breaks existed still loads, with them off.
	expect(cleanRule({ workMin: 20, feet: 20, restSec: 60, maxSnoozes: 0 })).toMatchObject({
		longAfter: 0, longMin: 5,
	});
	expect(cleanRule({ workMin: Number("abc") })).toEqual(DEFAULT_RULE);
});

test("formatClock rounds up to whole seconds", () => {
	expect(formatClock(20 * MIN)).toBe("20:00");
	expect(formatClock(1)).toBe("0:01");
	expect(formatClock(0)).toBe("0:00");
});
