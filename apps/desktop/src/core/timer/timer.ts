// The timer as a small state machine. Every function is pure:
// it takes the current state (and the time) and returns a new state.
import { type Rule, workMs } from "./rule";
import { NO_STREAK, SNOOZE_MS, type Streak, followStreak, inFlow, inWarning, readyToBreak } from "./flow";
import { type BreakKind, breakLength, canHideBreak, planBreak, startsNewRow } from "./breaks";
import { type DayStats, NO_STATS, countEnded, countOffered } from "../analytics/stats";
import { type Activity, heldBy, holdBack } from "./hold";
import { isSteppedAway } from "./idle-reset";
import { type DaySummary, recordBreakMs, recordWorkTick, syncStatsToHistory } from "../analytics/history";

// The view of the state for the screens lives in snapshot.ts.
export { snapshot, type Snapshot } from "./snapshot";

export type Mode = "ready" | "working" | "paused" | "break";

export type TimerState = {
	mode: Mode;
	endsAt: number; // when the current phase ends (only while working or on break)
	leftMs: number; // time left (only while ready or paused)
	waiting: boolean; // ready, and will start on the user's first keypress or mouse move
	snoozes: number; // "Give me 2 minutes" used this round
	rule: Rule;
	kind: BreakKind; // the break under way (only on break)
	coffeeOffer: boolean; // Pip offers a 5-minute coffee break (only on break)
	breakCount: number; // breaks so far, so the short kinds take turns
	inRow: number; // work rounds since the last long rest
	stats: DayStats; // today's breaks offered, taken and skipped
	history: DaySummary[]; // quiet 7-day rolling history (breaks + active work time)
	activity: Activity; // what the platform last saw (a call, a fullscreen app), see hold.ts
	dndUntil: number; // Do Not Disturb holds breaks until then (0: off)
	streak: Streak; // the current typing streak, see flow.ts
	noticeClosedFor: number; // the break (its endsAt) whose notice the user closed, see notice.ts
	away: boolean; // true while stepped away from the desk under Natural Idle Reset
	breakHidden: boolean; // user closed/hid the fullscreen break overlay (e.g. to watch YouTube)
	breakStartedAt: number; // timestamp when current break started (0 outside a break)
	openedAt: number; // timestamp when the app session opened (0 when unset, so slot 0 shows the greeting)
	lastTickAt: number; // last tick timestamp while actively working (for active screen time)
	lastIdleResetAt: number; // when Natural Idle Reset last started a fresh round (0: never)
};

// A fresh timer: ready, with the full work time.
export function createTimer(
	rule: Rule,
	stats: DayStats = NO_STATS,
	history: DaySummary[] = [],
	openedAt = 0,
): TimerState {
	return {
		mode: "ready", endsAt: 0, leftMs: workMs(rule), waiting: false, snoozes: 0, rule,
		kind: "eyes", coffeeOffer: false, breakCount: 0, inRow: 0, stats, history,
		activity: "none", dndUntil: 0, streak: NO_STREAK, noticeClosedFor: 0,
		away: false, breakHidden: false, breakStartedAt: 0, openedAt, lastTickAt: 0, lastIdleResetAt: 0,
	};
}

// A fresh, ready round that keeps the break rotation, today's stats, history and any hold.
function freshRound(s: TimerState, rule: Rule = s.rule): TimerState {
	return {
		...keepHold(createTimer(rule, s.stats, s.history, s.openedAt), s),
		breakCount: s.breakCount, inRow: s.inRow, lastIdleResetAt: s.lastIdleResetAt,
	};
}

// Carry what the platform saw and Do Not Disturb over into a new state.
function keepHold(next: TimerState, s: TimerState): TimerState {
	return { ...next, activity: s.activity, dndUntil: s.dndUntil };
}

// Start or resume the work round.
export function start(s: TimerState, now: number): TimerState {
	if (s.mode === "working" || s.mode === "break") return s;
	return { ...s, mode: "working", endsAt: now + s.leftMs, waiting: false, away: false, lastTickAt: now };
}

// Wait in "ready" until the user is back (used when launched at login).
export function waitForInput(s: TimerState): TimerState {
	if (s.mode !== "ready") return s;
	return { ...s, waiting: true };
}

// The user pressed a key or moved the mouse: start if we were waiting for that.
export function noticeInput(s: TimerState, now: number): TimerState {
	return s.waiting ? start(s, now) : s;
}

// Pause the work round, keeping the time left (none, if the break was already due).
export function pause(s: TimerState, now: number): TimerState {
	if (s.mode !== "working") return s;
	return { ...s, mode: "paused", leftMs: Math.max(s.endsAt - now, 0), away: false, lastTickAt: 0 };
}

// "Give me 2 minutes": move the break to 2 minutes from now.
// Only while the notice shows (not while held or away), and only as often as the rule allows.
export function snooze(s: TimerState, now: number): TimerState {
	if (s.mode !== "working" || s.away || heldBy(s, now) !== "none" || !inWarning(s.endsAt - now)) return s;
	if (s.snoozes >= s.rule.maxSnoozes) return s;
	return { ...s, endsAt: now + SNOOZE_MS, snoozes: s.snoozes + 1 };
}

// Back to a fresh, ready timer. A break cut short this way counts as skipped.
export function reset(s: TimerState, now: number): TimerState {
	const stats = s.mode === "break" ? countEnded(s.stats, false, now) : s.stats;
	const history = syncStatsToHistory(s.history, stats, now);
	return keepHold(createTimer(s.rule, stats, history, s.openedAt), s);
}

// Start a break now. Its kind and length come from the rotation (see breaks.ts).
export function beginBreak(s: TimerState, now: number): TimerState {
	if (s.mode === "break") return s;
	const inRow = s.mode === "ready" ? s.inRow : s.inRow + 1; // a round of work was done
	const plan = planBreak(s.breakCount, inRow, s.rule);
	const stats = countOffered(s.stats, now);
	return {
		...s, mode: "break", endsAt: now + plan.ms, waiting: false, away: false, breakHidden: false,
		breakStartedAt: now, lastTickAt: 0,
		kind: plan.kind, coffeeOffer: plan.offerCoffee, breakCount: s.breakCount + 1,
		inRow: startsNewRow(plan) ? 0 : inRow, stats, history: syncStatsToHistory(s.history, stats, now),
	};
}

// Close/hide the fullscreen overlay during a long or coffee break while keeping the timer running.
export function hideBreak(s: TimerState): TimerState {
	if (s.mode !== "break" || s.breakHidden || !canHideBreak(s.kind)) return s;
	return { ...s, breakHidden: true };
}

// Bring the fullscreen break overlay back after hiding it.
export function showBreak(s: TimerState): TimerState {
	if (s.mode !== "break" || !s.breakHidden) return s;
	return { ...s, breakHidden: false };
}

// "Skip break": end the break early, unless the rule makes breaks strict.
export function skipBreak(s: TimerState, now: number): TimerState {
	return s.rule.strict ? s : endBreak(s, now);
}

// After a break the next work round starts right away. Ending on time counts as taken
// and records the break's rest duration (capped to its planned length so sleep never inflates it).
// Ignored when not on a break (so pressing the Skip shortcut while working does not reset the round).
export function endBreak(s: TimerState, now: number): TimerState {
	if (s.mode !== "break") return s;
	const taken = now >= s.endsAt;
	const stats = countEnded(s.stats, taken, now);
	let history = syncStatsToHistory(s.history, stats, now);
	if (taken && s.breakStartedAt > 0 && now > s.breakStartedAt) {
		const elapsed = Math.min(now - s.breakStartedAt, breakLength(s.kind, s.rule));
		history = recordBreakMs(history, now, elapsed);
	}
	return start({ ...freshRound(s), stats, history }, now);
}

// Yes to Pip's offer: the break becomes a 5-minute coffee break from now.
export function acceptCoffee(s: TimerState, now: number): TimerState {
	if (s.mode !== "break" || !s.coffeeOffer) return s;
	return { ...s, kind: "coffee", coffeeOffer: false, endsAt: now + breakLength("coffee", s.rule) };
}

// No thanks: keep the short break and put the offer away.
export function declineCoffee(s: TimerState): TimerState {
	return s.coffeeOffer ? { ...s, coffeeOffer: false } : s;
}

// A new rule applies at once when the timer is not running.
export function setRule(s: TimerState, rule: Rule): TimerState {
	if (s.mode === "ready") return { ...freshRound(s, rule), waiting: s.waiting };
	return { ...s, rule };
}

// Move to the next phase when the current one is over.
// idleMs is how long since the last keyboard or mouse input (supplied by the platform):
// - If Natural Idle Reset is on and the user steps away past the threshold, the timer pauses
//   silently and starts a fresh work round the moment they return.
// - Otherwise a due break waits for a short pause in typing (or holds while busy).
export function tick(s: TimerState, now: number, idleMs = Infinity): TimerState {
	if (s.mode === "working") {
		const steppedAway = isSteppedAway(s.rule, idleMs);
		if (steppedAway) {
			return s.away ? s : { ...s, away: true, streak: NO_STREAK, lastTickAt: 0 };
		}
		if (s.away) {
			// User returned after stepping away: count it as a natural rest and start a fresh round.
			return {
				...s,
				endsAt: now + workMs(s.rule),
				snoozes: 0,
				streak: NO_STREAK,
				noticeClosedFor: 0,
				away: false,
				lastTickAt: now,
				lastIdleResetAt: now,
			};
		}
		// Record active coding time (capped per tick in history.ts so sleep jumps stay honest).
		const delta = s.lastTickAt > 0 && now > s.lastTickAt ? now - s.lastTickAt : 0;
		const history = delta > 0 ? recordWorkTick(s.history, now, delta) : s.history;
		if (history !== s.history || s.lastTickAt !== now) {
			s = { ...s, history, lastTickAt: now };
		}
	}

	s = followTyping(s, now, idleMs);
	if (s.mode === "working" && heldBy(s, now) !== "none") return holdBack(s, now);
	if (s.mode === "working" && now >= s.endsAt && readyToBreak(now - s.endsAt, idleMs, flowing(s, now))) {
		return beginBreak(s, now);
	}
	if (s.mode === "break" && now >= s.endsAt) return endBreak(s, now);
	return s;
}

// Keep track of the typing streak while working. Returns the same state when nothing changed.
function followTyping(s: TimerState, now: number, idleMs: number): TimerState {
	const streak = s.mode === "working" ? followStreak(s.streak, now, idleMs) : NO_STREAK;
	if (streak.since === s.streak.since && streak.seen === s.streak.seen) return s;
	return { ...s, streak };
}

// Working, in flow, and the user lets flow hold the break a little.
export function flowing(s: TimerState, now: number): boolean {
	return s.mode === "working" && s.rule.flowGuard && inFlow(s.streak.since, now);
}
