# Pebni

A calm, open-source **20-20-20** break companion for developers. Every 20 minutes, Pebni gently invites you to look 20 feet away for 20 seconds — with zero guilt, zero streaks, and zero telemetry.

## Highlights

- **Smart break rhythms:** One-click 20-20-20 and Pomodoro presets, plus custom work/rest intervals and planned long breaks.
- **Respects your flow:** Natural idle reset when you step away, optional flow guard while typing steadily, and Do Not Disturb / focus-app holding during calls or fullscreen apps.
- **Closeable long breaks:** Close a long or coffee break window (`Esc`) to watch YouTube or grab coffee while the timer keeps running quietly in the tray.
- **Atmosphere & audio:** Time-of-day cozy cabin illustrations, gentle start/end chime, optional ambient break audio (meditation, public-domain short stories, nature sounds), and background audio muting when hidden.
- **Local-first & private:** Settings and 7-day break rhythm stay strictly on your machine.

## Quick Start

Requires [Hutch](https://github.com/blackboardsh/hutch) (manages Bun, Electrobun, and dependencies).

```bash
hutch install
hutch run start      # Build and launch the desktop app
hutch run dev:hmr    # Launch with Vite hot reload
hutch test src/core  # Run unit + architectural boundary tests
hutch pm exec -- tsc --noEmit -p .
node scripts/test-e2e.mjs # Run real-browser Chrome/Edge E2E suite (after vite build)
```

## Architecture

Pebni uses a **Hexagonal Modular Monolith** (Ports & Adapters with domain-grouped core slices). See [ADR 001](docs/adr/001-hexagonal-modular-architecture.md) for the full architecture decision and trade-off analysis.

```text
src/
├── core/        # Pure TypeScript domain (timer, audio, atmosphere, analytics, settings)
├── ports/       # Explicit boundary contracts (rpc.ts, bridge.ts)
└── adapters/
    ├── bun/     # Electrobun main process, OS hooks, windows, tray, local storage
    └── web/     # WebView presentation (stateless views, styles, art, audio)
```

Architectural boundaries are enforced automatically by `src/core/architecture.test.ts`.

## Contributing & License

Contributions are warmly welcome! Read [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md).

Licensed under the [MIT License](LICENSE).
