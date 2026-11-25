// The audiobook library: short poems and stories read by LibriVox volunteers (public domain),
// fetched from archive.org. Kept in the app's data folder and refreshed every two weeks;
// without a connection the saved list keeps working.
import { Utils } from "electrobun/main";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { type Recording } from "../../../core/audio/break-audio";
import { cleanLibrary, recordingsFrom } from "../../../core/audio/library";

const file = join(Utils.paths.userData, "library.json");
const FRESH_MS = 14 * 24 * 60 * 60_000;
const SEARCH = "https://archive.org/advancedsearch.php";
// Poems (mostly 1 to 3 minutes) for short breaks, stories (10 to 40 minutes) for long ones.
const SOURCES = [
	{ title: "short poetry collection", take: 8 },
	{ title: "short story collection", take: 3 },
];

let recordings: Recording[] = [];
let fetchedAt = 0;

// Read the saved library, if there is one.
function readSaved() {
	try {
		const saved = JSON.parse(readFileSync(file, "utf-8"));
		recordings = cleanLibrary(saved.recordings);
		fetchedAt = typeof saved.fetchedAt === "number" ? saved.fetchedAt : 0;
	} catch {
		recordings = [];
	}
}

// GET some JSON, or undefined when the network or the server fails.
async function getJson(url: string): Promise<any> {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Pebni break app" } });
		return res.ok ? await res.json() : undefined;
	} catch {
		return undefined;
	}
}

// A few LibriVox collections whose title matches, picked at random from the 60 most listened.
async function collections(title: string, take: number): Promise<string[]> {
	const q = encodeURIComponent(`collection:librivoxaudio AND title:("${title}")`);
	const data = await getJson(`${SEARCH}?q=${q}&fl[]=identifier&rows=60&sort[]=downloads+desc&output=json`);
	const ids: string[] = (data?.response?.docs ?? []).map((d: { identifier: string }) => d.identifier);
	return ids.sort(() => Math.random() - 0.5).slice(0, take);
}

// Fetch a fresh library and save it. Keeps the old one when nothing came back.
async function refresh() {
	const ids = (await Promise.all(SOURCES.map((s) => collections(s.title, s.take)))).flat();
	const items = await Promise.all(ids.map((id) => getJson(`https://archive.org/metadata/${id}`)));
	const fresh = items.flatMap((item) => (item ? recordingsFrom(item) : []));
	if (!fresh.length) return console.warn("Audiobook library: nothing fetched, keeping the saved list");
	recordings = fresh;
	fetchedAt = Date.now();
	if (!existsSync(Utils.paths.userData)) mkdirSync(Utils.paths.userData, { recursive: true });
	writeFileSync(file, JSON.stringify({ fetchedAt, recordings }));
	console.log(`Audiobook library: ${fresh.length} recordings from ${ids.length} collections`);
}

// Load the saved library, and fetch a new one in the background when it is old or missing.
export function startLibrary() {
	readSaved();
	if (Date.now() - fetchedAt > FRESH_MS || !recordings.length) void refresh();
}

// Every recording we know of (may be empty until the first fetch is done).
export function libraryRecordings(): Recording[] {
	return recordings;
}
