// Deciding, from the system idle time, whether the user touched the computer.

// True when there was keyboard or mouse input after `since`.
// The last input happened `idleMs` before `now`.
export function inputSince(since: number, now: number, idleMs: number): boolean {
	return now - idleMs > since;
}
