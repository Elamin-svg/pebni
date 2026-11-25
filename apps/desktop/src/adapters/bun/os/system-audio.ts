// Mute other applications' audio sessions during active breaks (Windows Core Audio COM).
// Pebni's own process tree (Bun + WebView2) is excluded so chimes and break audio keep playing,
// and only sessions muted by Pebni are restored when the break ends, closes, or the app quits.

const CORE_AUDIO_CS = `
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class PebniAudio {
	[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
	private class MMDeviceEnumerator {}

	[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
	private interface IMMDeviceEnumerator {
		int NotImpl1();
		[PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
	}

	[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
	private interface IMMDevice {
		[PreserveSig] int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
	}

	[Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
	private interface IAudioSessionManager2 {
		int NotImpl1();
		int NotImpl2();
		[PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator SessionEnum);
	}

	[Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DDE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
	private interface IAudioSessionEnumerator {
		[PreserveSig] int GetCount(out int SessionCount);
		[PreserveSig] int GetSession(int SessionCount, out IAudioSessionControl2 Session);
	}

	[Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
	private interface IAudioSessionControl2 {
		int NotImpl01(); int NotImpl02(); int NotImpl03(); int NotImpl04(); int NotImpl05();
		int NotImpl06(); int NotImpl07(); int NotImpl08(); int NotImpl09();
		int NotImpl10(); int NotImpl11();
		[PreserveSig] int GetProcessId(out uint pRetVal);
	}

	[Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
	private interface ISimpleAudioVolume {
		[PreserveSig] int SetMasterVolume(float fLevel, ref Guid EventContext);
		[PreserveSig] int GetMasterVolume(out float pfLevel);
		[PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid EventContext);
		[PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
	}

	private static IAudioSessionEnumerator GetSessions() {
		var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumerator());
		IMMDevice device;
		if (enumerator.GetDefaultAudioEndpoint(0, 1, out device) != 0 || device == null) return null;
		Guid iid = typeof(IAudioSessionManager2).GUID;
		object obj;
		if (device.Activate(ref iid, 23, IntPtr.Zero, out obj) != 0 || obj == null) return null;
		IAudioSessionEnumerator sessions;
		if (((IAudioSessionManager2)obj).GetSessionEnumerator(out sessions) != 0) return null;
		return sessions;
	}

	public static uint[] MuteOthers(uint[] excludePids) {
		var skip = new HashSet<uint>(excludePids);
		var muted = new HashSet<uint>();
		var sessions = GetSessions();
		if (sessions == null) return new uint[0];
		int count;
		sessions.GetCount(out count);
		Guid ctx = Guid.Empty;
		for (int i = 0; i < count; i++) {
			IAudioSessionControl2 ctrl;
			if (sessions.GetSession(i, out ctrl) != 0 || ctrl == null) continue;
			uint pid;
			if (ctrl.GetProcessId(out pid) != 0 || pid == 0 || skip.Contains(pid)) continue;
			var vol = ctrl as ISimpleAudioVolume;
			if (vol == null) continue;
			bool alreadyMuted;
			if (vol.GetMute(out alreadyMuted) == 0 && !alreadyMuted) {
				if (vol.SetMute(true, ref ctx) == 0) muted.Add(pid);
			}
		}
		var result = new uint[muted.Count];
		muted.CopyTo(result);
		return result;
	}

	public static void UnmutePids(uint[] pids) {
		if (pids == null || pids.Length == 0) return;
		var targets = new HashSet<uint>(pids);
		var sessions = GetSessions();
		if (sessions == null) return;
		int count;
		sessions.GetCount(out count);
		Guid ctx = Guid.Empty;
		for (int i = 0; i < count; i++) {
			IAudioSessionControl2 ctrl;
			if (sessions.GetSession(i, out ctrl) != 0 || ctrl == null) continue;
			uint pid;
			if (ctrl.GetProcessId(out pid) != 0 || !targets.Contains(pid)) continue;
			var vol = ctrl as ISimpleAudioVolume;
			if (vol != null) vol.SetMute(false, ref ctx);
		}
	}
}
`;

// Collect Pebni's root PIDs (Bun + launcher if present) so its process tree is excluded from muting.
function ownRootPids(): number[] {
	const pids = [process.pid];
	const launcher = Number(process.env.ELECTROBUN_LAUNCHER_PID);
	if (Number.isInteger(launcher) && launcher > 0) pids.push(launcher);
	return pids;
}

// Build a self-contained PowerShell script that mutes all other apps or unmutes saved PIDs.
function buildScript(action: "mute" | "unmute", pids: number[]): string {
	const list = pids.join(",");
	if (action === "mute") {
		return `
Add-Type -TypeDefinition @'
${CORE_AUDIO_CS}
'@
$roots = @(${list})
$all = Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId
$skip = New-Object 'System.Collections.Generic.HashSet[uint32]'
$queue = New-Object 'System.Collections.Generic.Queue[uint32]'
foreach ($r in $roots) { if ($skip.Add([uint32]$r)) { $queue.Enqueue([uint32]$r) } }
while ($queue.Count -gt 0) {
	$cur = $queue.Dequeue()
	foreach ($p in $all) {
		if ([uint32]$p.ParentProcessId -eq $cur -and $skip.Add([uint32]$p.ProcessId)) {
			$queue.Enqueue([uint32]$p.ProcessId)
		}
	}
}
$arr = New-Object uint32[] $skip.Count
$skip.CopyTo($arr)
$muted = [PebniAudio]::MuteOthers($arr)
if ($muted.Length -gt 0) { ($muted -join ",") }
`;
	}
	return `
Add-Type -TypeDefinition @'
${CORE_AUDIO_CS}
'@
[PebniAudio]::UnmutePids([uint32[]]@(${list}))
`;
}

// Encode a PowerShell script as UTF-16LE base64 for -EncodedCommand (avoids quoting issues).
function psArgs(script: string): string[] {
	const encoded = Buffer.from(script, "utf16le").toString("base64");
	return ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded];
}

// Parse comma-separated PIDs returned by the mute helper.
function parsePids(raw: string): number[] {
	return raw
		.trim()
		.split(",")
		.map((s) => Number(s.trim()))
		.filter((n) => Number.isInteger(n) && n > 0);
}

let desiredMuted = false;
let appliedMuted = false;
let busy = false;
let mutedPids: number[] = [];

// Run one Windows audio action asynchronously without blocking the timer tick loop.
async function runAsync(action: "mute" | "unmute", pids: number[]): Promise<string> {
	const proc = Bun.spawn(psArgs(buildScript(action, pids)), {
		stdout: "pipe",
		stderr: "ignore",
		windowsHide: true,
	});
	const out = await new Response(proc.stdout).text();
	await proc.exited;
	return out;
}

// Reconcile desiredMuted against appliedMuted one step at a time so rapid toggles never drift.
async function reconcile() {
	if (busy || process.platform !== "win32") return;
	busy = true;
	try {
		while (desiredMuted !== appliedMuted) {
			const target = desiredMuted;
			if (target) {
				const out = await runAsync("mute", ownRootPids());
				mutedPids = parsePids(out);
				appliedMuted = true;
			} else {
				const toRestore = mutedPids;
				mutedPids = [];
				if (toRestore.length > 0) await runAsync("unmute", toRestore);
				appliedMuted = false;
			}
		}
	} catch (error) {
		console.warn("Could not toggle background audio:", error);
		appliedMuted = desiredMuted;
	} finally {
		busy = false;
	}
}

// Ask the OS to mute or restore other apps' audio sessions. Safe no-op on non-Windows.
export function setBackgroundAudioMuted(muted: boolean) {
	desiredMuted = muted;
	void reconcile();
}

// Synchronously unmute any sessions Pebni muted before the process exits.
export function restoreBackgroundAudioSync() {
	desiredMuted = false;
	appliedMuted = false;
	if (process.platform !== "win32" || mutedPids.length === 0) return;
	const toRestore = mutedPids;
	mutedPids = [];
	try {
		Bun.spawnSync(psArgs(buildScript("unmute", toRestore)), {
			stdout: "ignore",
			stderr: "ignore",
			windowsHide: true,
		});
	} catch (error) {
		console.warn("Could not restore background audio on quit:", error);
	}
}
