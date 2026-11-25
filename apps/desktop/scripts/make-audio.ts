// Makes the bundled meditations, breathing loop and nature loops with ElevenLabs, once,
// by the developer (never by the app). Stories: see make-stories.ts.
// Run:  bun scripts/make-audio.ts [voice|nature]   (key from .env: ELEVENLABS_API_KEY)
// Each spoken line is kept in .audio-cache/, so a second run costs nothing.
import { join } from "node:path";
import { BREATHING_LOOP, MEDITATIONS, NATURE_PROMPTS, type VoiceTrack } from "./audio-script";
import { type Voice, ffmpeg, needKey, post, speak } from "./eleven";

const OUT = "src/adapters/web/audio";
// "Matilda": calm and warm. Slow and steady for guided breathing.
const CALM: Voice = { id: process.env.ELEVENLABS_VOICE_ID || "XrExE9yKIg1WjnnlVkGX", speed: 0.85, stability: 0.8 };

// Place every line at its time on silence, cut to the exact length, and save the track.
async function makeVoiceTrack(track: VoiceTrack) {
	console.log(`${track.file} (${track.seconds} s)`);
	const clips: string[] = [];
	for (const line of track.lines) clips.push(await speak(CALM, line.text));
	const inputs = clips.flatMap((clip) => ["-i", clip]);
	const delays = track.lines.map((line, i) => `[${i}]adelay=${line.at * 1000}:all=1[a${i}]`);
	const mix = `${track.lines.map((_, i) => `[a${i}]`).join("")}amix=inputs=${clips.length}:normalize=0`;
	const filter = `${delays.join(";")};${mix},apad,atrim=0:${track.seconds},afade=t=out:st=${track.seconds - 1}:d=1`;
	await ffmpeg([...inputs, "-filter_complex", filter, "-ac", "1", "-b:a", "96k", join(OUT, track.file)]);
}

// A nature sound as a seamless 20 s loop.
async function makeNature(file: string, prompt: string) {
	console.log(file);
	const audio = await post("/sound-generation", {
		text: prompt,
		model_id: "eleven_text_to_sound_v2",
		duration_seconds: 20,
		prompt_influence: 0.4,
		loop: true,
	});
	await Bun.write(join(OUT, file), audio);
}

// Make the voice tracks, the nature loops, or both.
async function main() {
	needKey();
	const only = process.argv[2];
	if (only !== "nature") for (const track of [...MEDITATIONS, BREATHING_LOOP]) await makeVoiceTrack(track);
	if (only !== "voice") for (const n of NATURE_PROMPTS) await makeNature(n.file, n.prompt);
	console.log("Done. Listen to the files in src/adapters/web/audio/ before you ship them.");
}

await main();
