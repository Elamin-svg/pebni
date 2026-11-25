// Sound during breaks: the choice in "Your rhythm", background mute option, and break player.
// What plays always fits the break (core/break-audio.ts decides): a meditation then the
// breathing loop, a poem or story shorter than the time left, or a nature loop.
// Only the main window plays sound, so several monitors never play it twice.
import type { Bridge } from "../../../ports/bridge";
import type { Snapshot } from "../../../core/timer/timer";
import {
	type AudioChoice, type Recording, meditationPlan, natureFor, recordingLine,
	shouldMuteBackgroundApps, shouldPlayBreakAudio,
} from "../../../core/audio/break-audio";
import { breakScene } from "../../../core/atmosphere/scenes";
import { formatMinutes } from "../../../core/analytics/format";
import { BREATHING_LOOP, MEDITATION_FILES, NATURE_FILES, NATURE_NAMES } from "../audio/audio-files";
import { STORY_FILES } from "../audio/stories/story-files";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// One piece in the queue: a file, what to call it, and whether it is the breathing loop.
type Piece = { src: string; title: string; detail: string; breathing?: boolean; loop?: boolean };

export function createSoundView(bridge: Bridge) {
	const row = $("sound");
	const toggle = $<HTMLButtonElement>("sound-toggle");
	const title = $("sound-title");
	const detail = $("sound-detail");
	const choices = document.querySelectorAll<HTMLInputElement>('input[name="audio"]');
	const muteBg = $<HTMLInputElement>("mute-in-background");
	const muteOther = $<HTMLInputElement>("mute-other-audio");
	const muteOtherScope = $("mute-other-scope");
	const muteOtherShort = $<HTMLInputElement>("mute-other-short");
	const muteOtherLong = $<HTMLInputElement>("mute-other-long");
	const audio = new Audio();

	let choice: AudioChoice = "off";
	let activeChoice: AudioChoice = "off";
	let muteInBackground = false;
	let muteOtherAudio = false;
	let muteOtherAudioShort = true;
	let muteOtherAudioLong = true;
	let onBreak = false;
	let breakHidden = false;
	let userPaused = false;
	let breakRun = 0; // increments on every break start/stop so stale async picks are ignored
	let leftSec = 0; // time left in the break, from the latest snapshot
	let queue: Piece[] = [];
	let piece: Piece | undefined;

	// The radios save the choice; it applies from the next break on.
	for (const input of choices) {
		input.onchange = () => {
			choice = input.value as AudioChoice;
			bridge.setPrefs({ audio: choice });
		};
	}

	// Background mute toggle saves immediately and pauses/resumes an active break right away.
	if (muteBg) {
		muteBg.onchange = () => {
			muteInBackground = muteBg.checked;
			bridge.setPrefs({ muteBreakInBackground: muteInBackground }).then((p) => {
				muteInBackground = p.muteBreakInBackground;
				muteBg.checked = p.muteBreakInBackground;
				syncPlayback();
			});
			syncPlayback();
		};
	}

	// Sync the short/long scope visibility and expose the active background-muting state on <html>.
	function syncBackgroundMuteState() {
		if (muteOtherScope) muteOtherScope.hidden = !muteOtherAudio;
		const muted = !!lastSnap && shouldMuteBackgroundApps({
			onBreak,
			breakHidden,
			kind: lastSnap.kind,
			muteOtherAudio,
			muteOtherAudioShort,
			muteOtherAudioLong,
		});
		document.documentElement.dataset.bgAudioMuted = String(muted);
	}

	// Master "Mute background audio during breaks" switch + short/long break scope checkboxes.
	if (muteOther) {
		muteOther.onchange = () => {
			muteOtherAudio = muteOther.checked;
			// Turning the feature on ensures both short and long breaks are activated if both were unchecked.
			if (muteOtherAudio && !muteOtherAudioShort && !muteOtherAudioLong) {
				muteOtherAudioShort = true;
				muteOtherAudioLong = true;
				if (muteOtherShort) muteOtherShort.checked = true;
				if (muteOtherLong) muteOtherLong.checked = true;
			}
			syncBackgroundMuteState();
			bridge.setPrefs({ muteOtherAudio, muteOtherAudioShort, muteOtherAudioLong }).then((p) => {
				muteOtherAudio = p.muteOtherAudio;
				muteOtherAudioShort = p.muteOtherAudioShort;
				muteOtherAudioLong = p.muteOtherAudioLong;
				muteOther.checked = p.muteOtherAudio;
				if (muteOtherShort) muteOtherShort.checked = p.muteOtherAudioShort;
				if (muteOtherLong) muteOtherLong.checked = p.muteOtherAudioLong;
				syncBackgroundMuteState();
			});
		};
	}
	if (muteOtherShort) {
		muteOtherShort.onchange = () => {
			muteOtherAudioShort = muteOtherShort.checked;
			syncBackgroundMuteState();
			bridge.setPrefs({ muteOtherAudioShort }).then((p) => {
				muteOtherAudioShort = p.muteOtherAudioShort;
				muteOtherShort.checked = p.muteOtherAudioShort;
				syncBackgroundMuteState();
			});
		};
	}
	if (muteOtherLong) {
		muteOtherLong.onchange = () => {
			muteOtherAudioLong = muteOtherLong.checked;
			syncBackgroundMuteState();
			bridge.setPrefs({ muteOtherAudioLong }).then((p) => {
				muteOtherAudioLong = p.muteOtherAudioLong;
				muteOtherLong.checked = p.muteOtherAudioLong;
				syncBackgroundMuteState();
			});
		};
	}

	// The saved choices. A break that starts before prefs load waits for them.
	const loaded = bridge.getPrefs().then((p) => {
		choice = p.audio;
		muteInBackground = p.muteBreakInBackground;
		muteOtherAudio = p.muteOtherAudio;
		muteOtherAudioShort = p.muteOtherAudioShort;
		muteOtherAudioLong = p.muteOtherAudioLong;
		for (const input of choices) input.checked = input.value === choice;
		if (muteBg) muteBg.checked = muteInBackground;
		if (muteOther) muteOther.checked = muteOtherAudio;
		if (muteOtherShort) muteOtherShort.checked = muteOtherAudioShort;
		if (muteOtherLong) muteOtherLong.checked = muteOtherAudioLong;
		syncBackgroundMuteState();
	});

	// Decide whether ambient break audio should be playing right now.
	function wantPlay(): boolean {
		return shouldPlayBreakAudio({
			onBreak,
			choice: activeChoice,
			muteInBackground,
			breakHidden,
			windowHidden: document.hidden,
			userPaused,
		});
	}

	// Keep HTMLAudioElement and UI state aligned with visibility, breakHidden, and manual pause.
	function syncPlayback() {
		if (!onBreak || !piece) return;
		if (wantPlay()) {
			if (audio.paused) resume();
			else drawState();
		} else {
			if (!audio.paused) audio.pause();
			drawState();
		}
	}

	// Play the next piece in the queue, or stop when it is empty.
	function playNext() {
		piece = queue.shift();
		if (!piece) return stop();
		audio.src = piece.src;
		audio.loop = !!piece.loop;
		title.textContent = piece.title;
		detail.textContent = piece.detail;
		row.classList.toggle("breathing", !!piece.breathing);
		restartBreath();
		syncPlayback();
	}

	// Start or continue; the webview may refuse to play before the first click.
	function resume() {
		audio.play().then(drawState, drawState);
	}

	// Stop all sound and forget the queue.
	function stop() {
		queue = [];
		piece = undefined;
		audio.pause();
		audio.removeAttribute("src");
		row.classList.remove("breathing");
		drawState();
	}

	// The button and the breathing ring follow the audio: playing or paused.
	function drawState() {
		const playing = !audio.paused;
		toggle.classList.toggle("playing", playing);
		toggle.setAttribute("aria-label", playing ? "Pause the sound" : "Play the sound");
		row.classList.toggle("paused", !playing);
	}

	// The ring and the cue start a new breath together with the loop.
	function restartBreath() {
		row.classList.remove("breath-run");
		void row.offsetWidth;
		row.classList.add("breath-run");
	}

	// A piece ended: the breathing loop starts its next breath; a poem asks for the next one.
	audio.onended = () => {
		if (!onBreak) return;
		if (piece?.breathing) {
			restartBreath();
			return syncPlayback();
		}
		if (activeChoice === "book") {
			const mine = breakRun;
			return queueBook(mine).then(() => {
				if (onBreak && mine === breakRun) playNext();
			});
		}
		playNext();
	};
	audio.onplay = drawState;
	audio.onpause = drawState;

	// Manual play/pause on the break screen: remembered so reopening from background respects it.
	toggle.onclick = () => {
		if (audio.paused) {
			userPaused = false;
			syncPlayback();
		} else {
			userPaused = true;
			audio.pause();
		}
	};

	// Pause/resume when the OS window is hidden to tray, minimized, or restored.
	document.addEventListener("visibilitychange", syncPlayback);

	// The breathing loop, for as long as the break lasts.
	const breathing = (): Piece => ({
		src: BREATHING_LOOP, title: "Breathe with me", detail: "In for four, out for six.", breathing: true,
	});

	// Meditation: the longest guided track that fits, then the breathing loop.
	function queueMeditation() {
		const plan = meditationPlan(leftSec);
		queue = [];
		if (plan.track) {
			const minutes = plan.track.replace("meditation-", "");
			queue.push({ src: MEDITATION_FILES[plan.track], title: "Guided meditation", detail: `${minutes} minutes, with a calm voice.` });
		}
		if (plan.loop) queue.push(breathing());
	}

	// Nature: the sound that matches the picture, looped.
	function queueNature(snap: Snapshot, why = "") {
		const sound = natureFor(breakScene(snap.dayPart, snap.stats.offered - 1));
		queue = [{ src: NATURE_FILES[sound], title: NATURE_NAMES[sound], detail: why || "Nature sounds, until the break ends.", loop: true }];
	}

	// Audiobook: a poem or story that fits the time left. None fits or fetch fails: nature sounds instead.
	let lastSnap: Snapshot | undefined;
	async function queueBook(mine: number) {
		let pick: Recording | null = null;
		try {
			pick = await bridge.pickRecording(leftSec);
		} catch {
			pick = null;
		}
		if (!onBreak || mine !== breakRun) return;
		if (pick) {
			const bundled = STORY_FILES[pick.id];
			const who = bundled ? `${pick.collection} · AI narration` : "Read by a LibriVox volunteer";
			const detail = `${who} · ${formatMinutes(pick.seconds * 1000)}`;
			queue = [{ src: bundled ?? pick.id, title: recordingLine(pick), detail }];
		} else if (lastSnap) {
			queueNature(lastSnap, "No poem is short enough for the time left, so nature sounds play.");
		}
	}

	// A break starts: build the queue for the chosen sound and play if not muted in background.
	async function startBreak(snap: Snapshot, mine: number) {
		await loaded;
		if (!onBreak || mine !== breakRun) return;
		activeChoice = choice;
		row.hidden = activeChoice === "off";
		if (activeChoice === "off") return;
		if (activeChoice === "meditation") queueMeditation();
		if (activeChoice === "nature") queueNature(snap);
		if (activeChoice === "book") await queueBook(mine);
		if (onBreak && mine === breakRun) playNext();
	}

	// Follow the break: start sound when it begins, sync on hide/show, stop when it ends.
	return function render(snap: Snapshot) {
		const was = onBreak;
		const wasHidden = breakHidden;
		onBreak = snap.mode === "break";
		breakHidden = onBreak && snap.breakHidden;
		leftSec = Math.floor(snap.leftMs / 1000);
		lastSnap = snap;
		syncBackgroundMuteState();
		if (onBreak && !was) {
			userPaused = false;
			void startBreak(snap, ++breakRun);
		} else if (onBreak && breakHidden !== wasHidden) {
			syncPlayback();
		} else if (!onBreak && was) {
			breakRun++;
			userPaused = false;
			stop();
			row.hidden = true;
		}
	};
}
