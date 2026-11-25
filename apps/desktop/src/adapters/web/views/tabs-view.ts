// Navigation tabs for the main window: Timer, Breaks, Sound, Focus, App.
// On compact windows (< 960px) all five switch the active panel; on wide desktop
// the Timer column stays pinned on the left and the four settings tabs live on the right.
// Uses Rombo tailwindcss-motion classes for calm panel and pill entrance animations.

export type TabId = "timer" | "rhythm" | "sound" | "focus" | "app";

const TABS: TabId[] = ["timer", "rhythm", "sound", "focus", "app"];
const WIDE_QUERY = "(min-width: 960px)";

// Rombo tailwindcss-motion utility classes applied when navigating between tabs.
const PANEL_MOTION = [
	"motion-opacity-in-0",
	"motion-translate-y-in-[10px]",
	"motion-duration-300",
	"motion-ease-spring-smooth",
];
const TAB_MOTION = [
	"motion-scale-in-[0.96]",
	"motion-duration-200",
	"motion-ease-spring-smooth",
];

// Replay a set of tailwindcss-motion utility classes cleanly unless reduced motion is set.
function playMotion(el: HTMLElement, classes: string[], reduced: boolean) {
	el.classList.remove(...classes);
	if (reduced) return;
	void el.offsetWidth; // restart CSS keyframe animation on repeated visits
	el.classList.add(...classes);
}

export function createTabsView() {
	const root = document.getElementById("timer-view")!;
	const buttons = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"][data-tab]')];
	const panels = [...root.querySelectorAll<HTMLElement>('[role="tabpanel"][data-panel]')];
	const wide = matchMedia(WIDE_QUERY);
	const reduced = matchMedia("(prefers-reduced-motion: reduce)");

	let active: TabId = "timer";
	let lastSettings: Exclude<TabId, "timer"> = "rhythm";

	// Switch to a tab, remembering the last settings area for wide mode.
	function select(id: TabId) {
		const prevShown = shownPanelId();
		active = id;
		if (id !== "timer") lastSettings = id;
		const nextShown = shownPanelId();
		draw(prevShown !== nextShown ? nextShown : undefined);
	}

	// The panel id currently selected for the active viewport layout.
	function shownPanelId(): TabId {
		return wide.matches && active === "timer" ? lastSettings : active;
	}

	// Sync ARIA state and visible panels, animating only the newly navigated tab/panel.
	function draw(animateId?: TabId) {
		const isWide = wide.matches;
		const shownSettings = isWide && active === "timer" ? lastSettings : active;
		for (const btn of buttons) {
			const id = btn.dataset.tab as TabId;
			const selected = isWide ? id === shownSettings : id === active;
			btn.setAttribute("aria-selected", String(selected));
			btn.tabIndex = selected ? 0 : -1;
			if (selected && animateId === id) playMotion(btn, TAB_MOTION, reduced.matches);
		}
		for (const panel of panels) {
			const id = panel.dataset.panel as TabId;
			const visible = isWide ? id === "timer" || id === shownSettings : id === active;
			panel.hidden = !visible;
			if (visible && animateId === id) playMotion(panel, PANEL_MOTION, reduced.matches);
		}
	}

	// Arrow keys move between visible tabs in the tablist.
	function visibleTabs(): HTMLButtonElement[] {
		return wide.matches ? buttons.filter((b) => b.dataset.tab !== "timer") : buttons;
	}

	for (const btn of buttons) {
		btn.onclick = () => select(btn.dataset.tab as TabId);
		btn.onkeydown = (e) => {
			const list = visibleTabs();
			const i = list.indexOf(btn);
			if (i < 0) return;
			let next = -1;
			if (e.key === "ArrowRight") next = (i + 1) % list.length;
			else if (e.key === "ArrowLeft") next = (i - 1 + list.length) % list.length;
			else if (e.key === "Home") next = 0;
			else if (e.key === "End") next = list.length - 1;
			if (next < 0) return;
			e.preventDefault();
			const target = list[next]!;
			select(target.dataset.tab as TabId);
			target.focus();
		};
	}

	// Buttons outside the tablist (such as the active rhythm chip) can jump straight to a tab.
	for (const jump of root.querySelectorAll<HTMLElement>("[data-open-tab]")) {
		jump.onclick = () => {
			const id = jump.dataset.openTab as TabId;
			if (TABS.includes(id)) select(id);
		};
	}

	wide.addEventListener("change", () => draw());
	draw();

	return { select };
}
