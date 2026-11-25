import { expect, test } from "bun:test";
import { DEFAULT_RULE } from "./rule";
import * as timer from "./timer";
import { createEngine } from "./engine";
import { DND_CHOICES, dndView, heldBy, noticeActivity, startDnd, stopDnd } from "./hold";
import { holdLine } from "../atmosphere/hold-copy";
import { cleanFocusApps, DEFAULT_FOCUS_APPS, focusAppRunning } from "../settings/focus-apps";
import { cleanPrefs } from "../settings/prefs";
import { trayLabel } from "../atmosphere/tray-label";

const rule = DEFAULT_RULE; // 20 min work, 20 s rest
const MIN = 60_000;
const IDLE = 5000; // the user is not typing

// A round started at 0, so the break is due at 20 min.
const round = () => timer.start(timer.createTimer(rule), 0);
const snap = (s: timer.TimerState, now: number) => timer.snapshot(s, now);

test("a due break waits during a call, with no notice", () => {
	let s = noticeActivity(round(), "call");
	s = timer.tick(s, 20 * MIN, IDLE);
	expect(snap(s, 20 * MIN)).toMatchObject({
		mode: "working", held: "call", leftMs: 30_000, warning: false, holding: false,
	});
	s = timer.tick(s, 80 * MIN, IDLE);
	expect(snap(s, 80 * MIN)).toMatchObject({ mode: "working", held: "call", leftMs: 30_000 });
});

test("a hold changes nothing before the break is near", () => {
	const s = noticeActivity(round(), "fullscreen");
	expect(timer.tick(s, 10 * MIN, IDLE)).toMatchObject({ mode: "working", endsAt: s.endsAt });
	expect(snap(s, 10 * MIN)).toMatchObject({ held: "fullscreen", leftMs: 10 * MIN });
});

test("once the app goes away, the notice shows and the break follows 30 s later", () => {
	let s = timer.tick(noticeActivity(round(), "call"), 40 * MIN, IDLE);
	s = noticeActivity(s, "none");
	expect(snap(s, 40 * MIN)).toMatchObject({ held: "none", warning: true, leftMs: 30_000 });
	expect(timer.tick(s, 40 * MIN + 29_000, IDLE).mode).toBe("working");
	expect(timer.tick(s, 40 * MIN + 30_000, IDLE).mode).toBe("break");
});

test("the app coming back during the grace holds the break again", () => {
	let s = noticeActivity(timer.tick(noticeActivity(round(), "call"), 30 * MIN, IDLE), "none");
	s = timer.tick(noticeActivity(s, "call"), 30 * MIN + 20_000, IDLE);
	expect(snap(s, 30 * MIN + 20_000)).toMatchObject({ mode: "working", leftMs: 30_000 });
});

test("Do Not Disturb holds breaks and expires on time", () => {
	let s = startDnd(round(), 0, DND_CHOICES.dnd30);
	s = timer.tick(s, 20 * MIN, IDLE);
	expect(snap(s, 29 * MIN)).toMatchObject({ mode: "working", held: "dnd" });
	s = timer.tick(s, 30 * MIN - 1, IDLE);
	expect(heldBy(s, 30 * MIN)).toBe("none");
	expect(snap(s, 30 * MIN)).toMatchObject({ held: "none", warning: true, dnd: { on: false } });
	expect(timer.tick(s, 30 * MIN + 30_000, IDLE).mode).toBe("break");
});

test("Do Not Disturb until turned off, and turning it off", () => {
	let s = timer.tick(startDnd(round(), 0, null), 600 * MIN, IDLE);
	expect(snap(s, 600 * MIN)).toMatchObject({ held: "dnd", dnd: { on: true, leftMs: null } });
	s = stopDnd(s);
	expect(snap(s, 600 * MIN)).toMatchObject({ held: "none", warning: true });
	expect(stopDnd(s)).toBe(s);
});

test("the time left of Do Not Disturb is shown in whole minutes", () => {
	const s = startDnd(round(), 0, DND_CHOICES.dnd60);
	expect(dndView(s, 0)).toEqual({ on: true, leftMs: 60 * MIN });
	expect(dndView(s, 1000)).toEqual({ on: true, leftMs: 60 * MIN });
	expect(dndView(s, MIN + 1)).toEqual({ on: true, leftMs: 59 * MIN });
});

test("the hold carries over a break and a reset, and taking a break by hand still works", () => {
	const s = noticeActivity(startDnd(round(), 0, null), "call");
	const onBreak = timer.beginBreak(s, MIN);
	expect(onBreak.mode).toBe("break");
	expect(timer.endBreak(onBreak, 2 * MIN)).toMatchObject({ activity: "call", dndUntil: s.dndUntil });
	expect(timer.reset(s, MIN)).toMatchObject({ activity: "call", dndUntil: s.dndUntil });
});

test("nothing is held while paused or ready", () => {
	const s = noticeActivity(timer.pause(round(), MIN), "call");
	expect(snap(s, 2 * MIN).held).toBe("none");
	expect(snap(noticeActivity(timer.createTimer(rule), "call"), 0).held).toBe("none");
});

test("the window and the tray say why", () => {
	const off = { on: false, leftMs: null };
	expect(holdLine("call", off)).toBe("Waiting until your call ends");
	expect(holdLine("fullscreen", off)).toBe("Waiting until you leave fullscreen");
	expect(holdLine("dnd", { on: true, leftMs: 25 * MIN })).toBe("Do Not Disturb · 25 min left");
	expect(holdLine("dnd", { on: true, leftMs: null })).toBe("Do Not Disturb is on");

	const call = noticeActivity(round(), "call");
	expect(trayLabel(snap(call, 10 * MIN))).toBe("Break in 10 min"); // not due yet
	expect(trayLabel(snap(timer.tick(call, 20 * MIN), 20 * MIN))).toBe("Break after your call");
	const full = timer.tick(noticeActivity(round(), "fullscreen"), 20 * MIN);
	expect(trayLabel(snap(full, 20 * MIN))).toBe("Break after fullscreen");
	expect(trayLabel(snap(startDnd(round(), 0, DND_CHOICES.dnd30), 5 * MIN))).toBe(
		"Do Not Disturb · 25 min left",
	);
});

test("the engine runs the Do Not Disturb commands and takes the activity", () => {
	let t = 0;
	const engine = createEngine(rule, () => {}, () => t);
	engine.run("start");
	engine.run("dnd60");
	expect(engine.snapshot()).toMatchObject({ held: "dnd", dnd: { on: true, leftMs: 60 * MIN } });
	engine.run("dndOff");
	expect(engine.snapshot().dnd.on).toBe(false);
	engine.run("dndOn");
	expect(engine.snapshot().dnd.leftMs).toBeNull();
	engine.run("dndOff");
	engine.setActivity("fullscreen");
	expect(engine.snapshot().held).toBe("fullscreen");
	engine.stop();
});

test("focus apps: cleaned, defaulted and matched without case", () => {
	expect(cleanFocusApps(undefined)).toEqual(DEFAULT_FOCUS_APPS);
	expect(cleanFocusApps([" OBS64.exe ", "obs64.exe", "", 7, "a/b.exe"])).toEqual(["obs64.exe"]);
	expect(cleanFocusApps([])).toEqual([]); // the user removed them all
	expect(focusAppRunning(["zoom.exe"], ["explorer.exe", "Zoom.exe"])).toBe(true);
	expect(focusAppRunning(["zoom.exe"], ["explorer.exe"])).toBe(false);
	expect(cleanPrefs({ focusApps: ["Notepad.exe"] }).focusApps).toEqual(["notepad.exe"]);
});
