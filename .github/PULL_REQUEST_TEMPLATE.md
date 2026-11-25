## Summary
Brief summary of what changed and why.

## Architecture check
- [ ] Domain logic stays pure in `apps/desktop/src/core/` (no DOM, Bun, Node, or Electrobun imports)
- [ ] Views talk only through `apps/desktop/src/ports/bridge.ts`
- [ ] No coupling between `apps/desktop/` and `apps/web/`

## Verification
- [ ] `hutch pm exec -- tsc --noEmit -p .` passes
- [ ] `hutch test src/core` passes (including `architecture.test.ts`)
- [ ] `hutch pm exec -- vite build && node scripts/test-e2e.mjs` passes
