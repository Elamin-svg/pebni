// Starting the app when the user logs in.
// Windows: a value under HKCU\...\Run. macOS: a LaunchAgent plist.
// The login launch passes --login, so the app knows to wait for the user.
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const LOGIN_FLAG = "--login";
const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const RUN_VALUE = "Pebni";
const AGENT_ID = "app.pebni.desktop";
const agentFile = join(homedir(), "Library", "LaunchAgents", `${AGENT_ID}.plist`);

// True when this process was started by the login item.
// Electrobun 2.0.7's launcher does not pass its arguments on to this process,
// so we also read the launcher's own command line (it tells us its PID).
export function launchedAtLogin(): boolean {
	if (process.argv.includes(LOGIN_FLAG)) return true;
	const launcherPid = Number(process.env.ELECTROBUN_LAUNCHER_PID);
	if (!launcherPid || !isLoginEnabled()) return false;
	return commandLineOf(launcherPid).includes(LOGIN_FLAG);
}

// The full command line of another process, or "" if it cannot be read.
function commandLineOf(pid: number): string {
	const cmd =
		process.platform === "win32"
			? ["powershell", "-NoProfile", "-Command",
				`(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`]
			: ["ps", "-o", "args=", "-p", String(pid)];
	const result = Bun.spawnSync(cmd, { stderr: "ignore", windowsHide: true });
	return result.exitCode === 0 ? result.stdout.toString() : "";
}

// The program to start: Electrobun's launcher, which sits next to bun in the bin folder.
function launcherPath(): string {
	const name = process.platform === "win32" ? "launcher.exe" : "launcher";
	return join(dirname(process.execPath), name);
}

// Run a small command without a console window; true when it exits with 0.
function run(cmd: string[]): boolean {
	return Bun.spawnSync(cmd, { stdout: "ignore", stderr: "ignore", windowsHide: true }).exitCode === 0;
}

// The LaunchAgent that opens the app at login (macOS).
function agentPlist(): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>${AGENT_ID}</string>
	<key>ProgramArguments</key>
	<array><string>${launcherPath()}</string><string>${LOGIN_FLAG}</string></array>
	<key>RunAtLoad</key><true/>
</dict>
</plist>
`;
}

// Is the app set to start at login?
export function isLoginEnabled(): boolean {
	if (process.platform === "win32") return run(["reg", "query", RUN_KEY, "/v", RUN_VALUE]);
	if (process.platform === "darwin") return existsSync(agentFile);
	return false;
}

// Turn start at login on or off. Returns the setting as it is afterwards.
export function setLoginEnabled(on: boolean): boolean {
	try {
		if (process.platform === "win32") {
			const command = `"${launcherPath()}" ${LOGIN_FLAG}`;
			if (on) run(["reg", "add", RUN_KEY, "/v", RUN_VALUE, "/t", "REG_SZ", "/d", command, "/f"]);
			else run(["reg", "delete", RUN_KEY, "/v", RUN_VALUE, "/f"]);
		} else if (process.platform === "darwin") {
			if (on) {
				mkdirSync(dirname(agentFile), { recursive: true });
				writeFileSync(agentFile, agentPlist());
			} else {
				rmSync(agentFile, { force: true });
			}
		}
	} catch (error) {
		console.warn("Could not change start at login:", error);
	}
	return isLoginEnabled();
}
