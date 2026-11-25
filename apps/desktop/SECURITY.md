# Security Policy

## Scope & Privacy Posture

Pebni is designed to be local-first and transparent:

- **No telemetry, analytics, or user accounts.** Settings and 7-day history are stored locally in your OS user-data directory (`settings.json`).
- **OS APIs used:** Idle duration (`GetLastInputInfo` on Windows), active foreground window title/process checks for Do Not Disturb / focus apps, global keyboard shortcuts, and optional launch-at-login registration. No keystrokes or screen contents are ever recorded or transmitted.
- **Network access:** Optional read-only fetches of public-domain LibriVox recordings from `archive.org` when audiobook break audio is used.

## Supported Versions

Security fixes are applied to the latest `1.x` release on the `main` branch.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report vulnerabilities privately via GitHub Security Advisories (Private Vulnerability Reporting) on the public repository with:

1. A clear description of the issue and affected files.
2. Minimal steps to reproduce.
3. Potential impact and any suggested remediation.

We aim to acknowledge reports within 72 hours and coordinate a fix before public disclosure.
