// The "Break in 30s" notice: it shows for the first 10 seconds of the warning and closes
// itself after that, or at once when the user closes it. A snooze moves the break, so the
// next warning brings the notice back.
import type { TimerState } from "./timer";
import { WARNING_MS } from "./flow";

export const NOTICE_SHOW_MS = 10_000; // how long the notice stays on screen

// True while the notice should be on screen.
export function noticeShows(s: TimerState, warning: boolean, leftMs: number): boolean {
	if (!warning || s.noticeClosedFor === s.endsAt) return false;
	return leftMs > WARNING_MS - NOTICE_SHOW_MS;
}

// The user closed the notice: keep it closed for this break (until a snooze moves it).
export function closeNotice(s: TimerState): TimerState {
	return s.mode === "working" ? { ...s, noticeClosedFor: s.endsAt } : s;
}
