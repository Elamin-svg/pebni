// The small "Break in 30s" notice: a frameless window in the bottom-right corner.
// It floats above other apps but never takes the keyboard focus.
import { BrowserWindow, Screen } from "electrobun/main";
import { getViewUrl, type Rpc } from "./window";
import { makeNonActivating, showWithoutFocus } from "../os/no-focus";
import { setAppIcon } from "../os/app-icon";

const WIDTH = 360;
const HEIGHT = 168;
const MARGIN = 16; // gap to the screen edges

// Where the notice sits: the bottom-right corner of the main screen, above the taskbar.
function cornerFrame() {
	const area = Screen.getPrimaryDisplay().workArea;
	return {
		x: area.x + area.width - WIDTH - MARGIN,
		y: area.y + area.height - HEIGHT - MARGIN,
		width: WIDTH,
		height: HEIGHT,
	};
}

// Create the notice window, hidden until a break is near.
export async function createNoticeWindow(rpc: Rpc) {
	const win = new BrowserWindow({
		title: "Pebni notice",
		url: `${await getViewUrl()}#notice`,
		rpc,
		hidden: true,
		activate: false,
		titleBarStyle: "hidden",
		frame: cornerFrame(),
	});
	makeNonActivating(win);
	setAppIcon(win);
	return win;
}

// Remember what we last asked for, so we only touch the window when it changes.
let shown = false;
const FADE_MS = 180; // the page fades out first (notice.css), then the window goes

// Show the notice without focusing it, or hide it again after its fade.
export function setNoticeShown(win: BrowserWindow, on: boolean) {
	if (on === shown) return;
	shown = on;
	if (!on) {
		setTimeout(() => !shown && win.hide(), FADE_MS); // not if it came back meanwhile
		return;
	}
	const { x, y } = cornerFrame(); // the screen may have changed since last time
	win.setPosition(x, y);
	showWithoutFocus(win);
}
