// The part of the user's day, from their local clock. Pip and the valley follow it:
// coffee in the morning, the usual valley by day, chilling in the evening, asleep at night.
export type DayPart = "morning" | "day" | "evening" | "night";

// Where each part starts, in local hours. Night runs from 22:00 until 5:00.
export const DAY_PARTS: { part: DayPart; from: number }[] = [
	{ part: "morning", from: 5 },
	{ part: "day", from: 11 },
	{ part: "evening", from: 17 },
	{ part: "night", from: 22 },
];

// The part of the day for an hour from 0 to 23.
export function dayPart(hour: number): DayPart {
	let found: DayPart = "night"; // before 5:00 it is still night
	for (const { part, from } of DAY_PARTS) if (hour >= from) found = part;
	return found;
}

// The local hour at a moment. Date is part of the language, so the domain may use it;
// the moment itself is passed in, never read from the clock here.
export function localHour(now: number): number {
	return new Date(now).getHours();
}
