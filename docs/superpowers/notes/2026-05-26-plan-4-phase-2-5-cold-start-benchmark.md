# Plan #4 Phase 2.5 — Cold-start gate measurement

**Date:** 2026-05-26
**Result:** **PASS** — total **8298ms** (gate 120000ms; 14× headroom)

## Per-stage timing

| Stage | ms | Notes |
|---|---|---|
| `Sandbox.create()` return | 801 | git clone + microVM boot (much faster than Phase 1's ~4500ms — Vercel cached the repo) |
| `npm ci --prefix scripts/render-worker` | 6510 | with full Phase 2.5 deps (Remotion + React + Chromium + Fontsource) |
| `npx remotion --version` | 844 | exit code 1 (see note); CLI launches and dumps help text |
| **Total** | **8298** | gate: 120000 |

## Reported Remotion CLI behavior

`npx remotion --version` returns exit 1 and prints the help text (the `--version` flag is not in Remotion's CLI surface). This proves the binary is on PATH and executes, which is the only thing the gate cares about. For Task 3+ the probe will use `npx remotion render` directly (a real, expected-to-succeed command).

If a future task wants a non-zero-on-error version check, `npx remotion versions` is the documented command and would exit 0.

## Decision

**PASS → proceed to Task 3.**

The `npm ci` cost at 6.5s is well under expectations (the spec's §6 risk #6 warned of 30-60s+ scaling with dep volume). Vercel Sandbox's npm layer caches the dep tarballs effectively. This headroom means the full render pipeline (Tasks 4-9) has plenty of budget — even if Remotion bundling adds 10-15s, the end-to-end render gate of 240s should be comfortable.

## What this unlocks

Tasks 3 (font glyph-hash probe), 4-9 (composition + worker plumbing + handler restructure), 10-11 (smoke + checklist), 12 (cleanup) can proceed without re-evaluating the architecture. Phase 2.5 stays on Vercel Sandbox; no need for Remotion Lambda or pre-baked images.
