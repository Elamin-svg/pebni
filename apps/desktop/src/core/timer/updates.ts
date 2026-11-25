// When is a new snapshot worth sending to the windows?
// The engine checks four times a second, but the screens only show whole seconds,
// so most checks change nothing anyone can see. Sending less keeps CPU use low.
import type { Snapshot } from "./snapshot";

// Everything the screens show, with the time left as the second the clock shows.
function shown(snap: Snapshot): string {
	return JSON.stringify({ ...snap, leftMs: Math.ceil(snap.leftMs / 1000) });
}

// Send when there was nothing before, or when the shown second, the mode or anything else changed.
export function shouldSend(prev: Snapshot | undefined, next: Snapshot): boolean {
	if (!prev) return true;
	if (prev.mode !== next.mode) return true;
	return shown(prev) !== shown(next);
}

// The memory reading as whole megabytes (what the timer window shows).
export function toMegabytes(bytes: number): number {
	return Math.round(Math.max(bytes, 0) / 1_048_576);
}

// Send a memory reading only when the shown number of megabytes changed.
export function shouldSendMemory(prevMb: number | undefined, bytes: number): boolean {
	return prevMb !== toMegabytes(bytes);
}
