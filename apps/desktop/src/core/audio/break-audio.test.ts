// Sound during breaks always fits the break.
import { expect, test } from "bun:test";
import {
	isBreakInBackground, meditationPlan, natureFor, pickListening, pickRecording,
	rememberHeard, shouldMuteBackgroundApps, shouldPlayBreakAudio,
	type BackgroundMuteState, type BreakAudioState, type Recording,
} from "./break-audio";
import { cleanTitle, parseLength, recordingsFrom } from "./library";
import { cleanPrefs } from "../settings/prefs";

test("meditation: the longest guided track that fits, then the breathing loop", () => {
	expect(meditationPlan(20)).toEqual({ track: null, loop: true }); // 20-20-20: the loop alone
	expect(meditationPlan(180)).toEqual({ track: null, loop: true }); // 3 min does not fit with slack
	expect(meditationPlan(300)).toEqual({ track: "meditation-3", loop: true });
	expect(meditationPlan(304)).toEqual({ track: "meditation-5", loop: false });
	expect(meditationPlan(30 * 60)).toEqual({ track: "meditation-10", loop: true });
});

test("nature sounds follow the picture", () => {
	expect(natureFor("morning-window")).toBe("morning");
	expect(natureFor("rain-window")).toBe("rain");
	expect(natureFor("evening-cabin")).toBe("evening");
	expect(natureFor("fireplace")).toBe("fire");
});

const rec = (id: string, seconds: number): Recording => ({ id, title: id, author: "", collection: "", seconds });

test("a recording never runs longer than the break and is not repeated", () => {
	const list = [rec("a", 50), rec("b", 110), rec("c", 290), rec("d", 1200)];
	expect(pickRecording(list, 60, [], 0)?.id).toBe("a");
	expect(pickRecording(list, 300, [], 0)?.id).toBe("c");
	expect(pickRecording(list, 300, ["c"], 0)?.id).toBe("b");
	expect(pickRecording(list, 20, [], 0)).toBeNull();
	expect(pickRecording(list, 60, ["a"], 0)?.id).toBe("a"); // all heard: start over
});

test("a bundled story comes first, then LibriVox, and a story repeats only when all were heard", () => {
	const stories = [rec("story:fox", 40), rec("story:hare", 70)];
	const library = [rec("poem", 45)];
	expect(pickListening(stories, library, 60, [], 0)?.id).toBe("story:fox");
	expect(pickListening(stories, library, 60, ["story:fox"], 0)?.id).toBe("poem");
	expect(pickListening(stories, library, 60, ["story:fox", "poem"], 0)?.id).toBe("poem"); // longest that fits
	expect(pickListening(stories, [], 30, [], 0)).toBeNull();
});

test("heard recordings are remembered newest first", () => {
	expect(rememberHeard(["a", "b"], "b")).toEqual(["b", "a"]);
});

test("archive.org metadata becomes recordings with lengths", () => {
	expect(parseLength("02:20")).toBe(140);
	expect(parseLength("1:02:03")).toBe(3723);
	expect(parseLength("140.5")).toBe(141);
	expect(parseLength("soon")).toBe(0);
	expect(cleanTitle("01 - A Conservative")).toBe("A Conservative");
	const item = {
		metadata: { identifier: "spc168", title: "Short Poetry Collection 168" },
		files: [
			{ name: "a_64kb.mp3", title: "02 - Ad Infinitum", creator: "William Carlos Williams", length: "00:47" },
			{ name: "a_128kb.mp3", title: "02 - Ad Infinitum", length: "00:47" },
			{ name: "cover.jpg" },
		],
	};
	expect(recordingsFrom(item)).toEqual([{
		id: "https://archive.org/download/spc168/a_64kb.mp3", title: "Ad Infinitum",
		author: "William Carlos Williams", collection: "Short Poetry Collection 168", seconds: 47,
	}]);
});

test("prefs: sound is off by default; the old story switch becomes the audiobook", () => {
	expect(cleanPrefs()).toMatchObject({ audio: "off", muteBreakInBackground: false, heard: [] });
	expect(cleanPrefs({ stories: true } as never)).toMatchObject({ audio: "book" });
	expect(cleanPrefs({ audio: "nature", muteBreakInBackground: true })).toMatchObject({
		audio: "nature", muteBreakInBackground: true,
	});
	expect(cleanPrefs({ audio: "loud" as never, muteBreakInBackground: "yes" as never })).toMatchObject({
		audio: "off", muteBreakInBackground: false,
	});
});

test("background mute: pauses when break overlay or window is hidden and respects manual pause", () => {
	const base: BreakAudioState = {
		onBreak: true,
		choice: "nature",
		muteInBackground: true,
		breakHidden: false,
		windowHidden: false,
		userPaused: false,
	};

	// Visible break plays normally; hiding overlay or window mutes when option is on.
	expect(isBreakInBackground(base)).toBe(false);
	expect(shouldPlayBreakAudio(base)).toBe(true);
	expect(shouldPlayBreakAudio({ ...base, breakHidden: true })).toBe(false);
	expect(shouldPlayBreakAudio({ ...base, windowHidden: true })).toBe(false);
	expect(shouldPlayBreakAudio({ ...base, breakHidden: true, windowHidden: true })).toBe(false);

	// Returning to foreground resumes automatically unless the user paused by hand.
	expect(shouldPlayBreakAudio({ ...base, breakHidden: false, userPaused: false })).toBe(true);
	expect(shouldPlayBreakAudio({ ...base, breakHidden: false, userPaused: true })).toBe(false);

	// Turning the option off allows background playback (unless user paused or audio is off).
	expect(shouldPlayBreakAudio({ ...base, muteInBackground: false, breakHidden: true })).toBe(true);
	expect(shouldPlayBreakAudio({ ...base, muteInBackground: false, windowHidden: true })).toBe(true);
	expect(shouldPlayBreakAudio({ ...base, muteInBackground: false, breakHidden: true, userPaused: true })).toBe(false);
	expect(shouldPlayBreakAudio({ ...base, muteInBackground: false, choice: "off" })).toBe(false);
	expect(shouldPlayBreakAudio({ ...base, onBreak: false })).toBe(false);
});

test("muteOtherAudio: silences background apps on short and long breaks when enabled", () => {
	expect(cleanPrefs()).toMatchObject({
		muteOtherAudio: false,
		muteOtherAudioShort: true,
		muteOtherAudioLong: true,
	});
	expect(cleanPrefs({ muteOtherAudio: true, muteOtherAudioShort: false, muteOtherAudioLong: "no" as never })).toMatchObject({
		muteOtherAudio: true,
		muteOtherAudioShort: false,
		muteOtherAudioLong: true,
	});

	const base: BackgroundMuteState = {
		onBreak: true,
		breakHidden: false,
		kind: "eyes",
		muteOtherAudio: true,
		muteOtherAudioShort: true,
		muteOtherAudioLong: true,
	};

	// Master on + both short & long enabled: mutes all break kinds while overlay is visible.
	expect(shouldMuteBackgroundApps(base)).toBe(true);
	expect(shouldMuteBackgroundApps({ ...base, kind: "stretch" })).toBe(true);
	expect(shouldMuteBackgroundApps({ ...base, kind: "long" })).toBe(true);
	expect(shouldMuteBackgroundApps({ ...base, kind: "coffee" })).toBe(true);

	// Hiding a long break (e.g. to watch YouTube) or ending the break immediately unmutes.
	expect(shouldMuteBackgroundApps({ ...base, kind: "long", breakHidden: true })).toBe(false);
	expect(shouldMuteBackgroundApps({ ...base, onBreak: false })).toBe(false);

	// Individual short / long toggles control each category cleanly.
	expect(shouldMuteBackgroundApps({ ...base, kind: "eyes", muteOtherAudioShort: false })).toBe(false);
	expect(shouldMuteBackgroundApps({ ...base, kind: "long", muteOtherAudioShort: false })).toBe(true);
	expect(shouldMuteBackgroundApps({ ...base, kind: "long", muteOtherAudioLong: false })).toBe(false);
	expect(shouldMuteBackgroundApps({ ...base, kind: "coffee", muteOtherAudioLong: false })).toBe(false);
	expect(shouldMuteBackgroundApps({ ...base, kind: "eyes", muteOtherAudioLong: false })).toBe(true);

	// Master off never mutes.
	expect(shouldMuteBackgroundApps({ ...base, muteOtherAudio: false })).toBe(false);
});
