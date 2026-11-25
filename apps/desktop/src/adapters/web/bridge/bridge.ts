// The window's link to the timer.
// Inside Electrobun it talks to the Bun process over RPC.
// In a plain browser (preview, design checks) it runs the engine locally.
import { Electroview } from "electrobun/view";
import type { PebniRPC } from "../../../ports/rpc";
import { createEngine, type Command } from "../../../core/timer/engine";
import { cleanRule, type Rule } from "../../../core/timer/rule";
import type { Snapshot } from "../../../core/timer/timer";
import { cleanPrefs, type Prefs, type PrefsView } from "../../../core/settings/prefs";
import type { AppUpdateState } from "../../../core/settings/app-update";
import { toMegabytes } from "../../../core/timer/updates";
import { pickListening, type Recording } from "../../../core/audio/break-audio";
import { STORIES } from "../../../core/audio/story-list";
import { cleanHistory } from "../../../core/analytics/history";
import { cleanStats } from "../../../core/analytics/stats";

import type { Bridge } from "../../../ports/bridge";

export type { Bridge };

// True inside the app; false in a plain browser preview.
export const insideElectrobun = "__electrobunWebviewId" in window;

// The real link inside the app, a local engine anywhere else.
export function connect(): Bridge {
	return insideElectrobun ? connectToBun() : connectLocal();
}

// --- Real app: Bun owns the timer ---
function connectToBun(): Bridge {
	let listener: (snap: Snapshot) => void = () => {};
	let memoryListener: (mb: number) => void = () => {};
	let updateListener: (state: AppUpdateState) => void = () => {};

	const rpc = Electroview.defineRPC<PebniRPC>({
		handlers: {
			requests: {},
			messages: {
				state: (snap) => listener(snap),
				usage: ({ memoryMb }) => memoryListener(memoryMb),
				appUpdate: (state) => updateListener(state),
			},
		},
	});
	new Electroview({ rpc });

	return {
		run: (command) => void rpc.request.command({ command }),
		setRule: (rule) => void rpc.request.setRule({ rule }),
		onState: (fn) => {
			listener = fn;
			rpc.request.getState({}).then(fn); // draw at once, before the next tick
		},
		onMemory: (fn) => {
			memoryListener = fn;
			rpc.request.getUsage({}).then((u) => fn(u.memoryMb)); // show it at once
		},
		onUpdate: (fn) => {
			updateListener = fn;
			rpc.request.getUpdateState({}).then(fn);
		},
		getPrefs: () => rpc.request.getPrefs({}),
		setPrefs: (prefs) => rpc.request.setPrefs({ prefs }),
		getRunningApps: () => rpc.request.getRunningApps({}).then((r) => r.names),
		pickRecording: (seconds) => rpc.request.pickRecording({ seconds }),
		checkForUpdate: () => rpc.request.checkForUpdate({}),
		applyUpdate: () => rpc.request.applyUpdate({}),
	};
}

// Read a JSON object from localStorage without crashing on corrupt or unavailable storage.
function readStorage(key: string): Record<string, unknown> {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

// Write a value to localStorage, ignoring storage quota or privacy-mode errors.
function writeStorage(key: string, value: unknown) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {}
}

// Read a JSON array from localStorage without crashing on corrupt storage.
function readStorageList(key: string): unknown[] {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

// --- Browser preview: same engine, settings in localStorage ---
function connectLocal(): Bridge {
	let listener: (snap: Snapshot) => void = () => {};
	const saved = readStorage("rule");
	const savedStats = cleanStats(readStorage("stats"));
	const savedHistory = cleanHistory(readStorageList("history"));
	const engine = createEngine(
		cleanRule(saved),
		(snap) => {
			writeStorage("stats", snap.stats);
			writeStorage("history", engine.history());
			listener(snap);
		},
		Date.now,
		() => Infinity,
		savedStats,
		savedHistory,
	);

	return {
		run: engine.run,
		setRule: (rule) => {
			const clean = cleanRule(rule);
			writeStorage("rule", clean);
			engine.setRule(clean);
		},
		onState: (fn) => {
			listener = fn;
			fn(engine.snapshot());
		},
		// No Bun process here: show the page's own JS heap once, where the browser tells it.
		onMemory: (fn) => {
			const heap = (performance as { memory?: { usedJSHeapSize: number } }).memory;
			if (heap) fn(toMegabytes(heap.usedJSHeapSize));
		},
		// No login item or shortcuts in a browser; the switches just remember their state.
		getPrefs: async () => ({
			...cleanPrefs(readStorage("prefs")),
			taken: [],
		}),
		setPrefs: async (change) => {
			const saved = readStorage("prefs");
			const next = cleanPrefs({ ...saved, ...change });
			writeStorage("prefs", next);
			return { ...next, taken: [] };
		},
		// A browser cannot see other programs: no suggestions.
		getRunningApps: async () => [],
		// A browser preview has the bundled stories and one LibriVox sample, nothing remembered.
		pickRecording: async (seconds) => pickListening(STORIES, [SAMPLE_RECORDING], seconds, [], Math.random()),
		onUpdate: (fn) => fn({ status: "idle", currentVersion: "0.1.0" }),
		checkForUpdate: async () => ({
			status: "up-to-date",
			currentVersion: "0.1.0",
			message: "Desktop updates run inside the installed app.",
		}),
		applyUpdate: async () => {},
	};
}

// The browser preview's one audiobook piece (a real LibriVox recording, public domain).
const SAMPLE_RECORDING: Recording = {
	id: "https://archive.org/download/spc168_1706_librivox/spc168_adinfinitum_vfkabt_64kb.mp3",
	title: "Ad Infinitum",
	author: "William Carlos Williams",
	collection: "Short Poetry Collection 168",
	seconds: 47,
};
