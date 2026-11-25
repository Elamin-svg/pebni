// Hooks for checking the real app by script, off unless an environment variable asks for them.
// PEBNI_TEST_BREAK=5,60   start a break 5 and 60 seconds after launch
// PEBNI_TEST_SKIP=30,90   skip it again 30 and 90 seconds after launch
import type { Command } from "../../../core/timer/engine";

// Read a comma-separated list of seconds from the environment (empty when not set).
function seconds(name: string): number[] {
	const raw = process.env[name] ?? "";
	return raw.split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0);
}

// Run "breakNow" and "skip" at the times the environment asks for.
export function scheduleTestBreak(run: (command: Command) => void) {
	const starts = seconds("PEBNI_TEST_BREAK");
	const skips = seconds("PEBNI_TEST_SKIP");
	for (const s of starts) setTimeout(() => run("breakNow"), s * 1000);
	for (const s of skips) setTimeout(() => run("skip"), s * 1000);
	if (starts.length || skips.length) {
		console.log(`Test hooks: breaks at ${starts.join(",") || "-"}s, skips at ${skips.join(",") || "-"}s`);
	}
}
