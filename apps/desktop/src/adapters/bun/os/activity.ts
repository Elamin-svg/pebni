// Watching what the user is doing, so a due break can wait: a focus app running (a call),
// or a fullscreen app in front. Checked every few seconds, not on every tick.
import type { Activity } from "../../../core/timer/hold";
import { focusAppRunning } from "../../../core/settings/focus-apps";
import { runningProcesses } from "./processes";
import { foregroundIsFullscreen } from "./fullscreen";

const CHECK_EVERY_MS = 3000;

// What the user is doing right now. A call comes first; it is the stronger reason.
export function currentActivity(focusApps: string[]): Activity {
	if (focusApps.length && focusAppRunning(focusApps, runningProcesses())) return "call";
	if (foregroundIsFullscreen()) return "fullscreen";
	return "none";
}

// Check every few seconds and report only changes. Returns a function that stops it.
export function watchActivity(focusApps: () => string[], onChange: (a: Activity) => void) {
	let last: Activity = "none";
	const check = () => {
		const next = currentActivity(focusApps());
		if (next === last) return;
		last = next;
		console.log(next === "none" ? "Nothing holds breaks any more" : `Holding breaks: ${next}`);
		onChange(next);
	};
	check();
	const timer = setInterval(check, CHECK_EVERY_MS);
	return () => clearInterval(timer);
}
