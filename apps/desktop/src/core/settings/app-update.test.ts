import { expect, test } from "bun:test";
import { updateSummary } from "./app-update";

test("updateSummary renders clear status lines for each updater state", () => {
	expect(updateSummary({ status: "idle", currentVersion: "0.1.0" })).toContain("v0.1.0");
	expect(updateSummary({ status: "checking", currentVersion: "0.1.0" })).toContain("Checking");
	expect(updateSummary({ status: "up-to-date", currentVersion: "0.1.0" })).toBe("v0.1.0 · Up to date.");
	expect(updateSummary({ status: "downloading", currentVersion: "0.1.0", latestVersion: "0.2.0" })).toContain("v0.2.0");
	expect(updateSummary({ status: "ready", currentVersion: "0.1.0", latestVersion: "0.2.0" })).toContain("restart");
	expect(updateSummary({ status: "error", currentVersion: "0.1.0", message: "Offline" })).toBe("Offline");
});
