// Root monorepo orchestrator for Hutch.
// Both apps/desktop and apps/web are open-source (MIT) and pushed together in this repository.
export default {
	scripts: {
		"desktop:install": "cd apps/desktop && hutch install",
		"desktop:start": "cd apps/desktop && hutch run start",
		"desktop:dev": "cd apps/desktop && hutch run dev:hmr",
		"desktop:build": "cd apps/desktop && hutch run build",
		"desktop:test": "cd apps/desktop && hutch test src/core",
		"desktop:typecheck": "cd apps/desktop && hutch pm exec -- tsc --noEmit -p .",
		"desktop:e2e": "cd apps/desktop && hutch pm exec -- vite build && node scripts/test-e2e.mjs",
		"web:dev": "cd apps/web && npm run dev",
		"web:build": "cd apps/web && npm run build",
		check: "cd apps/desktop && hutch pm exec -- tsc --noEmit -p . && hutch test src/core && hutch pm exec -- vite build && node scripts/test-e2e.mjs && cd ../web && npm run build",
	},
};
