// Pip's icon on the windows and in the taskbar (Windows only).
// The app runs inside bun.exe, so Windows showed Bun's logo. We give the process its own
// taskbar identity and set Pip's .ico on every window we open.
import { dlopen, FFIType, type Pointer } from "bun:ffi";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BrowserWindow } from "electrobun/main";

const APP_ID = "app.pebni.desktop";
const WM_SETICON = 0x80;
const ICON_SMALL = 0;
const ICON_BIG = 1;
const IMAGE_ICON = 1;
const LR_LOADFROMFILE = 0x10;

// A wide (UTF-16) C string for the Windows API.
const wide = (text: string) => Buffer.from(`${text}\0`, "utf16le");

// Load user32 and shell32 once, only on Windows.
function loadWin() {
	const user32 = dlopen("user32.dll", {
		LoadImageW: {
			args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.i32, FFIType.i32, FFIType.u32],
			returns: FFIType.ptr,
		},
		SendMessageW: { args: [FFIType.ptr, FFIType.u32, FFIType.u64, FFIType.ptr], returns: FFIType.i64 },
	}).symbols;
	const shell32 = dlopen("shell32.dll", {
		SetCurrentProcessExplicitAppUserModelID: { args: [FFIType.ptr], returns: FFIType.i32 },
	}).symbols;
	return { user32, shell32 };
}

const win = process.platform === "win32" ? loadWin() : undefined;

// Pip's .ico, copied into the build next to the views (see electrobun.config.ts).
function iconPath(): string | undefined {
	const path = join(dirname(process.execPath), "..", "Resources", "app", "views", "tray.ico");
	return existsSync(path) ? path : undefined;
}

// The icons in the two sizes Windows asks for, loaded once.
let icons: { big: Pointer | null; small: Pointer | null } | undefined;

function loadIcons() {
	const path = iconPath();
	if (!win || !path) return { big: null, small: null };
	const file = wide(path);
	const load = (size: number) => win.user32.LoadImageW(null, file, IMAGE_ICON, size, size, LR_LOADFROMFILE) as Pointer | null;
	return { big: load(48), small: load(16) };
}

// Give the app its own taskbar identity, so it is not grouped as Bun. Call once, early.
export function useOwnTaskbarIdentity() {
	if (!win) return;
	try {
		win.shell32.SetCurrentProcessExplicitAppUserModelID(wide(APP_ID));
	} catch (error) {
		console.warn("Could not set the taskbar identity:", error);
	}
}

// Put Pip's icon on a window's title bar and taskbar button.
export function setAppIcon(window: BrowserWindow) {
	if (!win || !window.ptr) return;
	try {
		icons ??= loadIcons();
		if (icons.big) win.user32.SendMessageW(window.ptr, WM_SETICON, ICON_BIG, icons.big);
		if (icons.small) win.user32.SendMessageW(window.ptr, WM_SETICON, ICON_SMALL, icons.small);
	} catch (error) {
		console.warn("Could not set the window icon:", error);
	}
}
