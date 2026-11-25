// The timer pane: valley scene, clock, cycle row, action bar, today's screen time & 7-day strip.
// Also shows a calm background-break view when the user hides a long break window to relax freely.
import type { Bridge } from "../../../ports/bridge";
import type { Snapshot } from "../../../core/timer/timer";
import { formatBreakMinutes, formatClock, formatHoursMinutes, plural } from "../../../core/analytics/format";
import { dndLine, holdLine } from "../../../core/atmosphere/hold-copy";
import { PRESETS, matchingPreset } from "../../../core/timer/presets";
import { APP_LOGO } from "../art/mascot-files";
import { mountPip, poseForTimer, setMascotPose } from "./pip";
import { createWeekStrip } from "./week-strip";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Short label for the active rhythm chip, e.g. "20-20-20 · Eye rest" or "25m / 5 min · Your text".
function rhythmSummary(snap: Snapshot): string {
	const presetId = matchingPreset(snap.rule);
	const preset = PRESETS.find((p) => p.id === presetId);
	const rest = snap.rule.restSec >= 60 && snap.rule.restSec % 60 === 0
		? `${snap.rule.restSec / 60} min`
		: `${snap.rule.restSec} s`;
	const timing = preset ? preset.name : `${snap.rule.workMin}m / ${rest}`;
	const focusMap = { eyes: "Eye rest", away: "Step away", stretch: "Stretch", custom: "Your text" };
	return `${timing} · ${focusMap[snap.rule.focus]}`;
}

// Machine state token for the header status dot.
function statusState(snap: Snapshot): string {
	if (snap.mode === "break") return "working";
	if (snap.away) return "away";
	if (snap.holding) return "holding";
	if (snap.held !== "none") return "held";
	if (snap.warning) return "warning";
	if (snap.flow && snap.mode === "working") return "flow";
	return snap.mode;
}

export function createTimerView(bridge: Bridge) {
	const root = $("timer-view");
	const scene = $("scene");
	const clock = $("clock");
	const clockNote = $("clock-note");
	const status = $("status");
	const statusPill = $("status-pill");
	const statsCount = $("stats-count");
	const screenTime = $("screen-time");
	const breakTimeToday = $("break-time-today");
	const weekWorkTime = $("week-work-time");
	const weekBreaksCount = $("week-breaks-count");
	const weekBreakTime = $("week-break-time");
	const idleNote = $("idle-reset-note");
	const rhythmChip = $("rhythm-chip");
	const dndBanner = $("timer-dnd-banner");
	const dndText = $("timer-dnd-text");
	const dndOff = $("timer-dnd-off");
	const startBtn = $<HTMLButtonElement>("start");
	const breakNowBtn = $<HTMLButtonElement>("break-now");
	const resetBtn = $<HTMLButtonElement>("reset");
	const cycle = $("cycle");
	const cycleDots = $("cycle-dots");
	const cycleText = $("cycle-text");
	const renderWeek = createWeekStrip($("week-strip"));

	const setPip = mountPip($("pip-timer"), "posture");
	const brandMark = $<HTMLImageElement>("brand-mark");
	const stateMascot = $<HTMLImageElement>("state-mascot");
	if (brandMark) brandMark.src = APP_LOGO;

	let hiddenBreak = false;
	let lastSkipped = -1;
	let skippedUntil = 0;

	// Buttons send commands; during a hidden long break they reopen or finish the break.
	startBtn.onclick = () => bridge.run(hiddenBreak ? "showBreak" : "toggle");
	breakNowBtn.onclick = () => bridge.run(hiddenBreak ? "skip" : "breakNow");
	resetBtn.onclick = () => bridge.run("reset");
	dndOff.onclick = () => bridge.run("dndOff");

	// The word in the corner: what the timer is doing right now.
	function statusText(snap: Snapshot): string {
		if (snap.mode === "break") return snap.copy.label;
		if (snap.waiting) return "Starts when you type";
		if (snap.away) return "Stepped away";
		if (snap.holding) return "Break when you pause";
		if (snap.flow && snap.mode === "working") return "In flow";
		if (snap.held !== "none") return "On hold";
		if (snap.warning) return "Break soon";
		return { ready: "Ready", working: "Coding", paused: "Paused", break: "On a break" }[snap.mode];
	}

	// The line above the clock names the coming break, or explains a background break / hold.
	function clockNoteText(snap: Snapshot): string {
		if (snap.mode === "break" && snap.breakHidden) return `${snap.copy.label} · relax freely`;
		if (snap.away) return "Fresh round when you return";
		if (snap.held !== "none") return holdLine(snap.held, snap.dnd);
		return `${snap.copy.label} in`;
	}

	// "Round 2 of 4" with one dot per round: done, current, still to come.
	function showCycle(snap: Snapshot) {
		cycle.hidden = !snap.cycle;
		if (!snap.cycle) return;
		const { round, of } = snap.cycle;
		cycleText.textContent = round === of ? `Round ${round} of ${of}, then a long break` : `Round ${round} of ${of}`;
		if (cycleDots.childElementCount !== of) {
			cycleDots.replaceChildren(...Array.from({ length: of }, () => document.createElement("span")));
		}
		[...cycleDots.children].forEach((dot, i) => {
			dot.className = i + 1 < round ? "done" : i + 1 === round ? "now" : "";
		});
	}

	return function render(snap: Snapshot) {
		hiddenBreak = snap.mode === "break" && snap.breakHidden;
		root.hidden = snap.mode === "break" && !snap.breakHidden;
		if (root.hidden) return;

		const label = statusText(snap);
		if (status.textContent !== label) status.textContent = label;
		statusPill.dataset.state = statusState(snap);

		if (hiddenBreak) {
			startBtn.textContent = "Show break screen";
			breakNowBtn.textContent = "End break";
			breakNowBtn.hidden = snap.rule.strict;
		} else {
			startBtn.textContent = { ready: "Start coding", working: "Pause", paused: "Resume", break: "Pause" }[snap.mode];
			breakNowBtn.textContent = "Take a break";
			breakNowBtn.hidden = false;
		}
		resetBtn.classList.toggle("is-idle", snap.mode === "ready" && snap.leftMs >= snap.totalMs);
		clock.textContent = formatClock(snap.leftMs);
		clockNote.textContent = clockNoteText(snap);

		// Today & This week summary: worked time, break count, break minutes, and 7-day bar strip.
		statsCount.textContent = plural(snap.stats.taken, "break");
		screenTime.textContent = formatHoursMinutes(snap.workMsToday);
		breakTimeToday.textContent = formatBreakMinutes(snap.breakMsToday);
		weekWorkTime.textContent = formatHoursMinutes(snap.weekTotals.workMs);
		weekBreaksCount.textContent = plural(snap.weekTotals.breaks, "break");
		weekBreakTime.textContent = formatBreakMinutes(snap.weekTotals.breakMs);
		rhythmChip.textContent = rhythmSummary(snap);
		idleNote.hidden = !snap.recentIdleReset;
		dndBanner.hidden = !snap.dnd.on;
		if (snap.dnd.on) dndText.textContent = dndLine(snap.dnd);
		renderWeek(snap.week);

		// Notice when the user just skipped a break so the companion responds with an understanding shrug.
		const skipped = snap.stats.skipped;
		if (lastSkipped >= 0 && skipped > lastSkipped) skippedUntil = Date.now() + 60_000;
		if (snap.mode === "break" || snap.mode === "ready") skippedUntil = 0;
		lastSkipped = skipped;
		const pose = poseForTimer(snap, Date.now() < skippedUntil);
		setPip(pose);
		if (stateMascot) setMascotPose(stateMascot, pose);

		showCycle(snap);
		root.classList.toggle("paused", snap.mode === "paused" || snap.away);
		root.classList.toggle("disappointed", snap.disappointed);
		root.classList.toggle("held", snap.held !== "none");
		document.title = snap.mode === "working" || hiddenBreak ? `${formatClock(snap.leftMs)} · Pebni` : "Pebni";

		// How far through the phase we are (moves the moon); clamped to [0, 1].
		const raw = snap.mode === "ready" || snap.away || snap.totalMs <= 0 ? 0 : 1 - snap.leftMs / snap.totalMs;
		const progress = Math.min(Math.max(raw, 0), 1);
		scene.style.setProperty("--p", String(progress));
	};
}
