// Short motivational quotes in Pebni's voice, shown in a bubble next to the mascot.
// Each part of the day has its own set (50 total); the first message on open is a
// time-of-day greeting (starting with "Good morning!" in the morning), then a new quote arrives every 15 minutes.
import type { DayPart } from "./day-part";

export const QUOTE_EVERY_MS = 15 * 60_000;

export const QUOTES: Record<DayPart, string[]> = {
	morning: [
		"Good morning! Let's build something.",
		"Fresh mind. Tackle the hard part first.",
		"Win the morning, win the day.",
		"Coffee up. Time to ship great work.",
		"Start strong. Momentum loves action.",
		"One bold commit before lunch.",
		"Clear head, sharp focus. Let's go.",
		"Build the thing only you can build.",
		"First hour sets the whole pace.",
		"Open the editor and make progress.",
		"Big goals start with this sprint.",
		"Turn morning energy into real output.",
		"Today is yours. Ship something proud.",
	],
	day: [
		"Good afternoon! Keep the momentum up.",
		"Stay locked in. You are doing great.",
		"One bug at a time. You got this.",
		"Keep pushing. Progress beats perfection.",
		"Small commits build big products.",
		"Focus now, celebrate when it ships.",
		"Every focused block moves you forward.",
		"Stay sharp. The breakthrough is close.",
		"Deep work now pays off all week.",
		"Keep building. Consistency wins.",
		"One clean solution at a time.",
		"Trust the work. Keep moving forward.",
		"You are closer than you think.",
	],
	evening: [
		"Good evening! Finish strong today.",
		"One last clean push before wrap-up.",
		"Close the loop on what you started.",
		"Strong finish makes tomorrow easier.",
		"Ship that last piece with pride.",
		"Stay steady through the home stretch.",
		"Wrap this task cleanly. You got it.",
		"Golden hour focus hits different.",
		"Finish one more thing that matters.",
		"Leave the code better than you found it.",
		"One solid sprint to end on a high.",
		"Bring it home. Great work today.",
	],
	night: [
		"Good night owl! Make this sprint count.",
		"Quiet hours, pure focus. Keep going.",
		"No distractions now. Just build.",
		"Late focus, clean code. Let's ship.",
		"Own the quiet and move the needle.",
		"One clean commit before you call it.",
		"Calm mind, sharp code. Keep rolling.",
		"The world is quiet. Build your vision.",
		"Stay steady. Finish this milestone.",
		"Night sprints create real magic.",
		"Lock in, finish clean, then rest well.",
		"Make tonight's work worth staying up.",
	],
};

// The quote for this part of the day at this moment.
// When `openedAt` is provided, slot 0 (right after opening) always starts with the greeting (index 0),
// then rotates to the next motivational quote every 15 minutes.
export function quoteFor(part: DayPart, now: number, openedAt?: number): string {
	const list = QUOTES[part];
	const base = openedAt !== undefined && openedAt > 0 ? Math.max(now - openedAt, 0) : Math.max(now, 0);
	const slot = Math.floor(base / QUOTE_EVERY_MS);
	return list[slot % list.length]!;
}
