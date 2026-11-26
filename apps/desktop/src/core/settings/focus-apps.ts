// The user's focus apps: process names that hold breaks back while they run (calls, recording).

export const DEFAULT_FOCUS_APPS = ["zoom.exe", "ms-teams.exe", "teams.exe"];
const MAX_APPS = 20;
const MAX_NAME = 60;

// One process name as we compare it: trimmed and lower case, or "" when it is not usable.
export function cleanAppName(input: unknown): string {
	if (typeof input !== "string") return "";
	const name = input.trim().toLowerCase();
	return name.length <= MAX_NAME && !/[\\/:*?"<>|]/.test(name) ? name : "";
}

// Turn any saved value into a clean list without duplicates. A missing list gets the defaults.
export function cleanFocusApps(input: unknown): string[] {
	if (!Array.isArray(input)) return [...DEFAULT_FOCUS_APPS];
	const names = input.map(cleanAppName).filter((n) => n !== "");
	return [...new Set(names)].slice(0, MAX_APPS);
}

// True when one of the focus apps is in the list of running processes.
export function focusAppRunning(focusApps: string[], running: string[]): boolean {
	const lower = new Set(running.map((n) => n.toLowerCase()));
	return focusApps.some((app) => lower.has(app));
}

// What the platform sees about the programs right now. "Programs" include the ones that started
// them, since apps often record or draw their window from a helper process.
export type AppSignals = {
	running: string[]; // every running program, for example "Discord.exe"
	front: string[]; // the program whose window is in front ([] when unknown)
	micUsers: string[] | null; // programs recording from a microphone; null when the platform cannot tell
};

// True when a focus app is open AND busy: in a call (recording from the microphone) or in front.
// Apps like Discord or Teams sit in the tray all day, so merely running is not enough.
// When the platform cannot see the microphone, running is the best guess left.
export function focusAppBusy(focusApps: string[], s: AppSignals): boolean {
	if (s.micUsers === null) return focusAppRunning(focusApps, s.running);
	return focusAppRunning(focusApps, [...s.front, ...s.micUsers]);
}
