// The names of the programs running right now, for example "zoom.exe".
// Windows: a Toolhelp snapshot (kernel32), which is much cheaper than starting tasklist.
// macOS and others: `ps`. On failure the list is empty, so nothing is held by mistake.
import { dlopen, FFIType, ptr, type Pointer } from "bun:ffi";

const TH32CS_SNAPPROCESS = 0x2;
const ENTRY_SIZE = 568; // sizeof(PROCESSENTRY32W) on 64-bit Windows
const PID_OFFSET = 8; // th32ProcessID
const PARENT_OFFSET = 32; // th32ParentProcessID
const NAME_OFFSET = 44; // where szExeFile (260 UTF-16 characters) starts

// One running program: its process id, its parent's, and its name, for example "zoom.exe".
export type Program = { pid: number; parent: number; name: string };
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
function windowsProcesses(): Program[] {
	kernel32 ??= loadKernel32();
	const snap = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) as Pointer | null;
	if (!snap || BigInt(snap) === INVALID_HANDLE) return [];
	const entry = new Uint8Array(ENTRY_SIZE);
	const view = new DataView(entry.buffer);
	view.setUint32(0, ENTRY_SIZE, true); // dwSize
	const programs: Program[] = [];
	try {
		let ok = kernel32.Process32FirstW(snap, ptr(entry));
		while (ok) {
			const pid = view.getUint32(PID_OFFSET, true);
			programs.push({ pid, parent: view.getUint32(PARENT_OFFSET, true), name: exeName(entry) });
			ok = kernel32.Process32NextW(snap, ptr(entry));
		}
	} finally {
		kernel32.CloseHandle(snap);
	}
	return programs;
}

// The process ids and command names from `ps` (macOS, Linux), one "  123     1 Finder" per line.
function psProcesses(): Program[] {
	const result = Bun.spawnSync(["ps", "-axco", "pid=,ppid=,comm="], { stderr: "ignore" });
	if (result.exitCode !== 0) return [];
	return result.stdout.toString().split("\n").flatMap((line) => {
		const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
		return match ? [{ pid: Number(match[1]), parent: Number(match[2]), name: match[3]! }] : [];
	});
}

// The given processes and every process they started, at any depth (for example Pebni and its
// WebView helpers).
export function treeOf(roots: number[], programs: Program[]): Set<number> {
	const tree = new Set(roots);
	let grew = true;
	while (grew) {
		grew = false;
		for (const p of programs) {
			if (!tree.has(p.pid) && tree.has(p.parent)) {
				tree.add(p.pid);
				grew = true;
			}
		}
	}
	return tree;
}

// The names of a process and of the processes that started it (an app often records or draws
// its window from a helper process). Stops at a loop or after a few steps.
export function namesUpFrom(pid: number, programs: Program[]): string[] {
	const byPid = new Map(programs.map((p) => [p.pid, p]));
	const names: string[] = [];
	const seen = new Set<number>();
	for (let p = byPid.get(pid); p && !seen.has(p.pid) && names.length < 8; p = byPid.get(p.parent)) {
		seen.add(p.pid);
		names.push(p.name);
	}
	return names;
}

// Every running program with its process id. Empty when the list cannot be read.
export function runningPrograms(): Program[] {
	try {
		return process.platform === "win32" ? windowsProcesses() : psProcesses();
	} catch (error) {
		console.warn("Could not list running programs:", error);
		return [];
	}
}

// Every running program's name (no paths). Empty when the list cannot be read.
export function runningProcesses(): string[] {
	return runningPrograms().map((p) => p.name);
}
