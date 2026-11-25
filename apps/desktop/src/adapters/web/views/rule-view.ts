// The "Breaks" panel: presets, work/rest lengths, idle reset, break prompts & custom text.
// Every edit sends the whole rule; the engine cleans it and sends it back in the snapshot.
import type { Bridge } from "../../../ports/bridge";
import type { Snapshot } from "../../../core/timer/timer";
import { type BreakFocus, DEFAULT_RULE, RULE_LIMITS, type Rule } from "../../../core/timer/rule";
import { PRESETS, type PresetId, applyPreset, matchingPreset } from "../../../core/timer/presets";
import { CUSTOM_PROMPT_PRESETS } from "../../../core/atmosphere/break-copy";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
type Unit = "sec" | "min";

// Minutes when the rest is a whole number of minutes, else seconds.
function unitFor(restSec: number): Unit {
	return restSec >= 60 && restSec % 60 === 0 ? "min" : "sec";
}

// The rest length shown in a unit (never 0, so the field stays valid).
function restIn(unit: Unit, restSec: number): number {
	return unit === "min" ? Math.max(Math.round(restSec / 60), 1) : restSec;
}

const FOCUS_NOTES: Record<BreakFocus, string> = {
	eyes: "Gentle 20-20-20 rotation: eye rest, posture and light stretches between coding blocks.",
	away: "Every break nudges you away from the IDE to walk around and clear your head.",
	stretch: "Hands, wrists, neck, shoulders and water, built to undo desk tension.",
	custom: "Shows your own headline and message on every break screen.",
};

export function createRuleView(bridge: Bridge) {
	const form = $<HTMLFormElement>("rule");
	const work = $<HTMLInputElement>("work-min");
	const rest = $<HTMLInputElement>("rest-len");
	const restUnit = $<HTMLSelectElement>("rest-unit");
	const longOn = $<HTMLInputElement>("long-on");
	const longAfter = $<HTMLInputElement>("long-after");
	const longMin = $<HTMLInputElement>("long-min");
	const feet = $<HTMLInputElement>("feet");
	const snoozes = $<HTMLInputElement>("max-snoozes");
	const idleReset = $<HTMLInputElement>("idle-reset");
	const idleResetMin = $<HTMLInputElement>("idle-reset-min");
	const customTitle = $<HTMLInputElement>("custom-title");
	const customNote = $<HTMLInputElement>("custom-note");
	const customBox = $("custom-prompt");
	const promptChips = $("prompt-presets");
	const presetButtons = form.querySelectorAll<HTMLButtonElement>("[data-preset]");
	const focusInputs = form.querySelectorAll<HTMLInputElement>('input[name="focus"]');
	const flowGuard = $<HTMLInputElement>("flow-guard");
	const strict = $<HTMLInputElement>("strict");

	let rule: Rule = DEFAULT_RULE;
	let unit: Unit | undefined;

	// Keep the HTML min/max attributes in step with the chosen unit.
	function syncRestBounds(nextUnit: Unit) {
		const [minSec, maxSec] = RULE_LIMITS.restSec;
		rest.min = String(nextUnit === "min" ? 1 : minSec);
		rest.max = String(nextUnit === "min" ? Math.floor(maxSec / 60) : maxSec);
	}

	// Render one-click starter prompt chips inside the custom prompt box.
	promptChips.replaceChildren(...CUSTOM_PROMPT_PRESETS.map((p) => {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "prompt-chip";
		btn.textContent = p.label;
		btn.onclick = () => {
			customTitle.value = p.title;
			customNote.value = p.note;
			bridge.setRule({ ...readRule(), focus: "custom", customTitle: p.title, customNote: p.note });
		};
		return btn;
	}));

	// The preset texts come from the domain, so the card and the presets always agree.
	for (const button of presetButtons) {
		const preset = PRESETS.find((p) => p.id === button.dataset.preset)!;
		button.querySelector(".preset-detail")!.textContent = preset.detail;
		button.onclick = () => {
			unit = undefined;
			bridge.setRule(applyPreset(rule, preset.id as PresetId));
		};
	}

	// The rule as the fields describe it.
	function readRule(): Rule {
		const restValue = Number(rest.value);
		return {
			workMin: Number(work.value),
			restSec: unit === "min" ? restValue * 60 : restValue,
			longAfter: longOn.checked ? Number(longAfter.value) || 3 : 0,
			longMin: Number(longMin.value),
			feet: Number(feet.value),
			maxSnoozes: Number(snoozes.value),
			focus: ([...focusInputs].find((i) => i.checked)?.value ?? "eyes") as BreakFocus,
			flowGuard: flowGuard.checked,
			strict: strict.checked,
			lockOnLong: false,
			idleReset: idleReset.checked,
			idleResetMin: Number(idleResetMin.value),
			customTitle: customTitle.value,
			customNote: customNote.value,
		};
	}

	// A new unit keeps the same rest length and shows it in that unit.
	restUnit.onchange = () => {
		unit = restUnit.value as Unit;
		syncRestBounds(unit);
		rest.value = String(restIn(unit, rule.restSec));
		bridge.setRule(readRule());
	};

	// Audio and chime belong to sound-view.ts / chime.ts; every other field is part of the rule.
	form.oninput = (e) => {
		const target = e.target as HTMLInputElement;
		if (target.name === "audio" || target.id === "chime-on") return;
		bridge.setRule(readRule());
	};

	// When leaving a number field, snap blank/out-of-range edits back to the cleaned value.
	form.addEventListener("focusout", (e) => {
		const target = e.target as HTMLInputElement;
		if (target.tagName !== "INPUT" || target.type !== "number") return;
		const activeUnit = unit ?? unitFor(rule.restSec);
		work.value = String(rule.workMin);
		rest.value = String(restIn(activeUnit, rule.restSec));
		longMin.value = String(rule.longMin);
		feet.value = String(rule.feet);
		snoozes.value = String(rule.maxSnoozes);
		idleResetMin.value = String(rule.idleResetMin);
		if (rule.longAfter > 0) longAfter.value = String(rule.longAfter);
	});
	form.onsubmit = (e) => e.preventDefault();

	// Fill a field, but never while the user is typing in it.
	function fill(input: HTMLInputElement, value: string | number) {
		if (document.activeElement !== input) input.value = String(value);
	}

	return function render(snap: Snapshot) {
		rule = snap.rule;
		unit ??= unitFor(rule.restSec);
		restUnit.value = unit;
		syncRestBounds(unit);
		fill(work, rule.workMin);
		fill(rest, restIn(unit, rule.restSec));
		fill(longMin, rule.longMin);
		fill(feet, rule.feet);
		fill(snoozes, rule.maxSnoozes);
		fill(idleResetMin, rule.idleResetMin);
		fill(customTitle, rule.customTitle);
		fill(customNote, rule.customNote);

		idleReset.checked = rule.idleReset;
		$("idle-reset-line").hidden = !rule.idleReset;
		$("idle-reset-desc").textContent = `Away for ${rule.idleResetMin} min counts as a natural break and starts a fresh round when you return.`;

		const on = rule.longAfter > 0;
		longOn.checked = on;
		if (on) fill(longAfter, rule.longAfter);
		$("long-line").hidden = !on;
		$("long-off-note").hidden = on;

		for (const input of focusInputs) input.checked = input.value === rule.focus;
		$("focus-note").textContent = FOCUS_NOTES[rule.focus];
		customBox.hidden = rule.focus !== "custom";
		$("feet-line").hidden = rule.focus !== "eyes";
		flowGuard.checked = rule.flowGuard;
		strict.checked = rule.strict;

		const active = matchingPreset(rule);
		for (const b of presetButtons) b.setAttribute("aria-pressed", String(b.dataset.preset === active));
	};
}
