// Windows Core Audio over COM, called directly with bun:ffi (no PowerShell, about 1 ms).
// Methods are called by their vtable slot, so no QueryInterface "type check" is needed for
// objects Windows hands back. Some Windows builds reject that check on the session list,
// which is what broke the old .NET helper.
import { CFunction, dlopen, FFIType, ptr, read, type Pointer } from "bun:ffi";

export const CLSCTX_ALL = 0x17;
export const E_RENDER = 0; // EDataFlow: speakers and headphones
export const E_CAPTURE = 1; // EDataFlow: microphones
const DEVICE_STATE_ACTIVE = 1;
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

// A COM GUID as the 16 bytes Windows expects.
export function guid(text: string): Uint8Array {
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

// Load ole32 once, only on Windows.
function loadOle32() {
	return dlopen("ole32.dll", {
		CoInitializeEx: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
		CoCreateInstance: {
			args: [FFIType.ptr, FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr],
			returns: FFIType.i32,
		},
		CoTaskMemFree: { args: [FFIType.ptr], returns: FFIType.void },
	}).symbols;
}

// Run a COM call that hands back a string Windows allocated, read it and free it; null on failure.
export function getString(make: (out: Pointer) => number): string | null {
	const out = new BigUint64Array(1);
	if (make(ptr(out)) < 0 || out[0]! === 0n) return null;
	const text = Number(out[0]) as Pointer;
	try {
		const chars: number[] = [];
		for (let i = 0; chars.length < 4096; i += 2) {
			const char = read.u16(text, i);
			if (char === 0) break;
			chars.push(char);
		}
		return String.fromCharCode(...chars);
	} finally {
		ole32!.CoTaskMemFree(text);
	}
}

let ole32: ReturnType<typeof loadOle32> | undefined;
let comReady = false; // COM is set up on this thread (once: every set-up would need its own tear-down)
let enumerator: Pointer | null = null; // IMMDeviceEnumerator, made once and kept

export type Arg = FFIType.ptr | FFIType.u32 | FFIType.i32 | FFIType.f32;
type Value = Pointer | number | null;
type Method = (...args: Value[]) => number;
const methods = new Map<string, Method>(); // compiled callers, by function address and shape

// Call slot `slot` of a COM object's vtable with the object as `this`.
export function call(obj: Pointer, slot: number, args: Arg[], ...values: Value[]): number {
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
export const release = (obj: Pointer) => call(obj, RELEASE, []);

// Run a COM call that hands back an object, or null when it fails.
export function getObject(make: (out: Pointer) => number): Pointer | null {
	const out = new BigUint64Array(1);
	const ok = make(ptr(out)) >= 0 && out[0]! !== 0n;
	return ok ? (Number(out[0]) as Pointer) : null;
}

// Run a COM call that hands back a number, or null when it fails.
export function getNumber(make: (out: Pointer) => number): number | null {
	const out = new Uint32Array(1);
	return make(ptr(out)) >= 0 ? out[0]! : null;
}

// Ask an object for another of its interfaces, or null when it has none.
export function queryInterface(obj: Pointer, iid: Uint8Array): Pointer | null {
	return getObject((out) => call(obj, QUERY_INTERFACE, [FFIType.ptr, FFIType.ptr], ptr(iid), out));
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

// Visit every audio session on every active device of one kind (speakers or microphones).
// The session is released after `visit`; keep it longer with an AddRef'd interface of your own.
// Returns false when Core Audio cannot be reached at all.
export function eachSession(flow: number, visit: (session: Pointer) => void): boolean {
	const devices = deviceEnumerator();
	if (!devices) return false;
	const list = getObject((out) =>
		call(devices, ENUM_AUDIO_ENDPOINTS, [FFIType.u32, FFIType.u32, FFIType.ptr], flow, DEVICE_STATE_ACTIVE, out),
	);
	if (!list) return false;
	try {
		const count = getNumber((out) => call(list, COLLECTION_COUNT, [FFIType.ptr], out)) ?? 0;
		for (let i = 0; i < count; i++) {
			const device = getObject((out) => call(list, COLLECTION_ITEM, [FFIType.u32, FFIType.ptr], i, out));
			if (!device) continue;
			try {
				sessionsOn(device, visit);
			} finally {
				release(device);
			}
		}
	} finally {
		release(list);
	}
	return true;
}

// Visit every audio session on one device.
function sessionsOn(device: Pointer, visit: (session: Pointer) => void) {
	const manager = getObject((out) =>
		call(device, ACTIVATE, [FFIType.ptr, FFIType.u32, FFIType.ptr, FFIType.ptr], ptr(IID_SESSION_MANAGER2), CLSCTX_ALL, null, out),
	);
	if (!manager) return;
	const sessions = getObject((out) => call(manager, GET_SESSION_ENUMERATOR, [FFIType.ptr], out));
	release(manager);
	if (!sessions) return;
	try {
		const count = getNumber((out) => call(sessions, SESSIONS_COUNT, [FFIType.ptr], out)) ?? 0;
		for (let i = 0; i < count; i++) {
			const session = getObject((out) => call(sessions, SESSIONS_ITEM, [FFIType.u32, FFIType.ptr], i, out));
			if (!session) continue;
			try {
				visit(session);
			} finally {
				release(session);
			}
		}
	} finally {
		release(sessions);
	}
}
