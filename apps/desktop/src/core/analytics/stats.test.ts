import { expect, test } from "bun:test";
import { DEFAULT_RULE } from "../timer/rule";
import * as timer from "../timer/timer";
import { createEngine } from "../timer/engine";
import { NO_STATS, cleanStats, countEnded, countOffered, dayKey, forToday, statsLine } from "./stats";
import { plural } from "./format";

const rule = DEFAULT_RULE;
const MIN = 60_000;
const at = (h: number, m = 0, day = 23) => new Date(2026, 10, day, h, m).getTime(); // local time

test("dayKey is the local date", () => {
	expect(dayKey(at(0, 0))).toBe("2026-11-23");
	expect(dayKey(at(23, 59))).toBe("2026-11-23");
	expect(dayKey(at(9, 0, 4))).toBe("2026-11-04");
});

test("stats start over at local midnight", () => {
	const evening = countEnded(countOffered(NO_STATS, at(22)), true, at(22, 1));
	expect(evening).toEqual({ day: "2026-11-23", offered: 1, taken: 1, skipped: 0 });
	expect(forToday(evening, at(23, 59))).toBe(evening);
	expect(forToday(evening, at(0, 0, 24))).toEqual({ ...NO_STATS, day: "2026-11-24" });
});

test("a break that began before midnight is not counted in the new day", () => {
	const late = countOffered(NO_STATS, at(23, 59));
	expect(countEnded(late, true, at(0, 1, 24))).toEqual({ ...NO_STATS, day: "2026-11-24" });
});

test("breaks that end on time are taken, early ones skipped", () => {
	const t0 = at(9);
	let s = timer.start(timer.createTimer(rule), t0);
	s = timer.tick(s, t0 + 20 * MIN); // break begins
	s = timer.tick(s, t0 + 20 * MIN + 20_000); // and ends on time
	s = timer.beginBreak(s, t0 + 30 * MIN);
	s = timer.endBreak(s, t0 + 30 * MIN + 5000); // skipped
	s = timer.beginBreak(s, t0 + 40 * MIN);
	s = timer.reset(s, t0 + 40 * MIN + 1000); // reset during a break: skipped too
	expect(timer.snapshot(s, t0 + 41 * MIN).stats).toEqual({
		day: "2026-11-23", offered: 3, taken: 1, skipped: 2,
	});
});

test("skip while working counts nothing", () => {
	const s = timer.endBreak(timer.start(timer.createTimer(rule), at(9)), at(9, 5));
	expect(s.stats).toEqual(NO_STATS);
});

test("the engine starts from saved stats", () => {
	const saved = { day: dayKey(at(9)), offered: 4, taken: 3, skipped: 1 };
	const engine = createEngine(rule, () => {}, () => at(10), undefined, saved);
	expect(engine.snapshot().stats).toEqual(saved);
	engine.stop();
});

test("cleanStats repairs a broken file", () => {
	expect(cleanStats()).toEqual(NO_STATS);
	expect(cleanStats({ day: "2026-11-23", offered: 3, taken: 9, skipped: -2 })).toEqual({
		day: "2026-11-23", offered: 3, taken: 3, skipped: 0,
	});
	expect(cleanStats({ offered: "x" as unknown as number }).offered).toBe(0);
});

test("the stats line shows break count cleanly without ratio guilt", () => {
	const stats = (offered: number, taken: number) => ({ day: "d", offered, taken, skipped: offered - taken });
	expect(statsLine(NO_STATS)).toBe("No breaks yet today.");
	expect(statsLine(stats(10, 10))).toBe("10 breaks today.");
	expect(statsLine(stats(10, 8))).toBe("8 breaks today.");
	expect(statsLine(stats(1, 1))).toBe("1 break today.");
	expect(statsLine(stats(2, 0))).toBe("No breaks yet today.");
	expect(plural(1, "break")).toBe("1 break");
});
