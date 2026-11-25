// Quiet 7-day rhythm bar strip drawn in SVG (app-screens.md chart rules):
// one data hue on Today, muted neutral bars on prior 6 days, 3 faint horizontal gridlines,
// round integer Y-ticks above the maximum, honest zeros with no stubs, tabular figures.
import type { WeekBar } from "../../../core/analytics/history";
import { formatBreakMinutes, formatHoursMinutes, plural } from "../../../core/analytics/format";

const NS = "http://www.w3.org/2000/svg";

// Create an SVG element with attributes.
function el(tag: string, attrs: Record<string, string | number>, parent?: Element): SVGElement {
	const node = document.createElementNS(NS, tag);
	for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
	if (parent) parent.appendChild(node);
	return node;
}

// Even integer ceiling above the largest bar (at least 4 so an empty week stays calm).
function topTick(maxVal: number): number {
	if (maxVal < 4) return 4;
	const step = maxVal <= 8 ? 2 : maxVal <= 20 ? 4 : 10;
	return Math.ceil((maxVal + 1) / step) * step;
}

// Draw the 7-day strip into the container element. Only redraws when the serialized data changes.
export function createWeekStrip(container: HTMLElement) {
	let lastKey = "";

	return function render(week: WeekBar[]) {
		const key = JSON.stringify(week);
		if (key === lastKey) return;
		lastKey = key;

		const maxTaken = Math.max(0, ...week.map((d) => d.taken));
		const hi = topTick(maxTaken);
		const ticks = [0, hi / 2, hi];

		const W = 380;
		const H = 104;
		const padL = 24;
		const padR = 8;
		const padT = 10;
		const padB = 22;
		const plotW = W - padL - padR;
		const plotH = H - padT - padB;
		const yOf = (v: number) => padT + plotH - (v / hi) * plotH;

		const totalWeek = week.reduce((sum, d) => sum + d.taken, 0);
		const totalBreakMs = week.reduce((sum, d) => sum + d.breakMs, 0);
		const totalWorkMs = week.reduce((sum, d) => sum + d.workMs, 0);
		const svg = el("svg", {
			viewBox: `0 0 ${W} ${H}`,
			width: "100%",
			height: H,
			role: "img",
			"aria-label": `Last 7 days: ${plural(totalWeek, "break")}, ${formatBreakMinutes(totalBreakMs)} resting, ${formatHoursMinutes(totalWorkMs)} worked`,
			class: "week-svg",
		});

		// Three quiet horizontal gridlines with integer Y-ticks.
		for (const v of ticks) {
			const y = Math.round(yOf(v)) + 0.5;
			el("line", {
				x1: padL, x2: W - padR, y1: y, y2: y,
				class: v === 0 ? "week-baseline" : "week-grid",
				"shape-rendering": "crispEdges",
			}, svg);
			const t = el("text", { x: padL - 7, y: y + 3.5, "text-anchor": "end", class: "week-tick" }, svg);
			t.textContent = String(v);
		}

		// Seven equal columns: Today carries the one accent hue; earlier days stay muted neutral.
		const step = plotW / Math.max(week.length, 1);
		const barW = Math.min(26, Math.round(step * 0.48));
		week.forEach((d, i) => {
			const cx = padL + step * (i + 0.5);
			const g = el("g", {}, svg);
			const tip = `${d.label} (${d.day}): ${plural(d.taken, "break")}`
				+ (d.breakMs > 0 ? ` (${formatBreakMinutes(d.breakMs)})` : "")
				+ (d.workMs > 0 ? ` · ${formatHoursMinutes(d.workMs)} worked` : "");
			el("title", {}, g).textContent = tip;

			if (d.isToday) {
				// Quiet 1.5px marker on the baseline so Today is anchored in the one data hue even at 0.
				el("line", {
					x1: (cx - barW / 2).toFixed(1),
					x2: (cx + barW / 2).toFixed(1),
					y1: (Math.round(yOf(0)) + 0.5).toFixed(1),
					y2: (Math.round(yOf(0)) + 0.5).toFixed(1),
					class: "week-today-line",
				}, g);
			}
			if (d.taken > 0) {
				const barH = Math.max(2, plotH - (yOf(d.taken) - padT));
				el("rect", {
					x: (cx - barW / 2).toFixed(1),
					y: yOf(d.taken).toFixed(1),
					width: barW,
					height: barH.toFixed(1),
					rx: 2,
					class: d.isToday ? "week-bar-today" : "week-bar",
				}, g);
			}

			const lbl = el("text", {
				x: cx.toFixed(1),
				y: H - 5,
				"text-anchor": "middle",
				class: d.isToday ? "week-day-today" : "week-day",
			}, g);
			lbl.textContent = d.label;
		});

		container.replaceChildren(svg);
	};
}
