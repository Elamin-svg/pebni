// Sound during breaks: nothing, a guided breathing meditation, a poem or short story read by
// a person, or nature sounds. Whatever plays always fits the break: a recording is never
// longer than the time left, and loops fill what remains.
import type { BreakScene } from "../atmosphere/scenes";
import type { BreakKind } from "../timer/breaks";

export type AudioChoice = "off" | "meditation" | "book" | "nature";
export const AUDIO_CHOICES: AudioChoice[] = ["off", "meditation", "book", "nature"];

// The guided meditations bundled with the app, and how long each runs.
export type MeditationTrack = "meditation-3" | "meditation-5" | "meditation-10";
export const MEDITATIONS: { track: MeditationTrack; seconds: number }[] = [
	{ track: "meditation-10", seconds: 600 },
	{ track: "meditation-5", seconds: 300 },
	{ track: "meditation-3", seconds: 180 },
];
const START_SLACK_SEC = 4; // time to load and start, so a recording never runs over the break

// The plan for a meditation: the longest guided track that fits, then the breathing loop
// ("breathe in, breathe out") for whatever is left. Short breaks get the loop alone.
export function meditationPlan(breakSec: number): { track: MeditationTrack | null; loop: boolean } {
	const fits = MEDITATIONS.find((m) => m.seconds <= breakSec - START_SLACK_SEC);
	if (!fits) return { track: null, loop: true };
	return { track: fits.track, loop: breakSec - fits.seconds > START_SLACK_SEC };
}

// The nature sound that goes with the picture on the break screen.
export type NatureSound = "rain" | "fire" | "evening" | "morning" | "night";
const NATURE_FOR: Record<BreakScene, NatureSound> = {
	"morning-window": "morning",
	"rain-window": "rain",
	"evening-cabin": "evening",
	fireplace: "fire",
};
export function natureFor(scene: BreakScene): NatureSound {
	return NATURE_FOR[scene];
}

// A poem or short story read by a LibriVox volunteer (public domain), from archive.org.
export type Recording = {
	id: string; // the file's address, also used to remember what was heard
	title: string;
	author: string;
	collection: string; // e.g. "Short Poetry Collection 168"
	seconds: number;
};

// The recording for this break: one that fits the time left, not heard recently, as long as
// possible (so the break is filled), picking among the near-longest with `roll` (0 to 1).
export function pickRecording(list: Recording[], breakSec: number, heard: string[], roll: number): Recording | null {
	const fits = list.filter((r) => r.seconds > 0 && r.seconds <= breakSec - START_SLACK_SEC);
	const fresh = fits.filter((r) => !heard.includes(r.id));
	const pool = (fresh.length ? fresh : fits).sort((a, b) => b.seconds - a.seconds);
	if (!pool.length) return null;
	const top = pool.filter((r) => r.seconds >= pool[0]!.seconds * 0.6); // the ones that fill most
	const clamped = Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 1) : 0;
	return top[Math.min(Math.floor(clamped * top.length), top.length - 1)]!;
}

// Something to listen to: a new bundled classic story first, then a new LibriVox piece;
// only when everything that fits was heard does a story come round again.
export function pickListening(
	stories: Recording[], library: Recording[], breakSec: number, heard: string[], roll: number,
): Recording | null {
	const fresh = (list: Recording[]) => list.filter((r) => !heard.includes(r.id));
	return (
		pickRecording(fresh(stories), breakSec, heard, roll) ??
		pickRecording(fresh(library), breakSec, heard, roll) ??
		pickRecording([...stories, ...library], breakSec, heard, roll)
	);
}

// Remember a heard recording; the newest 300 are kept.
export function rememberHeard(heard: string[], id: string): string[] {
	return [id, ...heard.filter((h) => h !== id)].slice(0, 300);
}

// "Ad Infinitum · William Carlos Williams" for the player, "3 min" for meditations.
export function recordingLine(r: Recording): string {
	return r.author ? `${r.title} · ${r.author}` : r.title;
}

// Inputs for deciding whether break ambient audio should actively play right now.
export type BreakAudioState = {
	onBreak: boolean;
	choice: AudioChoice;
	muteInBackground: boolean;
	breakHidden: boolean; // user closed/hid the break overlay while the break timer still runs
	windowHidden: boolean; // browser tab or OS window is hidden/minimized
	userPaused: boolean; // user manually clicked Pause on the break screen player
};

// True when the break is running in the background (overlay closed or window hidden/minimized).
export function isBreakInBackground(state: Pick<BreakAudioState, "breakHidden" | "windowHidden">): boolean {
	return state.breakHidden || state.windowHidden;
}

// True when ambient break audio should play; respects manual pause and background muting.
export function shouldPlayBreakAudio(state: BreakAudioState): boolean {
	if (!state.onBreak || state.choice === "off" || state.userPaused) return false;
	if (state.muteInBackground && isBreakInBackground(state)) return false;
	return true;
}

// Inputs for deciding whether other apps' background audio should be muted during a break.
export type BackgroundMuteState = {
	onBreak: boolean;
	breakHidden: boolean; // user closed a long/coffee break window to watch YouTube or relax freely
	kind: BreakKind;
	muteOtherAudio: boolean;
	muteOtherAudioShort: boolean;
	muteOtherAudioLong: boolean;
};

// True when Pebni should mute other apps' audio right now (long/coffee vs short break aware).
export function shouldMuteBackgroundApps(state: BackgroundMuteState): boolean {
	if (!state.onBreak || state.breakHidden || !state.muteOtherAudio) return false;
	const isLong = state.kind === "long" || state.kind === "coffee";
	return isLong ? state.muteOtherAudioLong : state.muteOtherAudioShort;
}
