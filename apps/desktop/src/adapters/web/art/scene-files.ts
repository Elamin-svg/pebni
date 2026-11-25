// The picture files, bundled by Vite: one timer card still per part of the day,
// and one loop plus a still (shown first, and alone under reduced motion) for each break scene.
import type { DayPart } from "../../../core/atmosphere/day-part";
import type { BreakScene } from "../../../core/atmosphere/scenes";
import cardMorning from "./card-morning.jpg";
import cardDay from "./card-day.jpg";
import cardEvening from "./card-evening.jpg";
import cardNight from "./card-night.jpg";
import morningWindow from "./break-morning-window.webm";
import morningWindowStill from "./break-morning-window.jpg";
import rainWindow from "./break-rain-window.webm";
import rainWindowStill from "./break-rain-window.jpg";
import eveningCabin from "./break-evening-cabin.webm";
import eveningCabinStill from "./break-evening-cabin.jpg";
import fireplace from "./break-fireplace.webm";
import fireplaceStill from "./break-fireplace.jpg";

export const CARD_IMAGES: Record<DayPart, string> = {
	morning: cardMorning,
	day: cardDay,
	evening: cardEvening,
	night: cardNight,
};

export const BREAK_FILES: Record<BreakScene, { video: string; still: string }> = {
	"morning-window": { video: morningWindow, still: morningWindowStill },
	"rain-window": { video: rainWindow, still: rainWindowStill },
	"evening-cabin": { video: eveningCabin, still: eveningCabinStill },
	fireplace: { video: fireplace, still: fireplaceStill },
};
