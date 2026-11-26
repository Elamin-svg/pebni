// Mute other apps' audio during breaks (Windows Core Audio, see com.ts).
// Every session on every active output device is muted, not only the default device: a headset
// in a call plays through its separate "Hands-Free" device, and apps can pick their own output.
// Pebni's own process tree (Bun + WebView2) is left alone so chimes and break audio keep playing.
// While muted, the sessions are checked again every few seconds, so sound that starts during
// the break (the next video, a newly connected headset) is muted too.
// Afterwards everything is unmuted except the sessions that were already muted when the break
// began. Tracking "what Pebni muted" is not enough: Windows starts a new session of a program
// already muted when that program's last session was muted, so those must be unmuted too.
import { FFIType, type Pointer } from "bun:ffi";
import { call, E_RENDER, eachSession, getNumber, getString, guid, queryInterface, release } from "./com";
import { runningPrograms, treeOf } from "./processes";

const RECHECK_MS = 2000;
const GET_INSTANCE_ID = 13; // IAudioSessionControl2
const GET_PROCESS_ID = 14;
const SET_MUTE = 5; // ISimpleAudioVolume
const GET_MUTE = 6;
const IID_SESSION_CONTROL2 = guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D");
const IID_SIMPLE_VOLUME = guid("87CE5498-68D6-44E5-9215-6DA47EF883D8");

let mutedBefore: Set<string> | null = null; // sessions muted when the break began; null: not muting
let recheck: ReturnType<typeof setInterval> | null = null;
let warned = false; // log a failure once, not every few seconds

// One other app's session: its unique id and mute switch. Pebni's own sessions are skipped.
type Session = { id: string; muted: boolean; setMuted: (on: boolean) => void };

// Pebni's root processes: Bun, plus the launcher when there is one.
function ownRootPids(): number[] {
	const pids = [process.pid];
	const launcher = Number(process.env.ELECTROBUN_LAUNCHER_PID);
	if (Number.isInteger(launcher) && launcher > 0) pids.push(launcher);
	return pids;
}

// A session's process id and unique instance id, or null for system sounds and unknowns.
function identify(session: Pointer): { pid: number; id: string } | null {
	const control2 = queryInterface(session, IID_SESSION_CONTROL2);
	if (!control2) return null;
	try {
		const pid = getNumber((out) => call(control2, GET_PROCESS_ID, [FFIType.ptr], out)) ?? 0;
		const id = getString((out) => call(control2, GET_INSTANCE_ID, [FFIType.ptr], out));
		return pid && id ? { pid, id } : null;
	} finally {
		release(control2);
	}
}

// Visit every other app's session on every output device. Throws when Core Audio is unreachable.
function eachOtherSession(visit: (s: Session) => void) {
	const own = treeOf(ownRootPids(), runningPrograms());
	const reached = eachSession(E_RENDER, (session) => {
		const who = identify(session);
		if (!who || own.has(who.pid)) return;
		const volume = queryInterface(session, IID_SIMPLE_VOLUME);
		if (!volume) return;
		try {
			const muted = getNumber((out) => call(volume, GET_MUTE, [FFIType.ptr], out)) === 1;
			const setMuted = (on: boolean) => void call(volume, SET_MUTE, [FFIType.i32, FFIType.ptr], on ? 1 : 0, null);
			visit({ id: who.id, muted, setMuted });
		} finally {
			release(volume);
		}
	});
	if (!reached) throw new Error("Core Audio is not reachable");
}

// Remember what was muted already, so it stays muted after the break.
function rememberMuted() {
	const ids = new Set<string>();
	eachOtherSession((s) => s.muted && ids.add(s.id));
	mutedBefore = ids;
}

// Mute every other app's session that still plays. Safe to repeat. Mutes nothing until what
// was muted before is known, or the break's end could not tell what to give back.
function muteOthers() {
	if (!mutedBefore) rememberMuted();
	eachOtherSession((s) => !s.muted && s.setMuted(true));
}

// Unmute every other app's session, except the ones that were muted before the break.
function unmuteOthers() {
	const keep = mutedBefore ?? new Set<string>();
	mutedBefore = null;
	eachOtherSession((s) => s.muted && !keep.has(s.id) && s.setMuted(false));
}

// Run one step, logging the first failure instead of throwing.
function attempt(step: () => void) {
	try {
		step();
	} catch (error) {
		if (!warned) console.warn("Could not mute or restore other apps' audio:", error);
		warned = true;
	}
}

// Mute or restore other apps' audio. Repeating the same choice is cheap. No-op off Windows.
export function setBackgroundAudioMuted(muted: boolean) {
	if (process.platform !== "win32" || muted === (recheck !== null)) return;
	if (muted) {
		attempt(muteOthers);
		recheck = setInterval(() => attempt(muteOthers), RECHECK_MS);
	} else {
		clearInterval(recheck!);
		recheck = null;
		if (mutedBefore) attempt(unmuteOthers); // never unmute without knowing what to keep
	}
}

// Restore other apps' audio before the process exits.
export function restoreBackgroundAudioSync() {
	setBackgroundAudioMuted(false);
}
