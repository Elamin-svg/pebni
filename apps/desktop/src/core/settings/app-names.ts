// Friendly names for focus apps ("zoom.exe" -> "Zoom"), and turning what the user typed
// ("Zoom", "zoom", "zoom.exe") into the process name the platform compares against.
import { cleanAppName } from "./focus-apps";

// Programs people often want to hold breaks for, by process name.
const KNOWN: Record<string, string> = {
	"zoom.exe": "Zoom",
	"ms-teams.exe": "Microsoft Teams",
	"teams.exe": "Microsoft Teams (classic)",
	"slack.exe": "Slack",
	"discord.exe": "Discord",
	"webex.exe": "Webex",
	"ciscocollabhost.exe": "Webex",
	"skype.exe": "Skype",
	"obs64.exe": "OBS Studio",
	"loom.exe": "Loom",
	"powerpnt.exe": "PowerPoint",
	"facetime": "FaceTime",
};

// Background parts of the system nobody wants to pick from a list.
const SYSTEM = new Set([
	"system", "system idle process", "registry", "smss.exe", "csrss.exe", "wininit.exe",
	"services.exe", "lsass.exe", "svchost.exe", "fontdrvhost.exe", "dwm.exe", "winlogon.exe",
	"conhost.exe", "runtimebroker.exe", "dllhost.exe", "sihost.exe", "taskhostw.exe",
	"ctfmon.exe", "searchindexer.exe", "spoolsv.exe", "audiodg.exe", "wudfhost.exe",
	"backgroundtaskhost.exe", "applicationframehost.exe", "smartscreen.exe", "securityhealthservice.exe",
]);

// "zoom.exe" -> "Zoom"; an unknown "figma.exe" -> "Figma".
export function appLabel(processName: string): string {
	const known = KNOWN[processName];
	if (known) return known;
	const bare = processName.replace(/\.exe$/, "");
	return bare.charAt(0).toUpperCase() + bare.slice(1);
}

// What the user typed, as a process name: a known name ("Zoom"), a running program
// ("figma" while figma.exe runs), or the name itself.
export function appFromInput(input: string, running: string[]): string {
	const name = cleanAppName(input);
	if (!name) return "";
	const byLabel = Object.keys(KNOWN).find((p) => KNOWN[p].toLowerCase() === name);
	if (byLabel) return byLabel;
	const lower = running.map((r) => r.toLowerCase());
	if (lower.includes(name)) return name;
	if (lower.includes(`${name}.exe`)) return `${name}.exe`;
	return name;
}

// The running programs worth suggesting: no system parts, nothing already chosen,
// each once, known apps first, then A to Z.
export function appSuggestions(running: string[], chosen: string[]): string[] {
	const names = new Set(running.map(cleanAppName).filter((n) => n && !SYSTEM.has(n) && !chosen.includes(n)));
	const known = (n: string) => (n in KNOWN ? 0 : 1);
	return [...names].sort((a, b) => known(a) - known(b) || a.localeCompare(b)).slice(0, 150);
}
