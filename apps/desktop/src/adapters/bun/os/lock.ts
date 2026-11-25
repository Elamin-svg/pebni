// Locking the computer, for users who opt into OS-locking on planned long breaks.
// Windows: LockWorkStation (user32). macOS: the display sleeps, which locks when a password is set.
// Linux: the desktop session's own lock. Any failure is ignored: the break screen still shows.
import { dlopen, FFIType } from "bun:ffi";

const LOCK_DELAY_MS = 3000; // the break screen shows first, so the lock never comes as a surprise
let pending: ReturnType<typeof setTimeout> | undefined;

// Lock right now, in the way this system supports.
function lockNow() {
	pending = undefined;
	try {
		if (process.platform === "win32") {
			const user32 = dlopen("user32.dll", { LockWorkStation: { args: [], returns: FFIType.i32 } });
			user32.symbols.LockWorkStation();
			user32.close();
		} else if (process.platform === "darwin") {
			Bun.spawn(["pmset", "displaysleepnow"]);
		} else {
			Bun.spawn(["loginctl", "lock-session"]);
		}
	} catch (error) {
		console.error("Could not lock the screen:", error);
	}
}

// Cancel a pending lock (for example when the user skips or ends the break within 3 s).
export function cancelLock() {
	if (!pending) return;
	clearTimeout(pending);
	pending = undefined;
}

// Lock a few seconds after the long break starts, replacing any earlier pending lock.
export function lockSoon() {
	cancelLock();
	pending = setTimeout(lockNow, LOCK_DELAY_MS);
}
