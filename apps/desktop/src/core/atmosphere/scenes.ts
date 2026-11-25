// Which picture shows where. The timer card and the break screen each pick a scene that
// suits the time of day, and break scenes take turns when a part has more than one.
import type { DayPart } from "./day-part";

export type BreakScene = "morning-window" | "rain-window" | "evening-cabin" | "fireplace";

// The scenes for each part of the day, in the order they take turns.
export const BREAK_SCENES: Record<DayPart, BreakScene[]> = {
	morning: ["morning-window"],
	day: ["rain-window"],
	evening: ["evening-cabin"],
	night: ["fireplace"],
};

// The scene for a break: by part of the day, the next one each time a break is offered.
export function breakScene(part: DayPart, offeredToday: number): BreakScene {
	const scenes = BREAK_SCENES[part];
	return scenes[Math.max(offeredToday, 0) % scenes.length]!;
}
