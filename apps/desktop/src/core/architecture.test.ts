// Architectural fitness tests: enforce Hexagonal Modular Monolith boundaries automatically.
// Dependencies must point inward (adapters -> ports -> core) and never cross between bun and web.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";

const SRC = resolve(import.meta.dir, "..");

// Collect every TypeScript file under a directory, excluding test files.
function sourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...sourceFiles(full));
		else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) out.push(full);
	}
	return out;
}

// Extract all ES module import/export specifiers from a TypeScript file.
function importsOf(file: string): string[] {
	const text = readFileSync(file, "utf-8");
	const specs: string[] = [];
	for (const m of text.matchAll(/\b(?:from|import)\s+["']([^"']+)["']/g)) {
		specs.push(m[1]!);
	}
	return specs;
}

// Resolve a relative specifier to a POSIX path relative to src/.
function resolveToSrc(file: string, spec: string): string {
	const target = normalize(join(dirname(file), spec));
	return relative(SRC, target).replace(/\\/g, "/");
}

test("core has zero dependencies on ports, adapters, Node, Bun, or Electrobun", () => {
	const violations: string[] = [];
	for (const file of sourceFiles(join(SRC, "core"))) {
		const rel = relative(SRC, file).replace(/\\/g, "/");
		for (const spec of importsOf(file)) {
			if (spec.startsWith("node:") || spec.startsWith("bun:") || spec.startsWith("electrobun")) {
				violations.push(`${rel} -> ${spec}`);
			} else if (spec.startsWith(".")) {
				const target = resolveToSrc(file, spec);
				if (!target.startsWith("core/")) violations.push(`${rel} -> ${target}`);
			}
		}
	}
	expect(violations).toEqual([]);
});

test("ports depend only on core, never on adapters or runtime packages", () => {
	const violations: string[] = [];
	for (const file of sourceFiles(join(SRC, "ports"))) {
		const rel = relative(SRC, file).replace(/\\/g, "/");
		for (const spec of importsOf(file)) {
			if (spec.startsWith("electrobun") || spec.startsWith("node:") || spec.startsWith("bun:")) {
				violations.push(`${rel} -> ${spec}`);
			} else if (spec.startsWith(".")) {
				const target = resolveToSrc(file, spec);
				if (!target.startsWith("core/") && !target.startsWith("ports/")) {
					violations.push(`${rel} -> ${target}`);
				}
			}
		}
	}
	expect(violations).toEqual([]);
});

test("bun and web adapters never import each other directly", () => {
	const violations: string[] = [];
	for (const file of sourceFiles(join(SRC, "adapters", "bun"))) {
		const rel = relative(SRC, file).replace(/\\/g, "/");
		for (const spec of importsOf(file)) {
			if (spec.startsWith(".") && resolveToSrc(file, spec).startsWith("adapters/web/")) {
				violations.push(`${rel} -> ${spec}`);
			}
		}
	}
	for (const file of sourceFiles(join(SRC, "adapters", "web"))) {
		const rel = relative(SRC, file).replace(/\\/g, "/");
		for (const spec of importsOf(file)) {
			if (spec.startsWith(".") && resolveToSrc(file, spec).startsWith("adapters/bun/")) {
				violations.push(`${rel} -> ${spec}`);
			}
		}
	}
	expect(violations).toEqual([]);
});

test("web views talk only through the Bridge port, never Electrobun or RPC directly", () => {
	const violations: string[] = [];
	for (const file of sourceFiles(join(SRC, "adapters", "web", "views"))) {
		const rel = relative(SRC, file).replace(/\\/g, "/");
		for (const spec of importsOf(file)) {
			if (spec.startsWith("electrobun")) violations.push(`${rel} -> ${spec}`);
			if (spec.startsWith(".")) {
				const target = resolveToSrc(file, spec);
				if (target.startsWith("ports/rpc") || target.startsWith("adapters/web/bridge")) {
					violations.push(`${rel} -> ${target}`);
				}
			}
		}
	}
	expect(violations).toEqual([]);
});

test("desktop app never imports from the web landing page", () => {
	const violations: string[] = [];
	for (const file of sourceFiles(SRC)) {
		const rel = relative(SRC, file).replace(/\\/g, "/");
		for (const spec of importsOf(file)) {
			if (spec.includes("apps/web") || spec.includes("@pebni/web")) {
				violations.push(`${rel} -> ${spec}`);
			}
		}
	}
	expect(violations).toEqual([]);
});
