// Saves the rule, the prefs, today's break stats and the 7-day rhythm history to settings.json.
import { Utils } from "electrobun/main";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { type Rule, cleanRule } from "../../../core/timer/rule";
import { type Prefs, cleanPrefs } from "../../../core/settings/prefs";
import { type DayStats, cleanStats } from "../../../core/analytics/stats";
import { type DaySummary, cleanHistory } from "../../../core/analytics/history";

const file = join(Utils.paths.userData, "settings.json");

type SettingsFile = {
	rule?: Partial<Rule>;
	prefs?: Partial<Prefs>;
	stats?: Partial<DayStats>;
	history?: DaySummary[];
};

// The whole file, or an empty object on first launch or when it is unreadable.
function readFile(): SettingsFile {
	try {
		const parsed = JSON.parse(readFileSync(file, "utf-8"));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

// Change some keys of the file and keep the rest.
function writeFile(change: SettingsFile) {
	if (!existsSync(Utils.paths.userData)) mkdirSync(Utils.paths.userData, { recursive: true });
	writeFileSync(file, JSON.stringify({ ...readFile(), ...change }, null, 2));
}

// The saved break rule.
export function loadRule(): Rule {
	return cleanRule(readFile().rule);
}

// Save the break rule.
export function saveRule(rule: Rule) {
	writeFile({ rule });
}

// The saved prefs. (Start at login is read from the OS instead, see login.ts.)
export function loadPrefs(): Prefs {
	return cleanPrefs(readFile().prefs);
}

// Save the prefs.
export function savePrefs(prefs: Prefs) {
	writeFile({ prefs });
}

// What is in the file now, so it is only written when the stats or history really change.
let savedStats = "";
let savedHistory = "";

// Today's saved break stats (core/stats.ts starts a new day when the date has changed).
export function loadStats(): DayStats {
	const stats = cleanStats(readFile().stats);
	savedStats = JSON.stringify(stats);
	return stats;
}

// Save the stats if they changed. Called on every tick, so it must be cheap when nothing did.
export function saveStats(stats: DayStats) {
	const next = JSON.stringify(stats);
	if (next === savedStats) return;
	savedStats = next;
	writeFile({ stats });
}

// The saved 7-day history (breaks and active work time).
export function loadHistory(): DaySummary[] {
	const history = cleanHistory(readFile().history);
	savedHistory = historyKey(history);
	return history;
}

// Save the 7-day history when break counts or displayed minutes change.
export function saveHistory(history: DaySummary[]) {
	const key = historyKey(history);
	if (key === savedHistory) return;
	savedHistory = key;
	writeFile({ history });
}

// Key rounded to whole work minutes and break seconds so disk writes happen only when shown values change.
function historyKey(history: DaySummary[]): string {
	return JSON.stringify(
		history.map((d) => ({
			...d,
			workMs: Math.floor(d.workMs / 60_000),
			breakMs: Math.floor(d.breakMs / 1000),
		})),
	);
}
