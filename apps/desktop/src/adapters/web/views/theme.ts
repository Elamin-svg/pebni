// Light or dark: sets the daisyUI theme on the page from the user's choice.
import type { Theme } from "../../../core/settings/prefs";

const NAMES = { light: "pebble", dark: "pebble-night" };
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
let current: Theme = "dark";

// Pick the daisyUI theme name for a choice ("system" asks the OS).
function themeName(theme: Theme): string {
	if (theme === "system") return systemDark.matches ? NAMES.dark : NAMES.light;
	return NAMES[theme];
}

// Apply a choice to the page.
export function applyTheme(theme: Theme) {
	current = theme;
	document.documentElement.dataset.theme = themeName(theme);
}

// When following the system, switch along with the OS setting.
systemDark.addEventListener("change", () => applyTheme(current));
