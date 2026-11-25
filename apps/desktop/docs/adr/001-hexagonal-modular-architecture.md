# ADR 001: Hexagonal Modular Monolith Architecture

- **Status:** Accepted
- **Date:** 2026-11-25
- **Scope:** `apps/desktop` (Open-Source Pebni Desktop App)

## Context

Pebni is a dual-process desktop app (Electrobun: Bun main process for OS integration + system WebView for presentation) that also runs in a plain browser for preview and headless E2E testing. Previously, all 32 domain modules lived in a flat `src/core/` folder and platform/view adapters had no automated architectural guardrails.

We also structured the workspace as an open-source (MIT) monorepo housing both `apps/desktop` (desktop app) and `apps/web` (bare AstroJS landing page) as cleanly decoupled workspaces.

## Architectures Evaluated

| Architecture | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **Classic 3-Tier Layered** | Simple to grasp for small apps. | Flat `core/` (30+ files) loses domain cohesion; no explicit port contracts. | Outgrown |
| **Clean Architecture (Onion)** | Strong dependency inversion. | Heavy boilerplate (DTOs, Mappers, Interactors) hurts readability for OSS contributors. | Too heavy |
| **Feature-Sliced Design (FSD)** | Great for huge multi-page SPAs. | Poor fit for a dual-process desktop app with 3 small views and OS FFI adapters. | Mismatch |
| **Pure Hexagonal (Ports & Adapters)** | Ideal for Bun + WebView + Browser preview dual-runtime; 100% pure domain tests. | Leaves the interior of the hexagon flat without sub-domain organization. | Almost ideal |
| **Hexagonal Modular Monolith** | Combines Hexagonal Ports & Adapters with bounded domain slices (`timer`, `audio`, `atmosphere`, `analytics`, `settings`); zero boilerplate; machine-verified boundaries. | Requires discipline when placing new files (mitigated by automated `architecture.test.ts`). | **Chosen** |

## Decision

Organize `apps/desktop/src/` into three strict rings:

1. **`src/core/` (Domain Modules):** `timer/`, `audio/`, `atmosphere/`, `analytics/`, `settings/` + `index.ts`. Strictly pure TypeScript — zero DOM, Node, Bun, or Electrobun imports.
2. **`src/ports/` (Hexagonal Ports):** `rpc.ts` (Bun <-> WebView RPC contract) and `bridge.ts` (View <-> Timer port interface). Depends only on `core/`.
3. **`src/adapters/` (Hexagonal Adapters):**
   - `adapters/bun/` (`index.ts`, `os/`, `ui/`, `storage/`, `assets/`)
   - `adapters/web/` (`index.html`, `main.ts`, `bridge/`, `views/`, `styles/`, `art/`, `audio/`)

## Consequences

- **Enforced in CI:** `src/core/architecture.test.ts` fails immediately on any inward-dependency violation, cross-adapter import, view accessing RPC/Electrobun directly, or cross-import into `apps/web`.
- **Clean workspace boundary:** `apps/desktop` stays 100% self-contained under MIT with zero coupling to `apps/web`.
