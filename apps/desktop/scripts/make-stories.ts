// Reads the classic stories in scripts/stories.json aloud with ElevenLabs, once, by the developer.
// The texts are public domain (Project Gutenberg: Aesop, the Brothers Grimm, Andersen), unchanged.
// Run:  bun scripts/make-stories.ts   (key from .env: ELEVENLABS_API_KEY)
// Writes src/adapters/web/audio/stories/<id>.mp3 and src/core/audio/story-list.ts with each length.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type Voice, ffmpeg, lengthOf, needKey, speak } from "./eleven";

type Story = { id: string; title: string; author: string; text: string };

const OUT = "src/adapters/web/audio/stories";
// "George": a warm storyteller, read a little slower than normal.
const TELLER: Voice = { id: process.env.ELEVENLABS_STORY_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb", speed: 0.9, stability: 0.6 };
const MAX_CHARS = 2400; // one request; whole paragraphs only

// Split a story into pieces of whole paragraphs, each small enough for one request.
function pieces(text: string): string[] {
	const out: string[] = [];
	let cur = "";
	for (const para of text.split("\n\n")) {
		if (cur && cur.length + para.length > MAX_CHARS) {
			out.push(cur);
			cur = "";
		}
		cur = cur ? `${cur}\n\n${para}` : para;
	}
	if (cur) out.push(cur);
	return out;
}

// Which book a story comes from, for the player's second line.
function collectionOf(author: string): string {
	if (author === "Aesop") return "Aesop's Fables";
	if (author === "The Brothers Grimm") return "Grimms' Fairy Tales";
	return "Andersen's Fairy Tales";
}

// Read one story: the title, then each piece, joined with short pauses and a soft fade.
async function makeStory(story: Story): Promise<number> {
	console.log(story.title);
	const parts = [`${story.title}. By ${story.author}.`, ...pieces(story.text)];
	const clips: string[] = [];
	for (let i = 0; i < parts.length; i++) clips.push(await speak(TELLER, parts[i]!, parts[i - 1], parts[i + 1]));
	const inputs = clips.flatMap((clip) => ["-i", clip]);
	const padded = clips.map((_, i) => `[${i}]apad=pad_dur=${i === 0 ? 1.2 : 0.6}[p${i}]`);
	const join_ = `${clips.map((_, i) => `[p${i}]`).join("")}concat=n=${clips.length}:v=0:a=1`;
	const file = join(OUT, `${story.id}.mp3`);
	await ffmpeg([...inputs, "-filter_complex", `${padded.join(";")};${join_},afade=t=in:d=0.3`, "-ac", "1", "-b:a", "96k", file]);
	return Math.ceil(await lengthOf(file));
}

// Read every story and write the list the app picks from.
async function main() {
	needKey();
	mkdirSync(OUT, { recursive: true });
	const stories: Story[] = await Bun.file("scripts/stories.json").json();
	const rows: string[] = [];
	for (const s of stories) {
		const seconds = await makeStory(s);
		rows.push(`\t{ id: "story:${s.id}", title: ${JSON.stringify(s.title)}, author: ${JSON.stringify(s.author)}, collection: "${collectionOf(s.author)}", seconds: ${seconds} },`);
	}
	const head = "// Made by scripts/make-stories.ts: the classic stories bundled with the app, and how long each one is.\n";
	await Bun.write("src/core/audio/story-list.ts", `${head}import type { Recording } from "./break-audio";\n\nexport const STORIES: Recording[] = [\n${rows.join("\n")}\n];\n`);
	await writeFileList(stories);
	console.log(`Done: ${stories.length} stories.`);
}

// The window's map from story id to its bundled file (plain imports, so Vite bundles them).
export async function writeFileList(stories: Story[]) {
	const name = (id: string) => id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
	const imports = stories.map((s) => `import ${name(s.id)} from "./${s.id}.mp3";`).join("\n");
	const rows = stories.map((s) => `\t"story:${s.id}": ${name(s.id)},`).join("\n");
	const head = "// Made by scripts/make-stories.ts: each bundled story's sound file, by its id.\n";
	await Bun.write(`${OUT}/story-files.ts`, `${head}${imports}\n\nexport const STORY_FILES: Record<string, string> = {\n${rows}\n};\n`);
}

if (import.meta.main) await main();
