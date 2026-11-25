// Ready-made rhythms the user can pick with one click. They set the timing fields only
// (and keep lockOnLong off so switching to Pomodoro never locks the screen by surprise).
import type { Rule } from "./rule";

export type PresetId = "twenty" | "pomodoro";
type Timing = Pick<Rule, "workMin" | "restSec" | "longAfter" | "longMin">;

export type Preset = { id: PresetId; name: string; detail: string; timing: Timing };

export const PRESETS: Preset[] = [
	{
		id: "twenty",
		name: "20-20-20",
		detail: "20 min work, 20 s rest",
		timing: { workMin: 20, restSec: 20, longAfter: 0, longMin: 5 },
	},
	{
		id: "pomodoro",
		name: "Pomodoro",
		detail: "25 min work, 5 min rest",
		timing: { workMin: 25, restSec: 300, longAfter: 3, longMin: 30 },
	},
];

// The rule with a preset's timing applied.
export function applyPreset(rule: Rule, id: PresetId): Rule {
	const preset = PRESETS.find((p) => p.id === id);
	return preset ? { ...rule, ...preset.timing, lockOnLong: false } : rule;
}

// The preset the rule matches, if any (so its button can show as selected).
// With long breaks off, the long-break length does not matter.
export function matchingPreset(rule: Rule): PresetId | undefined {
	return PRESETS.find(({ timing: t }) =>
		t.workMin === rule.workMin && t.restSec === rule.restSec && t.longAfter === rule.longAfter &&
		(t.longAfter === 0 || t.longMin === rule.longMin),
	)?.id;
}
