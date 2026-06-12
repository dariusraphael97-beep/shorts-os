# Style-Aware On-Screen Captions + B58 v3 (longer, real-channel debut)

**Date:** 2026-06-08
**Branch:** `feat/niche-finder-dominatable`
**Status:** Design — approved, pending spec review

## Problem

The existing B58 video (`~/Downloads/B58-engine-800hp-v2.mp4`, technical-illustration, ~3.5 min) is good and close to post-ready — Darius will post it on his **existing car channel** (the bird/niche videos are R&D for separate new accounts). But two things must change first:

1. **Too short.** Darius wants ~8–9 min. The v2 script ends on a perfect cliffhanger ("the engine isn't the weak point anymore"), so there's a natural extension into *what breaks beyond 800hp*.
2. **Today's on-screen-text fix would break it.** The just-shipped retention-caption rule makes `assembleImagePrompt` render the beat's `onScreenText` as *"the only text in the image."* That's right for the naturalist style, but the `technical-illustration` preset's value includes **information beats** — a dyno curve (axes + "550"), an "INVOICE: forged internals…" — whose internal text IS the content. "Only text" would strip it. Re-rendering the B58 today would therefore degrade it.

Darius's taste (from v1's "too detailed/busy" complaint, fixed in v2): keep the **clean, sparse** look, but layer a **few key retention hooks** on the beats where they land.

## Decisions (from brainstorming)
- **Length:** ~8–9 min (`targetDurationSeconds ≈ 510`).
- **Captions:** clean by default; a punchy hook only on a few key beats; info-diagrams keep their own text.

## Scope
A small, contained pipeline change (style-aware captions) + a generation run (the B58 v3) + a minor style touch. No DB migration, no worker change (`assembleImagePrompt` output is the stored `imagePrompt`).

## Design

### A. `onScreenTextMode` on the StyleBible — `src/lib/longform/style-presets.ts`
Add `onScreenTextMode?: "exclusive" | "additive"` to the `StyleBible` interface (default `"exclusive"` when absent).
- Set `technical-illustration` → `onScreenTextMode: "additive"`. All other presets default to `"exclusive"` (naturalist keeps today's behavior).
- Minor: a light positive-prefix touch on `technical-illustration` to hold the fine line-art look (discourage the cel-shaded/cartoon outlier) — best-effort.

### B. `assembleImagePrompt` becomes mode-aware — `src/lib/longform/image-prompt.ts`
Read `styleBible.onScreenTextMode` (default `"exclusive"`). The text instruction:
- **`exclusive`** (today's behavior, unchanged):
  - hook present → `on-screen caption reading exactly "{X}", as clean bold hand-lettered type, the only text in the image`
  - empty/absent → `no on-screen text, labels, or captions`
- **`additive`**:
  - hook present → `a bold readable headline caption reading exactly "{X}", alongside any labels the illustration itself needs` (no "only text")
  - empty/absent → **omit the text instruction entirely** (the scene description's own labels/diagram text stand; do NOT say "no text")

### C. Caption frequency keys off the mode — `src/lib/agents/longform/beat-planner.ts`
The shared `onScreenText` instruction in `scenePrompt` branches on the style's `onScreenTextMode`:
- **`exclusive`** → today's wording: "Most beats should have text; use '' only when a clean wordless image is clearly stronger."
- **`additive`** → "Keep it clean: leave `onScreenText` '' on most beats; add a short hook ONLY on the few beats where a key stat or turning point really lands."
The "never an encyclopedic label — no Latin/species names, no 'Fig. N'" rule stays shared for both.

### D. Generate the B58 v3 (operating the pipeline — no code)
POST `/api/lab/longform/dispatch` with: `presetId: "technical-illustration"`, `targetDurationSeconds: 510`, `channelId` (default channel), and a `topic` enriched to extend past the cliffhanger — *"…and what becomes the limiting factor beyond 800hp: the ZF 8-speed, fueling/E85, the driveline, cooling, and the real reliability ceiling,"* plus deeper build stages. The writer fills the length; technical (additive) keeps the clean look + intact diagrams; the beat-planner lands a few hooks. Render via the worker. **Spends real credits — confirm with Darius before firing.**

## Data flow
beat-planner (mode-aware frequency) → per-beat `onScreenText` → `assembleImagePrompt({ onScreenText, styleBible })` reads `onScreenTextMode` → bakes the right instruction into the stored `imagePrompt` → worker renders it. Technical info-beats keep their diagram text; a few beats carry a headline hook; naturalist is unchanged.

## Error handling / back-compat
- Absent `onScreenTextMode` → `"exclusive"` (every existing preset/plan behaves as today; naturalist + its tests unaffected).
- `additive` + empty hook → no text instruction added (scene stands), so info-diagrams never lose their text.

## Testing
- **`assembleImagePrompt`** (TDD): `exclusive` hook → "only text"; `exclusive` empty → "no on-screen text"; `additive` hook → contains the exact caption + "alongside any labels" and does NOT contain "the only text in the image"; `additive` empty → contains neither a caption nor "no on-screen text" (no text instruction at all).
- **Presets:** `technical-illustration.onScreenTextMode === "additive"`; `naturalist-illustration` has no mode (defaults exclusive) and still renders "only text" for a hook.
- **Beat-planner:** `scenePrompt` for an `additive` style contains the "clean by default / only on key beats" guidance; for `exclusive` contains the "most beats" guidance; both still forbid Latin/figure labels.
- Full suite + tsc green.
- **Live proof:** dispatch + render the B58 v3 → watch: ~8–9 min, clean technical illustrations with the dyno/invoice diagrams intact, a few sharp hooks on key beats, the beyond-800hp content, the crankshaft style nit improved.

## Out of scope (deferred / other track)
- Thumbnail generation, YouTube title/description, the actual upload (the "post it" phase).
- The niche / new-account video track (the other chat, currently on hold).
- Per-niche Style Scout; estimator recalibration (separate chip).
