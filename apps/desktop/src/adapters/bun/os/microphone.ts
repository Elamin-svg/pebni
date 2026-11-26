// Which processes are recording from a microphone right now, so "in a call" means a real call.
// Windows only, through Core Audio (the same sessions the volume mixer shows, see com.ts):
// every session on every active microphone that is active right now, and the process behind it.
// Elsewhere this returns null: the platform cannot tell.
import { FFIType, type Pointer } from "bun:ffi";
import { call, E_CAPTURE, eachSession, getNumber, guid, queryInterface, release } from "./com";

const SESSION_ACTIVE = 1; // AudioSessionState: recording right now
const GET_STATE = 3; // IAudioSessionControl
const GET_PROCESS_ID = 14; // IAudioSessionControl2
const IID_SESSION_CONTROL2 = guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D");

// The process behind one session when it is recording right now, or null.
function recordingPid(session: Pointer): number | null {
	if (getNumber((out) => call(session, GET_STATE, [FFIType.ptr], out)) !== SESSION_ACTIVE) return null;
	const control2 = queryInterface(session, IID_SESSION_CONTROL2);
	if (!control2) return null;
	try {
		const pid = getNumber((out) => call(control2, GET_PROCESS_ID, [FFIType.ptr], out));
		return pid ? pid : null; // 0 is the system sounds session
	} finally {
		release(control2);
	}
}

// The process ids recording from a microphone right now. null when the platform cannot tell.
// Never throws.
export function recordingPids(): number[] | null {
	if (process.platform !== "win32") return null;
	try {
		const pids: number[] = [];
		const reached = eachSession(E_CAPTURE, (session) => {
			const pid = recordingPid(session);
			if (pid) pids.push(pid);
		});
		return reached ? pids : null;
	} catch (error) {
		console.warn("Could not read who uses the microphone:", error);
		return null;
	}
}
