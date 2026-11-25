// The "Break in 30s" notice closes itself after 10 s or on the x; strict breaks cannot be skipped.
import { expect, test } from "bun:test";
import { DEFAULT_RULE } from "./rule";
import { beginBreak, createTimer, skipBreak, snapshot, snooze, start } from "./timer";
import { closeNotice } from "./notice";

const MIN = 60_000;
const working = () => start(createTimer(DEFAULT_RULE), 0); // break due at 20 min

test("the notice shows for the first 10 seconds of the warning, then closes itself", () => {
	const s = working();
	expect(snapshot(s, 20 * MIN - 31_000).notice).toBe(false); // not yet
	expect(snapshot(s, 20 * MIN - 30_000).notice).toBe(true); // 30 s left
	expect(snapshot(s, 20 * MIN - 21_000).notice).toBe(true);
	expect(snapshot(s, 20 * MIN - 20_000).notice).toBe(false); // 10 s later: gone
	expect(snapshot(s, 20 * MIN - 20_000).warning).toBe(true); // the break still comes
});

test("closing the notice hides it at once, and a snooze brings it back for the next warning", () => {
	const closed = closeNotice(working());
	expect(snapshot(closed, 20 * MIN - 28_000).notice).toBe(false);

	const snoozed = snooze(closed, 20 * MIN - 28_000); // break now at 22 min - 28 s
	const nextWarning = snoozed.endsAt - 30_000;
	expect(snapshot(snoozed, nextWarning).notice).toBe(true);
});

test("strict breaks ignore Skip break; normal breaks end", () => {
	const strict = beginBreak(start(createTimer({ ...DEFAULT_RULE, strict: true }), 0), 1000);
	expect(skipBreak(strict, 5000).mode).toBe("break");

	const normal = beginBreak(working(), 1000);
	expect(skipBreak(normal, 5000).mode).toBe("working");
});
