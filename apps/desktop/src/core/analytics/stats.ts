// Quiet stats: breaks offered, taken and skipped today. They start over at local midnight.
// Skipped breaks are simply not counted as taken. No streaks, nothing to lose.
import { plural } from "./format";

export type DayStats = {
	day: string; // local date, "2026-11-23"; "" before the first count
	offered: number;
	taken: number;
	skipped: number;
};

export const NO_STATS: DayStats = { day: "", offered: 0, taken: 0, skipped: 0 };

// The local date of a moment, as "YYYY-MM-DD".
export function dayKey(now: number): string {
	const d = new Date(now);
	const mm = String(d.getMonth() + 1).padStart(2, "0");
	const dd = String(d.getDate()).padStart(2, "0");
	return `${d.getFullYear()}-${mm}-${dd}`;
}

// The stats for the day of `now`: the same ones, or a fresh day after midnight.
export function forToday(stats: DayStats, now: number): DayStats {
	const day = dayKey(now);
	return stats.day === day ? stats : { ...NO_STATS, day };
}

// A break began.
export function countOffered(stats: DayStats, now: number): DayStats {
	const today = forToday(stats, now);
	return { ...today, offered: today.offered + 1 };
}

// A break ended: on time (taken) or early (skipped).
// A break that began before midnight is not counted in the new day.
export function countEnded(stats: DayStats, taken: boolean, now: number): DayStats {
	const today = forToday(stats, now);
	if (today.taken + today.skipped >= today.offered) return today;
	return taken ? { ...today, taken: today.taken + 1 } : { ...today, skipped: today.skipped + 1 };
}

// A whole number of at least 0, or 0.
function count(value: unknown): number {
	const n = Math.floor(Number(value));
	return Number.isFinite(n) && n > 0 ? n : 0;
}

// Turn any saved (possibly broken) value into valid stats.
export function cleanStats(input?: Partial<DayStats> | null): DayStats {
	const src = input && typeof input === "object" ? input : {};
	const offered = count(src.offered);
	const taken = Math.min(count(src.taken), offered);
	return {
		day: typeof src.day === "string" ? src.day : "",
		offered,
		taken,
		skipped: Math.min(count(src.skipped), offered - taken),
	};
}

// Today's quiet break count with zero ratio guilt, e.g. "4 breaks today."
export function statsLine(stats: DayStats): string {
	if (stats.taken === 0) return "No breaks yet today.";
	return `${plural(stats.taken, "break")} today.`;
}
