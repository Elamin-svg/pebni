// Small helpers for the sound scripts: ElevenLabs requests, a line cache, and ffmpeg.
// Bun reads ELEVENLABS_API_KEY from .env by itself; the key never leaves this machine otherwise.
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.elevenlabs.io/v1";
const CACHE = ".audio-cache";

// Stop early with a clear message when the key is missing.
export function needKey(): string {
	const key = process.env.ELEVENLABS_API_KEY;
	if (!key) {
		console.error("Set ELEVENLABS_API_KEY (in .env or the shell) first.");
		process.exit(1);
	}
	mkdirSync(CACHE, { recursive: true });
	return key;
}

// Ask ElevenLabs for audio and return the mp3 bytes; stop with its message on an error.
export async function post(path: string, body: object): Promise<ArrayBuffer> {
	const res = await fetch(`${API}${path}`, {
		method: "POST",
		headers: { "xi-api-key": needKey(), "content-type": "application/json", accept: "audio/mpeg" },
		body: JSON.stringify(body),
	});
	if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
	return res.arrayBuffer();
}

// Settings for one voice: which voice, how fast, how steady.
export type Voice = { id: string; speed: number; stability: number };

// One piece of speech as an mp3 in the cache; made only if it is not there yet.
// The text around it (before, after) keeps the tone even across pieces of one story.
export async function speak(voice: Voice, text: string, before = "", after = ""): Promise<string> {
	const file = join(CACHE, `${Bun.hash(voice.id + voice.speed + text).toString(16)}.mp3`);
	if (existsSync(file)) return file;
	console.log(`  voice: ${text.slice(0, 60)}${text.length > 60 ? "…" : ""}`);
	const audio = await post(`/text-to-speech/${voice.id}?output_format=mp3_44100_128`, {
		text,
		model_id: "eleven_multilingual_v2",
		previous_text: before || undefined,
		next_text: after || undefined,
		voice_settings: { stability: voice.stability, similarity_boost: 0.75, style: 0, speed: voice.speed },
	});
	await Bun.write(file, audio);
	return file;
}

// Run ffmpeg and stop if it fails.
export async function ffmpeg(args: string[]) {
	const run = Bun.spawn(["ffmpeg", "-y", "-loglevel", "error", ...args], { stderr: "inherit" });
	if ((await run.exited) !== 0) throw new Error("ffmpeg failed");
}

// The length of an audio file in seconds, from ffprobe.
export async function lengthOf(file: string): Promise<number> {
	const run = Bun.spawn(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
	return Number(await new Response(run.stdout).text());
}
