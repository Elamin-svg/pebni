// The user's rhythm: "Work for X minutes, then rest for Z seconds", plus break prompt focus
// (eye rest, leave the IDE, stretch & hydrate, or custom text), natural idle reset when you
// step away from the desk, flow guard, strict mode, and optional planned long breaks.
export type BreakFocus = "eyes" | "away" | "stretch" | "custom";
export const BREAK_FOCUSES: BreakFocus[] = ["eyes", "away", "stretch", "custom"];

export type Rule = {
	workMin: number;
	feet: number;
	restSec: number;
	maxSnoozes: number;
	longAfter: number; // short breaks before a long one; 0: no planned long breaks
	longMin: number; // how long the long break lasts
	focus: BreakFocus;
	flowGuard: boolean;
	strict: boolean;
	lockOnLong: boolean; // opt-in OS lock on planned long breaks (forced false when longAfter is 0)
	idleReset: boolean; // stepping away resets the round cleanly when you return
	idleResetMin: number; // minutes idle before it counts as stepping away
	customTitle: string; // user's own break headline when focus === "custom"
	customNote: string; // user's own break instruction when focus === "custom"
};

type NumberKey = "workMin" | "feet" | "restSec" | "maxSnoozes" | "longAfter" | "longMin" | "idleResetMin";

export const DEFAULT_RULE: Rule = {
	workMin: 20, feet: 20, restSec: 20, maxSnoozes: 2, longAfter: 0, longMin: 5,
	focus: "eyes", flowGuard: true, strict: false, lockOnLong: false,
	idleReset: true, idleResetMin: 3, customTitle: "", customNote: "",
};

// Allowed range for each numeric field: [min, max]
export const RULE_LIMITS: Record<NumberKey, [number, number]> = {
	workMin: [1, 180],
	feet: [5, 100],
	restSec: [5, 1800],
	maxSnoozes: [0, 3],
	longAfter: [0, 8],
	longMin: [1, 60],
	idleResetMin: [1, 15],
};

// Keep a number inside its range; fall back to the default when it is not a number.
function clamp(key: NumberKey, value: unknown): number {
	const [min, max] = RULE_LIMITS[key];
	const n = Math.round(Number(value));
	if (!Number.isFinite(n)) return DEFAULT_RULE[key];
	return Math.min(Math.max(n, min), max);
}

// Trim and cap a custom break text line so it never overflows the break screen.
function cleanText(value: unknown, maxLen: number): string {
	return typeof value === "string" ? value.trim().slice(0, maxLen) : "";
}

// Turn any (possibly partial or broken) input into a valid rule.
export function cleanRule(input?: Partial<Rule> | null): Rule {
	const src = input && typeof input === "object" ? input : {};
	const keys = Object.keys(RULE_LIMITS) as NumberKey[];
	const numbers = Object.fromEntries(keys.map((k) => [k, clamp(k, src[k] ?? DEFAULT_RULE[k])])) as Pick<Rule, NumberKey>;
	return {
		...numbers,
		focus: BREAK_FOCUSES.includes(src.focus as BreakFocus) ? (src.focus as BreakFocus) : DEFAULT_RULE.focus,
		flowGuard: typeof src.flowGuard === "boolean" ? src.flowGuard : DEFAULT_RULE.flowGuard,
		strict: typeof src.strict === "boolean" ? src.strict : DEFAULT_RULE.strict,
		lockOnLong: false, // OS lock removed: long breaks let you close the window instead of logging you out
		idleReset: typeof src.idleReset === "boolean" ? src.idleReset : DEFAULT_RULE.idleReset,
		customTitle: cleanText(src.customTitle, 60),
		customNote: cleanText(src.customNote, 160),
	};
}

export const workMs = (rule: Rule) => rule.workMin * 60_000;
export const restMs = (rule: Rule) => rule.restSec * 1000;
export const longMs = (rule: Rule) => rule.longMin * 60_000;
