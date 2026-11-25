import { defineConfig } from "vite";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { electrobunViteAliases } from "./.hutch/devkit/api/config/electrobun-vite";

export default defineConfig({
	plugins: [tailwindcss()],
	resolve: {
		alias: electrobunViteAliases(resolve(__dirname, ".hutch/devkit")),
	},
	root: "src/adapters/web",
	base: "./", // relative paths so the built files work from any folder
	build: {
		outDir: "../../../dist",
		emptyOutDir: true,
		// Keep videos and audio as files instead of inlining them.
		assetsInlineLimit: 0,
	},
	server: {
		port: 5173,
		strictPort: true,
	},
});
