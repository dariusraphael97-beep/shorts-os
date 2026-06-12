# Longform Video Generator (Phase L1) — Design

**Status:** Design approved in brainstorming 2026-06-02. Ready for implementation plan.

**One-line goal:** Turn a typed topic/title (e.g. "The IRS is hiding this from you") into a finished **16:9, 8–10 min (up to 20 min) faceless video** — multi-pass narration, AI images animated with Ken-Burns, voiceover, music — and capture every agent decision so the system can learn from posted-video performance later.

This is the first sub-project of the **shorts → longform pivot**. It is the *generator* half. The *finder* (retargeting niche discovery to longform) and the *learning engine* (Phase L2, below) are separate, later sub-projects.

---

## 1. Decisions locked in brainstorming

| Decision | Choice |
|---|---|
| Start point | Generator first (prove one finished video before retargeting discovery) |
| Length | 8–10 min tuning target; **length-parameterized** up to 20 min |
| Input | Operator **types a topic/title**; niche→generator wiring deferred |
| Visual style | **Mixed per video** — Style-picker chooses a preset per topic |
| Starting style presets | Two: **cinematic-realistic** and **editorial-graphic** (painterly later) |
| Orientation | **16:9 landscape, 1920×1080** |
| Architecture | **Dedicated longform path that reuses proven primitives** (Higgsfield, Ken-Burns, Cartesia, ffmpeg) |
| Voiceover | One authoritative narrator (Cartesia, already wired), configurable |
| Captions | **Off by default** (cinematic); clean sentence-subtitles available as a toggle. NOT shorts word-by-word kinetic |
| Music | Subtle bed, quieter than shorts; mood chosen by Style-picker |
| Learning | **Instrument now** (decision ledger + outcome join + playbook-ready agents); learning **engine = Phase L2** |

---

## 1.5 Reference videos — format & quality benchmark (MUST MATCH)

The operator's hard requirement: the generated videos must **follow the format and match the quality** of the two YouTube videos reviewed during scoping:

- **Workflow / tooling reference:** https://www.youtube.com/watch?v=WODnqHPLR38 — the Higgsfield AI-image method and tool order for turning a script into image-driven video.
- **Output-format reference:** https://www.youtube.com/watch?v=--w3Rumz9sM — the longform faceless style the output should look and feel like.

**Implementation requirement:** before tuning the Writer / Style-picker / Beat-planner prompts, **re-watch both videos with the `/watch` skill** and extract the concrete format spec: cold-open hook structure, narration cadence and tone, how often the image changes (beat length), image style and shot framing, music/pacing, and how chapters/sections are paced. Encode those findings directly into the agent prompts and the two style presets. The agents and presets are considered done only when a generated video plausibly passes as the same format/quality as these references (the "1000+ views" benchmark from project memory), not merely "a video was produced."

---

## 2. Scope

**In scope (Phase L1):**
- A typed-topic entry point in the Lab that creates a longform generation job.
- A longform agent pipeline (`Writer → Style-picker → Beat-planner → Voice-coach`) that produces a complete, structured generation plan.
- A render path (`render-longform`) that turns the plan into a 1920×1080 mp4 with chapter markers, reusing and extending the existing render primitives.
- Two visual style presets, each producing cross-image-consistent results.
- Chunked Cartesia voiceover for long scripts.
- The **feedback-flywheel foundations**: a decision ledger per video, an outcome-join hook to YouTube analytics, and every agent built to read an (initially empty) per-agent playbook.

**Out of scope (later phases):**
- The learning **engine** that distills playbooks (Phase L2).
- Niche→generator auto-wiring (Finder phase).
- Channel personas / brand identity (intro/outro templates, watermark).
- Multi-channel support, a vertical (9:16) cut, thumbnails, A/B candidate ranking.
- Auto-posting to YouTube (operator posts manually; we only read analytics back).

---

## 3. Target artifact

A finished video file with:
- **1920×1080**, H.264 mp4, ~8–10 min (configurable `targetDurationSeconds`, valid 180–1200 s).
- A cold-open **hook** in the first ~10–15 s.
- **Chapters** (≈4–7 for 8–10 min), each a coherent narrated section. Chapter timestamps emitted for the YouTube description.
- **~70–110 image beats** (8–10 min) / up to ~240 (20 min), one Higgsfield image per ~5–7 s beat, all in one consistent style.
- **Ken-Burns** horizontal pan/zoom on each image (16:9 framing).
- **Voiceover** (single narrator) as the spine; **subtle music** bed; **no burned-in captions** by default.

Success benchmark (per project memory): good enough to plausibly clear "1000+ views" — i.e. watchable, coherent narration, on-topic and visually consistent imagery, correct pacing — not a tech demo.

---

## 4. Architecture overview

```
[Lab: type a topic] ──POST /api/lab/longform/dispatch──▶ creates longform job + draft
                                                          │  (SSE progress stream)
                          ┌───────────────────────────────┘
                          ▼
  AGENT PLAN (src/lib/agents/longform/, reads per-agent playbook — empty in L1)
   1. Writer (multi-pass)   topic → angle + cold-open hook + chapter outline → per-chapter narration
   2. Style-picker          genre/topic → ONE style preset (style bible + seed) + music mood
   3. Beat-planner          narration → ordered beats (~5–7s) + a strong 16:9 Higgsfield prompt per beat
   4. Voice-coach           → narrator voice + speed (existing agent, reused)
                          │  persists: draft + chapters/beats plan + DECISION LEDGER row
                          ▼
  RENDER (scripts/render-worker/handlers/render-longform.ts — long-running worker, chapter-batched)
   • Chunked Cartesia TTS (per chapter) → concat with offsets
   • Per beat: Higgsfield image (16:9) → Ken-Burns clip
   • Whisper word timings (for optional subtitles + beat/VO alignment)
   • Compose per chapter (beats + chapter VO + music) → concat chapters → 1920×1080 mp4
   • Blob upload; write back to draft
                          ▼
  [Lab: review the finished video + chapter markers]
                          │
   (operator posts to YouTube manually, marks posted)
                          ▼
  OUTCOME JOIN: analytics sync attaches views / retention / CTR onto the decision-ledger row
```

The four agent steps and the `render-longform` handler are new and longform-specific. Steps inside render reuse existing modules (`cartesia.ts`, `higgsfield.ts`, `ken-burns.ts`, ffmpeg compose), extended from vertical→landscape and single→chunked.

---

## 5. Components (each a focused, independently testable unit)

### 5.1 Entry / dispatch — `src/app/api/lab/longform/dispatch/route.ts`
- **Does:** accepts `{ topic: string, targetDurationSeconds?: number, channelId: string }`; creates a longform draft + `longform_render`-bound job; runs the agent plan; streams `StreamEvent`s (SSE) like the existing `/api/lab/dispatch`; persists the plan and the decision-ledger row.
- **Interface:** POST, `text/event-stream` response. Mirrors the existing dispatch route's streaming + persistence shape.
- **Depends on:** the longform agents, the drafts/decisions repositories, `getServiceClient`.
- **Note:** This is a new App Router route — follow the breaking-changes rule: read `node_modules/next/dist/docs/` before writing route/runtime code.

### 5.2 Writer (multi-pass) — `src/lib/agents/longform/writer.ts`
- **Does:** three LLM passes via the AI Gateway:
  1. **Angle + hook:** from the topic, pick a sharp angle and write a cold-open hook (first ~10–15 s of narration) engineered for retention.
  2. **Chapter outline:** produce N chapters (N derived from `targetDurationSeconds`; ≈1 chapter per ~90–120 s) with a title + one-line purpose each.
  3. **Chapter narration:** for each chapter, write the spoken narration (the VO text), retention-aware, conversational, no on-screen-text assumptions.
- **Output (validated schema):** `{ angle, hook, chapters: Array<{ title, purpose, narration }>, estimatedWords }`.
- **Reads:** its **playbook** input (top-performing hooks/angles for the genre) — empty in L1.
- **Depends on:** `getGatewayModel`, a writer schema (zod). Pure prompt-assembly helpers separated for testing.

### 5.3 Style-picker — `src/lib/agents/longform/style-picker.ts`
- **Does:** chooses ONE **style preset** for the whole video based on topic/genre, plus a music mood. Emits a **style bible**: the locked style string, negative prompts, lighting/color guidance, and a consistency key (fixed seed and/or a style/character reference) so all images look like one film.
- **Output:** `{ presetId: 'cinematic-realistic' | 'editorial-graphic', styleBible: StyleBible, musicMood }`.
- **Reads:** its playbook (which preset retained best per genre) — empty in L1.
- **Depends on:** the style-preset library (§6), `getGatewayModel`.

### 5.4 Beat-planner — `src/lib/agents/longform/beat-planner.ts` (+ `image-prompt.ts`)
- **Does:** splits each chapter's narration into ordered **beats** (~5–7 s of narration each, derived from a words-per-second estimate), then for each beat writes a **strong Higgsfield image prompt** — the user's explicit quality bar ("the prompts into Higgsfield need to be good"). Prompt = `concrete scene from the beat` + `style bible` + `16:9 framing` + `negatives`, consistent across the video.
- **Output:** `{ beats: Array<{ chapterIndex, narrationSlice, estDurationSeconds, imagePrompt }> }`.
- **Reads:** its playbook (beat length + prompt patterns that retained) — empty in L1.
- **Pure core:** the narration→beats splitter and the prompt assembler are pure functions (no I/O) → unit-tested directly; the assembler is **also copied** into the render worker (cannot import `src/*`).

### 5.5 Voice-coach — reuse `src/lib/agents/voice-coach.ts`
- Reused as-is to pick narrator `voice_id`, `speed`, `stability` from the Cartesia voice pool. Longform default leans to an authoritative narrator; configurable per channel.

### 5.6 Render — `scripts/render-worker/handlers/render-longform.ts`
- **Does (chapter-batched):**
  1. **Chunked TTS:** synthesize the narration per chapter via `cartesia.ts` (extended to chunk long text at sentence boundaries, concat WAVs, track per-chunk offsets). One contiguous VO per chapter.
  2. **Images:** per beat, `higgsfield.ts` generates a **16:9** image (style-bible prompt, fixed seed); best-effort with retry, degrading to a style-consistent gradient on failure.
  3. **Animate:** `ken-burns.ts` (extended for 1920×1080 horizontal pans) turns each still into a clip whose duration matches its beat.
  4. **Align:** Groq Whisper word timings on the chapter VO drive (a) optional subtitle timing and (b) snapping beat boundaries to narration.
  5. **Compose per chapter:** concat the chapter's beat clips, mux chapter VO + music bed (subtle), then **concat all chapters** → final 1920×1080 mp4. Chapter boundaries → chapter-marker timestamps.
  6. Upload to Blob; write `output_url`, duration, and chapter markers back to the draft.
- **Resilience:** chapter-batched so a failed chapter can be retried/resumed without redoing the whole video. Runs in the long-running render worker (not bounded by the 300 s function limit).
- **Reuse rule:** the worker is a separate Node project and **cannot import `src/*`**; pure helpers (image-prompt assembler, beat math) are copied in, mirroring the existing `render-f1` arrangement.

### 5.7 Data model
- **Draft:** extend the existing `your_videos` draft with `format = 'longform'`, `target_duration_seconds`, `orientation = '16:9'`, `style_preset_id`, and a structured `plan` (chapters + beats). Prefer a child table `longform_plans` (or `video_chapters` + `video_beats`) over a giant JSON blob if it keeps units focused — decided at plan time, following existing repository patterns.
- **Job:** new `job_type = 'longform_render'` handled by `render-longform.ts`.
- **Decision ledger (feedback foundation):** one row per generated video capturing each agent's decision — `writer` (angle, hook, chapter titles, est words), `style_picker` (preset, music mood, style bible id), `beat_planner` (beat count, avg beat seconds, prompt-pattern tags), `voice_coach` (voice, speed). Extends the existing `decisions` / `agent_messages` tables rather than inventing a parallel store. Keyed to the draft so analytics can join later.

---

## 6. Visual style presets — `src/lib/agents/longform/style-presets.ts`

Two presets in L1; the structure supports adding more without touching agents.

```
StyleBible = {
  presetId,                 // 'cinematic-realistic' | 'editorial-graphic'
  positivePrefix,           // locked aesthetic terms prepended to every beat prompt
  negativePrompt,           // e.g. "no text, no watermark, no extra fingers, ..."
  lighting, palette,        // guidance strings woven into prompts
  aspect: '16:9',
  consistency: { seed, styleRefHint }  // fixed seed (+ optional style reference) for cross-image coherence
}
```

- **cinematic-realistic:** dramatic, photoreal-ish, film-like (history-POV / immersive). e.g. "muddy WW1 trench at dawn, cinematic haze, 35mm, volumetric light."
- **editorial-graphic:** clean editorial illustration / bold graphic (finance / explainer). e.g. "bold editorial illustration of an opening vault, flat dramatic lighting."

Consistency strategy: lock a per-video seed and reuse the style prefix across all beats; if Higgsfield Soul style/character references are available under the paid plan, attach one. (Soul V2 is the assumed image model; final model choice confirmed at plan time against Higgsfield pricing.)

---

## 7. Voiceover, captions, music

- **Voiceover:** Cartesia (Sonic-2), single narrator, chunked synthesis for long scripts (split at sentence boundaries, concat WAVs, track offsets). Configurable voice/speed via Voice-coach.
- **Captions:** **off by default.** A toggle renders clean, sentence-level subtitles (bottom-center, readable on 16:9) driven by Whisper word timings — explicitly NOT the shorts word-by-word kinetic overlay.
- **Music:** one subtle bed at a lower mix level than shorts (longform convention), mood selected by the Style-picker. Reuse the existing music-track source.

---

## 8. The feedback flywheel — foundations in L1, engine in L2

- **A. Decision ledger (build in L1):** §5.7 — every agent decision recorded per video.
- **B. Outcome join (build in L1, fills over time):** when a video is marked posted, the existing analytics sync attaches its performance (views, **average view duration / retention**, CTR, watch time) onto the decision-ledger row. Implemented as a join keyed by draft/video id; populates as real analytics arrive.
- **Playbook-ready agents (build in L1):** every longform agent accepts a `playbook` parameter (per-agent, per-channel/genre exemplars + heuristics). In L1 this is **empty/stub**, so agents run on priors but the wiring exists.
- **C. Learning engine (Phase L2, NOT in L1):** a cron mines the joined ledger per channel/genre and distills each agent's playbook (top hooks, winning style per genre, best beat pacing, best voice). Future runs inject the playbook into each agent's prompt. No model training — retrieval-augmented, transparent, compounding. **Cannot function until videos are posted**, which is why it follows L1.

This guarantees: from video #1, nothing is lost, and switching on learning later needs **zero re-architecture**.

---

## 9. Error handling & resilience
- **Agent passes:** each LLM pass validates against a schema with one bounded retry, then a safe fallback (e.g. fewer chapters) — mirrors existing agents. A missing AI-Gateway credential surfaces as a logged failure, not a silent 500 (consistent with the recently-fixed cron pattern).
- **Image gen:** best-effort per beat with retry; on failure degrade to a style-consistent gradient still so the video never hard-fails on one image.
- **TTS:** per-chunk retry; a failed chunk fails only its chapter, which is retryable.
- **Render:** chapter-batched and idempotent per chapter so partial progress resumes.

---

## 10. Compute & cost
- **Image volume / cost:** 8–10 min ≈ 70–110 images (~12 Higgsfield credits) + ~$0.05 voiceover; 20 min ≈ up to 240 images (~29 credits). Image generation is the wall-clock bottleneck — parallelize within Higgsfield rate limits, chapter-batched.
- **Execution:** rendering runs in the long-running render worker (render_jobs queue), not a 300 s serverless function.

---

## 11. Dependencies & risks
- **Higgsfield (paid + auth):** the whole pipeline builds and unit-tests without it, but a **live** end-to-end render needs the operator's Higgsfield paid plan + the deferred CLI-auth wiring for `higgsfield.ts`. This is the only blocker between "built" and "a real video." Tracked, not surprising.
- **Render worker execution model:** confirm the worker's long-run environment (e.g. Vercel Sandbox) and the render_jobs claim/dispatch path at plan time; reuse the `render-f1` arrangement.
- **AI Gateway:** classifier/writers run through the gateway (now funded). Keep the "fail visibly" pattern.
- **Next.js breaking changes:** read `node_modules/next/dist/docs/` before any route/runtime code (project rule).

---

## 12. Testing strategy
Unit-test the pure cores (no network):
- Writer prompt assembly + chapter-count derivation from target duration.
- Beat-planner narration→beats splitter (word/sec math, boundary handling) and the image-prompt assembler per style preset.
- Chunked-TTS offset math (split → concat → cumulative offsets line up).
- Ken-Burns 16:9 argument builder (pan/zoom within a wide frame).
- Chapter concat list / chapter-marker timestamp computation.
- Decision-ledger serialization (every agent field captured; round-trips).

Integration: a dry-run dispatch with image gen + TTS mocked, asserting a complete, well-formed plan + ledger row. Run `tsc --noEmit`, `vitest`, and `npm run build` before completion (TS strict, no `any`). Live render verification is gated on the Higgsfield credential.

---

## 13. Success criteria
1. From a typed topic, the agent plan produces a coherent angle, hook, chapters, beats with good 16:9 image prompts, a chosen style preset, and a voice — all persisted with a complete decision-ledger row.
2. With the Higgsfield credential available, `render-longform` produces a watchable 1920×1080 8–10 min video: consistent on-topic imagery, Ken-Burns motion, narrator VO, subtle music, chapter markers — no hard failure on a single bad image/chunk.
3. Marking the video posted joins real YouTube performance back onto its ledger row.
4. Every agent reads a playbook input (empty), so Phase L2 can switch on learning with no re-architecture.

---

## 14. Next phases (not this spec)
- **Phase L2 — Learning engine:** the cron that distills per-agent playbooks from the joined ledger and feeds them back in.
- **Finder retarget:** longform format labels + duration-aware discovery so `/niches` surfaces longform opportunities, then niche→generator wiring.
- **Channel personas / brand identity, thumbnails, multi-channel, vertical cut.**
