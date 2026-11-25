# Changelog

All notable changes to the Pebni open-source desktop app will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-25 (Beta)

### Added
- Hexagonal Modular Monolith architecture (`core/{timer,audio,atmosphere,analytics,settings}`, `ports/`, `adapters/{bun,web}`) with automated boundary fitness tests (`src/core/architecture.test.ts`).
- Cozy time-of-day work cards (`morning`, `day`, `evening`, `night`), 4 animated break loops, 12 transparent mascot state poses, and updated coffee mascot icon.
- `Disable break audio in background` preference with full edge-case handling (overlay close, minimize/tray, manual pause memory, live mid-break toggle).
- Smooth Rombo (`tailwindcss-motion`) tab navigation animations with `prefers-reduced-motion` support and improved vertical settings spacing.
- Open-source documentation (`LICENSE`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, ADR 001).
