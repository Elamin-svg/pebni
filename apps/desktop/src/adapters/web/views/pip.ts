// Mascot helper: mounts the transparent mascot illustration and picks the pose for every state.
import type { Snapshot } from "../../../core/timer/timer";
import type { BreakKind } from "../../../core/timer/breaks";
import { MASCOT_FILES, type MascotPose } from "../art/mascot-files";

// Put a mascot <img> into a slot and return a function that swaps poses only when they change.
export function mountPip(slot: HTMLElement, initial: MascotPose = "posture"): (pose: MascotPose) => void {
	const img = document.createElement("img");
	img.className = "pip mascot-img";
	img.alt = "";
	img.setAttribute("aria-hidden", "true");
	slot.replaceChildren(img);
	setMascotPose(img, initial);
	return (pose: MascotPose) => setMascotPose(img, pose);
}

// Swap an existing mascot <img> to another pose without touching the DOM when unchanged.
export function setMascotPose(img: HTMLImageElement, pose: MascotPose) {
	if (img.dataset.pose === pose) return;
	img.dataset.pose = pose;
	img.src = MASCOT_FILES[pose];
}

// Pose for each break kind (eyes, stretch, posture, water, coffee, long).
export function poseForBreak(kind: BreakKind): MascotPose {
	const map: Record<BreakKind, MascotPose> = {
		eyes: "eyes",
		stretch: "stretch",
		posture: "posture",
		water: "water",
		coffee: "coffee",
		long: "stroll",
	};
	return map[kind];
}

// Pose for the corner reminder notice: pout after 2 snoozes, wait in flow, or wave / preview break.
export function poseForNotice(snap: Snapshot): MascotPose {
	if (snap.disappointed) return "pout";
	if (snap.holding) return "wait";
	if (snap.kind === "eyes") return "wave";
	return poseForBreak(snap.kind);
}

// Pose for the main timer card companion across every app state.
export function poseForTimer(snap: Snapshot, recentlySkipped: boolean): MascotPose {
	if (snap.mode === "break") return poseForBreak(snap.kind);
	if (snap.held !== "none" || snap.dnd.on) return "dnd";
	if (snap.disappointed) return "pout";
	if (recentlySkipped) return "shrug";
	if (snap.holding || snap.flow) return "wait";
	if (snap.mode === "paused" || snap.away) return "chill";
	if (snap.warning) return "wave";
	if (snap.dayPart === "morning") return "coffee";
	return "posture";
}
