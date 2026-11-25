// Quiet 7-day rhythm history: breaks taken/offered and active screen time per local day.
// No streaks, no badges, no guilt — just an honest look at how heavy the week has been.
import { type DayStats, dayKey } from "./stats";

export type DaySummary = {
	day: string; // local date "YYYY-MM-DD"
	offered: number;
	taken: number;
	skipped: number;
	workMs: number; // active coding/work time recorded that day
	breakMs: number; // time spent resting in completed breaks that day
};

export type WeekBar = DaySummary & {
	label: string; // "Mon", "Tue", ... or "Today"
	isToday: boolean;
};

export type WeekTotals = {
	breaks: number;
	breakMs: number;
	workMs: number;
};

const MAX_STORED_DAYS = 14;
const MAX_TICK_MS = 5_000; // cap per tick so OS sleep/hibernate jumps never inflate screen time
const MAX_DAY_WORK_MS = 24 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Non-negative integer count, or 0 for broken values.
function whole(value: unknown): number {
	const n = Math.floor(Number(value));
	return Number.isFinite(n) && n > 0 ? n : 0;
}

// Sanitize a persisted history array from settings.json or localStorage.
export function cleanHistory(input: unknown): DaySummary[] {
	if (!Array.isArray(input)) return [];
	const byDay = new Map<string, DaySummary>();
	for (const item of input) {
		if (!item || typeof item !== "object") continue;
		const r = item as Partial<DaySummary>;
		if (typeof r.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.day)) continue;
		const offered = whole(r.offered);
		const taken = Math.min(whole(r.taken), offered);
		const skipped = Math.min(whole(r.skipped), offered - taken);
		const workMs = Math.min(whole(r.workMs), MAX_DAY_WORK_MS);
		const breakMs = Math.min(whole(r.breakMs), MAX_DAY_WORK_MS);
		byDay.set(r.day, { day: r.day, offered, taken, skipped, workMs, breakMs });
	}
	return [...byDay.values()]
		.sort((a, b) => a.day.localeCompare(b.day))
		.slice(-MAX_STORED_DAYS);
}

// Update or insert a single day entry, keeping the list sorted and capped.
function upsert(history: DaySummary[], entry: DaySummary): DaySummary[] {
	const next = history.filter((d) => d.day !== entry.day);
	next.push(entry);
	return next.sort((a, b) => a.day.localeCompare(b.day)).slice(-MAX_STORED_DAYS);
}

// Sync today's break counts into the rolling history while keeping today's recorded workMs and breakMs.
export function syncStatsToHistory(history: DaySummary[], stats: DayStats, now: number): DaySummary[] {
	const day = dayKey(now);
	if (stats.day !== day) return history;
	const prev = history.find((d) => d.day === day);
	if (prev && prev.offered === stats.offered && prev.taken === stats.taken && prev.skipped === stats.skipped) {
		return history;
	}
	return upsert(history, {
		day,
		offered: stats.offered,
		taken: stats.taken,
		skipped: stats.skipped,
		workMs: prev?.workMs ?? 0,
		breakMs: prev?.breakMs ?? 0,
	});
}

// Add active working time to today's entry. Capped per tick so sleep/clock jumps stay honest.
export function recordWorkTick(history: DaySummary[], now: number, deltaMs: number): DaySummary[] {
	if (!Number.isFinite(deltaMs) || deltaMs <= 0) return history;
	const add = Math.min(Math.round(deltaMs), MAX_TICK_MS);
	const day = dayKey(now);
	const prev = history.find((d) => d.day === day) ?? { day, offered: 0, taken: 0, skipped: 0, workMs: 0, breakMs: 0 };
	const workMs = Math.min(prev.workMs + add, MAX_DAY_WORK_MS);
	return upsert(history, { ...prev, workMs });
}

// Add completed break rest duration to today's entry.
export function recordBreakMs(history: DaySummary[], now: number, durationMs: number): DaySummary[] {
	if (!Number.isFinite(durationMs) || durationMs <= 0) return history;
	const add = Math.min(Math.round(durationMs), MAX_DAY_WORK_MS);
	const day = dayKey(now);
	const prev = history.find((d) => d.day === day) ?? { day, offered: 0, taken: 0, skipped: 0, workMs: 0, breakMs: 0 };
	const breakMs = Math.min(prev.breakMs + add, MAX_DAY_WORK_MS);
	return upsert(history, { ...prev, breakMs });
}

// Today's active work time in milliseconds.
export function workMsForDay(history: DaySummary[], now: number): number {
	return history.find((d) => d.day === dayKey(now))?.workMs ?? 0;
}

// Today's completed break duration in milliseconds.
export function breakMsForDay(history: DaySummary[], now: number): number {
	return history.find((d) => d.day === dayKey(now))?.breakMs ?? 0;
}

// Sum the displayed 7-day bars so week totals always reconcile exactly with each day.
export function weekTotals(week: WeekBar[]): WeekTotals {
	return week.reduce(
		(acc, d) => ({
			breaks: acc.breaks + d.taken,
			breakMs: acc.breakMs + d.breakMs,
			workMs: acc.workMs + d.workMs,
		}),
		{ breaks: 0, breakMs: 0, workMs: 0 },
	);
}

// Ordered 7-day window ending today (6 days ago -> today), with honest zeros for quiet days.
export function lastSevenDays(history: DaySummary[], now: number): WeekBar[] {
	const byDay = new Map(history.map((d) => [d.day, d]));
	const today = new Date(now);
	today.setHours(12, 0, 0, 0); // noon avoids DST midnight edge shifts
	const bars: WeekBar[] = [];
	for (let offset = 6; offset >= 0; offset--) {
		const dt = new Date(today.getTime() - offset * DAY_MS);
		const key = dayKey(dt.getTime());
		const rec = byDay.get(key) ?? { day: key, offered: 0, taken: 0, skipped: 0, workMs: 0, breakMs: 0 };
		const isToday = offset === 0;
		bars.push({
			...rec,
			label: isToday ? "Today" : WEEKDAYS[dt.getDay()]!,
			isToday,
		});
	}
	return bars;
}
