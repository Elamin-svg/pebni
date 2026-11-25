// Real-browser end-to-end tests for the built Pebni frontend (dist/).
// Starts a throwaway local HTTP server, launches headless Chrome/Edge via CDP,
// and verifies every interactive flow and edge case with zero external dependencies.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const DIST = path.resolve("dist");
const MIME = {
	".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".png": "image/png",
	".webm": "video/webm", ".mp3": "audio/mpeg", ".svg": "image/svg+xml",
};

// Locate an installed Chromium-based browser on Windows, macOS or Linux.
function findBrowser() {
	const candidates = [
		"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
		"C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
		"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
		"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/usr/bin/google-chrome",
		"/usr/bin/chromium",
	];
	const found = candidates.find((p) => fs.existsSync(p));
	if (!found) throw new Error("No Chrome or Edge binary found for E2E tests.");
	return found;
}

// Serve dist/ on an ephemeral localhost port.
function startServer() {
	return new Promise((resolve) => {
		const server = http.createServer((req, res) => {
			const clean = decodeURIComponent((req.url ?? "/").split("?")[0]);
			const file = path.join(DIST, clean === "/" ? "index.html" : clean);
			if (!file.startsWith(DIST) || !fs.existsSync(file)) {
				res.writeHead(404);
				return res.end("Not found");
			}
			res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
			fs.createReadStream(file).pipe(res);
		});
		server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
	});
}

// Launch headless browser and open a CDP WebSocket to the first page target.
async function launchCdp() {
	const port = 19222 + Math.floor(Math.random() * 1000);
	const userData = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP || "/tmp"), "pebni-e2e-"));
	const proc = spawn(findBrowser(), [
		"--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`,
		"--no-first-run", "--no-default-browser-check", "--disable-gpu", "about:blank",
	], { stdio: "ignore" });

	let wsUrl = "";
	for (let i = 0; i < 60; i++) {
		try {
			const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
			const page = targets.find((t) => t.type === "page");
			if (page?.webSocketDebuggerUrl) { wsUrl = page.webSocketDebuggerUrl; break; }
		} catch {}
		await new Promise((r) => setTimeout(r, 150));
	}
	if (!wsUrl) throw new Error("Timed out waiting for Chrome CDP.");

	const ws = new WebSocket(wsUrl);
	await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

	let seq = 0;
	const pending = new Map();
	const errors = [];
	ws.onmessage = (ev) => {
		const msg = JSON.parse(ev.data);
		if (msg.id && pending.has(msg.id)) {
			const { res, rej } = pending.get(msg.id);
			pending.delete(msg.id);
			msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
		}
		if (msg.method === "Runtime.exceptionThrown") {
			errors.push(msg.params.exceptionDetails?.text ?? "Runtime exception");
		}
	};

	const send = (method, params = {}) => new Promise((res, rej) => {
		const id = ++seq;
		pending.set(id, { res, rej });
		ws.send(JSON.stringify({ id, method, params }));
	});
	const evalJs = async (expression) => {
		const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
		if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
		return r.result?.value;
	};
	const close = () => {
		ws.close();
		proc.kill();
		try { fs.rmSync(userData, { recursive: true, force: true }); } catch {}
	};

	await send("Page.enable");
	await send("Runtime.enable");
	return { send, evalJs, errors, close };
}

function assert(cond, msg) {
	if (!cond) throw new Error(`FAIL: ${msg}`);
}

const { server, port } = await startServer();
const baseUrl = `http://127.0.0.1:${port}`;
const cdp = await launchCdp();
let passed = 0;

async function check(name, fn) {
	await fn();
	passed++;
	console.log(`(pass) ${name}`);
}

async function open(urlPath, width = 520, height = 800) {
	await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 500 });
	await cdp.send("Page.navigate", { url: "about:blank" });
	await new Promise((r) => setTimeout(r, 80));
	await cdp.send("Page.navigate", { url: `${baseUrl}${urlPath}` });
	await new Promise((r) => setTimeout(r, 450));
}

try {
	// 1. Corrupt localStorage must not crash boot
	await open("/");
	await cdp.evalJs(`localStorage.setItem("rule", "{bad json"); localStorage.setItem("prefs", "null");`);
	await open("/", 520, 800);
	await check("boots cleanly even with corrupt localStorage", async () => {
		const state = await cdp.evalJs(`({ clock: document.getElementById("clock").textContent, status: document.getElementById("status").textContent })`);
		assert(state.clock === "20:00" && state.status === "Ready", `Unexpected boot state: ${JSON.stringify(state)}`);
	});

	// 2. Compact 520x800 tabs (click + keyboard ArrowRight/Home/End + rhythm chip jump)
	await check("tabs switch panels cleanly by click, keyboard and rhythm chip on 520x800", async () => {
		const res = await cdp.evalJs(`(() => {
			const timer = document.getElementById("panel-timer");
			const rhythm = document.getElementById("rule");
			const sound = document.getElementById("panel-sound");
			const focus = document.getElementById("panel-focus");
			const app = document.getElementById("panel-app");
			const t0 = !timer.hidden && rhythm.hidden && sound.hidden && focus.hidden && app.hidden;
			document.getElementById("rhythm-chip").click();
			const t1 = timer.hidden && !rhythm.hidden && sound.hidden;
			const tabR = document.getElementById("tab-rhythm");
			tabR.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
			const t2 = !sound.hidden && rhythm.hidden;
			document.getElementById("tab-sound").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
			const t3 = !focus.hidden && sound.hidden;
			document.getElementById("tab-focus").dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
			const t4 = !app.hidden && focus.hidden;
			document.getElementById("tab-app").dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
			const t5 = !timer.hidden && app.hidden;
			return { t0, t1, t2, t3, t4, t5 };
		})()`);
		assert(Object.values(res).every(Boolean), `Tab states failed: ${JSON.stringify(res)}`);
	});

	// 3. Start -> Pause -> Resume -> Reset flow
	await check("timer Start, Pause, Resume and Reset update button, status pill and idle state", async () => {
		const res = await cdp.evalJs(`(() => {
			const start = document.getElementById("start");
			const reset = document.getElementById("reset");
			const status = document.getElementById("status");
			const pill = document.getElementById("status-pill");
			start.click();
			const s1 = { btn: start.textContent, status: status.textContent, state: pill.dataset.state };
			start.click();
			const s2 = { btn: start.textContent, status: status.textContent, state: pill.dataset.state };
			start.click();
			const s3 = { btn: start.textContent, status: status.textContent };
			reset.click();
			const s4 = { btn: start.textContent, status: status.textContent, idle: reset.classList.contains("is-idle") };
			return { s1, s2, s3, s4 };
		})()`);
		assert(res.s1.btn === "Pause" && res.s1.status === "Coding" && res.s1.state === "working", `Start failed: ${JSON.stringify(res.s1)}`);
		assert(res.s2.btn === "Resume" && res.s2.status === "Paused" && res.s2.state === "paused", `Pause failed: ${JSON.stringify(res.s2)}`);
		assert(res.s3.btn === "Pause" && res.s3.status === "Coding", `Resume failed: ${JSON.stringify(res.s3)}`);
		assert(res.s4.btn === "Start coding" && res.s4.status === "Ready" && res.s4.idle, `Reset failed: ${JSON.stringify(res.s4)}`);
	});

	// 4. Break now -> overlay + Skip -> returns to working with updated today's count
	await check("Break now opens fullscreen break overlay and Skip returns to working with updated stats", async () => {
		const res = await cdp.evalJs(`(() => {
			document.getElementById("break-now").click();
			const br = document.getElementById("break-view");
			const tv = document.getElementById("timer-view");
			const onBreak = !br.hidden && tv.hidden && !document.getElementById("skip").hidden;
			document.getElementById("skip").click();
			const countText = document.getElementById("stats-count").textContent;
			const minsText = document.getElementById("break-time-today").textContent;
			const after = br.hidden && !tv.hidden && countText === "0 breaks" && minsText === "0 min" && !countText.includes("of");
			document.getElementById("reset").click();
			return { onBreak, after, count: countText, mins: minsText };
		})()`);
		assert(res.onBreak && res.after, `Break/skip flow failed: ${JSON.stringify(res)}`);
	});

	// 5. Strict breaks hides Skip and displays strict note
	await check("Strict breaks hides Skip button and reveals strict-note on break screen", async () => {
		const res = await cdp.evalJs(`(() => {
			const strict = document.getElementById("strict");
			strict.checked = true;
			strict.dispatchEvent(new Event("input", { bubbles: true }));
			document.getElementById("break-now").click();
			const skipHidden = document.getElementById("skip").hidden;
			const noteShown = !document.getElementById("strict-note").hidden;
			// Turn strict off and skip out
			strict.checked = false;
			strict.dispatchEvent(new Event("input", { bubbles: true }));
			document.getElementById("skip").click();
			document.getElementById("reset").click();
			return { skipHidden, noteShown };
		})()`);
		assert(res.skipHidden && res.noteShown, `Strict break failed: ${JSON.stringify(res)}`);
	});

	// 6. Presets, numeric clamping on blur, unit switch, break focus & sound choices
	await check("Rhythm presets, numeric blur clamping, unit switch and focus toggle all sync cleanly", async () => {
		const res = await cdp.evalJs(`(() => {
			document.getElementById("tab-rhythm").click();
			document.querySelector('[data-preset="pomodoro"]').click();
			const pomo = {
				work: document.getElementById("work-min").value,
				rest: document.getElementById("rest-len").value,
				unit: document.getElementById("rest-unit").value,
				longOn: document.getElementById("long-on").checked,
				cycleShown: !document.getElementById("cycle").hidden,
			};
			// Empty input + blur snaps back to cleaned minimum (1), huge value clamps to 180
			const work = document.getElementById("work-min");
			work.value = "";
			work.dispatchEvent(new Event("input", { bubbles: true }));
			work.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
			const clampedMin = work.value;
			work.value = "999";
			work.dispatchEvent(new Event("input", { bubbles: true }));
			work.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
			const clampedMax = work.value;
			// Switch back to 20-20-20 and toggle focus to "away"
			document.querySelector('[data-preset="twenty"]').click();
			const away = document.querySelector('input[name="focus"][value="away"]');
			away.checked = true;
			away.dispatchEvent(new Event("input", { bubbles: true }));
			const feetHidden = document.getElementById("feet-line").hidden;
			const chip = document.getElementById("rhythm-chip").textContent;
			return { pomo, clampedMin, clampedMax, feetHidden, chip };
		})()`);
		assert(res.pomo.work === "25" && res.pomo.rest === "5" && res.pomo.unit === "min" && res.pomo.longOn && res.pomo.cycleShown, `Pomodoro failed: ${JSON.stringify(res.pomo)}`);
		assert(res.clampedMin === "1" && res.clampedMax === "180", `Blur clamp failed: ${res.clampedMin}/${res.clampedMax}`);
		assert(res.feetHidden && res.chip.includes("Step away"), `Away focus failed: ${JSON.stringify(res)}`);
	});

	// 6a. Long breaks expose a closeable window button + Escape so developers can watch YouTube while timer runs
	await check("long break screen can be closed/hidden while timer keeps running, then reopened", async () => {
		const res = await cdp.evalJs(`(() => {
			// Configure 60 min work so the very next break is a long break
			const work = document.getElementById("work-min");
			work.value = "60";
			work.dispatchEvent(new Event("input", { bubbles: true }));
			document.getElementById("tab-timer").click();
			document.getElementById("start").click();
			document.getElementById("break-now").click();

			const br = document.getElementById("break-view");
			const tv = document.getElementById("timer-view");
			const closeVisible = !document.getElementById("break-close").hidden && !document.getElementById("hide-break").hidden;

			// Close window via top-right close button
			document.getElementById("break-close").click();
			const hiddenCleanly = br.hidden && !tv.hidden && document.getElementById("start").textContent === "Show break screen";

			// Reopen break screen, then close via Escape
			document.getElementById("start").click();
			const reopened = !br.hidden && tv.hidden;
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
			const escClosed = br.hidden && !tv.hidden;

			// Clean up back to 20-20-20 ready state
			document.getElementById("reset").click();
			document.getElementById("tab-rhythm").click();
			document.querySelector('[data-preset="twenty"]').click();
			return { closeVisible, hiddenCleanly, reopened, escClosed };
		})()`);
		assert(res.closeVisible && res.hiddenCleanly && res.reopened && res.escClosed, `Closeable long break failed: ${JSON.stringify(res)}`);
	});

	// 6b. Quiet 7-day strip, custom break text, starter prompt chip, chime & idle reset controls
	await check("7-day SVG strip, custom break prompt text, chime and idle reset work end-to-end", async () => {
		const res = await cdp.evalJs(`(async () => {
			document.getElementById("tab-timer").click();
			const weekSvg = document.querySelector("#week-strip svg[role='img']");
			const dayLabels = document.querySelectorAll("#week-strip .week-day, #week-strip .week-day-today").length;

			document.getElementById("tab-rhythm").click();
			const customRadio = document.querySelector('input[name="focus"][value="custom"]');
			customRadio.checked = true;
			customRadio.dispatchEvent(new Event("input", { bubbles: true }));
			const customShown = !document.getElementById("custom-prompt").hidden;

			// Click starter chip then type own custom text
			document.querySelector(".prompt-chip")?.click();
			const presetLoaded = document.getElementById("custom-title").value.length > 0;
			const titleInput = document.getElementById("custom-title");
			const noteInput = document.getElementById("custom-note");
			titleInput.value = "Close the terminal";
			noteInput.value = "Stand up and stretch your wrists.";
			titleInput.dispatchEvent(new Event("input", { bubbles: true }));

			// Chime preview & toggle live in the dedicated Sound tab
			document.getElementById("tab-sound").click();
			document.getElementById("chime-test").click();
			const chimeToggle = document.getElementById("chime-on");
			const chimeDefault = chimeToggle.checked;

			// Trigger break and verify custom text appears on the break screen
			document.getElementById("tab-timer").click();
			document.getElementById("break-now").click();
			const breakTitle = document.getElementById("break-title").textContent;
			const breakNote = document.getElementById("break-note").textContent;
			document.getElementById("skip").click();
			document.getElementById("reset").click();
			return { hasSvg: !!weekSvg, dayLabels, customShown, presetLoaded, chimeDefault, breakTitle, breakNote };
		})()`);
		assert(res.hasSvg && res.dayLabels === 7, `7-day strip failed: ${JSON.stringify(res)}`);
		assert(res.customShown && res.presetLoaded && res.chimeDefault, `Custom prompt / chime failed: ${JSON.stringify(res)}`);
		assert(res.breakTitle === "Close the terminal" && res.breakNote === "Stand up and stretch your wrists.", `Custom break screen text failed: ${JSON.stringify(res)}`);
	});

	// 6c. Today & This week activity card shows worked time, break count & break minutes with zero "X of Y" ratio
	await check("Today and This week activity summary reconciles worked time, breaks and break minutes", async () => {
		const now = new Date();
		const keyOf = (offsetDays) => {
			const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offsetDays, 12);
			return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
		};
		const todayKey = keyOf(0);
		const prevKey = keyOf(2);
		await cdp.evalJs(`(() => {
			const MIN = 60_000;
			localStorage.setItem("stats", JSON.stringify({ day: ${JSON.stringify(todayKey)}, offered: 5, taken: 4, skipped: 1 }));
			localStorage.setItem("history", JSON.stringify([
				{ day: ${JSON.stringify(prevKey)}, offered: 6, taken: 6, skipped: 0, workMs: 180 * MIN, breakMs: 18 * MIN },
				{ day: ${JSON.stringify(todayKey)}, offered: 5, taken: 4, skipped: 1, workMs: 135 * MIN, breakMs: 12 * MIN },
			]));
		})()`);
		await open("/", 520, 800);
		const res = await cdp.evalJs(`(() => {
			const cardText = document.querySelector(".summary-card").textContent;
			return {
				todayWork: document.getElementById("screen-time").textContent,
				todayBreaks: document.getElementById("stats-count").textContent,
				todayBreakMin: document.getElementById("break-time-today").textContent,
				weekWork: document.getElementById("week-work-time").textContent,
				weekBreaks: document.getElementById("week-breaks-count").textContent,
				weekBreakMin: document.getElementById("week-break-time").textContent,
				hasRatio: /\\bof\\s+\\d+\\s+break/i.test(cardText),
			};
		})()`);
		assert(res.todayWork === "2h 15m" && res.todayBreaks === "4 breaks" && res.todayBreakMin === "12 min", `Today metrics wrong: ${JSON.stringify(res)}`);
		assert(res.weekWork === "5h 15m" && res.weekBreaks === "10 breaks" && res.weekBreakMin === "30 min", `Week metrics wrong: ${JSON.stringify(res)}`);
		assert(!res.hasRatio, `Found unwanted ratio copy in summary card: ${JSON.stringify(res)}`);
		await cdp.evalJs(`localStorage.removeItem("stats"); localStorage.removeItem("history");`);
		await open("/", 520, 800);
	});

	// 7. Focus tab: DND on/off + Timer banner + Focus apps add/duplicate/empty/remove
	await check("DND syncs between Focus tab and Timer banner, and focus apps validate add/duplicate/remove", async () => {
		const res = await cdp.evalJs(`(async () => {
			document.getElementById("tab-focus").click();
			document.querySelector('[data-dnd="dnd30"]').click();
			const dndOn = document.getElementById("dnd-state").textContent.includes("30 min") && !document.getElementById("timer-dnd-banner").hidden;
			document.getElementById("timer-dnd-off").click();
			const dndOff = document.getElementById("dnd-state").textContent === "Off" && document.getElementById("timer-dnd-banner").hidden;

			const form = document.getElementById("focus-add");
			const input = document.getElementById("focus-name");
			const help = document.getElementById("focus-help");
			input.value = "   ";
			form.dispatchEvent(new Event("submit", { cancelable: true }));
			const emptyMsg = help.textContent;

			input.value = "Slack";
			form.dispatchEvent(new Event("submit", { cancelable: true }));
			await new Promise((r) => setTimeout(r, 30));
			const addedMsg = help.textContent;

			input.value = "slack";
			form.dispatchEvent(new Event("submit", { cancelable: true }));
			const dupMsg = help.textContent;

			const rm = document.querySelector('[aria-label="Remove Slack"]');
			rm?.click();
			await new Promise((r) => setTimeout(r, 30));
			const removedMsg = help.textContent;
			return { dndOn, dndOff, emptyMsg, addedMsg, dupMsg, removedMsg };
		})()`);
		assert(res.dndOn && res.dndOff, `DND failed: ${JSON.stringify(res)}`);
		assert(res.emptyMsg.includes("Type a program"), `Empty focus app msg: ${res.emptyMsg}`);
		assert(res.addedMsg === "Added Slack." && res.dupMsg.includes("already") && res.removedMsg === "Removed Slack.", `Focus apps failed: ${JSON.stringify(res)}`);
	});

	// 8. App tab: theme switching & shortcut recording + Escape + Restore defaults
	await check("Theme switching updates data-theme and shortcut recorder saves, cancels and restores defaults", async () => {
		const res = await cdp.evalJs(`(async () => {
			document.getElementById("tab-app").click();
			const light = document.querySelector('input[name="theme"][value="light"]');
			light.checked = true;
			light.dispatchEvent(new Event("change", { bubbles: true }));
			await new Promise((r) => setTimeout(r, 30));
			const lightTheme = document.documentElement.dataset.theme;

			const dark = document.querySelector('input[name="theme"][value="dark"]');
			dark.checked = true;
			dark.dispatchEvent(new Event("change", { bubbles: true }));
			await new Promise((r) => setTimeout(r, 30));
			const darkTheme = document.documentElement.dataset.theme;

			const firstKey = document.querySelector("#shortcut-list .shortcut-keys");
			firstKey.click();
			const recording = firstKey.classList.contains("recording");
			firstKey.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
			const cancelled = !firstKey.classList.contains("recording");

			firstKey.click();
			firstKey.dispatchEvent(new KeyboardEvent("keydown", { key: "k", code: "KeyK", ctrlKey: true, altKey: true, bubbles: true }));
			await new Promise((r) => setTimeout(r, 30));
			const changedText = firstKey.textContent;
			const restoreShown = !document.getElementById("shortcut-restore").hidden;

			document.getElementById("shortcut-restore").click();
			await new Promise((r) => setTimeout(r, 30));
			const restoredHidden = document.getElementById("shortcut-restore").hidden;

			document.getElementById("update-btn").click();
			await new Promise((r) => setTimeout(r, 30));
			const updateText = document.getElementById("update-status").textContent;
			return { lightTheme, darkTheme, recording, cancelled, changedText, restoreShown, restoredHidden, updateText };
		})()`);
		assert(res.lightTheme === "pebble" && res.darkTheme === "pebble-night", `Theme failed: ${JSON.stringify(res)}`);
		assert(res.recording && res.cancelled && res.changedText.includes("K") && res.restoreShown && res.restoredHidden, `Shortcuts failed: ${JSON.stringify(res)}`);
		assert(res.updateText.includes("Up to date") || res.updateText.includes("v0.1.0"), `Update button failed: ${JSON.stringify(res)}`);
	});

	// 9. Wide desktop 1440x900 keeps both Timer and Settings visible side-by-side with zero overflow
	await open("/", 1440, 900);
	await check("wide desktop 1440x900 shows Timer + active Settings pane side-by-side with zero overflow", async () => {
		const res = await cdp.evalJs(`(() => {
			const t = document.getElementById("panel-timer").getBoundingClientRect();
			const r = document.getElementById("rule").getBoundingClientRect();
			return {
				timerVis: !document.getElementById("panel-timer").hidden,
				rhythmVis: !document.getElementById("rule").hidden,
				sideBySide: r.left > t.right,
				overflow: document.documentElement.scrollWidth - window.innerWidth,
			};
		})()`);
		assert(res.timerVis && res.rhythmVis && res.sideBySide && res.overflow <= 0, `Desktop layout failed: ${JSON.stringify(res)}`);
	});

	// 10. Secondary windows: #break, #notice, #screen and ?part=night preview
	await open("/#break", 1280, 800);
	await check("#break preview opens the break screen cleanly", async () => {
		const ok = await cdp.evalJs(`!document.getElementById("break-view").hidden && document.getElementById("timer-view").hidden`);
		assert(ok, "#break did not show break view");
	});

	await open("/#notice", 360, 168);
	await check("#notice window renders the corner notice cleanly", async () => {
		const ok = await cdp.evalJs(`!document.getElementById("notice-view").hidden && document.documentElement.classList.contains("notice-window")`);
		assert(ok, "#notice did not render notice view");
	});

	await open("/?part=night", 520, 800);
	await check("?part=night preview sets night part on scene", async () => {
		const part = await cdp.evalJs(`document.getElementById("scene").dataset.part`);
		assert(part === "night", `Expected night, got ${part}`);
	});

	// 11. All 4 day-part work illustrations load cleanly with distinct assets & proper sky contrast
	await check("all 4 day-part work cards load distinct images and correct light/dark clock ink", async () => {
		const seen = new Set();
		for (const part of ["morning", "day", "evening", "night"]) {
			await open(`/?part=${part}`, 1280, 820);
			const info = await cdp.evalJs(`(async () => {
				const img = document.getElementById("scene-photo");
				const scene = document.getElementById("scene");
				const quote = document.getElementById("pip-quote").textContent;
				for (let i = 0; i < 40 && !(img.complete && img.naturalWidth > 0); i++) {
					await new Promise((r) => setTimeout(r, 50));
				}
				const ink = getComputedStyle(scene).getPropertyValue("--scene-ink").trim();
				return {
					part: scene.dataset.part,
					hasArt: scene.classList.contains("has-art"),
					loaded: img.complete && img.naturalWidth > 0,
					complete: img.complete,
					w: img.naturalWidth,
					src: img.src,
					ink,
					quote,
				};
			})()`);
			assert(info.part === part && info.hasArt && info.loaded, `Work card failed for ${part}: ${JSON.stringify(info)}`);
			if (part === "morning") assert(info.quote.startsWith("Good morning"), `Expected Good morning greeting, got: ${info.quote}`);
			if (part === "evening") assert(info.quote.startsWith("Good evening"), `Expected Good evening greeting, got: ${info.quote}`);
			seen.add(info.src);
			const wantLight = part === "evening" || part === "night";
			assert(wantLight ? info.ink === "#f4f1ea" : info.ink === "#1f2622", `Wrong ink for ${part}: ${info.ink}`);
		}
		assert(seen.size === 4, `Expected 4 distinct work card images, got ${seen.size}`);
	});

	// 12. New logo & dynamic mascot poses across timer states and corner notice
	await open("/", 1280, 820);
	await check("new logo and state mascot load cleanly and switch poses for DND, pause, skip and notice", async () => {
		const res = await cdp.evalJs(`(async () => {
			const logo = document.getElementById("brand-mark");
			const mascot = document.getElementById("state-mascot");
			const logoOk = logo.complete && logo.naturalWidth > 0 && logo.src.includes("logo");
			const mascotOk = mascot.complete && mascot.naturalWidth > 0;

			// DND -> dnd pose
			document.getElementById("tab-focus").click();
			document.querySelector('[data-dnd="dnd30"]').click();
			const dndPose = mascot.dataset.pose;
			document.getElementById("timer-dnd-off").click();

			// Pause -> chill pose
			document.getElementById("start").click();
			document.getElementById("start").click();
			const pausedPose = mascot.dataset.pose;

			// Break + Skip -> shrug pose
			document.getElementById("break-now").click();
			document.getElementById("skip").click();
			const skippedPose = mascot.dataset.pose;

			// Reset back to ready
			document.getElementById("reset").click();
			return { logoOk, mascotOk, dndPose, pausedPose, skippedPose };
		})()`);
		assert(res.logoOk && res.mascotOk, `Logo/mascot failed to load: ${JSON.stringify(res)}`);
		assert(res.dndPose === "dnd" && res.pausedPose === "chill" && res.skippedPose === "shrug", `Unexpected poses: ${JSON.stringify(res)}`);

		await open("/#notice", 420, 140);
		const noticeImg = await cdp.evalJs(`(() => {
			const img = document.querySelector("#pip-notice img");
			return { pose: img?.dataset.pose, ok: !!img && img.complete && img.naturalWidth > 0 };
		})()`);
		assert(noticeImg.ok && noticeImg.pose === "wave", `Notice waving mascot failed: ${JSON.stringify(noticeImg)}`);
	});

	// 13. Disable break audio in background: hide, reopen, manual pause, live toggle & reload persistence
	await open("/", 1280, 820);
	await check("disable break audio in background handles hide, reopen, manual pause, live toggle and persistence", async () => {
		const res = await cdp.evalJs(`(async () => {
			// Hook HTMLAudioElement play/pause cleanly (leaving <video id="rain"> untouched)
			const origPlay = HTMLAudioElement.prototype.play;
			const origPause = HTMLAudioElement.prototype.pause;
			const origPausedDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "paused");
			let activeAudio = null;
			let simPaused = true;
			let playCalls = 0;
			let pauseCalls = 0;
			Object.defineProperty(HTMLAudioElement.prototype, "paused", {
				configurable: true,
				get() { return this === activeAudio ? simPaused : true; },
			});
			HTMLAudioElement.prototype.play = function () {
				activeAudio = this;
				simPaused = false;
				playCalls++;
				this.dispatchEvent(new Event("play"));
				return Promise.resolve();
			};
			HTMLAudioElement.prototype.pause = function () {
				if (this === activeAudio && !simPaused) pauseCalls++;
				simPaused = true;
				this.dispatchEvent(new Event("pause"));
			};

			// Configure 60 min work (long break), then switch to Sound tab for Nature sounds & Mute in background
			document.getElementById("tab-rhythm").click();
			const work = document.getElementById("work-min");
			work.value = "60";
			work.dispatchEvent(new Event("input", { bubbles: true }));
			document.getElementById("tab-sound").click();
			const nature = document.querySelector('input[name="audio"][value="nature"]');
			nature.checked = true;
			nature.dispatchEvent(new Event("change", { bubbles: true }));
			const muteBg = document.getElementById("mute-in-background");
			muteBg.checked = true;
			muteBg.dispatchEvent(new Event("change", { bubbles: true }));
			await new Promise((r) => setTimeout(r, 60));

			// Start break -> should play
			document.getElementById("start").click();
			document.getElementById("break-now").click();
			await new Promise((r) => setTimeout(r, 120));
			const playingOnStart = !simPaused && playCalls >= 1;

			// Hide break window -> should pause immediately
			document.getElementById("break-close").click();
			await new Promise((r) => setTimeout(r, 60));
			const pausedOnHide = simPaused && pauseCalls >= 1;

			// Reopen break window -> should resume automatically
			document.getElementById("start").click();
			await new Promise((r) => setTimeout(r, 60));
			const resumedOnShow = !simPaused;

			// Manual pause -> hide -> reopen must STAY paused
			document.getElementById("sound-toggle").click();
			const manuallyPaused = simPaused;
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
			await new Promise((r) => setTimeout(r, 40));
			document.getElementById("start").click();
			await new Promise((r) => setTimeout(r, 40));
			const stayedPausedAfterReopen = simPaused;

			// Manual resume -> hide -> toggle Mute in background OFF mid-break -> resumes live!
			document.getElementById("sound-toggle").click();
			const resumedByHand = !simPaused;
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
			await new Promise((r) => setTimeout(r, 40));
			const pausedAgainOnHide = simPaused;
			muteBg.checked = false;
			muteBg.dispatchEvent(new Event("change", { bubbles: true }));
			await new Promise((r) => setTimeout(r, 40));
			const resumedOnLiveToggleOff = !simPaused;
			muteBg.checked = true;
			muteBg.dispatchEvent(new Event("change", { bubbles: true }));
			await new Promise((r) => setTimeout(r, 40));
			const pausedOnLiveToggleOn = simPaused;

			// Reset cleans up audio
			document.getElementById("reset").click();
			await new Promise((r) => setTimeout(r, 40));
			const stoppedOnReset = simPaused;

			delete HTMLAudioElement.prototype.paused;
			HTMLAudioElement.prototype.play = origPlay;
			HTMLAudioElement.prototype.pause = origPause;
			void origPausedDesc;
			return {
				playingOnStart, pausedOnHide, resumedOnShow, manuallyPaused,
				stayedPausedAfterReopen, resumedByHand, pausedAgainOnHide,
				resumedOnLiveToggleOff, pausedOnLiveToggleOn, stoppedOnReset,
			};
		})()`);
		assert(Object.values(res).every(Boolean), `Background break audio flow failed: ${JSON.stringify(res)}`);

		// Reload and verify #mute-in-background persisted cleanly
		await open("/", 1280, 820);
		const persisted = await cdp.evalJs(`document.getElementById("mute-in-background").checked`);
		assert(persisted === true, `muteBreakInBackground did not persist across reload`);
	});

	// 14. Rombo tailwindcss-motion nav animations, reduced-motion respect, and y-axis spacing
	await open("/", 1280, 820);
	await check("Rombo nav animations trigger on tab switch, respect reduced motion, and y-axis spacing applies", async () => {
		const res = await cdp.evalJs(`(() => {
			// Verify y-axis spacing on Ambient break audio section inside the Sound tab
			document.getElementById("tab-sound").click();
			const choiceMb = parseFloat(getComputedStyle(document.querySelector(".sound-choice")).marginBottom);
			const legendMb = parseFloat(getComputedStyle(document.querySelector(".sound-choice legend")).marginBottom);
			const muteRowMb = parseFloat(getComputedStyle(document.getElementById("mute-in-background").closest(".setting")).marginBottom);

			// Click Focus tab -> Rombo motion classes & real CSS animation active
			document.getElementById("tab-focus").click();
			const focusPanel = document.getElementById("panel-focus");
			const focusTab = document.getElementById("tab-focus");
			const focusHasMotion = focusPanel.classList.contains("motion-opacity-in-0") &&
				focusPanel.classList.contains("motion-translate-y-in-[10px]") &&
				focusTab.classList.contains("motion-scale-in-[0.96]");
			const animName = getComputedStyle(focusPanel).animationName;

			// Click App tab -> panel animates
			document.getElementById("tab-app").click();
			const appHasMotion = document.getElementById("panel-app").classList.contains("motion-opacity-in-0");

			return { choiceMb, legendMb, muteRowMb, focusHasMotion, animName, appHasMotion };
		})()`);
		assert(res.choiceMb >= 20 && res.legendMb >= 10 && res.muteRowMb >= 14, `Y-axis spacing too small: ${JSON.stringify(res)}`);
		assert(res.focusHasMotion && res.appHasMotion && res.animName && res.animName !== "none", `Rombo nav animation failed: ${JSON.stringify(res)}`);

		// Under prefers-reduced-motion: reduce, tab switch must NOT add motion classes
		await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
		const reducedOk = await cdp.evalJs(`(() => {
			document.getElementById("tab-rhythm").click();
			return !document.getElementById("rule").classList.contains("motion-opacity-in-0");
		})()`);
		await cdp.send("Emulation.setEmulatedMedia", { features: [] });
		assert(reducedOk, "Reduced motion still applied Rombo motion classes");
	});

	// 15. Break screen loads valid video & poster for the active break scene
	await open("/#break", 1280, 800);
	await check("break screen sets valid bundled webm video and jpg poster with HTTP 200", async () => {
		const res = await cdp.evalJs(`(async () => {
			const v = document.getElementById("rain");
			const posterRes = await fetch(v.poster);
			const videoRes = await fetch(v.src);
			return {
				posterOk: posterRes.ok && v.poster.endsWith(".jpg"),
				videoOk: videoRes.ok && v.src.endsWith(".webm"),
				coffeeMascotOk: document.getElementById("coffee-mascot").src.includes("coffee"),
			};
		})()`);
		assert(res.posterOk && res.videoOk && res.coffeeMascotOk, `Break media check failed: ${JSON.stringify(res)}`);
	});

	// 16. Mute background audio during breaks: short + long activated when checked, hide unmutes, scope & persistence
	await open("/", 1280, 820);
	await check("mute background audio during breaks covers short & long when checked, unmutes on hide, and persists", async () => {
		const res = await cdp.evalJs(`(async () => {
			document.getElementById("tab-sound").click();
			const master = document.getElementById("mute-other-audio");
			const scope = document.getElementById("mute-other-scope");
			const shortBox = document.getElementById("mute-other-short");
			const longBox = document.getElementById("mute-other-long");

			// Off by default -> scope row hidden, background audio not muted
			const defaultOff = !master.checked && scope.hidden && document.documentElement.dataset.bgAudioMuted === "false";

			// Check master -> reveals scope row with BOTH short and long activated (checked)
			master.checked = true;
			master.dispatchEvent(new Event("change", { bubbles: true }));
			await new Promise((r) => setTimeout(r, 40));
			const bothActivated = master.checked && !scope.hidden && shortBox.checked && longBox.checked;

			// Short break -> mutes background audio; Skip -> immediately restores
			document.querySelector('[data-preset="twenty"]').click();
			document.getElementById("break-now").click();
			const mutedOnShort = document.documentElement.dataset.bgAudioMuted === "true";
			document.getElementById("skip").click();
			const unmutedAfterShort = document.documentElement.dataset.bgAudioMuted === "false";
			document.getElementById("reset").click();

			// Long break (60m work) -> mutes; closing long break overlay immediately restores; reopening re-mutes
			const work = document.getElementById("work-min");
			work.value = "60";
			work.dispatchEvent(new Event("input", { bubbles: true }));
			document.getElementById("start").click();
			document.getElementById("break-now").click();
			const mutedOnLong = document.documentElement.dataset.bgAudioMuted === "true";
			document.getElementById("break-close").click();
			const unmutedOnLongHide = document.documentElement.dataset.bgAudioMuted === "false";
			document.getElementById("start").click();
			const remutedOnLongReopen = document.documentElement.dataset.bgAudioMuted === "true";
			document.getElementById("reset").click();

			// Uncheck Short breaks -> short break does NOT mute, while Long break still mutes
			shortBox.checked = false;
			shortBox.dispatchEvent(new Event("change", { bubbles: true }));
			await new Promise((r) => setTimeout(r, 40));
			document.querySelector('[data-preset="twenty"]').click();
			document.getElementById("break-now").click();
			const shortUncheckedSkipsMute = document.documentElement.dataset.bgAudioMuted === "false";
			document.getElementById("skip").click();
			document.getElementById("reset").click();

			work.value = "60";
			work.dispatchEvent(new Event("input", { bubbles: true }));
			document.getElementById("start").click();
			document.getElementById("break-now").click();
			const longStillMuted = document.documentElement.dataset.bgAudioMuted === "true";

			// Live toggle Long off mid-break -> unmutes immediately
			longBox.checked = false;
			longBox.dispatchEvent(new Event("change", { bubbles: true }));
			await new Promise((r) => setTimeout(r, 40));
			const liveLongOffUnmuted = document.documentElement.dataset.bgAudioMuted === "false";
			document.getElementById("reset").click();

			// Turning master off then back on with both unchecked re-activates both short & long
			master.checked = false;
			master.dispatchEvent(new Event("change", { bubbles: true }));
			await new Promise((r) => setTimeout(r, 40));
			master.checked = true;
			master.dispatchEvent(new Event("change", { bubbles: true }));
			await new Promise((r) => setTimeout(r, 40));
			const reactivatedBoth = shortBox.checked && longBox.checked;

			document.querySelector('[data-preset="twenty"]').click();
			return {
				defaultOff, bothActivated, mutedOnShort, unmutedAfterShort,
				mutedOnLong, unmutedOnLongHide, remutedOnLongReopen,
				shortUncheckedSkipsMute, longStillMuted, liveLongOffUnmuted, reactivatedBoth,
			};
		})()`);
		assert(Object.values(res).every(Boolean), `Mute background audio E2E failed: ${JSON.stringify(res)}`);

		// Reload and verify prefs persisted cleanly
		await open("/", 1280, 820);
		const persisted = await cdp.evalJs(`({
			master: document.getElementById("mute-other-audio").checked,
			scopeVisible: !document.getElementById("mute-other-scope").hidden,
			short: document.getElementById("mute-other-short").checked,
			long: document.getElementById("mute-other-long").checked,
		})`);
		assert(persisted.master && persisted.scopeVisible && persisted.short && persisted.long, `Mute background audio prefs did not persist: ${JSON.stringify(persisted)}`);
	});

	assert(cdp.errors.length === 0, `Uncaught browser errors: ${cdp.errors.join("; ")}`);
	console.log(`\nE2E RESULT: ${passed} passed, 0 failed, 0 browser errors.`);
} finally {
	cdp.close();
	server.close();
}
