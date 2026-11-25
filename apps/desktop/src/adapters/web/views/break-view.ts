// The fullscreen break screen: scene loop, Pip, break prompt, countdown, coffee offer,
// and on long/coffee breaks a closeable window action so developers can watch YouTube or chill.
import type { Bridge } from "../../../ports/bridge";
import type { Snapshot } from "../../../core/timer/timer";
import { BREAK_KINDS, LONG_BREAK_MS, type BreakKind } from "../../../core/timer/breaks";
import { formatClock, formatMinutes } from "../../../core/analytics/format";
import { mountPip, poseForBreak, setMascotPose } from "./pip";
import { breakScene } from "../../../core/atmosphere/scenes";
import { BREAK_FILES } from "../art/scene-files";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Kinds where Pip rests with closed eyes; in the others Pip is busy stretching or sipping.
const RESTING: BreakKind[] = ["eyes", "coffee"];

export function createBreakView(bridge: Bridge) {
	const root = $("break-view");
	const pipSlot = $("pip-break");
	const title = $("break-title");
	const clock = $("break-clock");
	const note = $("break-note");
	const offer = $("coffee-offer");
	const video = $<HTMLVideoElement>("rain");
	const skip = $<HTMLButtonElement>("skip");
	const hideBtn = $<HTMLButtonElement>("hide-break");
	const closeBtn = $<HTMLButtonElement>("break-close");
	const hideHint = $("hide-hint");
	const announce = $("break-announce");

	video.preload = "none"; // load the clip on the first break, not when the window opens
	const stillMotion = matchMedia("(prefers-reduced-motion: reduce)");

	// A scene for this break that suits the time of day (see core/scenes.ts).
	// Under reduced motion only its still shows.
	function showScene(snap: Snapshot) {
		const files = BREAK_FILES[breakScene(snap.dayPart, snap.stats.offered - 1)];
		video.poster = files.still;
		video.src = stillMotion.matches ? "" : files.video;
	}
	const setPip = mountPip(pipSlot, "eyes");
	const coffeeMascot = $<HTMLImageElement>("coffee-mascot");
	if (coffeeMascot) setMascotPose(coffeeMascot, "coffee");
	skip.onclick = () => bridge.run("skip");
	hideBtn.onclick = () => bridge.run("hideBreak");
	closeBtn.onclick = () => bridge.run("hideBreak");

	// Pressing Escape on a long or coffee break closes the overlay without skipping the break.
	let canHide = false;
	let visible = false;
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && visible && canHide) bridge.run("hideBreak");
	});

	// The offer's buttons. The length comes from the domain, so every screen agrees.
	const coffeeLength = formatMinutes(LONG_BREAK_MS);
	$("coffee-yes").textContent = `Take ${coffeeLength}`;
	$("coffee-yes").onclick = () => bridge.run("coffee");
	$("coffee-no").onclick = () => bridge.run("noCoffee");

	// Play the loop only while the break overlay is actually visible.
	function playIfSeen() {
		const seen = visible && !document.hidden && !stillMotion.matches;
		if (seen && video.paused) video.play().catch(() => {});
		if (!seen && !video.paused) video.pause();
	}
	document.addEventListener("visibilitychange", playIfSeen);

	let onBreak = false;
	return function render(snap: Snapshot) {
		const started = snap.mode === "break" && !onBreak;
		if (started) showScene(snap); // before playIfSeen, so the new clip is the one that plays
		onBreak = snap.mode === "break";
		visible = onBreak && !snap.breakHidden;
		canHide = snap.canHideBreak;
		root.hidden = !visible;
		playIfSeen();
		if (!visible) return;

		// One class per kind gives Pip the matching mood (see style.css).
		for (const kind of BREAK_KINDS) root.classList.toggle(`kind-${kind}`, kind === snap.kind);
		pipSlot.classList.toggle("pip-resting", RESTING.includes(snap.kind));
		setPip(poseForBreak(snap.kind));

		title.textContent = snap.copy.title;
		clock.textContent = formatClock(snap.leftMs);
		note.textContent = snap.copy.note;
		offer.hidden = !snap.coffeeOffer;
		hideBtn.hidden = !snap.canHideBreak;
		closeBtn.hidden = !snap.canHideBreak;
		hideHint.hidden = !snap.canHideBreak;
		skip.hidden = snap.rule.strict;
		$("strict-note").hidden = !snap.rule.strict || snap.canHideBreak;

		// Say the break once for screen readers, not every second of the clock.
		if (started) announce.textContent = `${snap.copy.title}. ${snap.copy.note}`;
	};
}
