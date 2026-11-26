// Watching what the user is doing, so a due break can wait: a focus app in use (a call, or in
// front), or a fullscreen app in front. Checked every few seconds, not on every tick.
import type { Activity } from "../../../core/timer/hold";
import { focusAppBusy, focusAppRunning } from "../../../core/settings/focus-apps";
import { namesUpFrom, runningPrograms } from "./processes";
import { foregroundIsFullscreen, foregroundPid } from "./fullscreen";
import { recordingPids } from "./microphone";

const CHECK_EVERY_MS = 3000;

// True when a focus app is open and busy. The microphone and the front window are only
// looked at when one of them is open at all, which keeps the usual check cheap.
function focusAppInUse(focusApps: string[]): boolean {
	if (!focusApps.length) return false;
	const programs = runningPrograms();
	const running = programs.map((p) => p.name);
	if (!focusAppRunning(focusApps, running)) return false;
	const front = namesUpFrom(foregroundPid(), programs);
	const recording = recordingPids();
	const micUsers = recording && recording.flatMap((pid) => namesUpFrom(pid, programs));
	return focusAppBusy(focusApps, { running, front, micUsers });
}

// What the user is doing right now. A call comes first; it is the stronger reason.
export function currentActivity(focusApps: string[]): Activity {
	if (focusAppInUse(focusApps)) return "call";
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
