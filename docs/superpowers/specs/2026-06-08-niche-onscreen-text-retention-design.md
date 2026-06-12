# On-Screen Text = Per-Beat Retention Hook (not encyclopedic labels)

**Date:** 2026-06-08
**Branch:** `feat/niche-finder-dominatable`
**Status:** Design — approved, pending spec review

## Problem

The niche videos now render in the proven naturalist illustrated style (great), but the on-screen captions are **encyclopedic field-guide labels** — species Latin names ("*Turdus migratorius*"), figure captions ("Fig. 4. *Buteo jamaicensis* in turbulent air"). Darius: on-screen text is fine/wanted, but **the words should match what the viewer should absorb from that beat, to keep retention** (the "14 GRAMS" stat under the wren was the *good* kind). See [memory: feedback_onscreen_text_retention].

**Root cause:** the beat-planner already instructs the model to "add on-screen text so the viewer absorbs the point," but the naturalist preset's positive prefix ends with *"the look of a high-end illustrated field guide"* — which cues the image model (Nano Banana Pro / `nano_banana_2`, a strong text renderer) to auto-add Latin species names and "Fig. N" captions on top of (or instead of) the intended hook.

## Decisions (from brainstorming)

- **Frequency:** captions on **most beats**, but every one is a retention hook — a stat, punchy claim, question, or key phrase tied to the narration. Never an encyclopedic label. (`""` allowed for the rare beat where a clean illustration is better.)
- **Mechanism:** **Approach A — a first-class `onScreenText` beat field** (controllable + testable), over prompt-tuning alone.

## Scope

App-side only. **No render-worker change** and **no DB migration**: `assembleImagePrompt` is a pure function whose output (`imagePrompt`) is stored in the plan, and the worker renders that stored prompt directly (it only re-reads `sceneDescription` for the reference-driven path, which naturalist is not). `onScreenText` rides along in the plan JSON (`longform_plan`), no schema change.

## Design

### A. Beat data model — `src/lib/agents/longform/types.ts`
Add `onScreenText: z.string()` to `BeatSchema` (alongside `sceneDescription`, `imagePrompt`, etc.). `""` = intentionally no on-screen text. Stored in the plan per beat.

### B. Beat-planner — `src/lib/agents/longform/beat-planner.ts`
The scene LLM currently returns `{ items: [{ scene, sound }] }`. It now returns `{ items: [{ scene, onScreenText, sound }] }`:
- `SceneItemsSchema` + the `SceneItem` interface gain `onScreenText: string`.
- The prompt's on-screen-text instruction is rewritten: **`onScreenText` is the ONE thing the viewer should absorb from this beat** — a stat, a punchy claim, a question, or a key phrase (≤ ~5 words), drawn from the narration slice. NEVER a species Latin name, scientific name, or figure caption. Output `""` only when a clean illustration genuinely beats a caption (rare — aim for text on most beats). The free-text `scene` no longer carries the on-screen text (that moves to the dedicated field).
- `runBeatPlanner` passes `onScreenText` into `assembleImagePrompt` and stores it on the beat.
- The count-mismatch / fallback path (`slices.map(... ?? { scene, sound })`) gains `onScreenText: ""`.

### C. Image-prompt assembly — `src/lib/longform/image-prompt.ts`
`AssembleArgs` gains `onScreenText?: string`. In the composed prompt:
- When non-empty: append a firm instruction, e.g. *`on-screen caption text reading exactly "{onScreenText}", as clean bold hand-lettered type, the ONLY text in the image`*.
- When empty/absent: append *`no on-screen text, no labels, no captions`*.
This is baked into the stored `imagePrompt`, so the worker renders it unchanged. The function stays pure + deterministic.

### D. Naturalist preset — `src/lib/longform/style-presets.ts`
- Positive prefix: replace the trailing *"the look of a high-end illustrated field guide"* with a phrasing that keeps the inked-watercolor aesthetic but drops the label cue, e.g. *"the polished look of a fine hand-illustrated nature storybook plate"*.
- Negative prompt: append `latin names, species labels, scientific names, figure numbers, multiple text labels, encyclopedic captions`.
- Naturalist-specific. `technical-illustration` legitimately keeps its part labels — untouched.

## Data flow
beat-planner scene LLM → `{ scene, onScreenText, sound }` → `assembleImagePrompt({ sceneDescription, onScreenText, styleBible })` bakes the exact-caption instruction into `imagePrompt` → stored in `longform_plan` → worker renders `imagePrompt` as-is → image shows the hook caption, no Latin labels.

## Error handling / back-compat
- A beat with no `onScreenText` (old plans, or LLM omission) → treated as `""` → "no text" instruction; nothing breaks.
- LLM returns fewer items than slices → fallback pads `{ scene: slice, onScreenText: "", sound: "" }`.

## Testing
- **`assembleImagePrompt`** (pure, TDD): with `onScreenText: "14 grams"` the prompt contains the exact-caption instruction with that text and "only text in the image"; with `""`/absent it contains the no-text instruction; the negativePrompt passes through unchanged.
- **Scene schema**: `SceneItemsSchema` requires `onScreenText` (a missing field fails parse → triggers the fallback).
- **Naturalist preset**: its `negativePrompt` includes the label-suppression terms; the positive prefix no longer contains "field guide".
- **Beat-planner**: `runBeatPlanner` output beats carry `onScreenText`, threaded into `imagePrompt`.
- Full suite + tsc green.
- **Live proof:** re-generate a niche → render → watch frames: captions are retention hooks (stats / claims / questions), zero Latin names / "Fig. N".

## Out of scope (deferred)
- The full per-niche Style Scout (this stays on fixed presets).
- On-screen-text policy for non-naturalist presets (technical keeps part labels; stick-figure already does its own labels).
- Burned-in narration subtitles (captions are off by default; `onScreenText` is the illustrated caption, a separate thing).
- Estimator recalibration (already a separate task chip).
