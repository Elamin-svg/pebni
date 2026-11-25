# Contributing to Pebni

Thank you for helping make Pebni calmer and better for developers.

## Architecture Rules

Pebni follows a **Hexagonal Modular Monolith** (`src/core/`, `src/ports/`, `src/adapters/`):

1. **Dependencies point inward only:** `adapters/* -> ports/* -> core/*`.
2. **`src/core/` stays 100% pure TypeScript:** No DOM, no Electrobun, no `node:*` or `bun:*` imports, no reading wall-clock time directly (`(state, now) => nextState`).
3. **Never cross-import between `adapters/bun/` and `adapters/web/`:** Processes meet only through `src/ports/rpc.ts`, and views talk only through `src/ports/bridge.ts`.
4. **Add a test for every domain change:** All boundary rules are also verified automatically by `src/core/architecture.test.ts`.

## Development Workflow

```bash
hutch install
hutch pm exec -- tsc --noEmit -p .
hutch test src/core
hutch pm exec -- vite build
node scripts/test-e2e.mjs
```

## Code Style

- Keep functions short, readable, and plain — avoid unnecessary abstractions.
- Add a one-line comment above every function and non-obvious block.
- Strict TypeScript (`strict: true`), no `any` unless forced by an external OS/Electrobun type.
- Avoid adding new packages without opening an issue or discussing the trade-off first.

## Pull Request Checklist

- [ ] `hutch pm exec -- tsc --noEmit -p .` passes with zero errors
- [ ] `hutch test src/core` passes (including `architecture.test.ts`)
- [ ] `hutch pm exec -- vite build && node scripts/test-e2e.mjs` passes
- [ ] Changes respect Pebni's calm, zero-guilt UX and accessibility (keyboard + reduced motion)
