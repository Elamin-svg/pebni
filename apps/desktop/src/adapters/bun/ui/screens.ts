// During a break, one extra break screen on every monitor the main window is not on.
// The windows are made fresh for each break, so a monitor added or removed since the last
// break is picked up, and nothing is kept around between breaks.
import { BrowserWindow, Screen, type Display } from "electrobun/main";
import type { Snapshot } from "../../../core/timer/timer";
import { getViewUrl, type Rpc } from "./window";
import { setAppIcon } from "../os/app-icon";

type Rect = Display["bounds"];
type BreakScreen = { win: BrowserWindow; rpc: Rpc };

let screens: BreakScreen[] = [];
let round = 0; // goes up on every open and close, so a late open can tell it is stale

// Is the point inside the rectangle?
function contains(r: Rect, x: number, y: number): boolean {
	return x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
}

// Every display except the one holding the middle of the main window (or else the primary one).
function otherDisplays(main: BrowserWindow): Display[] {
	const all = Screen.getAllDisplays();
	const f = main.getFrame();
	const home =
		all.find((d) => contains(d.bounds, f.x + f.width / 2, f.y + f.height / 2)) ??
		all.find((d) => d.isPrimary);
	return all.filter((d) => d.id !== home?.id);
}

// One borderless, always-on-top break window covering the display.
function openOn(display: Display, url: string, rpc: Rpc): BrowserWindow {
	const { x, y, width, height } = display.bounds;
	const win = new BrowserWindow({
		title: "Pebni break",
		url,
		rpc,
		titleBarStyle: "hidden",
		activate: false, // the main window keeps the focus
		frame: { x, y, width, height },
	});
	setAppIcon(win);
	win.setAlwaysOnTop(true);
	win.setFullScreen(true);
	return win;
}

// Cover the other monitors. makeRpc gives each window its own link with the usual handlers,
// so Skip and the coffee offer work from any screen.
export async function openBreakScreens(main: BrowserWindow, makeRpc: () => Rpc) {
	const mine = ++round;
	const displays = otherDisplays(main);
	if (!displays.length) return;
	const url = `${await getViewUrl()}#screen`;
	if (mine !== round) return; // the break ended while we waited
	screens = displays.map((d) => {
		const rpc = makeRpc();
		return { win: openOn(d, url, rpc), rpc };
	});
	console.log(`Break shown on ${screens.length + 1} screens`);
}

// Close every extra break screen.
export function closeBreakScreens() {
	round++;
	for (const s of screens) s.win.close();
	screens = [];
}

// Pass the timer state on to every extra break screen.
export function sendToBreakScreens(snap: Snapshot) {
	for (const s of screens) s.rpc.send.state(snap);
}
