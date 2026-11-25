// The time of day in the timer window: the valley's colours, Pip's mood
// (coffee in the morning, chilling in the evening, asleep at night) and Pip's speech bubble.
// The part of the day and the quote come from the snapshot (see core/day-part.ts).
import type { Snapshot } from "../../../core/timer/timer";
import type { DayPart } from "../../../core/atmosphere/day-part";
import { QUOTES } from "../../../core/atmosphere/quotes";
import { CARD_IMAGES } from "../art/scene-files";

const PARTS: DayPart[] = ["morning", "day", "evening", "night"];

// Design preview only: "?part=night" shows that part of the day at any hour.
function previewPart(): DayPart | undefined {
	const part = new URLSearchParams(location.search).get("part");
	return PARTS.find((p) => p === part);
}

export function createDayView() {
	const scene = document.getElementById("scene")!;
	const bubble = document.getElementById("pip-quote")!;
	const forced = previewPart();

	// The illustration replaces the drawn valley and Pip; the drawing stays if it fails to load.
	const photo = document.getElementById("scene-photo") as HTMLImageElement;
	const showArt = () => {
		photo.hidden = false;
		scene.classList.add("has-art");
	};
	photo.onload = showArt;
	let shownPart: DayPart | undefined;

	return function render(snap: Snapshot) {
		const part = forced ?? snap.dayPart;
		const quote = forced ? QUOTES[forced][0]! : snap.quote;
		if (scene.dataset.part !== part) scene.dataset.part = part;
		if (shownPart !== part) {
			shownPart = part;
			photo.src = CARD_IMAGES[part];
			if (photo.complete && photo.naturalWidth > 0) showArt();
		}

		// Only touch the bubble when the words change, so the fade-in plays once per quote.
		if (bubble.textContent === quote) return;
		bubble.textContent = quote;
		bubble.classList.remove("bubble-in");
		void bubble.offsetWidth; // restart the fade-in
		bubble.classList.add("bubble-in");
	};
}
