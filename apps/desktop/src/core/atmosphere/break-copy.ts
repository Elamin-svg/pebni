// Break copy written for developers who lose track of time in deep work.
// Supports built-in presets (20-20-20 eye rest, leave the IDE, stretch & hydrate)
// or the developer's own custom break headline and instruction.
import type { BreakKind } from "../timer/breaks";
import type { Rule } from "../timer/rule";

export type BreakCopy = {
	label: string; // "Stretch break", for "Stretch break in 30s"
	title: string; // the big line on the break screen
	note: string; // one line of instruction under the clock
};

// One-click starter prompts developers can load into Custom mode and edit freely.
export type CustomPromptPreset = { id: string; label: string; title: string; note: string };
export const CUSTOM_PROMPT_PRESETS: CustomPromptPreset[] = [
	{
		id: "eyes-20",
		label: "Look away 20s",
		title: "Look 20 feet away",
		note: "Give your focus muscles a reset before the next diff.",
	},
	{
		id: "leave-ide",
		label: "Leave the IDE",
		title: "Step away from the keyboard",
		note: "The bug will still be there in a minute — and clearer after a walk.",
	},
	{
		id: "wrists",
		label: "Wrists & jaw",
		title: "Drop your shoulders",
		note: "Shake out your wrists, unclench your jaw and take three slow breaths.",
	},
	{
		id: "water",
		label: "Hydrate",
		title: "Drink some water",
		note: "Coffee does not count. Stand up, stretch and refill your glass.",
	},
];

// The copy for one kind. Custom mode uses the user's own headline and note.
export function breakCopy(kind: BreakKind, rule: Rule): BreakCopy {
	if (rule.focus === "custom") return customCopy(kind, rule);
	if (rule.focus === "away") return awayCopy(kind);
	if (rule.focus === "stretch") return stretchCopy(kind);
	return eyesCopy(kind, rule);
}

// Custom user-written prompt, with calm defaults if either field is left blank.
function customCopy(kind: BreakKind, rule: Rule): BreakCopy {
	const label = kind === "long" ? "Long break" : kind === "coffee" ? "Coffee break" : "Break";
	return {
		label,
		title: rule.customTitle || "Step back from the screen",
		note: rule.customNote || "Take a breath. Your editor will wait right here.",
	};
}

// Resting the eyes: 20-20-20 rotation for long coding sessions.
function eyesCopy(kind: BreakKind, rule: Rule): BreakCopy {
	const copy: Record<BreakKind, BreakCopy> = {
		eyes: {
			label: "Eye break",
			title: `Look ${rule.feet} feet away`,
			note: "Rest your eyes on something far off, like a window or the end of the room.",
		},
		stretch: {
			label: "Stretch break",
			title: "Stand up and stretch",
			note: "Shake out your wrists, reach up high and roll your shoulders back three times.",
		},
		posture: {
			label: "Posture check",
			title: "Sit tall for a moment",
			note: "Feet flat, shoulders down, jaw unclenched, and look past the monitor.",
		},
		water: {
			label: "Water break",
			title: "Have a sip of water",
			note: "Take a few slow sips while you look across the room.",
		},
		long: {
			label: "Long break",
			title: "Time for a longer rest",
			note: "A solid block of work is done. Walk around and give your brain room to reset.",
		},
		coffee: {
			label: "Coffee break",
			title: "Coffee break",
			note: "A few minutes away from the terminal. Make a drink, stretch your legs, look outside.",
		},
	};
	return copy[kind];
}

// Time away from the IDE: every break is a cue to leave the keyboard.
function awayCopy(kind: BreakKind): BreakCopy {
	const copy: Record<BreakKind, BreakCopy> = {
		eyes: {
			label: "Screen break",
			title: "Step away from the screen",
			note: "Get up and leave the desk for a moment. Your work will be right here.",
		},
		stretch: {
			label: "Screen break",
			title: "Stand up and move",
			note: "Walk to another room and back, and stretch your back on the way.",
		},
		posture: {
			label: "Screen break",
			title: "Leave the desk for a moment",
			note: "Open a window, look outside and let your mind idle for a bit.",
		},
		water: {
			label: "Screen break",
			title: "Go get some water",
			note: "Walk to the kitchen, fill a glass, and drink it away from the desk.",
		},
		long: {
			label: "Long break",
			title: "Time for a real break",
			note: "Put the screen out of sight. Go outside, eat something, talk to someone.",
		},
		coffee: {
			label: "Coffee break",
			title: "Coffee, away from the desk",
			note: "Make a drink and have it somewhere without a screen.",
		},
	};
	return copy[kind];
}

// Body-first break preset: wrists, neck, shoulders and hydration.
function stretchCopy(kind: BreakKind): BreakCopy {
	const copy: Record<BreakKind, BreakCopy> = {
		eyes: {
			label: "Reset break",
			title: "Relax your hands and eyes",
			note: "Take your hands off the keyboard, shake your wrists loose and look far away.",
		},
		stretch: {
			label: "Stretch break",
			title: "Open your chest and back",
			note: "Stand up, clasp your hands behind you and hold a calm stretch.",
		},
		posture: {
			label: "Posture check",
			title: "Drop your shoulders",
			note: "Unclench your jaw, lengthen your neck and soften your gaze.",
		},
		water: {
			label: "Water break",
			title: "Hydrate and reset",
			note: "Take a few sips of water and let your eyes blink slowly.",
		},
		long: {
			label: "Long break",
			title: "Step away and recharge",
			note: "Take a real walk away from the chair before the next session.",
		},
		coffee: {
			label: "Coffee break",
			title: "Coffee break",
			note: "Grab a warm drink and give your hands and eyes a proper pause.",
		},
	};
	return copy[kind];
}
