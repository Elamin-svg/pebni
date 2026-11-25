// Gentle start & end chime synthesized with Web Audio API (zero audio files or dependencies).
// Lets developers truly look away from the monitor and hear when a break begins or finishes.
import type { Bridge } from "../../../ports/bridge";
import type { Snapshot } from "../../../core/timer/timer";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let audioCtx: AudioContext | null = null;

// Lazily open a shared AudioContext (safe if Web Audio is unavailable or blocked).
function getContext(): AudioContext | null {
	try {
		const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctor) return null;
		audioCtx ??= new Ctor();
		if (audioCtx.state === "suspended") void audioCtx.resume();
		return audioCtx;
	} catch {
		return null;
	}
}

// One soft bell tone with a gentle attack and warm exponential fade.
function tone(ctx: AudioContext, freq: number, delaySec: number, durationSec: number, peak: number) {
	const t0 = ctx.currentTime + delaySec;
	const osc = ctx.createOscillator();
	const overtone = ctx.createOscillator();
	const gain = ctx.createGain();
	const overGain = ctx.createGain();

	osc.type = "sine";
	osc.frequency.setValueAtTime(freq, t0);
	overtone.type = "triangle";
	overtone.frequency.setValueAtTime(freq * 2, t0);

	gain.gain.setValueAtTime(0.0001, t0);
	gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.025);
	gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

	overGain.gain.setValueAtTime(peak * 0.14, t0);
	overGain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec * 0.65);

	osc.connect(gain);
	overtone.connect(overGain);
	overGain.connect(gain);
	gain.connect(ctx.destination);

	osc.start(t0);
	overtone.start(t0);
	osc.stop(t0 + durationSec + 0.05);
	overtone.stop(t0 + durationSec + 0.05);
}

// Play the soft chime: ascending calm fifth on break start, resolving fourth on break end.
export function playChime(kind: "start" | "end") {
	const ctx = getContext();
	if (!ctx) return;
	if (kind === "start") {
		tone(ctx, 523.25, 0, 0.7, 0.07); // C5
		tone(ctx, 783.99, 0.14, 0.9, 0.06); // G5
	} else {
		tone(ctx, 659.25, 0, 0.65, 0.065); // E5
		tone(ctx, 523.25, 0.15, 0.95, 0.06); // C5
	}
}

// Main-window view for the chime toggle, preview button and break start/end triggers.
export function createChimeView(bridge: Bridge) {
	const toggle = $<HTMLInputElement>("chime-on");
	const preview = $<HTMLButtonElement>("chime-test");
	let enabled = true;
	let prevMode: Snapshot["mode"] | undefined;
	let prevTaken = 0;

	toggle.onchange = () => {
		enabled = toggle.checked;
		bridge.setPrefs({ chime: enabled }).then((p) => {
			enabled = p.chime;
			toggle.checked = p.chime;
		});
	};
	preview.onclick = () => playChime("start");

	bridge.getPrefs().then((p) => {
		enabled = p.chime;
		toggle.checked = p.chime;
	});

	return function render(snap: Snapshot) {
		if (prevMode !== undefined && enabled) {
			if (snap.mode === "break" && prevMode !== "break") playChime("start");
			// Only chime on break end when the break ran to completion (not when skipped by hand).
			if (prevMode === "break" && snap.mode !== "break" && snap.stats.taken > prevTaken) {
				playChime("end");
			}
		}
		prevMode = snap.mode;
		prevTaken = snap.stats.taken;
	};
}
