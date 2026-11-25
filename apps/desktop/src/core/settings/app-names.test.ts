// Focus apps by friendly name: labels, typed names, and suggestions from running programs.
import { expect, test } from "bun:test";
import { appFromInput, appLabel, appSuggestions } from "./app-names";

test("known programs get their real names; others lose .exe and get a capital", () => {
	expect(appLabel("zoom.exe")).toBe("Zoom");
	expect(appLabel("ms-teams.exe")).toBe("Microsoft Teams");
	expect(appLabel("figma.exe")).toBe("Figma");
});

test("a typed name becomes the process name", () => {
	expect(appFromInput("Zoom", [])).toBe("zoom.exe");
	expect(appFromInput(" figma ", ["Figma.exe"])).toBe("figma.exe");
	expect(appFromInput("Code.exe", [])).toBe("code.exe");
	expect(appFromInput("a/b", [])).toBe("");
});

test("suggestions skip system parts and chosen apps, known apps first", () => {
	const running = ["svchost.exe", "Figma.exe", "zoom.exe", "slack.exe", "figma.exe", "code.exe"];
	expect(appSuggestions(running, ["slack.exe"])).toEqual(["zoom.exe", "code.exe", "figma.exe"]);
});
