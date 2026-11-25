// App preferences that are not part of the break rule.
import { DEFAULT_FOCUS_APPS, cleanFocusApps } from "./focus-apps";
import { DEFAULT_SHORTCUTS, type ShortcutKeys, cleanShortcuts } from "./shortcuts";
import { AUDIO_CHOICES, type AudioChoice } from "../audio/break-audio";

export type Theme = "dark" | "light" | "system";
export const THEMES: Theme[] = ["dark", "light", "system"];

export type Prefs = {
	startAtLogin: boolean; // launch when the user logs in, waiting until they are back
	shortcutsOn: boolean; // global keyboard shortcuts are registered
	shortcuts: ShortcutKeys; // the keys for each shortcut, chosen by the user
	theme: Theme; // dark by default; "system" follows the OS setting
	focusApps: string[]; // process names that hold breaks back while they run (see focus-apps.ts)
	audio: AudioChoice; // what plays during breaks (see break-audio.ts)
	muteBreakInBackground: boolean; // pause ambient break audio when the break window is closed or hidden
	muteOtherAudio: boolean; // silence other apps' audio while a break screen is open
	muteOtherAudioShort: boolean; // apply background-app muting on short breaks
	muteOtherAudioLong: boolean; // apply background-app muting on long and coffee breaks
	chime: boolean; // soft start/end bell so you can look away without watching the clock
	heard: string[]; // recordings already played, newest first, so they are not repeated
};

export const DEFAULT_PREFS: Prefs = {
	startAtLogin: false, shortcutsOn: true, shortcuts: DEFAULT_SHORTCUTS, theme: "dark",
	focusApps: DEFAULT_FOCUS_APPS, audio: "off", muteBreakInBackground: false,
	muteOtherAudio: false, muteOtherAudioShort: true, muteOtherAudioLong: true,
	chime: true, heard: [],
};

// Turn any (possibly partial or broken) input into valid prefs.
export function cleanPrefs(input?: Partial<Prefs> | null): Prefs {
	const src = input && typeof input === "object" ? input : {};
	return {
		startAtLogin:
			typeof src.startAtLogin === "boolean" ? src.startAtLogin : DEFAULT_PREFS.startAtLogin,
		shortcutsOn:
			typeof src.shortcutsOn === "boolean" ? src.shortcutsOn : DEFAULT_PREFS.shortcutsOn,
		shortcuts: cleanShortcuts(src.shortcuts),
		theme: THEMES.includes(src.theme as Theme) ? (src.theme as Theme) : DEFAULT_PREFS.theme,
		focusApps: cleanFocusApps(src.focusApps),
		audio: cleanAudio(src),
		muteBreakInBackground:
			typeof src.muteBreakInBackground === "boolean"
				? src.muteBreakInBackground
				: DEFAULT_PREFS.muteBreakInBackground,
		muteOtherAudio:
			typeof src.muteOtherAudio === "boolean"
				? src.muteOtherAudio
				: DEFAULT_PREFS.muteOtherAudio,
		muteOtherAudioShort:
			typeof src.muteOtherAudioShort === "boolean"
				? src.muteOtherAudioShort
				: DEFAULT_PREFS.muteOtherAudioShort,
		muteOtherAudioLong:
			typeof src.muteOtherAudioLong === "boolean"
				? src.muteOtherAudioLong
				: DEFAULT_PREFS.muteOtherAudioLong,
		chime: typeof src.chime === "boolean" ? src.chime : DEFAULT_PREFS.chime,
		heard: Array.isArray(src.heard) ? src.heard.filter((h) => typeof h === "string").slice(0, 300) : [],
	};
}

// The sound choice. Settings from before it existed had a story switch: on means the audiobook.
function cleanAudio(input: Partial<Prefs> & { stories?: unknown }): AudioChoice {
	if (AUDIO_CHOICES.includes(input.audio as AudioChoice)) return input.audio as AudioChoice;
	return input.stories === true ? "book" : DEFAULT_PREFS.audio;
}

// Prefs as the settings area shows them, plus the shortcuts another app already holds.
export type PrefsView = Prefs & { taken: string[] };
