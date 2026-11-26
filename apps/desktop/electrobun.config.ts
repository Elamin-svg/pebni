import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "Pebni",
		identifier: "app.pebni.desktop",
		version: "0.1.2",
	},
	release: {
		// Override with PEBNI_RELEASE_BASE_URL when building for a custom repo or mirror.
		baseUrl: process.env.PEBNI_RELEASE_BASE_URL || "https://github.com/Elamin-svg/pebni/releases/latest/download",
		generatePatch: true,
	},
	runtime: {
		// The app lives in the tray; closing the window only hides it.
		exitOnLastWindowClosed: false,
	},
	scripts: {
		// Windows: start without a terminal window (see the script).
		postBuild: "scripts/hide-console.ts",
	},
	build: {
		mainProcess: "bun",
		bun: {
			entrypoint: "src/adapters/bun/index.ts",
		},
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
			"src/adapters/bun/assets/icon.ico": "views/tray.ico",
		},
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
			icon: "src/adapters/bun/assets/icon.ico",
		},
	},
} satisfies ElectrobunConfig;
