// The short text shown on the tray icon (macOS menu bar title, Windows tooltip).
import type { Snapshot } from "../timer/timer";
import { formatClock, formatMinutes } from "../analytics/format";
import { WARNING_MS } from "../timer/flow";
import { heldTrayLabel } from "./hold-copy";

// Minutes while more than a minute is left, then seconds.
function timeLeft(ms: number): string {
	return ms > 60_000 ? formatMinutes(ms) : formatClock(ms);
}

// One line that says what the timer is doing. It only changes once a minute
// (once a second in the last minute), so the tray is not redrawn needlessly.
// On a break it names the kind, for example "Stretch break · 0:15".
export function trayLabel(snap: Snapshot): string {
	if (snap.mode === "break") return `${snap.copy.label} · ${formatClock(snap.leftMs)}`;
	if (snap.mode === "paused") return `Paused · ${timeLeft(snap.leftMs)} left`;
	if (snap.away) return "Stepped away";
	if (snap.holding) return "Break when you stop typing";
	// Held back: Do Not Disturb says so at once; a call or fullscreen once the break is due.
	if (snap.held === "dnd" || (snap.held !== "none" && snap.leftMs <= WARNING_MS)) {
		return heldTrayLabel(snap.held, snap.dnd);
	}
	if (snap.mode === "working") return `Break in ${timeLeft(snap.leftMs)}`;
	return snap.waiting ? "Starts when you type" : "Ready";
}
