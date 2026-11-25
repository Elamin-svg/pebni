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
