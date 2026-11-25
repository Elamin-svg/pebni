import { expect, test } from "bun:test";
import { DEFAULT_RULE } from "./rule";
import * as timer from "./timer";
import { shouldSend, shouldSendMemory, toMegabytes } from "./updates";
import { formatMemory } from "../analytics/format";
import { createEngine } from "./engine";

const MIN = 60_000;
const working = timer.start(timer.createTimer(DEFAULT_RULE), 0);

test("the first snapshot is always sent", () => {
	expect(shouldSend(undefined, timer.snapshot(working, 0))).toBe(true);
});

test("ticks inside the same shown second are not sent", () => {
	const a = timer.snapshot(working, 1_100);
	const b = timer.snapshot(working, 1_350);
	const c = timer.snapshot(working, 1_850);
	expect(shouldSend(a, b)).toBe(false);
	expect(shouldSend(b, c)).toBe(false);
});

test("a new shown second is sent", () => {
	const a = timer.snapshot(working, 1_900);
	const b = timer.snapshot(working, 2_100);
	expect(shouldSend(a, b)).toBe(true);
});

test("a change of mode is sent, even within the same second", () => {
	const before = timer.snapshot(working, 5_000);
	const paused = timer.snapshot(timer.pause(working, 5_000), 5_000);
	expect(shouldSend(before, paused)).toBe(true);
});

test("other changes the screens show are sent (coffee offer answered, rule changed)", () => {
	const ready = timer.createTimer(DEFAULT_RULE);
	const longer = timer.setRule(ready, { ...DEFAULT_RULE, feet: 30 });
	expect(shouldSend(timer.snapshot(ready, 0), timer.snapshot(longer, 0))).toBe(true);
});

test("a paused or ready timer sends nothing while time passes", () => {
	const paused = timer.pause(working, 3 * MIN);
	expect(shouldSend(timer.snapshot(paused, 3 * MIN), timer.snapshot(paused, 9 * MIN))).toBe(false);
});

test("memory is sent only when the shown megabytes change", () => {
	const mb = 1_048_576;
	expect(toMegabytes(38.4 * mb)).toBe(38);
	expect(shouldSendMemory(undefined, 38 * mb)).toBe(true);
	expect(shouldSendMemory(38, 38.3 * mb)).toBe(false);
	expect(shouldSendMemory(38, 39 * mb)).toBe(true);
});

test("formatMemory reads as a quiet line", () => {
	expect(formatMemory(38)).toBe("Memory: 38 MB");
});

test("the engine tells its listener only about changes the screens would show", () => {
	let t = 0;
	const modes: string[] = [];
	const engine = createEngine(DEFAULT_RULE, (snap, prev) => modes.push(`${prev}>${snap.mode}`), () => t);
	engine.run("start");
	engine.run("start"); // already working: nothing new to show
	t = 400;
	engine.run("start"); // still the same second
	t = 1_200;
	engine.run("pause");
	engine.stop();
	expect(modes).toEqual(["ready>working", "working>paused"]);
});
