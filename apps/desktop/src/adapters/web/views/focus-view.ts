// The "While you are busy" card: Do Not Disturb, and the focus apps that hold breaks back.
// Focus apps show friendly names ("Zoom"); the field suggests the programs open right now.
import type { Bridge } from "../../../ports/bridge";
import type { Snapshot } from "../../../core/timer/timer";
import type { Command } from "../../../core/timer/engine";
import { formatMinutes } from "../../../core/analytics/format";
import { appFromInput, appLabel, appSuggestions } from "../../../core/settings/app-names";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const HELP = "Start typing to see the programs open right now.";

export function createFocusView(bridge: Bridge) {
	const dndState = $("dnd-state");
	const dndOff = $("dnd-off");
	const choices = $("dnd-choices");
	const list = $<HTMLUListElement>("focus-apps");
	const form = $<HTMLFormElement>("focus-add");
	const nameInput = $<HTMLInputElement>("focus-name");
	const suggestions = $<HTMLDataListElement>("running-apps");
	const help = $("focus-help");
	let apps: string[] = [];
	let running: string[] = [];

	// Do Not Disturb buttons send commands; the engine keeps the end time.
	for (const btn of choices.querySelectorAll<HTMLButtonElement>("[data-dnd]")) {
		btn.onclick = () => bridge.run(btn.dataset.dnd as Command);
	}
	dndOff.onclick = () => bridge.run("dndOff");

	// Save a new list, draw what was kept, and say what changed.
	function saveApps(next: string[], message: string) {
		bridge.setPrefs({ focusApps: next }).then((p) => {
			showApps(p.focusApps);
			help.textContent = message;
		});
	}

	// Ask for the open programs when the field is used, so the list is fresh.
	nameInput.onfocus = () => {
		bridge.getRunningApps().then((names) => {
			running = names;
			showSuggestions();
		});
	};

	// Adding a program by its friendly name or its process name.
	form.onsubmit = (e) => {
		e.preventDefault();
		const name = appFromInput(nameInput.value, running);
		nameInput.value = "";
		if (!name) return void (help.textContent = "Type a program name, for example Zoom.");
		if (apps.includes(name)) return void (help.textContent = `${appLabel(name)} is already on the list.`);
		bridge.setPrefs({ focusApps: [...apps, name] }).then((p) => {
			showApps(p.focusApps);
			help.textContent = p.focusApps.includes(name)
				? `Added ${appLabel(name)}.`
				: "Focus list is full (20 apps max). Remove one first.";
		});
	};

	// One suggestion per open program: the friendly name, with the process name as the value.
	function showSuggestions() {
		suggestions.replaceChildren(...appSuggestions(running, apps).map((name) => {
			const option = document.createElement("option");
			option.value = name;
			option.label = appLabel(name);
			return option;
		}));
	}

	// One chip per focus app, each with a remove button.
	function showApps(next: string[]) {
		apps = next;
		list.replaceChildren(...apps.map((name) =>
			appChip(name, () => saveApps(apps.filter((a) => a !== name), `Removed ${appLabel(name)}.`))));
		showSuggestions();
	}

	bridge.getPrefs().then((p) => showApps(p.focusApps));
	help.textContent = HELP;

	// Draw the Do Not Disturb state from the snapshot.
	return function render(snap: Snapshot) {
		dndState.textContent = dndStateText(snap);
		dndOff.hidden = !snap.dnd.on;
		choices.hidden = snap.dnd.on;
	};
}

// The small line under "Do Not Disturb": "Off", "On · 25 min left" or "On until you turn it off".
function dndStateText(snap: Snapshot): string {
	if (!snap.dnd.on) return "Off";
	return snap.dnd.leftMs === null ? "On until you turn it off" : `On · ${formatMinutes(snap.dnd.leftMs)} left`;
}

// A chip: the friendly name (process name on hover) and a remove button.
function appChip(name: string, onRemove: () => void): HTMLLIElement {
	const row = document.createElement("li");
	row.className = "badge badge-lg gap-1 bg-base-100 border-0";
	row.title = name;
	const label = document.createElement("span");
	label.textContent = appLabel(name);
	const remove = document.createElement("button");
	remove.type = "button";
	remove.className = "focus-remove";
	remove.textContent = "×";
	remove.setAttribute("aria-label", `Remove ${appLabel(name)}`);
	remove.onclick = onRemove;
	row.append(label, remove);
	return row;
}
