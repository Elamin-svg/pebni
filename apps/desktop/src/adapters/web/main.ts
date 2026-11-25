// Entry point of the window: connect to the timer and draw every state it sends.
import "./styles/style.css";
import { connect, insideElectrobun } from "./bridge/bridge";
import { createTimerView } from "./views/timer-view";
import { createBreakView } from "./views/break-view";
import { createSettingsView } from "./views/settings-view";
import { createNoticeView } from "./views/notice-view";
import { applyTheme } from "./views/theme";
import { createFocusView } from "./views/focus-view";
import { createUsageView } from "./views/usage-view";
import { createDayView } from "./views/day-view";
import { createRuleView } from "./views/rule-view";
import { createSoundView } from "./views/sound-view";
import { createTabsView } from "./views/tabs-view";
import { createChimeView } from "./views/chime";

const bridge = connect();

// The same page serves three windows: the main window, the corner notice (#notice),
// and the break screens on other monitors (#screen).
if (location.hash === "#notice") showNotice();
else if (location.hash === "#screen") showBreakScreen();
else showMain();

// A break screen on another monitor: only the break view, with the same state as the main one.
// Bun opens it when a break starts and closes it when the break ends.
function showBreakScreen() {
	document.getElementById("timer-view")!.hidden = true;
	const render = createBreakView(bridge);
	bridge.getPrefs().then((p) => applyTheme(p.theme));
	bridge.onState(render);
	// A browser preview has no Bun process with a break under way, so start one here.
	if (!insideElectrobun) bridge.run("breakNow");
}

// The small "Break in 30s" notice only.
function showNotice() {
	document.getElementById("timer-view")!.hidden = true;
	document.documentElement.classList.add("notice-window");
	const render = createNoticeView(bridge);
	let warned = false;
	bridge.onState((snap) => {
		// Pick up a theme change from the main window each time the notice appears.
		if (snap.warning && !warned) bridge.getPrefs().then((p) => applyTheme(p.theme));
		warned = snap.warning;
		render(snap);
	});
	// A browser preview has no Bun process to start the timer, so start it here.
	if (!insideElectrobun) bridge.run("start");
}

// The timer window, which becomes the break screen during a break.
function showMain() {
	createTabsView();
	const renderTimer = createTimerView(bridge);
	const renderBreak = createBreakView(bridge);
	createSettingsView(bridge);
	createUsageView(bridge);
	const renderFocus = createFocusView(bridge);
	const renderDay = createDayView();
	const renderRule = createRuleView(bridge);
	const renderSound = createSoundView(bridge); // only here: one sound, not one per monitor
	const renderChime = createChimeView(bridge); // only here: one chime, not one per monitor

	bridge.onState((snap) => {
		renderTimer(snap);
		renderRule(snap);
		renderSound(snap);
		renderChime(snap);
		renderDay(snap);
		renderFocus(snap);
		renderBreak(snap);
	});

	// Open the window with #break to preview the break screen.
	if (location.hash === "#break") bridge.run("breakNow");
}
