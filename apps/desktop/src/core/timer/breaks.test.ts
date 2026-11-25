import { expect, test } from "bun:test";
import { DEFAULT_RULE, cleanRule } from "./rule";
import * as timer from "./timer";
import { createEngine } from "./engine";
import { LONG_BREAK_MS, canHideBreak, locksScreen, planBreak } from "./breaks";
import { breakCopy } from "../atmosphere/break-copy";
import { trayLabel } from "../atmosphere/tray-label";

const rule = DEFAULT_RULE; // 20 min work, 20 s rest
const MIN = 60_000;

// Work `n` full rounds in a row, taking every break, and list the kinds that came.
function kindsOf(n: number): string[] {
	let s = timer.start(timer.createTimer(rule), 0);
	const kinds: string[] = [];
	for (let i = 0; i < n; i++) {
		s = timer.tick(s, s.endsAt); // the break begins
		kinds.push(s.coffeeOffer ? `${s.kind}+offer` : s.kind);
		s = timer.endBreak(s, s.endsAt); // taken
	}
	return kinds;
}

test("short breaks take turns: eyes, stretch, posture, water", () => {
	expect(planBreak(0, 1, rule).kind).toBe("eyes");
	expect(planBreak(1, 1, rule).kind).toBe("stretch");
	expect(planBreak(2, 1, rule).kind).toBe("posture");
	expect(planBreak(3, 1, rule).kind).toBe("water");
	expect(planBreak(4, 1, rule)).toEqual({ kind: "eyes", ms: 20_000, offerCoffee: false });
});

test("after three rounds in a row Pip offers coffee, then counting starts over", () => {
	expect(kindsOf(6)).toEqual(["eyes", "stretch", "posture+offer", "water", "eyes", "stretch+offer"]);
});

test("about an hour of work in fewer rounds brings a long break", () => {
	const halfHours = { ...rule, workMin: 30 };
	expect(planBreak(0, 1, halfHours).kind).toBe("eyes");
	expect(planBreak(1, 2, halfHours)).toEqual({ kind: "long", ms: LONG_BREAK_MS, offerCoffee: false });
	expect(planBreak(0, 1, { ...rule, workMin: 90 }).kind).toBe("long");
	expect(planBreak(0, 1, { ...rule, restSec: 600, workMin: 60 }).ms).toBe(10 * MIN); // never shorter
});

test("a long break is followed by a fresh row", () => {
	let s = timer.start(timer.createTimer({ ...rule, workMin: 30 }), 0);
	s = timer.tick(s, 30 * MIN);
	s = timer.tick(timer.endBreak(s, s.endsAt), 60 * MIN + 20_000);
	expect(s).toMatchObject({ mode: "break", kind: "long", inRow: 0 });
	expect(timer.snapshot(s, s.endsAt - LONG_BREAK_MS).totalMs).toBe(LONG_BREAK_MS);
});

test("reset starts the rotation and the row over", () => {
	const s = timer.endBreak(timer.beginBreak(timer.start(timer.createTimer(rule), 0), MIN), 2 * MIN);
	expect(timer.reset(s, 3 * MIN)).toMatchObject({ breakCount: 0, inRow: 0 });
});

test("accepting the offer makes a 5-minute coffee break from now", () => {
	const s = { ...timer.beginBreak(timer.start(timer.createTimer(rule), 0), 0), coffeeOffer: true };
	const coffee = timer.acceptCoffee(s, 5000);
	expect(timer.snapshot(coffee, 5000)).toMatchObject({
		kind: "coffee", coffeeOffer: false, leftMs: LONG_BREAK_MS, totalMs: LONG_BREAK_MS,
	});
	expect(timer.acceptCoffee(coffee, 6000)).toBe(coffee); // only once
	const declined = timer.declineCoffee(s);
	expect(timer.snapshot(declined, 0)).toMatchObject({ kind: "eyes", coffeeOffer: false, leftMs: 20_000 });
});

test("the snapshot names the coming break while working", () => {
	let s = timer.start(timer.createTimer(rule), 0);
	expect(timer.snapshot(s, 0)).toMatchObject({ kind: "eyes", coffeeOffer: false });
	s = timer.endBreak(timer.tick(s, 20 * MIN), 20 * MIN + 20_000);
	expect(timer.snapshot(s, 21 * MIN).copy.title).toBe("Stand up and stretch");
});

test("each kind has a label, a title and an instruction", () => {
	for (const kind of ["eyes", "stretch", "posture", "water", "long", "coffee"] as const) {
		const copy = breakCopy(kind, rule);
		expect(copy.label && copy.title && copy.note).toBeTruthy();
		expect(copy.title + copy.note).not.toContain("!");
	}
	expect(breakCopy("eyes", { ...rule, feet: 30 }).title).toContain("30 feet");
});

test("the tray and the engine know about the kinds", () => {
	let t = 0;
	const engine = createEngine(rule, () => {}, () => t);
	engine.run("start");
	t = 20 * MIN;
	engine.run("breakNow");
	expect(trayLabel(engine.snapshot())).toBe("Eye break · 0:20");
	engine.run("coffee"); // no offer: nothing happens
	expect(engine.snapshot()).toMatchObject({ kind: "eyes", leftMs: 20_000 });
	engine.run("breakNow"); // already on a break: nothing happens
	expect(engine.snapshot().stats.offered).toBe(1);
	engine.stop();
});

test("long and coffee breaks never lock the OS session and can be hidden to relax freely", () => {
	const longs = { ...DEFAULT_RULE, longAfter: 3 };
	expect(DEFAULT_RULE.lockOnLong).toBe(false);
	expect(locksScreen("long", longs)).toBe(false);
	expect(locksScreen("long", { ...longs, lockOnLong: true })).toBe(false);
	expect(cleanRule({ longAfter: 3, lockOnLong: true }).lockOnLong).toBe(false);
	expect(canHideBreak("long")).toBe(true);
	expect(canHideBreak("coffee")).toBe(true);
	expect(canHideBreak("eyes")).toBe(false);
	expect(canHideBreak("stretch")).toBe(false);
});
