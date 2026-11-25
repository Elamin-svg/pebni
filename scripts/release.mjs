#!/usr/bin/env node
// One-command Pebni release script:
//   node scripts/release.mjs <version> [--repo owner/repo] [--publish] [--skip-e2e]
//
// 1. Bumps version consistently across package.json, apps/desktop/package.json, and electrobun.config.ts
// 2. Optionally updates the GitHub repo slug across desktop updater, website downloads, and update script
// 3. Runs typecheck, 139+ unit/architecture tests, Electrobun stable build, and E2E browser suite
// 4. Stages Pebni-Setup.exe alongside Electrobun's auto-updater artifacts in apps/desktop/artifacts/
// 5. With --publish: creates tag v<version>, pushes, and publishes the GitHub Release (updates users + website)
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const DESKTOP = path.join(ROOT, "apps", "desktop");
const ARTIFACTS = path.join(DESKTOP, "artifacts");

const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith("--"));
const repoIdx = args.indexOf("--repo");
const repoArg = repoIdx >= 0 ? args[repoIdx + 1] : undefined;
const publish = args.includes("--publish");
const skipE2e = args.includes("--skip-e2e");

if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
	console.error("Usage: node scripts/release.mjs <semver> [--repo owner/repo] [--publish] [--skip-e2e]");
	console.error("Example: node scripts/release.mjs 1.0.1 --repo my-org/pebni --publish");
	process.exit(1);
}

// Run a shell command with inherited stdio so build/test progress streams live.
function run(cmd, cwd = ROOT, extraEnv = {}) {
	console.log(`\n> ${cmd}`);
	execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, ...extraEnv } });
}

// Replace a regex match inside a UTF-8 file and write back when changed.
function patchFile(relPath, regex, replacement) {
	const full = path.join(ROOT, relPath);
	const before = fs.readFileSync(full, "utf-8");
	const after = before.replace(regex, replacement);
	if (before !== after) {
		fs.writeFileSync(full, after, "utf-8");
		console.log(`Updated ${relPath}`);
	}
}

// 1. Sync version across root + desktop manifests, Electrobun config, and updater fallbacks.
patchFile("package.json", /("version"\s*:\s*")[^"]+(")/, `$1${version}$2`);
patchFile("apps/desktop/package.json", /("version"\s*:\s*")[^"]+(")/, `$1${version}$2`);
patchFile("apps/desktop/electrobun.config.ts", /(version:\s*")[^"]+(")/, `$1${version}$2`);
patchFile("apps/desktop/src/adapters/bun/os/updater.ts", /(currentVersion:\s*")[^"]+(")/, `$1${version}$2`);
patchFile("apps/desktop/src/adapters/web/views/settings-view.ts", /(currentVersion:\s*")[^"]+(")/, `$1${version}$2`);
patchFile("apps/desktop/src/adapters/web/index.html", /(Installed v)[^ ·]+( · Automatic updates enabled\.)/, `$1${version}$2`);

// 2. Optionally update the GitHub repo slug everywhere in one shot.
if (repoArg) {
	if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoArg)) {
		console.error(`Invalid --repo value "${repoArg}". Expected "owner/repo".`);
		process.exit(1);
	}
	patchFile(
		"apps/desktop/electrobun.config.ts",
		/(https:\/\/github\.com\/)[^/]+\/[^/]+(\/releases\/latest\/download)/,
		`$1${repoArg}$2`,
	);
	patchFile("apps/web/src/pages/index.astro", /(const GITHUB_REPO = ")[^"]+(")/, `$1${repoArg}$2`);
	patchFile("apps/web/src/pages/downloads.astro", /(const GITHUB_REPO = ")[^"]+(")/, `$1${repoArg}$2`);
	patchFile("scripts/update-pebni.ps1", /(\[string\]\$Repo = ")[^"]+(")/, `$1${repoArg}$2`);
}

// 3. Verify and package the stable Electrobun desktop app + web site.
const releaseEnv = repoArg
	? { PEBNI_RELEASE_BASE_URL: `https://github.com/${repoArg}/releases/latest/download` }
	: {};

run("hutch pm exec -- tsc --noEmit -p .", DESKTOP);
run("hutch test src/core", DESKTOP);
run("hutch run build", DESKTOP, releaseEnv);
if (!skipE2e) run("node scripts/test-e2e.mjs", DESKTOP);
run("npm run build", path.join(ROOT, "apps", "web"));

// 4. List Electrobun's release artifacts (win-x64-Pebni-Setup.zip bundles Pebni-Setup.exe + .installer/).
// Never ship a standalone Pebni-Setup.exe without its .installer folder.
const staleStandaloneExe = path.join(ARTIFACTS, "Pebni-Setup.exe");
if (fs.existsSync(staleStandaloneExe)) fs.unlinkSync(staleStandaloneExe);

const files = fs.existsSync(ARTIFACTS)
	? fs.readdirSync(ARTIFACTS).map((f) => path.join(ARTIFACTS, f)).filter((p) => fs.statSync(p).isFile())
	: [];

console.log(`\nRelease v${version} artifacts ready (${files.length} files):`);
for (const f of files) {
	const mb = (fs.statSync(f).size / (1024 * 1024)).toFixed(2);
	console.log(`  - ${path.relative(ROOT, f)} (${mb} MB)`);
}

// 5. Optional automated tag + GitHub Release publish via GitHub CLI (`gh`).
if (publish) {
	const tag = `v${version}`;
	run(`git add package.json apps/desktop/package.json apps/desktop/electrobun.config.ts apps/web/src/pages/index.astro apps/web/src/pages/downloads.astro scripts/update-pebni.ps1`);
	run(`git commit -m "chore(release): prepare ${tag}"`);
	run(`git tag -a ${tag} -m "Release ${tag}"`);
	run(`git push origin HEAD ${tag}`);
	const quoted = files.map((f) => `"${f}"`).join(" ");
	run(`gh release create ${tag} ${quoted} --title "Pebni ${tag}" --generate-notes`);
	console.log(`\nPublished Pebni ${tag}! Installed apps and the /downloads page now serve ${tag}.`);
} else {
	console.log(`\nNext step to publish (triggers .github/workflows/release.yml automatically):`);
	console.log(`  git commit -am "chore(release): v${version}"`);
	console.log(`  git tag -a v${version} -m "Release v${version}"`);
	console.log(`  git push origin HEAD v${version}`);
}
