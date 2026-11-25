# Pebni Monorepo

A public open-source (MIT) monorepo housing two cleanly decoupled workspaces:

- **`apps/desktop/` (MIT Open Source):** Desktop break companion (Electrobun, Bun, Vite, TypeScript, Tailwind v4, daisyUI 5, `tailwindcss-motion`).
- **`apps/web/` (MIT Open Source):** Bare AstroJS landing page and downloads site.

Package manager and task runner for `apps/desktop`: `hutch` (run inside `apps/desktop`).

```bash
cd apps/desktop
hutch run start                        # build and launch the app
hutch run dev:hmr                      # launch with Vite hot reload
hutch test src/core                    # unit + architectural fitness tests
hutch pm exec -- tsc --noEmit -p .     # type check
hutch pm exec -- vite build            # build WebView bundle
node scripts/test-e2e.mjs              # real-browser Chrome/Edge E2E suite
```

## Architecture (`apps/desktop`): Hexagonal Modular Monolith

Every file in `apps/desktop/src/` belongs to one of three inward-pointing rings (see [ADR 001](apps/desktop/docs/adr/001-hexagonal-modular-architecture.md)):

```text
  adapters/web ──┐
                 ├──► ports/ ──► core/{timer,audio,atmosphere,analytics,settings}
  adapters/bun ──┘
```

Boundaries are enforced automatically on every test run by `apps/desktop/src/core/architecture.test.ts`:

1. **`src/core/` (Domain Modules):** Pure TypeScript only — zero DOM, Electrobun, `node:*`, or `bun:*` imports; pure `(state, now) => nextState` transitions.
   - `core/timer/` — `timer`, `engine`, `snapshot`, `rule`, `presets`, `breaks`, `flow`, `hold`, `idle-reset`, `first-input`, `notice`, `updates`
   - `core/audio/` — `break-audio`, `library`, `story-list`
   - `core/atmosphere/` — `day-part`, `scenes`, `quotes`, `break-copy`, `hold-copy`, `tray-label`
   - `core/analytics/` — `stats`, `history`, `format`
   - `core/settings/` — `prefs`, `shortcuts`, `focus-apps`, `app-names`
2. **`src/ports/` (Hexagonal Ports):** `rpc.ts` (Bun <-> WebView RPC contract) and `bridge.ts` (`Bridge` interface for views). Imports only from `core/`.
3. **`src/adapters/` (Hexagonal Adapters):**
   - `adapters/bun/` — Composition root (`index.ts`), `os/`, `ui/`, `storage/`, `assets/`. Never imports `adapters/web/`.
   - `adapters/web/` — WebView (`index.html`, `main.ts`), `bridge/`, `views/`, `styles/`, `art/`, `audio/`. Views talk only through `ports/bridge.ts`.

## Dependencies: always ask first

**Never add an npm package without asking the user first.** Say which package, why, and what the alternative without it would be.

## Code & Design Rules

- Simple, readable TypeScript (`strict: true`, no `any`). Short functions, one-line comment above every function and non-obvious block.
- Theme: daisyUI `pebble` (warm oat `#e8e0d2`, cream cards, pine ink, meadow green `#34503b`) and `pebble-night` (`#111512`, blanket sage `#9bb487`), typeface Bricolage Grotesque.
- Tab navigation uses Rombo (`tailwindcss-motion`) animations while respecting `prefers-reduced-motion: reduce`.
- Never couple `apps/desktop/` to `apps/web/`.

## Checks before calling something done

1. `cd apps/desktop && hutch pm exec -- tsc --noEmit -p .` is clean.
2. `cd apps/desktop && hutch test src/core` passes (including `architecture.test.ts`).
3. `cd apps/desktop && hutch pm exec -- vite build && node scripts/test-e2e.mjs` passes with 0 browser errors.
4. `cd apps/web && npm run build` builds cleanly when web files change.
