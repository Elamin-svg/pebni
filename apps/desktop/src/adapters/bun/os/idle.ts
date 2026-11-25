// How long since the user last pressed a key or moved the mouse, read from the OS.
// Windows: GetLastInputInfo (user32). macOS: CGEventSourceSecondsSinceLastEventType.
// Other systems: always 0 ("active just now"), so nothing waits forever.
import { dlopen, FFIType, ptr } from "bun:ffi";

type IdleReader = () => number;

// Windows: last input tick vs. the current tick, both in ms since boot.
function windowsReader(): IdleReader {
	const user32 = dlopen("user32.dll", {
		GetLastInputInfo: { args: [FFIType.ptr], returns: FFIType.i32 },
	});
	const kernel32 = dlopen("kernel32.dll", {
		GetTickCount: { args: [], returns: FFIType.u32 },
	});
	// LASTINPUTINFO: { UINT cbSize; DWORD dwTime; }
	const info = new Uint32Array(2);
	info[0] = 8;

	return () => {
		if (!user32.symbols.GetLastInputInfo(ptr(info))) return 0;
		// ">>> 0" keeps it right when the 32-bit tick counter wraps (every 49 days)
		return (kernel32.symbols.GetTickCount() - info[1]!) >>> 0;
	};
}

// macOS: seconds since any input event in the HID system state.
function macReader(): IdleReader {
	const cg = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", {
		CGEventSourceSecondsSinceLastEventType: {
			args: [FFIType.i32, FFIType.u32],
			returns: FFIType.f64,
		},
	});
	const HID_SYSTEM_STATE = 1;
	const ANY_INPUT_EVENT = 0xffffffff;
	return () =>
		Math.round(
			cg.symbols.CGEventSourceSecondsSinceLastEventType(HID_SYSTEM_STATE, ANY_INPUT_EVENT) * 1000,
		);
}

// Pick the reader for this OS once; fall back to "active" if loading fails.
function loadReader(): IdleReader {
	try {
		if (process.platform === "win32") return windowsReader();
		if (process.platform === "darwin") return macReader();
	} catch (error) {
		console.warn("Idle time is not available:", error);
	}
	return () => 0;
}

let reader: IdleReader | undefined;

// Milliseconds since the last keyboard or mouse input anywhere on the system.
export function getIdleMs(): number {
	reader ??= loadReader();
	return reader();
}
