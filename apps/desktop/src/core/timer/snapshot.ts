// The view of the timer state at a given moment: everything the screens need to draw.
import { type Mode, type TimerState, flowing } from "./timer";
import { type Rule, workMs } from "./rule";
import { DISAPPOINTED_AT, inWarning } from "./flow";
import { type BreakKind, type Cycle, breakLength, canHideBreak, cyclePosition, planBreak } from "./breaks";
import { type BreakCopy, breakCopy } from "../atmosphere/break-copy";
import { type DayStats, forToday } from "../analytics/stats";
import { type WeekBar, type WeekTotals, breakMsForDay, lastSevenDays, syncStatsToHistory, weekTotals, workMsForDay } from "../analytics/history";
import { type DndView, type HoldReason, dndView, heldBy } from "./hold";
import { type DayPart, dayPart, localHour } from "../atmosphere/day-part";
import { quoteFor } from "../atmosphere/quotes";
import { noticeShows } from "./notice";

const IDLE_RESET_BANNER_MS = 30_000; // how long "Fresh round after stepping away" stays visible

// Floor milliseconds to whole minutes/seconds so snapshot diffs only fire when shown values change.
const wholeMinuteMs = (ms: number) => Math.floor(Math.max(ms, 0) / 60_000) * 60_000;
const wholeSecondMs = (ms: number) => Math.floor(Math.max(ms, 0) / 1000) * 1000;

// What the views need to draw the screen.
export type Snapshot = {
	mode: Mode;
	leftMs: number;
	totalMs: number; // length of the current phase
	waiting: boolean;
	away: boolean; // stepped away from desk under Natural Idle Reset
	recentIdleReset: boolean; // just returned from stepping away and started a fresh round
	warning: boolean; // working, and the break is 30 s away or less
	notice: boolean; // the "Break in 30s" notice is on screen (first 10 s, until closed)
	holding: boolean; // the work time is up; waiting for a pause in typing
	flow: boolean; // working in a steady typing streak; a due break waits a little longer
	snoozes: number; // snoozes used this round
	snoozesLeft: number; // snoozes still allowed this round
	disappointed: boolean; // Pip's mood after the second snooze
	kind: BreakKind; // on break: this break; otherwise: the coming one
	canHideBreak: boolean; // true on long/coffee breaks: user may close the overlay and chill freely
	breakHidden: boolean; // true when user closed the break overlay while the break timer still runs
	copy: BreakCopy; // the words for that kind
	coffeeOffer: boolean; // on break: show Pip's coffee offer
	stats: DayStats; // today's stats
	workMsToday: number; // active coding time today, rounded down to whole minutes
	breakMsToday: number; // completed break time today, rounded down to whole seconds
	week: WeekBar[]; // rolling 7-day strip ending today (no streaks, no guilt)
	weekTotals: WeekTotals; // exact 7-day sum of breaks, breakMs and workMs from `week`
	held: HoldReason; // working, and breaks wait for a call, a fullscreen app or Do Not Disturb
	dnd: DndView; // Do Not Disturb, with the time left in whole minutes
	dayPart: DayPart; // morning, day, evening or night on the user's clock (Pip's mood)
	quote: string; // Pip's words in the bubble, for this part of the day
	cycle: Cycle | null; // "round 2 of 4" while planned long breaks are on, else null
	rule: Rule;
};

// The view of the state at a given moment.
export function snapshot(s: TimerState, now: number): Snapshot {
	const onBreak = s.mode === "break";
	const running = s.mode === "working" || onBreak;
	const leftMs = s.away ? workMs(s.rule) : Math.max(running ? s.endsAt - now : s.leftMs, 0);
	const working = s.mode === "working";
	const kind = onBreak ? s.kind : planBreak(s.breakCount, s.inRow + 1, s.rule).kind;
	const held = working && !s.away ? heldBy(s, now) : "none";
	const part = dayPart(localHour(now));
	const warning = working && !s.away && held === "none" && inWarning(leftMs);
	const stats = forToday(s.stats, now);
	const synced = syncStatsToHistory(s.history, stats, now);
	const week = lastSevenDays(synced, now).map((d) => ({
		...d,
		workMs: wholeMinuteMs(d.workMs),
		breakMs: wholeSecondMs(d.breakMs),
	}));
	return {
		mode: s.mode,
		leftMs,
		totalMs: onBreak ? breakLength(s.kind, s.rule) : workMs(s.rule),
		waiting: s.waiting,
		away: working && s.away,
		recentIdleReset: working && s.lastIdleResetAt > 0 && now >= s.lastIdleResetAt && now - s.lastIdleResetAt < IDLE_RESET_BANNER_MS,
		warning,
		notice: noticeShows(s, warning, leftMs),
		holding: working && !s.away && held === "none" && leftMs === 0,
		flow: !s.away && flowing(s, now),
		snoozes: s.snoozes,
		snoozesLeft: Math.max(s.rule.maxSnoozes - s.snoozes, 0),
		disappointed: s.snoozes >= DISAPPOINTED_AT,
		kind,
		canHideBreak: onBreak && canHideBreak(s.kind),
		breakHidden: onBreak && s.breakHidden,
		copy: breakCopy(kind, s.rule),
		coffeeOffer: onBreak && s.coffeeOffer,
		stats,
		workMsToday: wholeMinuteMs(workMsForDay(synced, now)),
		breakMsToday: wholeSecondMs(breakMsForDay(synced, now)),
		week,
		weekTotals: weekTotals(week),
		held,
		dnd: dndView(s, now),
		dayPart: part,
		quote: quoteFor(part, now, s.openedAt > 0 ? s.openedAt : undefined),
		cycle: cyclePosition(s.inRow, onBreak && s.kind === "long", onBreak, s.rule) ?? null,
		rule: s.rule,
	};
}
