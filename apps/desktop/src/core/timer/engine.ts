// The engine holds the timer state, ticks it, and reports every change.
// It runs in the Bun process (and in the browser preview).
import { type Rule } from "./rule";
import * as timer from "./timer";

import { type DayStats, NO_STATS } from "../analytics/stats";
import { type DaySummary } from "../analytics/history";
import { shouldSend } from "./updates";
import { type Activity, DND_CHOICES, noticeActivity, startDnd, stopDnd } from "./hold";
import { closeNotice } from "./notice";

// "coffee" and "noCoffee" answer Pip's offer of a 5-minute coffee break (see breaks.ts).
// "closeNotice" is the x on the "Break in 30s" notice; "skip" does nothing on strict breaks.
// "dnd30", "dnd60" and "dndOn" turn Do Not Disturb on (30 min, 1 hour, until off); "dndOff" ends it.
export type Command =
	| "start" | "pause" | "toggle" | "reset" | "breakNow" | "skip" | "snooze" | "coffee" | "noCoffee"
	| "hideBreak" | "showBreak" | "dnd30" | "dnd60" | "dndOn" | "dndOff" | "closeNotice";

export type Engine = {
	run: (command: Command) => void;
	setRule: (rule: Rule) => void;
	waitForInput: () => void; // hold in "ready" until noticeInput()
	noticeInput: () => void; // the user is back at the keyboard
	setActivity: (activity: Activity) => void; // what the platform sees (a call, fullscreen)
	snapshot: () => timer.Snapshot;
	history: () => DaySummary[]; // rolling 7-day history for persistence
	stop: () => void;
};

// onChange gets the new snapshot and the mode before the change.
// idleMs says how long since the last keyboard or mouse input. The platform supplies it;
// without one (browser preview) the user counts as idle, so breaks start on time.
// stats and history are today's saved break stats and 7-day history, so restarts keep counting.
export function createEngine(
	rule: Rule,
	onChange: (snap: timer.Snapshot, prevMode: timer.Mode) => void,
	now: () => number = Date.now,
	idleMs: () => number = () => Infinity,
	stats: DayStats = NO_STATS,
	history: DaySummary[] = [],
): Engine {
	let state = timer.createTimer(rule, stats, history, now());
	let sent: timer.Snapshot | undefined; // the last snapshot the listener got
	let sentMode: timer.Mode = state.mode; // and its mode (the starting mode before the first)

	// Swap in the next state, and tell the listener when the screens would show something new
	// (a new second, a new mode, ...; see updates.ts). prevMode is the mode it last got.
	function apply(next: timer.TimerState) {
		state = next;
		const snap = timer.snapshot(state, now());
		if (!shouldSend(sent, snap)) return;
		const prevMode = sentMode;
		sent = snap;
		sentMode = snap.mode;
		onChange(snap, prevMode);
	}

	const actions: Record<Command, () => timer.TimerState> = {
		start: () => timer.start(state, now()),
		pause: () => timer.pause(state, now()),
		toggle: () =>
			state.mode === "working" ? timer.pause(state, now()) : timer.start(state, now()),
		reset: () => timer.reset(state, now()),
		breakNow: () => timer.beginBreak(state, now()),
		skip: () => timer.skipBreak(state, now()),
		snooze: () => timer.snooze(state, now()),
		coffee: () => timer.acceptCoffee(state, now()),
		noCoffee: () => timer.declineCoffee(state),
		hideBreak: () => timer.hideBreak(state),
		showBreak: () => timer.showBreak(state),
		dnd30: () => startDnd(state, now(), DND_CHOICES.dnd30),
		dnd60: () => startDnd(state, now(), DND_CHOICES.dnd60),
		dndOn: () => startDnd(state, now(), null),
		dndOff: () => stopDnd(state),
		closeNotice: () => closeNotice(state),
	};

	// Check four times a second.
	const interval = setInterval(() => apply(timer.tick(state, now(), idleMs())), 250);

	return {
		run: (command) => apply(actions[command]()),
		setRule: (r) => apply(timer.setRule(state, r)),
		waitForInput: () => apply(timer.waitForInput(state)),
		noticeInput: () => apply(timer.noticeInput(state, now())),
		setActivity: (activity) => apply(noticeActivity(state, activity)),
		snapshot: () => timer.snapshot(state, now()),
		history: () => state.history,
		stop: () => clearInterval(interval),
	};
}
