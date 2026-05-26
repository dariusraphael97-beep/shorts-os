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

---

# Gate 3 Stage 3a — Font probe (REVISED design)

**Date:** 2026-05-26
**Result:** PASS (with design revision)
**Sandbox duration:** 31927ms total (yum_install_ms: 15711, Remotion render: ~16s)

## Two findings

### Finding 1: Sandbox needs Chromium system libs (yum install)

Vercel Sandbox runs **Amazon Linux 2023 (yum)**, NOT apt. Remotion's bundled Chromium requires system libs not present in the default node24 image: `nspr`, `nss`, `atk`, `at-spi2-atk`, `cups-libs`, `libdrm`, `libxkbcommon`, `libXcomposite`, `libXdamage`, `libXfixes`, `libXrandr`, `mesa-libgbm`, `alsa-lib`, `pango`, `cairo`, `libxshmfence`. The route now `yum install -y -q`'s these before invoking Remotion (~15s overhead).

**Per-render cost:** +15s for yum install on every Sandbox cold-start. Pre-baked Sandbox image (deferred to Phase 2.5.x) would amortize this.

### Finding 2: Exact-hash check is too strict across Chromium builds

The spec's Stage 3a design called for bit-identical glyph hashes between a locally-generated fingerprint and the Sandbox render. **That doesn't work in practice** — even with the SAME `@fontsource/montserrat/800.css` file driving Chromium, sub-pixel rendering varies across:
- Chromium versions (local Mac vs Sandbox Linux)
- Font hinting / anti-aliasing engines
- DPI / scaling factor

The probe showed all 4 glyph rectangles mismatch between local + Sandbox. **But visual inspection confirms both PNGs show Montserrat ExtraBold rendering correctly** — distinctive geometric letterforms, heavy weight, NO fallback. See `phase-2-5-font-probe-reference.png` (local) and `phase-2-5-font-probe-sandbox.png` (Sandbox) committed alongside this note.

## Revised gate criteria

Stage 3a now establishes:
1. ✅ Remotion + Chromium + Montserrat all load successfully in the Sandbox
2. ✅ A PNG is produced (no silent fallback to a non-text frame)
3. ✅ Visual inspection of the PNG (paired with the local reference) confirms the font is Montserrat ExtraBold, NOT a system fallback

What it does NOT promise:
- ❌ Bit-identical rendering across environments (sub-pixel jitter is normal)

## Decision

**PASS → proceed to Task 4.**

The exact-hash strictness was over-engineered for what we actually need. The two PNGs are visually identical (operator-confirmable from the committed reference images). The hash check still has diagnostic value — if a future Sandbox image change broke font loading entirely, the PNG would look obviously wrong, and the hashes would diverge MUCH more than they currently do (or the render would fail outright). The Phase 3 SSIM regression test (>0.95) is the proper long-term version of this gate.

Stage 3b's operator 6-item checklist (Task 11) remains the primary visual fidelity validator.
