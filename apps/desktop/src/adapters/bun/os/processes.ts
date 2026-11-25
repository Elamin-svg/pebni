// The names of the programs running right now, for example "zoom.exe".
// Windows: a Toolhelp snapshot (kernel32), which is much cheaper than starting tasklist.
// macOS and others: `ps`. On failure the list is empty, so nothing is held by mistake.
import { dlopen, FFIType, ptr, type Pointer } from "bun:ffi";

const TH32CS_SNAPPROCESS = 0x2;
const ENTRY_SIZE = 568; // sizeof(PROCESSENTRY32W) on 64-bit Windows
const NAME_OFFSET = 44; // where szExeFile (260 UTF-16 characters) starts
const INVALID_HANDLE = 0xffffffffffffffffn; // INVALID_HANDLE_VALUE (-1)

// Load kernel32 once, only on Windows.
function loadKernel32() {
	return dlopen("kernel32.dll", {
		CreateToolhelp32Snapshot: { args: [FFIType.u32, FFIType.u32], returns: FFIType.ptr },
		Process32FirstW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
		Process32NextW: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
		CloseHandle: { args: [FFIType.ptr], returns: FFIType.i32 },
	}).symbols;
}

let kernel32: ReturnType<typeof loadKernel32> | undefined;
const utf16 = new TextDecoder("utf-16le");

// Read szExeFile from a PROCESSENTRY32W, up to its terminating zero.
function exeName(entry: Uint8Array): string {
	const chars = new Uint16Array(entry.buffer, NAME_OFFSET, 260);
	const end = chars.indexOf(0);
	return utf16.decode(chars.subarray(0, end < 0 ? 260 : end));
}

// Walk the process snapshot (Windows).
function windowsProcesses(): string[] {
	kernel32 ??= loadKernel32();
	const snap = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) as Pointer | null;
	if (!snap || BigInt(snap) === INVALID_HANDLE) return [];
	const entry = new Uint8Array(ENTRY_SIZE);
	new DataView(entry.buffer).setUint32(0, ENTRY_SIZE, true); // dwSize
	const names: string[] = [];
	try {
		let ok = kernel32.Process32FirstW(snap, ptr(entry));
		while (ok) {
			names.push(exeName(entry));
			ok = kernel32.Process32NextW(snap, ptr(entry));
		}
	} finally {
		kernel32.CloseHandle(snap);
	}
	return names;
}

// The command names from `ps` (macOS, Linux).
function psProcesses(): string[] {
	const result = Bun.spawnSync(["ps", "-axco", "comm="], { stderr: "ignore" });
	return result.exitCode === 0 ? result.stdout.toString().split("\n").map((l) => l.trim()) : [];
}

// Every running program's name (no paths). Empty when the list cannot be read.
export function runningProcesses(): string[] {
	try {
		return process.platform === "win32" ? windowsProcesses() : psProcesses();
	} catch (error) {
		console.warn("Could not list running programs:", error);
		return [];
	}
}
