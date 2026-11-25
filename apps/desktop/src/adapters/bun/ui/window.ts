// The app window, and switching it in and out of break mode.
import { BrowserView, BrowserWindow, Updater } from "electrobun/main";
import type { PebniRPC } from "../../../ports/rpc";
import { setAppIcon } from "../os/app-icon";

const DEV_SERVER_URL = "http://localhost:5173";

// Use the Vite dev server when it is running, else the built files.
// The notice window opens the same page with "#notice".
export async function getViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			return DEV_SERVER_URL;
		} catch {}
	}
	return "views://mainview/index.html";
}

// One RPC link per window (each webview needs its own).
export type Rpc = ReturnType<typeof BrowserView.defineRPC<PebniRPC>>;

// Set when the app quits, so closing the window is allowed then.
let quitting = false;

// Create the window. Closing it only hides it: the app keeps running in the tray.
export async function createMainWindow(rpc: Rpc, hidden: boolean) {
	const win = new BrowserWindow({
		title: "Pebni",
		url: await getViewUrl(),
		rpc,
		hidden,
		frame: { width: 520, height: 800, x: 200, y: 100 },
	});
	setAppIcon(win); // Pip, not the Bun logo
	win.on("will-close", (event) => {
		if (quitting) return;
		(event as { response: { allow: boolean } }).response = { allow: false };
		win.hide();
	});
	return win;
}

// Let the window really close, because the app is quitting.
export function allowClose() {
	quitting = true;
}

// Bring the window to the front (from the tray).
export function showWindow(win: BrowserWindow) {
	win.show();
	if (win.isMinimized()) win.unminimize();
	win.activate();
}

// How the window was before the break, so it can go back to exactly that afterwards.
let before = { hidden: false, minimized: false, maximized: false };
let guard: ReturnType<typeof setInterval> | undefined;
const GUARD_MS = 1000;

// Cover the screen during a break, or give it back.
// When hideWindow is true (user closed a long-break window to watch YouTube etc.),
// leave fullscreen and hide straight to the tray while the break timer keeps running.
export function setBreakMode(win: BrowserWindow, on: boolean, hideWindow = false) {
	if (on) enterBreak(win);
	else leaveBreak(win, hideWindow);
}

// Bring the window back from hidden, minimized or maximized, then cover the whole screen.
// A guard repeats this every second, so minimizing (Win+D, Win+M) cannot hide the break.
function enterBreak(win: BrowserWindow) {
	before = { hidden: !win.isVisible(), minimized: win.isMinimized(), maximized: win.isMaximized() };
	coverScreen(win, true);
	clearInterval(guard);
	guard = setInterval(() => coverScreen(win, false), GUARD_MS);
}

// Make sure the window is shown, restored, fullscreen and on top. Only touches what is off,
// except on the first call, which sets everything and takes the focus.
function coverScreen(win: BrowserWindow, first: boolean) {
	if (first || !win.isVisible()) win.show();
	if (win.isMinimized()) win.unminimize();
	if (first && win.isMaximized()) win.unmaximize(); // fullscreen from maximized keeps the taskbar
	if (first || !win.isAlwaysOnTop()) win.setAlwaysOnTop(true);
	if (first || !win.isFullScreen()) win.setFullScreen(true);
	if (first) win.activate();
}

// Stop guarding, leave fullscreen, and put the window back (or hide straight to tray).
function leaveBreak(win: BrowserWindow, hideWindow = false) {
	clearInterval(guard);
	guard = undefined;
	win.setFullScreen(false);
	win.setAlwaysOnTop(false);
	if (hideWindow) {
		win.hide();
		return;
	}
	if (before.maximized) win.maximize();
	if (before.hidden) win.hide();
	else if (before.minimized) win.minimize();
}
