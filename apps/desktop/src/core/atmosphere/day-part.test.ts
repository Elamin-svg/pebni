import { expect, test } from "bun:test";
import { dayPart, localHour } from "./day-part";
import { QUOTE_EVERY_MS, QUOTES, quoteFor } from "./quotes";
import { DEFAULT_RULE } from "../timer/rule";
import * as timer from "../timer/timer";

// A moment at the given local hour (local, so the test passes in any time zone).
const at = (hour: number, minute = 0) => new Date(2026, 10, 24, hour, minute).getTime();

test("each hour falls in the right part of the day", () => {
	expect(dayPart(0)).toBe("night");
	expect(dayPart(4)).toBe("night");
	expect(dayPart(5)).toBe("morning");
	expect(dayPart(10)).toBe("morning");
	expect(dayPart(11)).toBe("day");
	expect(dayPart(16)).toBe("day");
	expect(dayPart(17)).toBe("evening");
	expect(dayPart(21)).toBe("evening");
	expect(dayPart(22)).toBe("night");
	expect(dayPart(23)).toBe("night");
});

test("the local hour comes from the moment passed in", () => {
	expect(localHour(at(7, 30))).toBe(7);
	expect(localHour(at(23, 59))).toBe(23);
});

test("a quote stays for 15 minutes, then the next one comes", () => {
	const start = 40 * QUOTE_EVERY_MS;
	expect(quoteFor("day", start)).toBe(quoteFor("day", start + QUOTE_EVERY_MS - 1));
	expect(quoteFor("day", start)).not.toBe(quoteFor("day", start + QUOTE_EVERY_MS));
});

test("every quote comes from its own part of the day and is short enough for the bubble", () => {
	const all = Object.values(QUOTES).flat();
	expect(all).toHaveLength(50);
	expect(new Set(all).size).toBe(50);
	expect(QUOTES.morning[0]).toMatch(/^Good morning/i);
	for (const [part, list] of Object.entries(QUOTES)) {
		expect(list.length).toBeGreaterThanOrEqual(12);
		for (const q of list) expect(q.length).toBeLessThanOrEqual(40);
		expect(list).toContain(quoteFor(part as keyof typeof QUOTES, at(12)));
	}
});

test("first message on opening is the time-of-day greeting, then rotates every 15 minutes", () => {
	const openedMorning = at(8, 23);
	const ready = timer.createTimer(DEFAULT_RULE, undefined, undefined, openedMorning);
	const first = timer.snapshot(ready, openedMorning);
	expect(first.dayPart).toBe("morning");
	expect(first.quote).toBe(QUOTES.morning[0]);
	expect(first.quote).toMatch(/^Good morning/i);

	// 15 minutes later it rotates to the next motivational quote.
	const next = timer.snapshot(ready, openedMorning + QUOTE_EVERY_MS);
	expect(next.quote).toBe(QUOTES.morning[1]);

	// Evening and night openings also start with their own greeting.
	expect(timer.snapshot(timer.createTimer(DEFAULT_RULE, undefined, undefined, at(19, 10)), at(19, 10)).quote).toBe(QUOTES.evening[0]);
	expect(timer.snapshot(timer.createTimer(DEFAULT_RULE, undefined, undefined, at(23, 5)), at(23, 5)).quote).toBe(QUOTES.night[0]);
});
