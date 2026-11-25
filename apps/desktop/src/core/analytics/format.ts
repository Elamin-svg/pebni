// Positive finite milliseconds, or 0 for broken values (NaN, Infinity, negative).
function safeMs(ms: number): number {
	return Number.isFinite(ms) ? Math.max(ms, 0) : 0;
}

// 1234567 ms -> "20:35" (rounds up, so the clock never shows 0:00 too early)
export function formatClock(ms: number): string {
	const total = Math.ceil(safeMs(ms) / 1000);
	const m = Math.floor(total / 60);
	const s = String(total % 60).padStart(2, "0");
	return `${m}:${s}`;
}

// 840000 ms -> "14 min" (rounds up, like formatClock)
export function formatMinutes(ms: number): string {
	return `${Math.ceil(safeMs(ms) / 60_000)} min`;
}

// (1, "break") -> "1 break", (10, "break") -> "10 breaks"
export function plural(n: number, word: string): string {
	return `${n} ${n === 1 ? word : `${word}s`}`;
}

// 29400 ms -> "30s" (rounds up, like formatClock), for the short "Break in 30s" notice
export function formatSeconds(ms: number): string {
	return `${Math.ceil(safeMs(ms) / 1000)}s`;
}

// 38 -> "Memory: 38 MB", the quiet memory line in the timer window
export function formatMemory(mb: number): string {
	return `Memory: ${mb} MB`;
}

// Active screen time for the day: 0 -> "0m", 2_520_000 -> "42m", 8_100_000 -> "2h 15m"
export function formatHoursMinutes(ms: number): string {
	const mins = Math.floor(safeMs(ms) / 60_000);
	if (mins < 60) return `${mins}m`;
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Break duration in minutes: 0 -> "0 min", 20s -> "<1 min", 720_000 -> "12 min"
export function formatBreakMinutes(ms: number): string {
	const safe = safeMs(ms);
	if (safe <= 0) return "0 min";
	if (safe < 60_000) return "<1 min";
	return `${Math.round(safe / 60_000)} min`;
}
