// Reading how much memory the Bun process uses, for the quiet line in the timer window.
import { shouldSendMemory, toMegabytes } from "../../../core/timer/updates";

const CHECK_MS = 5_000; // memory moves slowly; a reading every few seconds is plenty

// The Bun process's resident memory in whole megabytes.
export function memoryMb(): number {
	return toMegabytes(process.memoryUsage().rss);
}

// Check every few seconds and call onChange whenever the shown number of MB changes.
export function watchMemory(onChange: (mb: number) => void) {
	let last: number | undefined;
	const timer = setInterval(() => {
		const bytes = process.memoryUsage().rss;
		if (!shouldSendMemory(last, bytes)) return;
		last = toMegabytes(bytes);
		onChange(last);
	}, CHECK_MS);
	return { stop: () => clearInterval(timer) };
}
