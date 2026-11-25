// The quiet memory line at the bottom of the timer window ("Memory: 38 MB").
import type { Bridge } from "../../../ports/bridge";
import { formatMemory } from "../../../core/analytics/format";

// Show the timer process's memory whenever Bun sends a new number.
export function createUsageView(bridge: Bridge) {
	const line = document.getElementById("usage-line")!;

	// Draw the number; the line stays hidden until there is one.
	function render(mb: number) {
		line.textContent = formatMemory(mb);
		line.hidden = false;
	}

	bridge.onMemory(render);
	return render;
}
