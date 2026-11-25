// Is the app in the foreground fullscreen (a presentation, a game, a video)?
// Windows only, through user32: the foreground window covers its whole monitor and is not
// simply maximized. The desktop and Pebni's own windows never count. Elsewhere: false.
import { dlopen, FFIType, ptr, type Pointer } from "bun:ffi";

const MONITOR_DEFAULTTONEAREST = 2;
const DESKTOP_CLASSES = ["Progman", "WorkerW", "Shell_TrayWnd"]; // the desktop and the taskbar

// Load user32 once, only on Windows.
function loadUser32() {
	return dlopen("user32.dll", {
		GetForegroundWindow: { args: [], returns: FFIType.ptr },
		GetWindowRect: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
		MonitorFromWindow: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.ptr },
		GetMonitorInfoW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
		IsZoomed: { args: [FFIType.ptr], returns: FFIType.i32 },
		GetClassNameW: { args: [FFIType.ptr, FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
		GetWindowThreadProcessId: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.u32 },
	}).symbols;
}

let user32: ReturnType<typeof loadUser32> | undefined;

// The window class name, for example "Progman" for the desktop.
function classOf(hwnd: Pointer): string {
	const buf = new Uint16Array(64);
	const len = user32!.GetClassNameW(hwnd, ptr(buf), buf.length);
	return String.fromCharCode(...buf.subarray(0, len));
}

// The id of the process that owns the window.
function ownerOf(hwnd: Pointer): number {
	const pid = new Uint32Array(1);
	user32!.GetWindowThreadProcessId(hwnd, ptr(pid));
	return pid[0]!;
}

// True when the rectangle [left, top, right, bottom] covers the other one completely.
function covers(win: Int32Array, mon: Int32Array): boolean {
	return win[0]! <= mon[0]! && win[1]! <= mon[1]! && win[2]! >= mon[2]! && win[3]! >= mon[3]!;
}

// The foreground window's check (Windows).
function windowsFullscreen(): boolean {
	user32 ??= loadUser32();
	const hwnd = user32.GetForegroundWindow() as Pointer | null;
	if (!hwnd || user32.IsZoomed(hwnd)) return false; // maximized is not fullscreen
	if (ownerOf(hwnd) === process.pid || DESKTOP_CLASSES.includes(classOf(hwnd))) return false;

	const rect = new Int32Array(4); // RECT
	if (!user32.GetWindowRect(hwnd, ptr(rect))) return false;
	const monitor = user32.MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) as Pointer | null;
	const info = new Int32Array(10); // MONITORINFO: cbSize, rcMonitor, rcWork, dwFlags
	info[0] = 40;
	if (!monitor || !user32.GetMonitorInfoW(monitor, ptr(info))) return false;
	return covers(rect, info.subarray(1, 5));
}

// True while a fullscreen app is in front. Never throws.
export function foregroundIsFullscreen(): boolean {
	if (process.platform !== "win32") return false;
	try {
		return windowsFullscreen();
	} catch (error) {
		console.warn("Could not check for fullscreen apps:", error);
		return false;
	}
}
