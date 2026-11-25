import { expect, test } from "bun:test";
import { DEFAULT_RULE } from "./rule";
import * as timer from "./timer";
import { FLOW_AFTER_MS, FLOW_HOLD_CAP_MS, HOLD_CAP_MS, NO_STREAK, followStreak, inFlow, readyToBreak } from "./flow";
import { breakCopy } from "../atmosphere/break-copy";
import { BREAK_KINDS } from "./breaks";

const MIN = 60_000;
const TYPING = 500; // idle ms while typing

// Work from 0 with steady typing, ticking every 5 s up to `until`.
function typeUntil(rule = DEFAULT_RULE, until = 20 * MIN) {
	let s = timer.start(timer.createTimer(rule), 0);
	for (let t = 5000; t <= until; t += 5000) s = timer.tick(s, t, TYPING);
	return s;
}

test("a typing streak starts with input and ends after 30 s of quiet or an unwatched gap", () => {
	const started = followStreak(NO_STREAK, 1000, TYPING);
	expect(started).toEqual({ since: 1000, seen: 1000 });
	expect(followStreak(started, 9000, 29_999).since).toBe(1000);
	expect(followStreak(started, 9000, 30_000)).toEqual(NO_STREAK);
	expect(followStreak(started, 1000 + 20 * MIN, TYPING).since).toBe(1000 + 20 * MIN); // gap not seen
	expect(inFlow(1000, 1000 + FLOW_AFTER_MS - 1)).toBe(false);
	expect(inFlow(1000, 1000 + FLOW_AFTER_MS)).toBe(true);
});

test("in flow, a due break waits for a 10 s pause, but never more than 5 minutes", () => {
	expect(readyToBreak(0, 3000, true)).toBe(false); // a short pause is not enough in flow
	expect(readyToBreak(0, 10_000, true)).toBe(true);
	expect(readyToBreak(HOLD_CAP_MS, 0, true)).toBe(false); // the normal cap does not apply
	expect(readyToBreak(FLOW_HOLD_CAP_MS, 0, true)).toBe(true);
});

test("twenty minutes of steady typing: the snapshot says flow, and the break waits for a real pause", () => {
	const s = typeUntil();
	expect(timer.snapshot(s, 20 * MIN)).toMatchObject({ mode: "working", flow: true, holding: true });
	const later = typeUntil(DEFAULT_RULE, 22 * MIN); // two more minutes of typing, still working
	expect(later.mode).toBe("working");
	expect(timer.tick(later, 22 * MIN + 1000, 3000).mode).toBe("working"); // 3 s pause: keeps going
	expect(timer.tick(later, 22 * MIN + 1000, 10_000).mode).toBe("break"); // 10 s pause: break
	expect(typeUntil(DEFAULT_RULE, 25 * MIN).mode).toBe("break"); // the 5-minute cap
});

test("with the flow guard off, the usual one-minute cap applies", () => {
	const s = typeUntil({ ...DEFAULT_RULE, flowGuard: false });
	expect(timer.snapshot(s, 20 * MIN).flow).toBe(false);
	expect(timer.tick(s, 21 * MIN, TYPING).mode).toBe("break");
});

test("a break ends the streak", () => {
	const s = timer.endBreak(timer.tick(typeUntil(), 20 * MIN + 10_000, 10_000), 20 * MIN + 30_000);
	expect(s.streak).toEqual(NO_STREAK);
});

test("time away from the screen: every break says to step away, the eyes rule stays the default", () => {
	const away = { ...DEFAULT_RULE, focus: "away" as const };
	for (const kind of BREAK_KINDS) {
		const copy = breakCopy(kind, away);
		expect(copy.title + copy.note).not.toMatch(/feet|eyes relax/);
		expect(copy.title + copy.note).not.toContain("!");
	}
	expect(breakCopy("eyes", away).title).toBe("Step away from the screen");
	expect(breakCopy("eyes", DEFAULT_RULE).title).toBe("Look 20 feet away");
	expect(timer.snapshot(timer.createTimer(away), 0).copy.label).toBe("Screen break");
});
