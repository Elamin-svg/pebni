// The "In the background" card: open at login, the global shortcuts and the theme.
import type { Bridge } from "../../../ports/bridge";
import type { PrefsView, Theme } from "../../../core/settings/prefs";
import { type AppUpdateState, updateSummary } from "../../../core/settings/app-update";
import { applyTheme } from "./theme";
import { createShortcutsView } from "./shortcuts-view";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Prefs change rarely and are not part of the timer snapshot,
// so this view loads them once and redraws after each change.
export function createSettingsView(bridge: Bridge) {
	const atLogin = $<HTMLInputElement>("start-at-login");
	const shortcutsOn = $<HTMLInputElement>("shortcuts-on");
	const themeInputs = document.querySelectorAll<HTMLInputElement>('input[name="theme"]');
	const updateStatus = $("update-status");
	const updateBtn = $<HTMLButtonElement>("update-btn");
	const renderShortcuts = createShortcutsView(bridge, render);

	let currentUpdate: AppUpdateState = { status: "idle", currentVersion: "0.1.0" };

	// Each switch asks for the change; the answer says what really applied.
	atLogin.onchange = () => bridge.setPrefs({ startAtLogin: atLogin.checked }).then(render);
	shortcutsOn.onchange = () => bridge.setPrefs({ shortcutsOn: shortcutsOn.checked }).then(render);
	for (const input of themeInputs) {
		input.onchange = () => bridge.setPrefs({ theme: input.value as Theme }).then(render);
	}

	// Draw the update row: "Check for updates" normally, "Restart to update" once downloaded.
	function renderUpdate(state: AppUpdateState) {
		currentUpdate = state;
		if (updateStatus) updateStatus.textContent = updateSummary(state);
		if (!updateBtn) return;
		const busy = state.status === "checking" || state.status === "downloading";
		updateBtn.disabled = busy;
		updateBtn.textContent =
			state.status === "ready" ? "Restart to update"
				: state.status === "checking" ? "Checking…"
				: state.status === "downloading" ? "Downloading…"
				: "Check for updates";
	}

	if (updateBtn) {
		updateBtn.onclick = () => {
			if (currentUpdate.status === "ready") {
				void bridge.applyUpdate();
			} else {
				renderUpdate({ ...currentUpdate, status: "checking" });
				bridge.checkForUpdate().then(renderUpdate);
			}
		};
	}

	// Draw the switches from the prefs.
	function render(prefs: PrefsView) {
		atLogin.checked = prefs.startAtLogin;
		shortcutsOn.checked = prefs.shortcutsOn;
		renderShortcuts(prefs);
		for (const input of themeInputs) input.checked = input.value === prefs.theme;
		applyTheme(prefs.theme);
	}

	bridge.getPrefs().then(render);
	bridge.onUpdate(renderUpdate);
}
