import { expect, test } from "bun:test";
import { DEFAULT_RULE, type Rule } from "./rule";
import * as timer from "./timer";
import { planBreak } from "./breaks";
import { PRESETS, applyPreset, matchingPreset } from "./presets";

const MIN = 60_000;
const pomodoro: Rule = applyPreset(DEFAULT_RULE, "pomodoro"); // 25 min, 5 min, 30 min after 3

// Work `n` full rounds, taking every break, and list each break as "kind length-in-minutes".
function breaksOf(rule: Rule, n: number): string[] {
	let s = timer.start(timer.createTimer(rule), 0);
	const seen: string[] = [];
	for (let i = 0; i < n; i++) {
		s = timer.tick(s, s.endsAt); // the break begins
		const snap = timer.snapshot(s, s.endsAt - 1);
		seen.push(`${s.kind === "long" ? "long" : "short"} ${Math.round(snap.totalMs / MIN)}`);
		s = timer.endBreak(s, s.endsAt);
	}
	return seen;
}

test("Pomodoro: 25 minutes of work, 5-minute rests, and 30 minutes after three short breaks", () => {
	expect(pomodoro).toMatchObject({ workMin: 25, restSec: 300, longAfter: 3, longMin: 30 });
	expect(breaksOf(pomodoro, 8)).toEqual([
		"short 5", "short 5", "short 5", "long 30",
		"short 5", "short 5", "short 5", "long 30",
	]);
});

test("planned long breaks replace the hourly rule and the coffee offer", () => {
	const rule = { ...DEFAULT_RULE, workMin: 90, longAfter: 2, longMin: 15 };
	expect(planBreak(0, 1, rule)).toMatchObject({ offerCoffee: false });
	expect(planBreak(0, 1, rule).kind).not.toBe("long"); // 90 minutes, but only the first round
	expect(planBreak(2, 3, rule)).toEqual({ kind: "long", ms: 15 * MIN, offerCoffee: false });
});

test("with long breaks off, the old rhythm stays (coffee offer after three rounds)", () => {
	expect(breaksOf(DEFAULT_RULE, 3)).toEqual(["short 0", "short 0", "short 0"]);
	let s = timer.start(timer.createTimer(DEFAULT_RULE), 0);
	for (let i = 0; i < 3; i++) s = timer.endBreak(timer.tick(s, s.endsAt), s.endsAt + 20_000);
	expect(timer.snapshot(s, s.endsAt).cycle).toBeNull();
});

test("the snapshot says which round of the cycle it is", () => {
	let s = timer.start(timer.createTimer(pomodoro), 0);
	expect(timer.snapshot(s, 0).cycle).toEqual({ round: 1, of: 4 });
	s = timer.tick(s, s.endsAt); // first short break
	expect(timer.snapshot(s, s.endsAt - 1).cycle).toEqual({ round: 1, of: 4 });
	s = timer.endBreak(s, s.endsAt);
	expect(timer.snapshot(s, s.endsAt - 1).cycle).toEqual({ round: 2, of: 4 });
	for (let i = 0; i < 2; i++) s = timer.endBreak(timer.tick(s, s.endsAt), s.endsAt + 5 * MIN);
	expect(timer.snapshot(s, s.endsAt - 1).cycle).toEqual({ round: 4, of: 4 });
	s = timer.tick(s, s.endsAt); // the long break
	expect(timer.snapshot(s, s.endsAt - 1)).toMatchObject({ kind: "long", cycle: { round: 4, of: 4 } });
	s = timer.endBreak(s, s.endsAt);
	expect(timer.snapshot(s, s.endsAt - 1).cycle).toEqual({ round: 1, of: 4 });
});

test("presets set only the timing and are recognised again", () => {
	const mine = { ...DEFAULT_RULE, feet: 30, maxSnoozes: 1 };
	const p = applyPreset(mine, "pomodoro");
	expect(p).toMatchObject({ feet: 30, maxSnoozes: 1 });
	expect(matchingPreset(p)).toBe("pomodoro");
	expect(matchingPreset(DEFAULT_RULE)).toBe("twenty");
	expect(matchingPreset({ ...p, workMin: 26 })).toBeUndefined();
	expect(matchingPreset({ ...DEFAULT_RULE, longMin: 12 })).toBe("twenty"); // long breaks off
	for (const preset of PRESETS) expect(preset.name && preset.detail).toBeTruthy();
});
