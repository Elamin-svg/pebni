// "Don't break flow at the worst moment": the rules for the moment a break begins.
// A notice 30 s before, "Give me 2 minutes" a limited number of times,
// and holding the break until the user pauses typing (but never for long).

export const WARNING_MS = 30_000; // the notice shows this long before the break
export const SNOOZE_MS = 2 * 60_000; // "Give me 2 minutes"
export const IDLE_NEEDED_MS = 3_000; // no input for this long counts as a pause
export const HOLD_CAP_MS = 60_000; // after this, the break starts even mid-typing
export const DISAPPOINTED_AT = 2; // Pip looks disappointed from the second snooze on

// True from 30 s before the break until it starts (including while holding).
export function inWarning(leftMs: number): boolean {
	return leftMs <= WARNING_MS;
}

// Flow: after 10 minutes of steady typing, a due break waits for a real thinking pause
// (10 s instead of 3) and may wait up to 5 minutes instead of 1. Never longer.
export const FLOW_AFTER_MS = 10 * 60_000; // this much steady typing counts as flow
export const FLOW_GAP_MS = 30_000; // a quiet stretch this long ends the typing streak
export const FLOW_IDLE_NEEDED_MS = 10_000;
export const FLOW_HOLD_CAP_MS = 5 * 60_000;

// The break is due `overdueMs` ago: start it once the user has paused, or once we waited enough.
// In flow the pause must be longer and the wait may be longer, up to its own cap.
export function readyToBreak(overdueMs: number, idleMs: number, flow = false): boolean {
	if (flow) return idleMs >= FLOW_IDLE_NEEDED_MS || overdueMs >= FLOW_HOLD_CAP_MS;
	return idleMs >= IDLE_NEEDED_MS || overdueMs >= HOLD_CAP_MS;
}

// The typing streak: when it began and when input was last seen (both 0: no streak).
export type Streak = { since: number; seen: number };
export const NO_STREAK: Streak = { since: 0, seen: 0 };

// Follow the streak. A quiet stretch of 30 s ends it, and so does a gap we did not watch
// (the app asleep, a clock jump backward, or a check long ago): only typing we saw counts as flow.
export function followStreak(streak: Streak, now: number, idleMs: number): Streak {
	if (idleMs >= FLOW_GAP_MS) return NO_STREAK;
	const unbroken = streak.since > 0 && now >= streak.seen && now - streak.seen < FLOW_GAP_MS;
	return { since: unbroken ? streak.since : now, seen: now };
}

// Has the user been typing steadily long enough to count as in flow?
export function inFlow(since: number, now: number): boolean {
	return since > 0 && now - since >= FLOW_AFTER_MS;
}
