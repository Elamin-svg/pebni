// Pure domain types and copy for desktop auto-updates (zero OS or Electrobun imports).
export type AppUpdateStatus =
	| "idle"
	| "checking"
	| "up-to-date"
	| "available"
	| "downloading"
	| "ready"
	| "error";

export type AppUpdateState = {
	status: AppUpdateStatus;
	currentVersion: string;
	latestVersion?: string;
	message?: string;
};

// Short, quiet status line for the App settings tab.
export function updateSummary(state: AppUpdateState): string {
	const cur = state.currentVersion ? `v${state.currentVersion}` : "";
	if (state.status === "checking") return "Checking for updates…";
	if (state.status === "downloading") {
		return state.latestVersion ? `Downloading v${state.latestVersion}…` : "Downloading update…";
	}
	if (state.status === "ready") {
		return state.latestVersion ? `v${state.latestVersion} is ready — restart to update.` : "Update ready — restart to apply.";
	}
	if (state.status === "available") {
		return state.latestVersion ? `v${state.latestVersion} available.` : "Update available.";
	}
	if (state.status === "error") return state.message || "Could not check for updates right now.";
	if (state.status === "up-to-date") return cur ? `${cur} · Up to date.` : "Up to date.";
	return cur ? `Installed ${cur} · Automatic updates enabled.` : "Automatic updates enabled.";
}
