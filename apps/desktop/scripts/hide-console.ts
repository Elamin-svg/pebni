// Electrobun postBuild step (Windows only): mark the app's bun.exe as a GUI program.
// The launcher starts the app in bun.exe, which is a console program, so Windows opened a
// terminal window next to the app on every start (desktop shortcut and start at login).
// A GUI program gets no console of its own. When started from a terminal (hutch run start),
// the logs still arrive there, because the launcher hands its output handles on.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SUBSYSTEM_GUI = 2;
const SUBSYSTEM_CONSOLE = 3;
const PE_POINTER_OFFSET = 0x3c; // where the offset of the "PE\0\0" header is stored
const SUBSYSTEM_OFFSET = 0x5c; // from the PE header to the Subsystem field (PE32 and PE32+)

// Every bun.exe below the folder.
function findBunExes(dir: string): string[] {
	const found: string[] = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) found.push(...findBunExes(path));
		else if (name.toLowerCase() === "bun.exe") found.push(path);
	}
	return found;
}

// Switch one exe from console to GUI. Leaves anything unexpected untouched.
function makeGui(path: string) {
	const bytes = readFileSync(path);
	const pe = bytes.readUInt32LE(PE_POINTER_OFFSET);
	if (bytes.toString("latin1", pe, pe + 4) !== "PE\0\0") return console.warn(`Not a PE file: ${path}`);
	const at = pe + SUBSYSTEM_OFFSET;
	const subsystem = bytes.readUInt16LE(at);
	if (subsystem === SUBSYSTEM_GUI) return console.log(`Already without a console: ${path}`);
	if (subsystem !== SUBSYSTEM_CONSOLE) return console.warn(`Unknown subsystem ${subsystem}: ${path}`);
	bytes.writeUInt16LE(SUBSYSTEM_GUI, at);
	writeFileSync(path, bytes);
	console.log(`No console window any more: ${path}`);
}

const buildDir = process.env.ELECTROBUN_BUILD_DIR;
if (process.platform === "win32" && buildDir) {
	for (const exe of findBunExes(buildDir)) makeGui(exe);
}
