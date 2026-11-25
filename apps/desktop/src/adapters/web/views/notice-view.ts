// The small "Break in 30s" notice in the screen corner (the page opened with #notice).
// It names the kind ("Stretch break in 30s"), offers a quiet snooze and an x to close it.
// Bun shows the window for the first 10 seconds of the warning (snap.notice); this view
// only animates it in and out.
import type { Bridge } from "../../../ports/bridge";
import type { Snapshot } from "../../../core/timer/timer";
import { SNOOZE_MS } from "../../../core/timer/flow";
import { formatMinutes, formatSeconds } from "../../../core/analytics/format";
import { mountPip, poseForNotice } from "./pip";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// "1 snooze left" / "2 snoozes left", next to the snooze button.
function snoozesLeftText(n: number): string {
	return n === 1 ? "1 snooze left" : `${n} snoozes left`;
}

export function createNoticeView(bridge: Bridge) {
	const root = $("notice-view");
	const title = $("notice-title");
	const note = $("notice-note");
	const announce = $("notice-announce");
	const snoozeBtn = $<HTMLButtonElement>("snooze");
	let shown = false;

	root.hidden = false;
	const setPip = mountPip($("pip-notice"), "wave");
	snoozeBtn.textContent = `Snooze ${formatMinutes(SNOOZE_MS)}`;
	snoozeBtn.onclick = () => bridge.run("snooze");
	$("notice-close").onclick = () => bridge.run("closeNotice");

	// Restart the entrance animation each time the notice comes back.
	function enter(snap: Snapshot) {
		root.classList.remove("entering", "leaving");
		void root.offsetWidth; // let the browser see the class go before it comes back
		root.classList.add("entering");
		announce.textContent = `${snap.copy.label} in ${formatSeconds(snap.leftMs)}`;
	}

	// Fade out; Bun hides the window a moment later.
	function leave() {
		root.classList.remove("entering");
		root.classList.add("leaving");
		announce.textContent = "";
	}

	return function render(snap: Snapshot) {
		if (snap.notice && !shown) enter(snap);
		if (!snap.notice && shown) leave();
		shown = snap.notice;

		const canSnooze = snap.snoozesLeft > 0;
		// Name the coming break: "Stretch break in 30s", "Water break when you stop typing".
		const when = snap.holding ? "when you stop typing" : `in ${formatSeconds(snap.leftMs)}`;
		title.textContent = `${snap.copy.label} ${when}`;
		snoozeBtn.hidden = !canSnooze;
		note.textContent = canSnooze ? snoozesLeftText(snap.snoozesLeft) : "No snoozes left before this break.";
		root.classList.toggle("disappointed", snap.disappointed); // Pip after the second snooze
		setPip(poseForNotice(snap));
	};
}
