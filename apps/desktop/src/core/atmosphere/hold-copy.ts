// The words for a held break, so the window and the tray agree.
import type { DndView, HoldReason } from "../timer/hold";
import { formatMinutes } from "../analytics/format";

// The line in the timer window, for example "Waiting until your call ends".
export function holdLine(reason: HoldReason, dnd: DndView): string {
	if (reason === "call") return "Waiting until your call ends";
	if (reason === "fullscreen") return "Waiting until you leave fullscreen";
	if (reason === "dnd") return dndLine(dnd);
	return "";
}

// "Do Not Disturb · 25 min left", or "Do Not Disturb is on" when it has no end.
export function dndLine(dnd: DndView): string {
	if (!dnd.on) return "";
	return dnd.leftMs === null ? "Do Not Disturb is on" : `Do Not Disturb · ${formatMinutes(dnd.leftMs)} left`;
}

// The short tray text once the break is due but held back.
export function heldTrayLabel(reason: HoldReason, dnd: DndView): string {
	if (reason === "call") return "Break after your call";
	if (reason === "fullscreen") return "Break after fullscreen";
	return dndLine(dnd);
}
