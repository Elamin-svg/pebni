// "Respect what's running": holding a due break back while the user is busy.
// The platform reports what it sees (a call, a fullscreen app); Do Not Disturb is the user's own
// choice with an end time. While held, the break stays one notice away (30 s), so when the
// hold lifts the "Break in 30s" notice shows first: that is the short grace.
import type { TimerState } from "./timer";
import { WARNING_MS } from "./flow";

// What the platform sees right now. "call" means one of the user's focus apps is running.
export type Activity = "none" | "call" | "fullscreen";

// Why breaks are held back right now ("none" when they are not).
export type HoldReason = Activity | "dnd";

export const DND_FOREVER = Number.MAX_SAFE_INTEGER; // "until I turn it off" (safe in JSON)
export const DND_CHOICES = { dnd30: 30 * 60_000, dnd60: 60 * 60_000 } as const;

// The hold that applies at `now`. Do Not Disturb comes first: the user asked for it.
export function heldBy(s: TimerState, now: number): HoldReason {
	if (now < s.dndUntil) return "dnd";
	return s.activity;
}

// While held, keep the break at least a notice away. Returns the same state when nothing moves.
export function holdBack(s: TimerState, now: number): TimerState {
	const earliest = now + WARNING_MS;
	return s.endsAt < earliest ? { ...s, endsAt: earliest } : s;
}

// The platform saw something new (or saw it end).
export function noticeActivity(s: TimerState, activity: Activity): TimerState {
	return s.activity === activity ? s : { ...s, activity };
}

// Turn on Do Not Disturb for `ms` from now, or until turned off when `ms` is null.
export function startDnd(s: TimerState, now: number, ms: number | null): TimerState {
	return { ...s, dndUntil: ms === null ? DND_FOREVER : now + ms };
}

// Turn Do Not Disturb off.
export function stopDnd(s: TimerState): TimerState {
	return s.dndUntil === 0 ? s : { ...s, dndUntil: 0 };
}

// Do Not Disturb as the screens show it: off, or on with the time left (null: until turned off).
export type DndView = { on: boolean; leftMs: number | null };

// The Do Not Disturb view at `now`. The time left is rounded up to whole minutes, the most
// the screens show, so the snapshot does not change (and get sent) on every tick.
export function dndView(s: TimerState, now: number): DndView {
	if (now >= s.dndUntil) return { on: false, leftMs: null };
	if (s.dndUntil === DND_FOREVER) return { on: true, leftMs: null };
	return { on: true, leftMs: Math.ceil((s.dndUntil - now) / 60_000) * 60_000 };
}
