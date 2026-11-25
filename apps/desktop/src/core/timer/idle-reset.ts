// Natural Idle Reset: stepping away from the desk for longer than the away threshold
// counts as a natural rest, so the work round starts fresh when you return instead of
// firing a break seconds after you sit back down.
import { type Rule, restMs } from "./rule";

// How long the user must be idle before it counts as stepping away:
// at least `idleResetMin` minutes and never shorter than the configured rest length.
export function idleThresholdMs(rule: Rule): number {
	return Math.max(rule.idleResetMin * 60_000, restMs(rule));
}

// True when a real finite OS idle reading shows the user has stepped away.
// Infinite idleMs (browser preview / tests without an OS idle sensor) never counts as away.
export function isSteppedAway(rule: Rule, idleMs: number): boolean {
	return rule.idleReset && Number.isFinite(idleMs) && idleMs >= idleThresholdMs(rule);
}
