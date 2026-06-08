# Niche Video Quality: Illustrated-Style Default + Longform-Aware Niche-Picking

**Date:** 2026-06-08
**Branch:** `feat/niche-finder-dominatable`
**Status:** Design — approved, pending spec review

## Problem

The first end-to-end Generate-Spine video ("which chicken has the most unhinged [scream]", draft `2169ccba`) came out bad: generic **photoreal cinematic** visuals (the look Darius previously rejected) with off-topic AI-hallucinated frames, and a **short-form tier-list premise stretched into a 3-min longform** doc that meanders. See [memory: feedback_niche_video_style_and_format].

Root causes — both upstream of the (working) render spine:

1. **The style-picker structurally cannot choose the good styles.** `src/lib/agents/longform/style-picker.ts` offers the LLM only `cinematic-realistic | editorial-graphic | stick-figure-animated` (in both the prompt and the Zod enum), and its fallback is `cinematic-realistic`. The two proven illustrated styles that made the bird and B58 videos good — `naturalist-illustration` and `technical-illustration`, both on the high-quality `nano_banana_2` model — are **not in the menu**. So the niche flow (which never forces a `presetId`) always lands on a `soul_v2` photoreal/doodle preset.

2. **Niche-picking has no length signal.** `niche_clusters` stores `example_video_ids` but not the winning video's duration, so a viral *Short* gets auto-picked and forced into longform. The scanner (`scripts/seed-niches.mjs`) also doesn't bias its search toward long videos.

## Scope

**Pragmatic fix only** (the full vision-LLM "Style Scout" auto-detection is explicitly deferred — see [memory: project_niche_finder_status] BUILD PLAN). Two parts:

- **A. Illustrated-by-default, constrained style picker.**
- **B. Longform-aware niche-picking** (scanner bias + duration capture + target-from-winner + auto-pick guard).

No new database schema. No renderer changes (the dynamic-style foundation — `StyleBible.model`/`imageParams` — already exists).

---

## Part A — Style: illustrated by default, constrained picker

**Files:** `src/lib/agents/longform/style-picker.ts` (+ its test).

- Introduce a pure, exported policy in `style-picker.ts`:
  - `AUTO_ELIGIBLE_PRESETS = ["naturalist-illustration", "technical-illustration", "stick-figure-animated"]` — the only presets the auto picker may choose. `cinematic-realistic` and `editorial-graphic` (both `soul_v2`) are **excluded from auto** but remain in `STYLE_PRESETS` so the Lab can still force them.
  - `DEFAULT_AUTO_PRESET = "naturalist-illustration"` — the proven high-quality default and the fallback.
- **Narrow `StylePickerOutputSchema`'s `presetId` enum to `AUTO_ELIGIBLE_PRESETS`** — the LLM literally cannot return a photoreal preset; a malformed/unknown value fails validation and falls back to `DEFAULT_AUTO_PRESET`.
- **Rewrite the picker prompt** to offer only the three illustrated styles with selection guidance: `naturalist-illustration` for factual / nature / animal / educational (the common case), `technical-illustration` for engineering / product / how-things-work, `stick-figure-animated` for relatable / comedy / personal-story. Tell it the house look is hand-illustrated, never photoreal.
- **Fallback → `DEFAULT_AUTO_PRESET`** (was `cinematic-realistic`).

**Quality floor:** every auto-eligible style uses `nano_banana_2` (naturalist, technical) or `gpt_image_2` (stick-figure) — none use `soul_v2`.

**Testable units:** `AUTO_ELIGIBLE_PRESETS` excludes `cinematic-realistic`/`editorial-graphic` and `DEFAULT_AUTO_PRESET === "naturalist-illustration"`; the resolve/fallback path returns `naturalist-illustration` for an invalid pick. (The LLM call itself isn't unit-tested — only the policy + fallback.)

---

## Part B — Longform-aware niche-picking

**Files:** `scripts/seed-niches.mjs`; `src/lib/niches/longform-topic.ts`; `src/lib/niches/auto-pick.ts`; `src/app/api/niches/studio/plan/route.ts`; plus the cluster→pick mapping in `src/app/niches/page.tsx`. (+ tests for the pure helpers.)

### B1 — Scanner finds longform winners + captures duration (`seed-niches.mjs`)
- Add `videoDuration: 'medium'` to the `search` call (YouTube "medium" = 4–20 min) so seeded niches are longform-worthy by construction.
- Add `contentDetails` to the `videos.list` `part` (`snippet,statistics` → `snippet,statistics,contentDetails`); parse the ISO-8601 `contentDetails.duration` to seconds.
- Track the winning video's duration per channel; as a safety net, drop candidates whose best video is `< 240s`.
- Write `winnerDurationSeconds` into the existing `explainability_top_signals` JSON (alongside `viewsToSubsRatio`, `firstMoverScore`, `channelAgeDays`). **No schema change.**

### B2 — Target length matches the proven winner (`longform-topic.ts`)
- Add `targetFromWinnerDuration(winnerDurationSeconds?: number): number` — returns `clamp(winnerDurationSeconds, 420, 900)` (7–15 min), or `DEFAULT_LONGFORM_DURATION_SECONDS` (480 / 8 min) when absent.
- `clusterToLongformInput` accepts an optional `winnerDurationSeconds` and uses `targetFromWinnerDuration` for `targetDurationSeconds` (instead of the flat default).

### B3 — Auto-pick guard against short-form (`auto-pick.ts`)
- `PickableCluster` gains optional `winnerDurationSeconds`.
- `pickBestNiche` excludes any cluster whose `winnerDurationSeconds` is known and `< 240` (safety net beyond the scanner bias). Clusters with unknown duration are still eligible (back-compat with already-seeded rows).

### B4 — Thread the duration through the read paths
- `buildPlanArgs` (plan route) reads `winnerDurationSeconds` from the loaded cluster's `explainability_top_signals` and passes it to `clusterToLongformInput`. Verify `getClusterById` returns `explainability_top_signals` (extend its `select` if it doesn't).
- `src/app/niches/page.tsx`'s cluster→`PickableCluster` mapping passes `winnerDurationSeconds` from `explainability_top_signals` so the hero's auto-pick guard works.

---

## Data flow

```
seed-niches (videoDuration=medium, +contentDetails)
  → niche_clusters.explainability_top_signals.winnerDurationSeconds
    → plan route getClusterById
       → buildPlanArgs → clusterToLongformInput(winnerDurationSeconds) → target = clamp(winner, 7–15min)
       → orchestrator runs the constrained picker → DEFAULT/illustrated nano_banana_2 StyleBible
    → niches/page → pickBestNiche(winnerDurationSeconds guard) → hero only offers longform-worthy niches
```

## Error handling / back-compat
- Missing `winnerDurationSeconds` (already-seeded rows): target falls back to 480; auto-pick guard does not exclude (unknown ≠ short).
- An invalid/unknown style from the LLM: Zod rejects → fallback to `naturalist-illustration`.
- Re-running the seed is idempotent for the ISO week (clears + re-inserts that week's rows).

## Testing
- **Unit (TDD):** `AUTO_ELIGIBLE_PRESETS`/`DEFAULT_AUTO_PRESET` policy + fallback (Part A); `targetFromWinnerDuration` clamp/fallback and `clusterToLongformInput` with/without duration (B2); `pickBestNiche` short-form exclusion + unknown-duration eligibility (B3); `buildPlanArgs` threads the duration (B4).
- **Full suite + tsc** stay green.
- **Live proof:** re-run the seed (free) for a fresh longform-worthy niche set → open `/niches`, confirm the hero pick is a longform niche → generate → confirm the plan uses an illustrated `nano_banana_2` preset and a target near the winner's length → **render (costs credits — confirm with Darius before firing)** → watch the result; it should match the illustrated quality bar of the bird/B58 videos.

## Out of scope (deferred)
- Full vision-LLM **Style Scout** (per-niche style auto-detected from the winner's frames). This design uses fixed proven presets; the Scout is the durable upgrade.
- Real recurring niche ingestion (slice #2). The seed remains a one-off.
- A general high-quality illustrated preset for non-nature factual niches (history/finance/psychology) — `naturalist-illustration` is nature-flavored; revisit if those niches surface.
- Operator-facing duration/style controls in the cockpit.
