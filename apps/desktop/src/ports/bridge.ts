// Presentation-to-Timer port (Hexagonal Port).
// Views talk only to this interface — never to Electrobun, RPC, or OS APIs directly.
// Implemented by both the Electrobun RPC adapter and the standalone browser-preview adapter.
import type { Command } from "../core/timer/engine";
import type { Rule } from "../core/timer/rule";
import type { Snapshot } from "../core/timer/timer";
import type { Prefs, PrefsView } from "../core/settings/prefs";
import type { AppUpdateState } from "../core/settings/app-update";
import type { Recording } from "../core/audio/break-audio";

export type Bridge = {
	run: (command: Command) => void;
	setRule: (rule: Rule) => void;
	onState: (listener: (snap: Snapshot) => void) => void;
	onMemory: (listener: (mb: number) => void) => void; // the timer process's memory in MB
	onUpdate: (listener: (state: AppUpdateState) => void) => void;
	getPrefs: () => Promise<PrefsView>;
	setPrefs: (change: Partial<Prefs>) => Promise<PrefsView>; // answers with what applied
	getRunningApps: () => Promise<string[]>; // process names, to suggest focus apps
	pickRecording: (seconds: number) => Promise<Recording | null>; // an audiobook piece that fits
	checkForUpdate: () => Promise<AppUpdateState>;
	applyUpdate: () => Promise<void>;
};
