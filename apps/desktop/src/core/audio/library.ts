// Reading LibriVox recordings out of archive.org's item metadata (the "files" list of
// https://archive.org/metadata/<id>). Pure: the platform fetches, this only parses.
import type { Recording } from "./break-audio";

type ArchiveFile = { name?: string; title?: string; creator?: string; length?: string };
type ArchiveItem = { metadata?: { identifier?: string; title?: string }; files?: ArchiveFile[] };

// "02:20" -> 140, "1:02:03" -> 3723, "140.5" -> 141. Anything else -> 0.
export function parseLength(length: unknown): number {
	if (typeof length !== "string") return 0;
	const trimmed = length.trim();
	if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed));
	const raw = trimmed.split(":");
	if (raw.length < 2 || raw.some((p) => !/^\d+(\.\d+)?$/.test(p))) return 0;
	return Math.round(raw.map(Number).reduce((total, n) => total * 60 + n, 0));
}

// "01 - A Conservative" -> "A Conservative".
export function cleanTitle(title: string): string {
	return title.replace(/^\s*\d+\s*[-–.:]\s*/, "").trim();
}

// Every 64 kb MP3 in an item, as a recording with its length, title and author.
export function recordingsFrom(item: ArchiveItem): Recording[] {
	const id = item.metadata?.identifier;
	if (!id || !item.files) return [];
	const collection = item.metadata?.title ?? "";
	return item.files
		.filter((f) => f.name?.endsWith("_64kb.mp3") && parseLength(f.length) > 0)
		.map((f) => ({
			id: `https://archive.org/download/${id}/${encodeURIComponent(f.name!)}`,
			title: cleanTitle(f.title ?? f.name!),
			author: (f.creator ?? "").trim(),
			collection,
			seconds: parseLength(f.length),
		}));
}

// A saved library, cleaned: only well-formed recordings from archive.org.
export function cleanLibrary(input: unknown): Recording[] {
	if (!Array.isArray(input)) return [];
	return input.filter((r): r is Recording =>
		typeof r?.id === "string" && r.id.startsWith("https://archive.org/download/") &&
		typeof r.title === "string" && typeof r.author === "string" &&
		typeof r.collection === "string" && typeof r.seconds === "number" && r.seconds > 0);
}
