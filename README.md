# Pebni Monorepo

Open-source monorepo (MIT) containing both the desktop break companion and its landing page:

| Workspace | License | Stack | Purpose |
| --- | --- | --- | --- |
| [`apps/desktop`](apps/desktop) | **MIT** | Electrobun, Bun, Vite, TypeScript, Tailwind v4, daisyUI 5 | Calm desktop break companion for Windows & macOS |
| [`apps/web`](apps/web) | **MIT** | AstroJS (bare) | Public marketing site and downloads page |

## Workspace Separation

Both workspaces live and ship together in this repository under the [MIT License](LICENSE) while remaining cleanly decoupled: `apps/desktop` is 100% self-contained and verified by `apps/desktop/src/core/architecture.test.ts` to have zero imports from `apps/web`.

## Quick Commands

```bash
# Desktop app (apps/desktop)
cd apps/desktop
hutch install
hutch run start                         # Build and launch desktop app
hutch pm exec -- tsc --noEmit -p .      # Strict TypeScript check
hutch test src/core                     # Unit + architectural boundary tests
hutch pm exec -- vite build             # Production WebView bundle
node scripts/test-e2e.mjs               # Headless Chrome E2E suite

# Landing page (apps/web)
cd apps/web
npm install
npm run dev                             # Astro dev server
npm run build                           # Static production build
```
