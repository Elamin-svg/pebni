// Which processes are recording from a microphone right now, so "in a call" means a real call.
// Windows only, through Core Audio (the same sessions the volume mixer shows) called directly
// over COM with bun:ffi: every active capture endpoint, every session on it, and the process
// behind each session that is active. Elsewhere this returns null: the platform cannot tell.
import { CFunction, dlopen, FFIType, ptr, read, type Pointer } from "bun:ffi";

const CLSCTX_ALL = 0x17;
const E_CAPTURE = 1; // EDataFlow: microphones
const DEVICE_STATE_ACTIVE = 1;
const SESSION_ACTIVE = 1; // AudioSessionState: recording right now
const RPC_E_CHANGED_MODE = 0x80010106 | 0; // COM is already set up on this thread, which is fine

// COM vtable slots (IUnknown takes 0-2 in every interface).
const QUERY_INTERFACE = 0;
const RELEASE = 2;
const ENUM_AUDIO_ENDPOINTS = 3; // IMMDeviceEnumerator
const COLLECTION_COUNT = 3; // IMMDeviceCollection
const COLLECTION_ITEM = 4;
const ACTIVATE = 3; // IMMDevice
const GET_SESSION_ENUMERATOR = 5; // IAudioSessionManager2
const SESSIONS_COUNT = 3; // IAudioSessionEnumerator
const SESSIONS_ITEM = 4;
const GET_STATE = 3; // IAudioSessionControl
const GET_PROCESS_ID = 14; // IAudioSessionControl2

// A COM GUID as the 16 bytes Windows expects.
function guid(text: string): Uint8Array {
	const hex = text.replace(/-/g, "");
	const bytes = new Uint8Array(16);
	const view = new DataView(bytes.buffer);
	view.setUint32(0, parseInt(hex.slice(0, 8), 16), true);
	view.setUint16(4, parseInt(hex.slice(8, 12), 16), true);
	view.setUint16(6, parseInt(hex.slice(12, 16), 16), true);
	for (let i = 0; i < 8; i++) bytes[8 + i] = parseInt(hex.slice(16 + i * 2, 18 + i * 2), 16);
	return bytes;
}

const CLSID_ENUMERATOR = guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
const IID_ENUMERATOR = guid("A95664D2-9614-4F35-A746-DE8DB63617E6");
const IID_SESSION_MANAGER2 = guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
const IID_SESSION_CONTROL2 = guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D");

// Load ole32 once, only on Windows.
function loadOle32() {
	return dlopen("ole32.dll", {
		CoInitializeEx: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
		CoCreateInstance: {
			args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr],
			returns: FFIType.i32,
		},
	}).symbols;
}

let ole32: ReturnType<typeof loadOle32> | undefined;
let comReady = false; // COM is set up on this thread (once: every set-up would need its own tear-down)
let enumerator: Pointer | null = null; // IMMDeviceEnumerator, made once and kept

type Arg = FFIType.ptr | FFIType.u32;
type Method = (...args: (Pointer | number | null)[]) => number;
const methods = new Map<string, Method>(); // compiled callers, by function address and shape

// Call slot `slot` of a COM object's vtable with the object as `this`.
function call(obj: Pointer, slot: number, args: Arg[], ...values: (Pointer | number | null)[]): number {
	const fn = read.ptr(read.ptr(obj, 0) as Pointer, slot * 8) as Pointer;
	const key = `${fn}:${args.join(",")}`;
	let method = methods.get(key);
	if (!method) {
		method = CFunction({ ptr: fn, args: [FFIType.ptr, ...args], returns: FFIType.i32 }) as unknown as Method;
		methods.set(key, method);
	}
	return method(obj, ...values);
}

// Let go of a COM object.
const release = (obj: Pointer) => call(obj, RELEASE, []);

// Run a COM call that hands back an object, or null when it fails.
function getObject(make: (out: Pointer) => number): Pointer | null {
	const out = new BigUint64Array(1);
	const ok = make(ptr(out)) >= 0 && out[0]! !== 0n;
	return ok ? (Number(out[0]) as Pointer) : null;
}

// Run a COM call that hands back a number, or null when it fails.
function getNumber(make: (out: Pointer) => number): number | null {
	const out = new Uint32Array(1);
	return make(ptr(out)) >= 0 ? out[0]! : null;
}

// Set up COM on this thread and make the device enumerator, once.
function deviceEnumerator(): Pointer | null {
	ole32 ??= loadOle32();
	if (enumerator) return enumerator;
	if (!comReady) {
		const status = ole32.CoInitializeEx(null, 0);
		if (status < 0 && status !== RPC_E_CHANGED_MODE) return null;
		comReady = true;
	}
	enumerator = getObject((out) =>
		ole32!.CoCreateInstance(ptr(CLSID_ENUMERATOR), null, CLSCTX_ALL, ptr(IID_ENUMERATOR), out),
	);
	return enumerator;
}

// The process behind one session when it is recording right now, or null.
function recordingPid(session: Pointer): number | null {
	if (getNumber((out) => call(session, GET_STATE, [FFIType.ptr], out)) !== SESSION_ACTIVE) return null;
	const control2 = getObject((out) =>
		call(session, QUERY_INTERFACE, [FFIType.ptr, FFIType.ptr], ptr(IID_SESSION_CONTROL2), out),
	);
	if (!control2) return null;
	try {
		const pid = getNumber((out) => call(control2, GET_PROCESS_ID, [FFIType.ptr], out));
		return pid ? pid : null; // 0 is the system sounds session
	} finally {
		release(control2);
	}
}

// The recording processes on one microphone.
function recordingOn(device: Pointer): number[] {
	const manager = getObject((out) =>
		call(device, ACTIVATE, [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr], ptr(IID_SESSION_MANAGER2), CLSCTX_ALL, null, out),
	);
	if (!manager) return [];
	const sessions = getObject((out) => call(manager, GET_SESSION_ENUMERATOR, [FFIType.ptr], out));
	release(manager);
	if (!sessions) return [];
	const pids: number[] = [];
	try {
		const count = getNumber((out) => call(sessions, SESSIONS_COUNT, [FFIType.ptr], out)) ?? 0;
		for (let i = 0; i < count; i++) {
			const session = getObject((out) => call(sessions, SESSIONS_ITEM, [FFIType.u32, FFIType.ptr], i, out));
			if (!session) continue;
			const pid = recordingPid(session);
			release(session);
			if (pid) pids.push(pid);
		}
	} finally {
		release(sessions);
	}
	return pids;
}

// Every process recording from any active microphone (Windows).
function windowsRecordingPids(): number[] | null {
	const devices = deviceEnumerator();
	if (!devices) return null;
	const list = getObject((out) =>
		call(devices, ENUM_AUDIO_ENDPOINTS, [FFIType.u32, FFIType.u32, FFIType.ptr], E_CAPTURE, DEVICE_STATE_ACTIVE, out),
	);
	if (!list) return null;
	const pids: number[] = [];
	try {
		const count = getNumber((out) => call(list, COLLECTION_COUNT, [FFIType.ptr], out)) ?? 0;
		for (let i = 0; i < count; i++) {
			const device = getObject((out) => call(list, COLLECTION_ITEM, [FFIType.u32, FFIType.ptr], i, out));
			if (!device) continue;
			pids.push(...recordingOn(device));
			release(device);
		}
	} finally {
		release(list);
	}
	return pids;
}

// The process ids recording from a microphone right now. null when the platform cannot tell.
// Never throws.
export function recordingPids(): number[] | null {
	if (process.platform !== "win32") return null;
	try {
		return windowsRecordingPids();
	} catch (error) {
		console.warn("Could not read who uses the microphone:", error);
		return null;
	}
}
