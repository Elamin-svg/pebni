// "Make breaks worth taking": which kind of break comes next, and how long it lasts.
// Short breaks rotate between kinds. With planned long breaks (rule.longAfter > 0, for example
// Pomodoro: 3 short breaks, then 30 minutes) the cycle decides. Without them, after about an hour
// of work the break is a long one, and after three rounds in a row Pip offers a coffee break.
import { type Rule, longMs, restMs, workMs } from "./rule";

export type BreakKind = "eyes" | "stretch" | "posture" | "water" | "long" | "coffee";

// Every kind, for views that set one CSS class per kind.
export const BREAK_KINDS: BreakKind[] = ["eyes", "stretch", "posture", "water", "long", "coffee"];

// The short breaks, in the order they take turns.
export const SHORT_KINDS: BreakKind[] = ["eyes", "stretch", "posture", "water"];

export const LONG_BREAK_MS = 5 * 60_000; // the long break and the coffee break
export const LONG_EVERY_MS = 60 * 60_000; // a long break after about this much work
export const COFFEE_AFTER = 3; // rounds in a row before Pip offers coffee

// What the coming break will be.
export type BreakPlan = {
	kind: BreakKind;
	ms: number; // how long it lasts
	offerCoffee: boolean; // Pip offers to turn it into a 5-minute coffee break
};

// Long and coffee breaks can be hidden (window closed) so developers can watch YouTube,
// listen to music or relax freely while the break timer keeps running in the tray.
export function canHideBreak(kind: BreakKind): boolean {
	return kind === "long" || kind === "coffee";
}

// Never lock/log out the OS session on breaks. Kept for backwards compatibility.
export function locksScreen(_kind: BreakKind, _rule: Rule): boolean {
	return false;
}

// How long a break of this kind lasts. Long ones are never shorter than the user's own rest.
export function breakLength(kind: BreakKind, rule: Rule): number {
	if (kind === "long" && rule.longAfter > 0) return Math.max(longMs(rule), restMs(rule));
	const long = kind === "long" || kind === "coffee";
	return long ? Math.max(LONG_BREAK_MS, restMs(rule)) : restMs(rule);
}

// The short kind whose turn it is, after `count` breaks so far.
export function shortKind(count: number): BreakKind {
	return SHORT_KINDS[count % SHORT_KINDS.length]!;
}

// Plan the break after `count` earlier breaks, with `inRow` work rounds done since the last
// long rest (this round included). The coffee offer comes first: with the default 20-minute
// rounds, three rounds are the hour, and Pip asks rather than insists.
export function planBreak(count: number, inRow: number, rule: Rule): BreakPlan {
	const kind = shortKind(count);
	if (rule.longAfter > 0) return planCycleBreak(kind, inRow, rule);
	if (inRow >= COFFEE_AFTER) return { kind, ms: breakLength(kind, rule), offerCoffee: true };
	if (inRow * workMs(rule) >= LONG_EVERY_MS) {
		return { kind: "long", ms: breakLength("long", rule), offerCoffee: false };
	}
	return { kind, ms: breakLength(kind, rule), offerCoffee: false };
}

// A long break, or a coffee offer (taken or not), starts counting rounds from zero again.
export function startsNewRow(plan: BreakPlan): boolean {
	return plan.kind === "long" || plan.offerCoffee;
}

// Planned long breaks: `longAfter` short breaks, then a long one, then the cycle starts over.
function planCycleBreak(short: BreakKind, inRow: number, rule: Rule): BreakPlan {
	const kind = inRow > rule.longAfter ? "long" : short;
	return { kind, ms: breakLength(kind, rule), offerCoffee: false };
}

// Where the user is in the cycle of planned long breaks: round `round` of `of`
// (the last round ends in the long break). Undefined while long breaks are off.
export type Cycle = { round: number; of: number };

export function cyclePosition(inRow: number, onLongBreak: boolean, onBreak: boolean, rule: Rule): Cycle | undefined {
	if (rule.longAfter <= 0) return undefined;
	const of = rule.longAfter + 1;
	if (onLongBreak) return { round: of, of };
	const round = onBreak ? inRow : inRow + 1; // on a break, inRow already counts the round done
	return { round: Math.min(Math.max(round, 1), of), of };
}
