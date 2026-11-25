// Showing a window on top without taking the keyboard focus from the app the user is in.
// On Windows, Electrobun's showInactive() still makes the window the foreground window,
// so there we ask user32 directly. Elsewhere we use Electrobun's own calls.
import { dlopen, FFIType, type Pointer } from "bun:ffi";
import type { BrowserWindow } from "electrobun/main";

const GWL_EXSTYLE = -20;
const WS_EX_TOOLWINDOW = 0x80; // no taskbar button
const WS_EX_APPWINDOW = 0x40000; // forces a taskbar button; removed
const WS_EX_NOACTIVATE = 0x08000000; // clicks and showing never activate it
const HWND_TOPMOST = -1;
const SWP_NOSIZE = 0x1;
const SWP_NOMOVE = 0x2;
const SWP_NOACTIVATE = 0x10;
const SWP_SHOWWINDOW = 0x40;

// Load user32 once, only on Windows.
function loadUser32() {
	return dlopen("user32.dll", {
		GetWindowLongPtrW: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.i64 },
		SetWindowLongPtrW: { args: [FFIType.ptr, FFIType.i32, FFIType.i64], returns: FFIType.i64 },
		SetWindowPos: {
			args: [FFIType.ptr, FFIType.i64, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.i32, FFIType.u32],
			returns: FFIType.i32,
		},
	}).symbols;
}

const user32 = process.platform === "win32" ? loadUser32() : undefined;

// The native window handle (an HWND on Windows).
function handleOf(win: BrowserWindow): Pointer | null {
	return win.ptr;
}

// Make the window one that never takes focus and has no taskbar button (Windows only).
export function makeNonActivating(win: BrowserWindow) {
	const hwnd = handleOf(win);
	if (!user32 || !hwnd) return;
	const style = BigInt(user32.GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
	const next = (style | BigInt(WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW)) & ~BigInt(WS_EX_APPWINDOW);
	user32.SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next);
}

// Show the window always on top, leaving the focus where it is.
export function showWithoutFocus(win: BrowserWindow) {
	const hwnd = handleOf(win);
	if (!user32 || !hwnd) {
		win.setAlwaysOnTop(true);
		win.showInactive();
		return;
	}
	const flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW;
	user32.SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, flags);
}
