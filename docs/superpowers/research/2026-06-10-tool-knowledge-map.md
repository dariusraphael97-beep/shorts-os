# Tool-Knowledge Map: Longform Pipeline (current state, 2026-06-10)

Where the current pipeline lives, what each stage does, the verbatim LLM prompts, and **where each research learning plugs in**. file:line refs are against the repo as of 2026-06-10. This is the map the implementation plan builds against.

## Pipeline call order (`src/lib/agents/longform/orchestrator.ts`)

`runLongformPipeline` (orchestrator.ts:56) runs in strict sequence:

1. `runLongformWriter` — angle + hook + outline + narration
2. `runStylePicker` (or `forcedStyle` if operator locked a preset) — visual style bible
3. `runBeatPlanner` — per-chapter beat list with image prompts + `onScreenText`
4. `pickLongformVoice` — voice pacing (then provider+voiceId are forced to ElevenLabs "George")
5. `LongformPlanSchema.parse(...)` — assemble + validate
6. `createLongformDraft` — persist to `your_videos`
7. `buildLongformLedgerRows` + `recordLedger` — write the decision ledger (flywheel seed)
8. `enqueueRender` (unless `planOnly: true`) — dispatch to the render worker

---

## Stage 1 — Researcher (`researcher.ts`)
Ground-truths the topic before any narration. Up to 6 parallel web-search queries → a `FactSheet { facts[], uncertain[] }`. **Operator `trustedFacts` are prepended verbatim and OVERRIDE web results.** Model: `claude-sonnet-4-5`.

Fact-extraction prompt explicitly down-weights forums/social and discards anything conflicting with operator ground truth (researcher.ts:40–58). This is the accuracy gate; it already feeds the writer's narration pass.

## Stage 2 — Writer (`writer.ts`) — THE HOOK LIVES HERE
Three passes: **Hook** (Opus `claude-opus-4-7`, writer.ts:85) → **Outline** (Sonnet) → **Narration** (Opus, one call/chapter). Research is injected into every narration call.

### (a) Hook prompt — VERBATIM (writer.ts:27–41)
```
PASS:HOOK
You are the Writer for a faceless longform YouTube documentary.
Topic: "${ctx.topic}"

Pick ONE sharp ANGLE, then write a cold-open HOOK (the first ~10-15 seconds of narration).
The hook must: open ON the story (a specific time/place anchor OR a bold curiosity claim), drip-reveal
in short clauses, and pose 1-2 rhetorical questions that frame the whole video's curiosity gap.
FORMAT (match a top-tier faceless documentary channel like Fern/Blackfiles):
- AUTHORITATIVE, MEASURED narration. Short, clipped sentences and fragments — one idea per line.
- Build suspense with deliberate, reveal-withholding turns ("but they're not...", fact-then-twist).
- Transition with turn-words ("So why...", "Here's the thing...", "So where do you go...") — never chapter cards.
- NO "hey guys", no channel intro, no on-screen-text assumptions. Write only what is spoken.
[If playbook.writer.exemplarHooks present]: Proven hooks for this channel (emulate their shape, not their words): ...
Return JSON: { "angle": string, "hook": string }.
```
> **Diagnosis tie-in:** the prompt allows a "specific time/place anchor OR a bold curiosity claim" — the B58 render took the slow-anchor path ("BMW builds commuter cars…") and buried the curiosity claim at 0:17. The prompt does NOT force restating the title-promise/payoff in the first sentence, does NOT mandate a "But"-reversal, and does NOT require teasing concrete open-loop payoffs. That's the fix surface.

### Outline (writer.ts:43–50) and Narration (writer.ts:53–65)
Same FORMAT block. Narration pass carries the **ACCURACY** clause ("Every number… MUST match the VERIFIED FACTS… do NOT invent"). No structural mandate for "but/therefore" beat logic, re-hooks, open-loop chaining, or a CTA chapter.

### Duration math (`duration.ts`)
`WORDS_PER_SECOND = 2.4` (duration.ts:6) · chapter count = `round(target/100)` clamped [3,12] · total words = `round(target × 2.4)` · per-chapter `max(40, total/chapters)`. Clamp currently 180–1200s.

## Stage 3 — Style Picker (`style-picker.ts`)
Picks one of three **auto-eligible illustrated** presets (`naturalist-illustration` default, `technical-illustration`, `stick-figure-animated`); the two photoreal presets are excluded from auto-pick (operator-force only). Model: `claude-haiku-4-5`. House look is always hand-illustrated — never photoreal.

## Stage 4 — Beat Planner (`beat-planner.ts`) — ON-SCREEN TEXT LIVES HERE
Deterministic beat-splitting (`beats.ts`) → one LLM call/chapter (Sonnet) for scene + `onScreenText` + sound + `visualKind`/`photoQuery` → deterministic `assembleImagePrompt` (image-prompt.ts).

### (b) onScreenText instruction — VERBATIM (beat-planner.ts:39–45)
```
For each beat also write ON-SCREEN TEXT ("onScreenText"): the ONE thing the viewer should absorb from that
moment — a punchy stat, a bold claim, a question, or a key phrase (≤ ~5 words), pulled from the narration so
it reinforces what is being said and drives retention. It must NEVER be an encyclopedic label — no species or
Latin names, no "Fig. N" captions, no figure numbers. ... ${frequency} ACCURACY: if onScreenText states any
number ... it MUST match the verified facts / narration — NEVER invent a figure for a caption ...
```
`${frequency}` = additive (technical-illustration: mostly "" + hook only on key beats) or exclusive (most beats have text). Beat cadence `targetBeatSeconds` is per-preset (3.5–4.5s).

## Stage 5 — Voice
`pickLongformVoice` runs, but orchestrator.ts:92–93 **overrides** provider→ElevenLabs and voiceId→"George" (`JBFqnCBsd6RMkjVDRZzb`). Only speed/stability survive from the LLM.

## Stage 6 — Render Worker (`scripts/render-worker/handlers/render-longform.ts`)
Per chapter: TTS → real per-word timestamps → image gen via Higgsfield (`nano_banana_2`/`gpt_image_2`); reference-driven presets fetch a reference photo via `searchImageUrl(photoQuery)` and pass it as `--image`; failed beats copy nearest prior good frame → Ken-Burns/static → concat → mux VO → SFX → concat chapters → (music bed off by default) → upload. Returns `render_artifact_url`, `duration_seconds_actual`, `chapter_markers`.

## (c) Style presets (`style-presets.ts`)
| Preset | Model | beatSec | kenBurns | refDriven | onScreenTextMode | Auto-pick |
|---|---|---|---|---|---|---|
| cinematic-realistic | soul_v2 | 4.5 | 0.06 | — | exclusive | ❌ force-only |
| editorial-graphic | soul_v2 | 3.5 | 0.03 | — | exclusive | ❌ force-only |
| stick-figure-animated | gpt_image_2 | 2.5 | 0 | — | exclusive | ✅ |
| naturalist-illustration | nano_banana_2 | 3.5 | 0 | — | exclusive | ✅ default |
| technical-illustration | nano_banana_2 | 4.0 | 0 | **true** | **additive** | ✅ |

`negativePrompt` is stored on the plan but **never sent** at render (neither model takes a negative-prompt param); suppressors are folded into `positivePrefix`.

## (d) Playbook (`playbook.ts`) — THE EMPTY L2 STORE
```ts
interface LongformPlaybook {
  writer: { exemplarHooks: string[]; winningAngleNotes: string[]; };
  stylePicker: { presetWinsByGenre: Partial<Record<string, PresetId>>; };
  beatPlanner: { promptPatternTags: string[]; bestBeatSeconds: number | null; };
  voice: { bestVoiceIdByGenre: Partial<Record<string, string>>; };
}
```
`EMPTY_LONGFORM_PLAYBOOK` is always used (orchestrator.ts:60). **Read-path is fully wired** (writer checks `exemplarHooks.length` at writer.ts:29; style-picker + beat-planner accept it). **Only the write-path is missing** — nothing distills analytics → a populated playbook.

## (e) Learning loop — exists vs stubbed
**EXISTS:** `ledger.ts` writes 4 decision rows/video (`writer`/`style_picker`/`beat_planner`/`voice_coach`) into the `decisions` table (orchestrator.ts:120). `video_analytics` table stores `views, avg_view_duration_seconds, ctr_pct, watch_time_seconds, retention_curve_jsonb, subscribers_gained, impressions`. `longform_decision_outcomes` VIEW joins decisions → your_videos → latest analytics; `getLongformOutcomes()` reads it.
**STUBBED/MISSING:** no L2 agent/cron/function reads outcomes → distills into the playbook; `EMPTY_LONGFORM_PLAYBOOK` is hardcoded with no backing table; `retention_curve_jsonb` has no ingest from YT Studio.

## (f) Titles & thumbnails — NOT GENERATED
- **Title:** `createLongformDraft` sets `title: args.topic` verbatim (repositories/longform.ts:21). No LLM title, no variants, no SEO/CTR pass.
- **Thumbnail:** none generated anywhere in the longform pipeline. (`render-longform.ts` produces no thumbnail; `your_videos` has no longform `thumbnail_url` write.) Thumbnail code exists only in the separate shorts/clip-ingest worker. **Both title and thumbnail are hand-made by the operator today.**

---

## Where each learning category plugs in
| Category | Current owner | file:line | What L2 / the plan changes |
|---|---|---|---|
| **Hook** | `hookPrompt()` (Opus) | writer.ts:27 | rewrite prompt (payoff-first + "But"-reversal + open-loop tease); inject `playbook.writer.exemplarHooks` |
| **Script structure** | outline + narration | writer.ts:43, 53 | add but/therefore beat logic, re-hooks, CTA chapter; `winningAngleNotes` |
| **Retention/pacing** | `splitNarrationIntoBeats` + per-preset `targetBeatSeconds` | beats.ts:84, style-presets.ts | `playbook.beatPlanner.bestBeatSeconds` from `retention_curve_jsonb` |
| **On-screen text** | `onScreenText` instruction | beat-planner.ts:39 | hook-claim mirroring; cadence tag in `promptPatternTags` |
| **Style/visual** | auto-pick or force | style-picker.ts:69 | `presetWinsByGenre` |
| **Titles** | `title = args.topic` | repositories/longform.ts:21 | **NEW stage** `titler.ts` (5 ranked candidates) |
| **Thumbnails** | none | — | **NEW stage** `thumbnail.ts` (illustrated hero + ≤3 words) |
| **Length** | `clampTargetDuration` etc. | duration.ts:14–27 | default 540s; floor 480; cap 720 while young |
| **L2 playbook engine** | `EMPTY_LONGFORM_PLAYBOOK` | playbook.ts:13 | **NEW:** cron/edge fn: query `longform_decision_outcomes`, score by CTR/retention, upsert per-channel `longform_playbooks`; orchestrator reads it |
