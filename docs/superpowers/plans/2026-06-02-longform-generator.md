# Longform Video Generator (Phase L1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a typed topic/title into a finished 16:9, 8–10 min (up to 20 min) faceless video — multi-pass narration → per-video style → image beats with strong prompts → chunked voiceover → Ken-Burns landscape render with chapter markers — and capture every agent decision so posted-video performance can train the system later.

**Architecture:** A dedicated longform path that reuses the proven shorts primitives. A new SSE dispatch route runs four agents (`Writer → Style-picker → Beat-planner → Voice`) that emit a validated `LongformPlan`, persisted on a `your_videos` draft plus a decision-ledger row keyed to the draft. A new long-running render handler (`render-longform`) in the separate `scripts/render-worker` project turns the plan into a 1920×1080 mp4 (chunked Cartesia TTS per chapter, Higgsfield image per beat with a style-consistent gradient fallback, Ken-Burns landscape clips, subtle music bed, chapter markers). Every agent reads an (empty in L1) playbook; an outcome-join view links the ledger to YouTube analytics.

**Tech Stack:** Next.js (App Router, breaking-changes variant — read `node_modules/next/dist/docs/`), TypeScript strict (no `any`), Vercel AI SDK via `getClaudeModel` (AI Gateway), zod, Supabase (Postgres), vitest, ffmpeg (`ffmpeg-static`), Cartesia (Sonic-2), Groq Whisper, Higgsfield (gated), Vercel Blob, shadcn/ui + Framer Motion.

---

## Source of truth & references

- Spec: `docs/superpowers/specs/2026-06-02-longform-generator-design.md`.
- Reference-format extraction lives in project memory (`reference-longform-format-spec`). **The output look to MATCH is reference #2** (cinematic 3D-documentary: photoreal, teal/amber grade, blank-faced "mannequin" characters, slow push-ins, authoritative measured narration with suspense gaps, subtle music well under voice, captions off). **Reference #1 is the *method* only** (Claude Code → Higgsfield → GPT Image; consistency from a heavy reused style block + long negative list, no seeds) — its crude MS-Paint look is NOT a target.

## Key interpretation decisions (locked for this plan)

1. **Two presets** = `cinematic-realistic` (the reference-#2 look; primary) and `editorial-graphic` (the spec's clean bold editorial-illustration look for finance/explainer), both built with reference-#1's reused-style-block + negative-list technique for cross-image consistency.
2. **Beat cadence follows the references** (~3–5 s/beat, faster than the spec's 5–7 s estimate), parameterized per preset (`targetBeatSeconds`). An 8–10 min video → ~110–170 beats; cost noted in Task 22.
3. **Plan storage = a validated `longform_plan` JSONB column on `your_videos`** (matches the existing `caption_props`/`script_brief` JSONB pattern; the plan is produced and consumed atomically, so no child tables in L1).
4. **Decision ledger reuses `decisions`** + a new nullable `your_video_id` column so the outcome join keys directly to the draft → `video_analytics`. New agents `style_picker` and `beat_planner` are seeded into `agents` (FK target); `writer` and `voice_coach` already exist.
5. **`ken-burns.ts` and `higgsfield.ts` do NOT exist yet** (the spec assumed they did) — this plan *creates* them in the worker, landscape-native. Existing `ffmpeg-commands.ts`/`cartesia.ts` are hardcoded vertical/single-shot, so longform gets its own landscape + chunked helpers rather than mutating the shorts path.
6. **Higgsfield is gated.** The whole pipeline builds and unit-tests without it; the handler degrades to a style-consistent gradient still per beat so a complete 1920×1080 video is always produced. A live render with real images is a documented follow-up gated on Darius's Higgsfield plan + CLI-auth wiring.
7. **Captions OFF by default** (clean sentence-subtitle toggle is a later nicety; not word-by-word kinetic). Not built in L1 beyond the `captionsEnabled=false` plumbing.

## File structure

**New — pure helpers (src, unit-tested; mirrored into the worker):**
- `src/lib/longform/duration.ts` — target-duration → chapter count + word budget math.
- `src/lib/longform/beats.ts` — narration → ordered beat slices (sentence-boundary split, wps math).
- `src/lib/longform/style-presets.ts` — `StyleBible` type + the two presets.
- `src/lib/longform/image-prompt.ts` — assemble final Higgsfield prompt + negative from a scene description + style bible.
- `src/lib/longform/ken-burns.ts` — landscape (1920×1080) ffmpeg zoompan filter builder.
- `src/lib/longform/tts-chunks.ts` — split long narration at sentence boundaries + cumulative-offset math.
- `src/lib/longform/chapters.ts` — chapter-marker timestamps + ffmpeg concat-list builder.
- `src/lib/longform/ledger.ts` — serialize each agent's decision into `recordDecision` rows (round-trips).

**New — agents (src):**
- `src/lib/agents/longform/types.ts` — zod schemas + `LongformPlan` + `PresetId`.
- `src/lib/agents/longform/playbook.ts` — `LongformPlaybook` type + `EMPTY_LONGFORM_PLAYBOOK`.
- `src/lib/agents/longform/writer.ts` — `runLongformWriter` (3 passes).
- `src/lib/agents/longform/style-picker.ts` — `runStylePicker`.
- `src/lib/agents/longform/beat-planner.ts` — `runBeatPlanner`.
- `src/lib/agents/longform/orchestrator.ts` — `runLongformPipeline` (SSE generator + persistence + ledger + enqueue render).
- `src/lib/agents/voice-coach.ts` — **modify**: add `pickLongformVoice` reusing the voice pool + retry/fallback.
- `src/lib/agents/types.ts` — **modify**: extend `AgentId` with `style_picker | beat_planner`.

**New — dispatch + repositories (src):**
- `src/app/api/lab/longform/dispatch/route.ts` — SSE dispatch (mirror of the shorts route).
- `src/lib/supabase/repositories/longform.ts` — create/read longform drafts + save plan.
- `src/lib/supabase/repositories/decisions.ts` — **modify**: `recordDecision` accepts `yourVideoId`; add `recordLongformLedger`.
- `src/lib/render/job-payload.ts` — **modify**: add `RenderLongformPayload`.
- `src/lib/supabase/repositories/render-jobs.ts` — **modify**: add `'render_longform'` to `RenderJobType`.
- `src/app/api/render/complete/route.ts` — **modify**: add the `render_longform` success side-effect.

**New — render worker (`scripts/render-worker`, cannot import `src/*`):**
- `scripts/render-worker/lib/ken-burns.ts`, `tts-chunks.ts`, `chapters.ts` — mirrors of the src helpers.
- `scripts/render-worker/lib/ffmpeg-longform.ts` — landscape Ken-Burns clip, gradient still, longform compose.
- `scripts/render-worker/lib/cartesia-longform.ts` — chunked TTS (reuses the Cartesia HTTP call).
- `scripts/render-worker/lib/higgsfield.ts` — gated image-gen interface.
- `scripts/render-worker/handlers/render-longform.ts` — the chapter-batched handler.
- `scripts/render-worker/run.ts` — **modify**: add the `render_longform` switch case.

**New — UI (src, premium):**
- `src/app/lab/longform/page.tsx` — the longform Lab screen.
- `src/components/lab/longform/longform-composer.tsx` — topic-entry.
- `src/components/lab/longform/longform-run-pane.tsx` — SSE consumer + live progress.
- `src/components/lab/longform/longform-pipeline-strip.tsx` — the 4 agent chips.
- `src/components/lab/longform/longform-review.tsx` — 16:9 player + chapter markers + plan.
- `src/components/layout/app-sidebar.tsx` — **modify**: add the Longform nav entry.

**New — migration + types:**
- `supabase/migrations/<timestamp>_longform_schema.sql`.
- `src/lib/supabase/types.ts` — **regenerate** after applying the migration.

---

## Conventions every task must follow

- **TS strict, no `any`.** Where the existing code casts to `Record<string, unknown>` for jsonb persistence, that is allowed (mirror it); never introduce `any`.
- **Agent error pattern (mirror `voice-coach.ts`):** a private `buildPrompt(ctx)`, a `callOnce(prompt)` that does `generateObject({ model, schema, prompt })` then `Schema.parse(result.object)`, catch `NoObjectGeneratedError`, retry once, then a deterministic `buildFallback`.
- **Test pattern (mirror `src/tests/lib/agents/voice-coach.test.ts`):** `vi.mock("@/lib/ai/gateway")` and `vi.mock("ai")` (keep `NoObjectGeneratedError` real via `importActual`), set return values with `vi.mocked(generateObject).mockResolvedValue(...)`. Tests live in `src/tests/lib/<mirrored path>.test.ts` and never hit the network.
- **Worker mirrors:** pure helpers used by the worker are written in `src/lib/longform/`, unit-tested there, then copied verbatim into `scripts/render-worker/lib/` with a header comment `// Mirror of src/lib/longform/<file> — worker cannot import src/*.` (the `pexels.ts` precedent). Logic is verified on the src side; the worker copy is verified by `tsc` in the worker project.
- **Per task:** run `npx tsc --noEmit` and the task's tests before committing. Commit after each task with a `feat:`/`test:` message.
- **AI Gateway / local runs:** unit + integration tests mock the model (no base-URL issue). Any *manual* local dispatch run that hits the gateway must unset `ANTHROPIC_BASE_URL` (`env -u ANTHROPIC_BASE_URL npm run dev`), per project rule.
- **Verification gate per the project rules:** `npx tsc --noEmit` + `npm test` + `npm run build` must pass before any task is "done"; the worker's own `npx tsc --noEmit` must pass for worker tasks.

---

## Phase 0 — Data model & types

### Task 1: Migration — longform schema, ledger key, job-type enums, agent seeds, outcome view

**Files:**
- Create: `supabase/migrations/20260602000001_longform_schema.sql`
- Modify (regenerate): `src/lib/supabase/types.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260602000001_longform_schema.sql`:

```sql
-- Longform Video Generator (Phase L1) schema.
-- Reuses your_videos + decisions; adds longform columns, the ledger join key,
-- new job-type enum values, the two new agents, and the outcome-join view.

-- 1. your_videos: longform draft fields + the structured plan (validated in app code).
alter table public.your_videos
  add column if not exists format text not null default 'short'
    check (format in ('short', 'longform')),
  add column if not exists target_duration_seconds int,
  add column if not exists orientation text not null default '9:16'
    check (orientation in ('9:16', '16:9')),
  add column if not exists style_preset_id text,
  add column if not exists longform_plan jsonb,
  add column if not exists chapter_markers jsonb;

-- 2. decisions: key a ledger row directly to the draft so analytics can join later.
alter table public.decisions
  add column if not exists your_video_id uuid references public.your_videos(id) on delete set null;
create index if not exists decisions_your_video_idx on public.decisions (your_video_id);

-- 3. jobs.kind: allow the longform agent-plan job.
alter table public.jobs drop constraint if exists jobs_kind_check;
alter table public.jobs add constraint jobs_kind_check
  check (kind in ('scrape', 'score_topics', 'produce_video', 'analyze_performance', 'produce_longform_video'));

-- 4. render_jobs.job_type: allow the longform render job.
alter table public.render_jobs drop constraint if exists render_jobs_job_type_check;
alter table public.render_jobs add constraint render_jobs_job_type_check
  check (job_type in ('clip_ingest', 'render_f1', 'render_f2', 'upload', 'render_longform'));

-- 5. Seed the two new agents (FK target for decisions/agent_messages). writer + voice_coach already exist.
insert into public.agents (id, display_name, emoji, description, prompt_template, model_id) values
('style_picker', 'The Style Picker', '🎨',
 'Chooses ONE visual style preset per longform video (cinematic-realistic or editorial-graphic) plus a music mood, and emits a style bible for cross-image consistency.',
 'Real prompt lives in code at src/lib/agents/longform/style-picker.ts:buildPrompt() (rebuilt per dispatch).',
 'claude-haiku-4-5'),
('beat_planner', 'The Beat Planner', '🎞️',
 'Splits chapter narration into ~3-5s image beats and writes a strong, style-consistent Higgsfield image prompt for each.',
 'Real prompt lives in code at src/lib/agents/longform/beat-planner.ts:buildPrompt() (rebuilt per dispatch).',
 'claude-sonnet-4-5')
on conflict (id) do nothing;

insert into public.agent_prompt_versions (agent_id, version, prompt_template, changelog)
select id, prompt_version, prompt_template, 'Initial L1 longform agent prompt (real prompt in code).'
from public.agents where id in ('style_picker', 'beat_planner')
on conflict do nothing;

-- 6. Outcome-join view: longform ledger rows joined to their video's latest analytics snapshot.
create or replace view public.longform_decision_outcomes as
select
  d.id              as decision_id,
  d.agent_id,
  d.decision_type,
  d.chosen,
  d.your_video_id,
  v.title,
  v.status,
  v.posted_at,
  va.views,
  va.avg_view_duration_seconds,
  va.ctr_pct,
  va.watch_time_seconds,
  va.snapshot_at    as analytics_snapshot_at
from public.decisions d
join public.your_videos v on v.id = d.your_video_id
left join lateral (
  select * from public.video_analytics a
  where a.your_video_id = v.id
  order by a.snapshot_at desc
  limit 1
) va on true
where d.your_video_id is not null
  and v.format = 'longform';
```

- [ ] **Step 2: Apply on a Supabase dev branch (NOT prod) and verify the CHECK constraint names**

Apply via the Supabase MCP against a **development branch** (create one if needed). Before applying, confirm the auto-named constraints exist (`jobs_kind_check`, `render_jobs_job_type_check`) — Postgres' default name is `<table>_<column>_check`. If `\d public.jobs` shows a different constraint name, edit the `drop constraint if exists` line to match.
**Prod is operator-gated:** do NOT apply this migration to the production project. Ask Darius in-chat before any prod apply.
Expected: migration applies cleanly; `select * from public.longform_decision_outcomes limit 1;` returns 0 rows without error.

- [ ] **Step 3: Regenerate types**

Regenerate `src/lib/supabase/types.ts` from the dev branch (Supabase MCP `generate_typescript_types`, or `supabase gen types`). Confirm `your_videos` Row now has `format`, `target_duration_seconds`, `orientation`, `style_preset_id`, `longform_plan`, `chapter_markers`, and `decisions` Row has `your_video_id`.

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS (no references to the new columns yet, but the regenerated types must compile).
```bash
git add supabase/migrations/20260602000001_longform_schema.sql src/lib/supabase/types.ts
git commit -m "feat(longform): schema — your_videos longform fields, ledger join key, job enums, agent seeds, outcome view"
```

---

## Phase 1 — Pure helpers (TDD core, src + worker mirrors)

### Task 2: Duration → chapter count + word budget

**Files:**
- Create: `src/lib/longform/duration.ts`
- Test: `src/tests/lib/longform/duration.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import {
  WORDS_PER_SECOND,
  clampTargetDuration,
  deriveChapterCount,
  estimateWordBudget,
  estimateNarrationSeconds,
} from "@/lib/longform/duration";

describe("longform/duration", () => {
  it("clamps target duration to the valid 180-1200s window", () => {
    expect(clampTargetDuration(60)).toBe(180);
    expect(clampTargetDuration(600)).toBe(600);
    expect(clampTargetDuration(9999)).toBe(1200);
  });

  it("derives ~1 chapter per 100s, clamped to 3..12", () => {
    expect(deriveChapterCount(180)).toBe(3); // floor is 3
    expect(deriveChapterCount(540)).toBe(5);
    expect(deriveChapterCount(600)).toBe(6);
    expect(deriveChapterCount(1200)).toBe(12);
  });

  it("estimates a word budget from the narration rate", () => {
    // 600s * 2.4 wps = 1440 words
    expect(estimateWordBudget(600)).toBe(Math.round(600 * WORDS_PER_SECOND));
  });

  it("estimates narration seconds from a word count (inverse of the budget)", () => {
    expect(estimateNarrationSeconds(240)).toBeCloseTo(240 / WORDS_PER_SECOND, 5);
  });
});
```

Run: `npm test -- duration` → Expected: FAIL (module not found).

- [ ] **Step 2: Implement**

```typescript
// src/lib/longform/duration.ts
// Pure math for turning a target video length into a chapter count + word budget.
// Mirrored into scripts/render-worker is NOT needed (worker reads stored counts).

/** Effective narration rate incl. the deliberate suspense gaps in the reference format (~2 wps spoken). */
export const WORDS_PER_SECOND = 2.4;

export const MIN_DURATION_SECONDS = 180;
export const MAX_DURATION_SECONDS = 1200;
const SECONDS_PER_CHAPTER = 100;
const MIN_CHAPTERS = 3;
const MAX_CHAPTERS = 12;

export function clampTargetDuration(seconds: number): number {
  if (!Number.isFinite(seconds)) return MIN_DURATION_SECONDS;
  return Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, Math.round(seconds)));
}

export function deriveChapterCount(targetDurationSeconds: number): number {
  const clamped = clampTargetDuration(targetDurationSeconds);
  const raw = Math.round(clamped / SECONDS_PER_CHAPTER);
  return Math.min(MAX_CHAPTERS, Math.max(MIN_CHAPTERS, raw));
}

export function estimateWordBudget(targetDurationSeconds: number): number {
  return Math.round(clampTargetDuration(targetDurationSeconds) * WORDS_PER_SECOND);
}

export function estimateNarrationSeconds(wordCount: number): number {
  return wordCount / WORDS_PER_SECOND;
}
```

Run: `npm test -- duration` → Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/longform/duration.ts src/tests/lib/longform/duration.test.ts
git commit -m "feat(longform): duration → chapter-count + word-budget math"
```

### Task 3: Narration → beats splitter

**Files:**
- Create: `src/lib/longform/beats.ts`
- Test: `src/tests/lib/longform/beats.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { splitIntoSentences, splitNarrationIntoBeats } from "@/lib/longform/beats";

describe("longform/beats", () => {
  it("splits prose into sentences keeping terminal punctuation", () => {
    expect(splitIntoSentences("A man walks in. The lights dim! Why?")).toEqual([
      "A man walks in.",
      "The lights dim!",
      "Why?",
    ]);
  });

  it("groups sentences into beats of ~targetBeatSeconds without splitting a sentence", () => {
    // wps=2.4, target=4s => ~9.6 words per beat.
    const narration =
      "It is the fourth of March. A marble hall in downtown Dubai. " +
      "A man walks onto the stage. He clicks a remote and the lights dim.";
    const beats = splitNarrationIntoBeats(narration, { targetBeatSeconds: 4, wordsPerSecond: 2.4 });
    expect(beats.length).toBeGreaterThanOrEqual(2);
    // every beat carries non-empty text and a positive duration estimate
    for (const b of beats) {
      expect(b.text.length).toBeGreaterThan(0);
      expect(b.estDurationSeconds).toBeGreaterThan(0);
    }
    // concatenated beat text equals the original sentence stream (no words lost)
    expect(beats.map((b) => b.text).join(" ")).toBe(narration.trim());
  });

  it("emits a long sentence as its own beat even if it exceeds the target", () => {
    const long = "This single very long uninterrupted sentence keeps going well past the four second beat budget without any terminal punctuation until here.";
    const beats = splitNarrationIntoBeats(long, { targetBeatSeconds: 4, wordsPerSecond: 2.4 });
    expect(beats).toHaveLength(1);
    expect(beats[0].estDurationSeconds).toBeGreaterThan(4);
  });
});
```

Run: `npm test -- beats` → Expected: FAIL.

- [ ] **Step 2: Implement**

```typescript
// src/lib/longform/beats.ts
// Pure narration → ordered image-beats. A beat is one image's worth of narration
// (~targetBeatSeconds). Splits only at sentence boundaries so an image never
// changes mid-sentence. Mirrored into the worker is NOT needed (worker reads stored beats).

export interface BeatSlice {
  text: string;
  estDurationSeconds: number;
}

export interface SplitOptions {
  targetBeatSeconds: number;
  wordsPerSecond: number;
}

const SENTENCE_RE = /[^.!?]+[.!?]+(?:["'”’)\]]+)?|\S[^.!?]*$/g;

export function splitIntoSentences(text: string): string[] {
  const matches = text.match(SENTENCE_RE);
  if (!matches) return [];
  return matches.map((s) => s.trim()).filter((s) => s.length > 0);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function splitNarrationIntoBeats(narration: string, opts: SplitOptions): BeatSlice[] {
  const { targetBeatSeconds, wordsPerSecond } = opts;
  const targetWords = Math.max(1, targetBeatSeconds * wordsPerSecond);
  const sentences = splitIntoSentences(narration);

  const beats: BeatSlice[] = [];
  let bucket: string[] = [];
  let bucketWords = 0;

  const flush = () => {
    if (bucket.length === 0) return;
    const text = bucket.join(" ");
    beats.push({ text, estDurationSeconds: wordCount(text) / wordsPerSecond });
    bucket = [];
    bucketWords = 0;
  };

  for (const sentence of sentences) {
    const w = wordCount(sentence);
    // If adding this sentence overshoots the target and the bucket already has content, close the beat first.
    if (bucketWords > 0 && bucketWords + w > targetWords) flush();
    bucket.push(sentence);
    bucketWords += w;
    // A single oversized sentence becomes its own beat.
    if (bucketWords >= targetWords) flush();
  }
  flush();
  return beats;
}
```

Run: `npm test -- beats` → Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/longform/beats.ts src/tests/lib/longform/beats.test.ts
git commit -m "feat(longform): narration → beat-slice splitter (sentence-boundary, wps math)"
```

### Task 4: Style presets + StyleBible

**Files:**
- Create: `src/lib/longform/style-presets.ts`
- Test: `src/tests/lib/longform/style-presets.test.ts`

The presets encode the reference findings: `cinematic-realistic` = the reference-#2 look; `editorial-graphic` = the spec's clean editorial illustration. Both carry a long `negativePrompt` (reference-#1's consistency lever) and a per-preset `targetBeatSeconds`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { STYLE_PRESETS, getStylePreset, PRESET_IDS } from "@/lib/longform/style-presets";

describe("longform/style-presets", () => {
  it("exposes exactly the two L1 presets", () => {
    expect(PRESET_IDS).toEqual(["cinematic-realistic", "editorial-graphic"]);
  });

  it("each preset has a non-empty positive prefix, a rich negative list, 16:9 aspect, and a beat target", () => {
    for (const id of PRESET_IDS) {
      const p = getStylePreset(id);
      expect(p.presetId).toBe(id);
      expect(p.positivePrefix.length).toBeGreaterThan(20);
      expect(p.negativePrompt.split(",").length).toBeGreaterThanOrEqual(6);
      expect(p.aspect).toBe("16:9");
      expect(p.targetBeatSeconds).toBeGreaterThan(0);
      expect(p.musicMood.length).toBeGreaterThan(0);
    }
  });

  it("cinematic preset encodes the teal/amber photoreal documentary look", () => {
    const p = getStylePreset("cinematic-realistic");
    expect(p.positivePrefix.toLowerCase()).toMatch(/cinematic|photoreal/);
    expect(p.palette.toLowerCase()).toMatch(/teal|amber/);
  });

  it("getStylePreset throws on an unknown id", () => {
    // @ts-expect-error invalid id
    expect(() => getStylePreset("painterly")).toThrow();
  });
});
```

Run: `npm test -- style-presets` → Expected: FAIL.

- [ ] **Step 2: Implement**

```typescript
// src/lib/longform/style-presets.ts
// The two L1 visual style presets. A StyleBible locks the aesthetic for an entire
// video so every beat image reads as one film. Consistency lever (per reference #1):
// a heavy reused positivePrefix + a long negativePrompt, no per-image randomness.
// Mirrored into the worker is NOT needed (the agent bakes the final prompt into the plan).

export const PRESET_IDS = ["cinematic-realistic", "editorial-graphic"] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export interface StyleBible {
  presetId: PresetId;
  /** Locked aesthetic terms prepended to every beat prompt. */
  positivePrefix: string;
  /** Long suppression list — the main cross-image consistency lever. */
  negativePrompt: string;
  lighting: string;
  palette: string;
  framing: string;
  aspect: "16:9";
  /** Ken-Burns push amount (fraction of frame) per beat for this style. */
  kenBurnsZoom: number;
  /** Per-style beat cadence target (seconds of narration per image). */
  targetBeatSeconds: number;
  /** Default music mood for the bed (Style-picker may override within the preset). */
  musicMood: string;
}

const NEG_COMMON =
  "no text, no watermark, no logo, no caption, no subtitles, no signature, " +
  "no border, no frame, no split screen, no collage, no extra limbs, " +
  "no deformed hands, no extra fingers, no distorted faces, low quality, blurry, jpeg artifacts";

export const STYLE_PRESETS: Record<PresetId, StyleBible> = {
  "cinematic-realistic": {
    presetId: "cinematic-realistic",
    positivePrefix:
      "ultra-detailed photoreal cinematic still, 35mm film look, shallow depth of field, " +
      "dramatic single-source lighting, volumetric haze, filmic teal-and-amber color grade, " +
      "high dynamic range, subtle film grain, centered composition",
    negativePrompt: `${NEG_COMMON}, cartoon, illustration, flat vector, anime, painting, 3d render look`,
    lighting: "dramatic single-source key light, deep shadows, gentle rim light, god-rays where natural",
    palette: "moody high-contrast teal-and-amber; warm tungsten interiors, cool teal exteriors, deep blacks",
    framing: "wide cinematic establishing shots and dramatic close-ups, subject centered, strong negative space",
    aspect: "16:9",
    kenBurnsZoom: 0.06,
    targetBeatSeconds: 4.5,
    musicMood: "cinematic, dramatic, suspenseful, low-energy orchestral bed",
  },
  "editorial-graphic": {
    presetId: "editorial-graphic",
    positivePrefix:
      "bold modern editorial illustration, clean flat vector shapes, confident thick linework, " +
      "limited high-contrast palette, strong geometric composition, dramatic flat lighting, " +
      "magazine-grade infographic clarity, centered subject",
    negativePrompt: `${NEG_COMMON}, photorealistic, 3d render, busy background, gradient mesh, cluttered detail`,
    lighting: "flat dramatic lighting, bold shadow shapes, no photographic shading",
    palette: "limited high-contrast editorial palette: one accent color over a neutral ground",
    framing: "single clear focal subject, generous negative space, poster-like centering",
    aspect: "16:9",
    kenBurnsZoom: 0.03,
    targetBeatSeconds: 3.5,
    musicMood: "clean, driving, understated electronic bed, low-energy",
  },
};

export function getStylePreset(id: PresetId): StyleBible {
  const preset = STYLE_PRESETS[id];
  if (!preset) throw new Error(`unknown style preset: ${id}`);
  return preset;
}
```

Run: `npm test -- style-presets` → Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/longform/style-presets.ts src/tests/lib/longform/style-presets.test.ts
git commit -m "feat(longform): two style presets (cinematic-realistic, editorial-graphic) + StyleBible"
```

### Task 5: Image-prompt assembler

**Files:**
- Create: `src/lib/longform/image-prompt.ts`
- Test: `src/tests/lib/longform/image-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { assembleImagePrompt } from "@/lib/longform/image-prompt";
import { getStylePreset } from "@/lib/longform/style-presets";

describe("longform/image-prompt", () => {
  it("wraps the scene in the style prefix, framing, lighting, and 16:9 cue", () => {
    const bible = getStylePreset("cinematic-realistic");
    const out = assembleImagePrompt({ sceneDescription: "a marble auditorium with a single spotlit podium", styleBible: bible });
    expect(out.prompt.startsWith(bible.positivePrefix)).toBe(true);
    expect(out.prompt).toContain("a marble auditorium with a single spotlit podium");
    expect(out.prompt).toContain("16:9");
    expect(out.prompt).toContain(bible.lighting);
    expect(out.negativePrompt).toBe(bible.negativePrompt);
  });

  it("trims and collapses whitespace in the scene description", () => {
    const bible = getStylePreset("editorial-graphic");
    const out = assembleImagePrompt({ sceneDescription: "  an   opening   vault  ", styleBible: bible });
    expect(out.prompt).toContain("an opening vault");
    expect(out.prompt).not.toContain("  ");
  });
});
```

Run: `npm test -- image-prompt` → Expected: FAIL.

- [ ] **Step 2: Implement**

```typescript
// src/lib/longform/image-prompt.ts
// Pure assembly of a final Higgsfield prompt from a per-beat scene description + the
// video's StyleBible. The Beat-planner LLM writes only the sceneDescription; this
// deterministically wraps it so every image shares one aesthetic. The fully-assembled
// prompt string is stored in the plan, so the worker consumes it directly (no mirror).

import type { StyleBible } from "@/lib/longform/style-presets";

export interface AssembleArgs {
  sceneDescription: string;
  styleBible: StyleBible;
}

export interface AssembledPrompt {
  prompt: string;
  negativePrompt: string;
}

export function assembleImagePrompt({ sceneDescription, styleBible }: AssembleArgs): AssembledPrompt {
  const scene = sceneDescription.replace(/\s+/g, " ").trim();
  const prompt = [
    styleBible.positivePrefix,
    scene,
    styleBible.framing,
    styleBible.lighting,
    styleBible.palette,
    "16:9 aspect ratio, wide landscape composition",
  ].join(". ");
  return { prompt, negativePrompt: styleBible.negativePrompt };
}
```

Run: `npm test -- image-prompt` → Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/longform/image-prompt.ts src/tests/lib/longform/image-prompt.test.ts
git commit -m "feat(longform): style-consistent image-prompt assembler"
```

### Task 6: Ken-Burns landscape filter builder

**Files:**
- Create: `src/lib/longform/ken-burns.ts`
- Test: `src/tests/lib/longform/ken-burns.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { buildKenBurnsFilter, KEN_BURNS_DIRECTIONS } from "@/lib/longform/ken-burns";

describe("longform/ken-burns", () => {
  it("builds a zoompan filter that ends at the 1920x1080 output size", () => {
    const f = buildKenBurnsFilter({ durationSeconds: 4, fps: 30, direction: "in", zoom: 0.06 });
    expect(f).toContain("zoompan");
    expect(f).toContain("s=1920x1080");
    expect(f).toContain("d=120"); // 4s * 30fps
    expect(f).toContain("fps=30");
  });

  it("supports every declared direction without throwing", () => {
    for (const direction of KEN_BURNS_DIRECTIONS) {
      expect(() => buildKenBurnsFilter({ durationSeconds: 3, fps: 30, direction, zoom: 0.05 })).not.toThrow();
    }
  });

  it("rounds frame count and guards a minimum of 1 frame", () => {
    const f = buildKenBurnsFilter({ durationSeconds: 0.01, fps: 30, direction: "in", zoom: 0.05 });
    expect(f).toContain("d=1");
  });
});
```

Run: `npm test -- ken-burns` → Expected: FAIL.

- [ ] **Step 2: Implement**

```typescript
// src/lib/longform/ken-burns.ts
// Pure builder of an ffmpeg zoompan filtergraph for a slow landscape (1920x1080)
// Ken-Burns move on a still image — emulates the reference's slow cinematic push-in.
// Mirrored verbatim into scripts/render-worker/lib/ken-burns.ts.

export const KEN_BURNS_DIRECTIONS = ["in", "out", "left", "right"] as const;
export type KenBurnsDirection = (typeof KEN_BURNS_DIRECTIONS)[number];

export interface KenBurnsArgs {
  durationSeconds: number;
  fps: number;
  direction: KenBurnsDirection;
  /** Total zoom travel as a fraction of frame (e.g. 0.06 = 6% push). */
  zoom: number;
}

const OUT_W = 1920;
const OUT_H = 1080;
// Oversample so the pan/zoom has pixels to move into without softening.
const SRC_W = OUT_W * 2;
const SRC_H = OUT_H * 2;

export function buildKenBurnsFilter(args: KenBurnsArgs): string {
  const frames = Math.max(1, Math.round(args.durationSeconds * args.fps));
  const z = Math.max(0, args.zoom);
  // zoom expression: push in ramps zoom up, push out starts zoomed and ramps down.
  const zExpr =
    args.direction === "out"
      ? `'if(eq(on,0),${(1 + z).toFixed(4)},max(zoom-${(z / frames).toFixed(6)},1.0))'`
      : `'min(zoom+${(z / frames).toFixed(6)},${(1 + z).toFixed(4)})'`;
  // pan expressions: centre by default, drift horizontally for left/right.
  let xExpr = "'iw/2-(iw/zoom/2)'";
  let yExpr = "'ih/2-(ih/zoom/2)'";
  if (args.direction === "left") xExpr = `'(iw - iw/zoom) * (1 - on/${frames})'`;
  if (args.direction === "right") xExpr = `'(iw - iw/zoom) * (on/${frames})'`;

  return (
    `scale=${SRC_W}:${SRC_H}:force_original_aspect_ratio=increase,` +
    `crop=${SRC_W}:${SRC_H},` +
    `zoompan=z=${zExpr}:x=${xExpr}:y=${yExpr}:d=${frames}:s=${OUT_W}x${OUT_H}:fps=${args.fps},` +
    `setsar=1`
  );
}
```

Run: `npm test -- ken-burns` → Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/longform/ken-burns.ts src/tests/lib/longform/ken-burns.test.ts
git commit -m "feat(longform): landscape Ken-Burns zoompan filter builder"
```

### Task 7: Chunked-TTS offset math

**Files:**
- Create: `src/lib/longform/tts-chunks.ts`
- Test: `src/tests/lib/longform/tts-chunks.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { planTtsChunks, cumulativeOffsets } from "@/lib/longform/tts-chunks";

describe("longform/tts-chunks", () => {
  it("packs sentences into chunks under maxChars without splitting a sentence", () => {
    const text = "One sentence here. Two sentence here. Three sentence here.";
    const chunks = planTtsChunks(text, 25);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(25 + 1);
    expect(chunks.join(" ")).toBe(text);
  });

  it("emits a single chunk when text fits", () => {
    expect(planTtsChunks("Short.", 100)).toEqual(["Short."]);
  });

  it("computes cumulative start offsets from per-chunk durations", () => {
    expect(cumulativeOffsets([2, 3, 1.5])).toEqual([0, 2, 5]);
  });

  it("an over-long single sentence still becomes its own chunk", () => {
    const long = "a".repeat(50) + ".";
    expect(planTtsChunks(long, 10)).toEqual([long]);
  });
});
```

Run: `npm test -- tts-chunks` → Expected: FAIL.

- [ ] **Step 2: Implement**

```typescript
// src/lib/longform/tts-chunks.ts
// Pure helpers for chunked Cartesia synthesis of long chapter narration:
// split at sentence boundaries under a char cap, then line up cumulative offsets
// after each chunk's WAV is probed. Mirrored verbatim into the worker.

import { splitIntoSentences } from "@/lib/longform/beats";

export function planTtsChunks(text: string, maxChars: number): string[] {
  const sentences = splitIntoSentences(text);
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if (current === "") {
      current = s;
    } else if (current.length + 1 + s.length <= maxChars) {
      current = `${current} ${s}`;
    } else {
      chunks.push(current);
      current = s;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Start time (seconds) of each chunk given its measured duration. */
export function cumulativeOffsets(durations: number[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const d of durations) {
    offsets.push(acc);
    acc += d;
  }
  return offsets;
}
```

Run: `npm test -- tts-chunks` → Expected: PASS.

> Note: `tts-chunks.ts` imports `splitIntoSentences` from `beats.ts`. When mirroring into the worker, copy **both** `splitIntoSentences` and the chunk helpers into `scripts/render-worker/lib/tts-chunks.ts` (the worker mirror is self-contained — it must not import `beats.ts`). See Task 18.

- [ ] **Step 3: Commit**

```bash
git add src/lib/longform/tts-chunks.ts src/tests/lib/longform/tts-chunks.test.ts
git commit -m "feat(longform): chunked-TTS split + cumulative-offset math"
```

### Task 8: Chapter markers + concat list

**Files:**
- Create: `src/lib/longform/chapters.ts`
- Test: `src/tests/lib/longform/chapters.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { formatTimestamp, buildChapterMarkers, buildConcatList } from "@/lib/longform/chapters";

describe("longform/chapters", () => {
  it("formats seconds as H:MM:SS or M:SS", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(3725)).toBe("1:02:05");
  });

  it("computes chapter start markers from chapter durations", () => {
    const markers = buildChapterMarkers([90, 120, 100], ["Intro", "Problem", "Payoff"]);
    expect(markers).toEqual([
      { index: 0, title: "Intro", startSeconds: 0, timestamp: "0:00" },
      { index: 1, title: "Problem", startSeconds: 90, timestamp: "1:30" },
      { index: 2, title: "Payoff", startSeconds: 210, timestamp: "3:30" },
    ]);
  });

  it("builds an ffmpeg concat-demuxer list with escaped paths", () => {
    const list = buildConcatList(["/tmp/a.mp4", "/tmp/b.mp4"]);
    expect(list).toBe("file '/tmp/a.mp4'\nfile '/tmp/b.mp4'\n");
  });
});
```

Run: `npm test -- chapters` → Expected: FAIL.

- [ ] **Step 2: Implement**

```typescript
// src/lib/longform/chapters.ts
// Pure chapter-marker timestamps (for the YouTube description) + ffmpeg concat-list
// builder. Mirrored verbatim into the worker.

export interface ChapterMarker {
  index: number;
  title: string;
  startSeconds: number;
  timestamp: string;
}

export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function buildChapterMarkers(chapterDurations: number[], titles: string[]): ChapterMarker[] {
  const markers: ChapterMarker[] = [];
  let acc = 0;
  for (let i = 0; i < chapterDurations.length; i++) {
    markers.push({
      index: i,
      title: titles[i] ?? `Chapter ${i + 1}`,
      startSeconds: Math.round(acc),
      timestamp: formatTimestamp(acc),
    });
    acc += chapterDurations[i];
  }
  return markers;
}

export function buildConcatList(paths: string[]): string {
  return paths.map((p) => `file '${p}'`).join("\n") + "\n";
}
```

Run: `npm test -- chapters` → Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/longform/chapters.ts src/tests/lib/longform/chapters.test.ts
git commit -m "feat(longform): chapter-marker timestamps + ffmpeg concat-list builder"
```

---

## Phase 2 — Agents

### Task 9: Longform agent types, schemas, and playbook

**Files:**
- Create: `src/lib/agents/longform/types.ts`
- Create: `src/lib/agents/longform/playbook.ts`
- Test: `src/tests/lib/agents/longform/types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { LongformPlanSchema, WriterOutputSchema, StylePickerOutputSchema } from "@/lib/agents/longform/types";
import { EMPTY_LONGFORM_PLAYBOOK } from "@/lib/agents/longform/playbook";

describe("longform/types", () => {
  it("validates a well-formed plan and round-trips through JSON", () => {
    const plan = {
      topic: "Why Dubai is building an underwater city",
      targetDurationSeconds: 540,
      presetId: "cinematic-realistic" as const,
      musicMood: "cinematic, suspenseful",
      angle: "A city that ran out of room builds down instead of up.",
      hook: "It's the 4th of March, 2023. A marble hall in downtown Dubai.",
      estimatedWords: 1296,
      captionsEnabled: false,
      voice: { provider: "cartesia", voiceId: "5ee9feff-1265-424a-9d7f-8e4d431a12c7", speed: 0.95, stability: 0.6 },
      styleBible: {
        presetId: "cinematic-realistic", positivePrefix: "x", negativePrompt: "no text",
        lighting: "x", palette: "teal", framing: "x", aspect: "16:9", kenBurnsZoom: 0.06,
        targetBeatSeconds: 4.5, musicMood: "cinematic",
      },
      chapters: [
        { index: 0, title: "The Reveal", purpose: "open on the stage", narration: "A man walks on. The lights dim.",
          beats: [{ index: 0, narrationSlice: "A man walks on.", estDurationSeconds: 4, sceneDescription: "a man on a dark stage", imagePrompt: "p", negativePrompt: "no text" }] },
      ],
    };
    const parsed = LongformPlanSchema.parse(plan);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
  });

  it("rejects a target duration outside 180-1200", () => {
    expect(() => LongformPlanSchema.parse({ targetDurationSeconds: 10 } as never)).toThrow();
  });

  it("writer output requires at least one chapter with narration", () => {
    expect(() => WriterOutputSchema.parse({ angle: "a", hook: "h", estimatedWords: 10, chapters: [] })).toThrow();
  });

  it("style picker output is one of the two presets", () => {
    const ok = StylePickerOutputSchema.parse({ presetId: "editorial-graphic", musicMood: "clean", rationale: "finance explainer reads better as bold graphics than photoreal footage." });
    expect(ok.presetId).toBe("editorial-graphic");
  });

  it("exposes an empty (stub) playbook for every agent", () => {
    expect(EMPTY_LONGFORM_PLAYBOOK.writer.exemplarHooks).toEqual([]);
    expect(EMPTY_LONGFORM_PLAYBOOK.stylePicker.presetWinsByGenre).toEqual({});
    expect(EMPTY_LONGFORM_PLAYBOOK.beatPlanner.promptPatternTags).toEqual([]);
  });
});
```

Run: `npm test -- longform/types` → Expected: FAIL.

- [ ] **Step 2: Implement the schemas**

```typescript
// src/lib/agents/longform/types.ts
import { z } from "zod";
import { PRESET_IDS } from "@/lib/longform/style-presets";

export const PresetIdSchema = z.enum(PRESET_IDS);

export const StyleBibleSchema = z.object({
  presetId: PresetIdSchema,
  positivePrefix: z.string().min(1),
  negativePrompt: z.string().min(1),
  lighting: z.string(),
  palette: z.string(),
  framing: z.string(),
  aspect: z.literal("16:9"),
  kenBurnsZoom: z.number().min(0).max(0.5),
  targetBeatSeconds: z.number().positive(),
  musicMood: z.string(),
});

export const VoiceChoiceSchema = z.object({
  provider: z.string().min(1),
  voiceId: z.string().min(1),
  speed: z.number().min(0.5).max(1.5),
  stability: z.number().min(0).max(1),
});

// --- Writer (multi-pass) ---
export const WriterHookSchema = z.object({
  angle: z.string().min(10).max(600),
  hook: z.string().min(20).max(900),
});
export const WriterOutlineSchema = z.object({
  chapters: z.array(z.object({ title: z.string().min(1).max(120), purpose: z.string().min(1).max(300) })).min(1).max(12),
});
export const WriterChapterNarrationSchema = z.object({
  narration: z.string().min(40),
});
export const WriterOutputSchema = z.object({
  angle: z.string().min(1),
  hook: z.string().min(1),
  estimatedWords: z.number().int().nonnegative(),
  chapters: z.array(z.object({
    title: z.string().min(1),
    purpose: z.string().min(1),
    narration: z.string().min(1),
  })).min(1),
});
export type WriterOutput = z.infer<typeof WriterOutputSchema>;

// --- Style picker ---
export const StylePickerOutputSchema = z.object({
  presetId: PresetIdSchema,
  musicMood: z.string().min(3).max(160),
  rationale: z.string().min(20).max(500),
});
export type StylePickerOutput = z.infer<typeof StylePickerOutputSchema>;

// --- Beat planner ---
export const BeatSchema = z.object({
  index: z.number().int().nonnegative(),
  narrationSlice: z.string().min(1),
  estDurationSeconds: z.number().positive(),
  sceneDescription: z.string().min(1),
  imagePrompt: z.string().min(1),
  negativePrompt: z.string().min(1),
});
export const ChapterBeatsSchema = z.object({
  chapterIndex: z.number().int().nonnegative(),
  beats: z.array(BeatSchema).min(1),
});
export const BeatPlannerOutputSchema = z.object({ chapters: z.array(ChapterBeatsSchema).min(1) });
export type BeatPlannerOutput = z.infer<typeof BeatPlannerOutputSchema>;
// The per-chapter LLM call only returns scene descriptions; pure code assembles prompts.
export const SceneDescriptionsSchema = z.object({ scenes: z.array(z.string().min(1)).min(1) });

// --- Persisted plan ---
export const PlanChapterSchema = z.object({
  index: z.number().int().nonnegative(),
  title: z.string().min(1),
  purpose: z.string().min(1),
  narration: z.string().min(1),
  beats: z.array(BeatSchema).min(1),
});
export const LongformPlanSchema = z.object({
  topic: z.string().min(1),
  targetDurationSeconds: z.number().int().min(180).max(1200),
  presetId: PresetIdSchema,
  styleBible: StyleBibleSchema,
  musicMood: z.string().min(1),
  angle: z.string().min(1),
  hook: z.string().min(1),
  voice: VoiceChoiceSchema,
  estimatedWords: z.number().int().nonnegative(),
  captionsEnabled: z.boolean(),
  chapters: z.array(PlanChapterSchema).min(1),
});
export type LongformPlan = z.infer<typeof LongformPlanSchema>;
```

- [ ] **Step 3: Implement the playbook stub**

```typescript
// src/lib/agents/longform/playbook.ts
// Per-agent playbook. EMPTY in L1 — every agent reads it so Phase L2 (the learning
// engine that distills these from posted-video outcomes) needs zero re-architecture.
import type { PresetId } from "@/lib/longform/style-presets";

export interface LongformPlaybook {
  writer: { exemplarHooks: string[]; winningAngleNotes: string[] };
  stylePicker: { presetWinsByGenre: Partial<Record<string, PresetId>> };
  beatPlanner: { promptPatternTags: string[]; bestBeatSeconds: number | null };
  voice: { bestVoiceIdByGenre: Partial<Record<string, string>> };
}

export const EMPTY_LONGFORM_PLAYBOOK: LongformPlaybook = {
  writer: { exemplarHooks: [], winningAngleNotes: [] },
  stylePicker: { presetWinsByGenre: {} },
  beatPlanner: { promptPatternTags: [], bestBeatSeconds: null },
  voice: { bestVoiceIdByGenre: {} },
};
```

Run: `npm test -- longform/types` → Expected: PASS. Then `npx tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agents/longform/types.ts src/lib/agents/longform/playbook.ts src/tests/lib/agents/longform/types.test.ts
git commit -m "feat(longform): agent schemas, LongformPlan, and empty playbook stub"
```

### Task 10: Decision-ledger serialization (pure)

**Files:**
- Create: `src/lib/longform/ledger.ts`
- Test: `src/tests/lib/longform/ledger.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { buildLongformLedgerRows } from "@/lib/longform/ledger";
import type { LongformPlan } from "@/lib/agents/longform/types";

const plan: LongformPlan = {
  topic: "t", targetDurationSeconds: 540, presetId: "cinematic-realistic", musicMood: "cinematic",
  angle: "angle", hook: "hook", estimatedWords: 1200, captionsEnabled: false,
  voice: { provider: "cartesia", voiceId: "v1", speed: 0.95, stability: 0.6 },
  styleBible: { presetId: "cinematic-realistic", positivePrefix: "x", negativePrompt: "no text", lighting: "l", palette: "teal", framing: "f", aspect: "16:9", kenBurnsZoom: 0.06, targetBeatSeconds: 4.5, musicMood: "cinematic" },
  chapters: [
    { index: 0, title: "A", purpose: "p", narration: "n", beats: [
      { index: 0, narrationSlice: "n", estDurationSeconds: 4, sceneDescription: "s", imagePrompt: "ip", negativePrompt: "no text" },
      { index: 1, narrationSlice: "n2", estDurationSeconds: 5, sceneDescription: "s2", imagePrompt: "ip2", negativePrompt: "no text" },
    ] },
  ],
};

describe("longform/ledger", () => {
  it("emits one row per agent keyed to the draft", () => {
    const rows = buildLongformLedgerRows(plan, { jobId: "j1", yourVideoId: "yv1" });
    const agents = rows.map((r) => r.agentId).sort();
    expect(agents).toEqual(["beat_planner", "style_picker", "voice_coach", "writer"]);
    for (const r of rows) {
      expect(r.jobId).toBe("j1");
      expect(r.yourVideoId).toBe("yv1");
    }
  });

  it("captures each agent's salient decision fields", () => {
    const rows = buildLongformLedgerRows(plan, { jobId: "j1", yourVideoId: "yv1" });
    const byAgent = Object.fromEntries(rows.map((r) => [r.agentId, r]));
    expect(byAgent.writer.decisionType).toBe("longform_script");
    expect((byAgent.writer.chosen as Record<string, unknown>).chapterTitles).toEqual(["A"]);
    expect((byAgent.style_picker.chosen as Record<string, unknown>).presetId).toBe("cinematic-realistic");
    expect((byAgent.beat_planner.chosen as Record<string, unknown>).beatCount).toBe(2);
    expect((byAgent.beat_planner.chosen as Record<string, unknown>).avgBeatSeconds).toBeCloseTo(4.5, 5);
    expect((byAgent.voice_coach.chosen as Record<string, unknown>).voiceId).toBe("v1");
  });
});
```

Run: `npm test -- longform/ledger` → Expected: FAIL.

- [ ] **Step 2: Implement**

```typescript
// src/lib/longform/ledger.ts
// Serialize a finished LongformPlan into one decision-ledger row per agent. These are
// the feedback-flywheel foundation: keyed to the draft (your_video_id) so the
// longform_decision_outcomes view can join YouTube analytics on later.
import type { LongformPlan } from "@/lib/agents/longform/types";

export interface LedgerRow {
  agentId: "writer" | "style_picker" | "beat_planner" | "voice_coach";
  decisionType: string;
  jobId: string;
  yourVideoId: string;
  inputs: Record<string, unknown>;
  chosen: Record<string, unknown>;
  reasoning: string;
}

export function buildLongformLedgerRows(
  plan: LongformPlan,
  keys: { jobId: string; yourVideoId: string },
): LedgerRow[] {
  const allBeats = plan.chapters.flatMap((c) => c.beats);
  const avgBeatSeconds = allBeats.length
    ? allBeats.reduce((sum, b) => sum + b.estDurationSeconds, 0) / allBeats.length
    : 0;
  const base = { jobId: keys.jobId, yourVideoId: keys.yourVideoId };
  return [
    {
      ...base,
      agentId: "writer",
      decisionType: "longform_script",
      inputs: { topic: plan.topic, targetDurationSeconds: plan.targetDurationSeconds },
      chosen: {
        angle: plan.angle,
        hook: plan.hook,
        chapterTitles: plan.chapters.map((c) => c.title),
        estimatedWords: plan.estimatedWords,
      },
      reasoning: plan.angle,
    },
    {
      ...base,
      agentId: "style_picker",
      decisionType: "longform_style",
      inputs: { topic: plan.topic },
      chosen: { presetId: plan.presetId, musicMood: plan.musicMood, styleBibleAspect: plan.styleBible.aspect },
      reasoning: `preset ${plan.presetId}, mood "${plan.musicMood}"`,
    },
    {
      ...base,
      agentId: "beat_planner",
      decisionType: "longform_beats",
      inputs: { chapters: plan.chapters.length },
      chosen: { beatCount: allBeats.length, avgBeatSeconds, promptPatternTags: [plan.presetId] },
      reasoning: `${allBeats.length} beats, avg ${avgBeatSeconds.toFixed(1)}s`,
    },
    {
      ...base,
      agentId: "voice_coach",
      decisionType: "longform_voice",
      inputs: { topic: plan.topic },
      chosen: { ...plan.voice },
      reasoning: `voice ${plan.voice.voiceId} @ ${plan.voice.speed}x`,
    },
  ];
}
```

Run: `npm test -- longform/ledger` → Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/longform/ledger.ts src/tests/lib/longform/ledger.test.ts
git commit -m "feat(longform): decision-ledger serialization (one row per agent, keyed to draft)"
```

### Task 11: Writer (multi-pass)

**Files:**
- Create: `src/lib/agents/longform/writer.ts`
- Test: `src/tests/lib/agents/longform/writer.test.ts`

The Writer makes 3 kinds of LLM call: (1) angle+hook, (2) chapter outline (count from `deriveChapterCount`), (3) per-chapter narration. Prompts encode the reference-#2 format. Uses `claude-opus-4-7` for narration quality.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({ getClaudeModel: vi.fn(() => ({ __mock: "model" })) }));
vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateObject: vi.fn() };
});

import { generateObject, NoObjectGeneratedError } from "ai";
import { runLongformWriter } from "@/lib/agents/longform/writer";
import { EMPTY_LONGFORM_PLAYBOOK } from "@/lib/agents/longform/playbook";

function routeByPrompt(prompt: string) {
  if (prompt.includes("PASS:HOOK")) return { object: { angle: "A city out of room builds down.", hook: "It's the 4th of March, 2023. A marble hall in Dubai." } };
  if (prompt.includes("PASS:OUTLINE")) return { object: { chapters: [
    { title: "The Reveal", purpose: "open on the stage" },
    { title: "The Problem", purpose: "Dubai is out of room" },
    { title: "The Payoff", purpose: "the underwater ring" },
  ] } };
  return { object: { narration: "A man walks on. The lights dim. But this is no ordinary talk." } };
}

beforeEach(() => {
  vi.mocked(generateObject).mockReset();
  vi.mocked(generateObject).mockImplementation(async (args: { prompt: string }) => routeByPrompt(args.prompt) as never);
});

const ctx = () => ({ topic: "Why Dubai is building an underwater city", targetDurationSeconds: 540, playbook: EMPTY_LONGFORM_PLAYBOOK });

describe("longform/writer", () => {
  it("produces angle, hook, and one narrated chapter per outline entry", async () => {
    const out = await runLongformWriter(ctx());
    expect(out.hook.length).toBeGreaterThan(0);
    expect(out.chapters).toHaveLength(3);
    for (const c of out.chapters) {
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.narration.length).toBeGreaterThan(0);
    }
    expect(out.estimatedWords).toBeGreaterThan(0);
  });

  it("retries a pass once on NoObjectGeneratedError", async () => {
    const err = Object.create(NoObjectGeneratedError.prototype);
    vi.mocked(generateObject)
      .mockImplementationOnce(async () => { throw err; })
      .mockImplementation(async (args: { prompt: string }) => routeByPrompt(args.prompt) as never);
    const out = await runLongformWriter(ctx());
    expect(out.chapters.length).toBe(3);
  });

  it("falls back to a minimal chapter set if the outline pass keeps failing", async () => {
    const err = Object.create(NoObjectGeneratedError.prototype);
    vi.mocked(generateObject).mockImplementation(async (args: { prompt: string }) => {
      if (args.prompt.includes("PASS:OUTLINE")) throw err;
      return routeByPrompt(args.prompt) as never;
    });
    const out = await runLongformWriter(ctx());
    expect(out.chapters.length).toBeGreaterThanOrEqual(3); // deriveChapterCount(540) === 5 fallback titles
  });
});
```

Run: `npm test -- longform/writer` → Expected: FAIL.

- [ ] **Step 2: Implement**

```typescript
// src/lib/agents/longform/writer.ts
import { generateObject, NoObjectGeneratedError } from "ai";
import { getClaudeModel } from "@/lib/ai/gateway";
import { deriveChapterCount, estimateWordBudget } from "@/lib/longform/duration";
import {
  WriterHookSchema, WriterOutlineSchema, WriterChapterNarrationSchema,
  WriterOutputSchema, type WriterOutput,
} from "@/lib/agents/longform/types";
import type { LongformPlaybook } from "@/lib/agents/longform/playbook";

export interface WriterRunContext {
  topic: string;
  targetDurationSeconds: number;
  playbook: LongformPlaybook;
}

const FORMAT_RULES = `FORMAT (match a top-tier faceless documentary channel like Fern/Blackfiles):
- AUTHORITATIVE, MEASURED narration. Short, clipped sentences and fragments — one idea per line.
- Build suspense with deliberate, reveal-withholding turns ("but they're not...", fact-then-twist).
- Transition with turn-words ("So why...", "Here's the thing...", "So where do you go...") — never chapter cards.
- NO "hey guys", no channel intro, no on-screen-text assumptions. Write only what is spoken.`;

function hookPrompt(ctx: WriterRunContext): string {
  const ex = ctx.playbook.writer.exemplarHooks.length
    ? `\nProven hooks for this channel (emulate their shape, not their words):\n${ctx.playbook.writer.exemplarHooks.map((h) => `- ${h}`).join("\n")}`
    : "";
  return `PASS:HOOK
You are the Writer for a faceless longform YouTube documentary.
Topic: "${ctx.topic}"

Pick ONE sharp ANGLE, then write a cold-open HOOK (the first ~10-15 seconds of narration).
The hook must: open ON the story (a specific time/place anchor OR a bold curiosity claim), drip-reveal
in short clauses, and pose 1-2 rhetorical questions that frame the whole video's curiosity gap.
${FORMAT_RULES}${ex}

Return JSON: { "angle": string, "hook": string }.`;
}

function outlinePrompt(ctx: WriterRunContext, chapterCount: number): string {
  return `PASS:OUTLINE
You are the Writer. Topic: "${ctx.topic}".
Produce exactly ${chapterCount} chapters forming ONE continuous narrative arc (invisible to the viewer —
no on-screen titles). Each chapter: a short internal title + a one-line purpose.
${FORMAT_RULES}

Return JSON: { "chapters": [{ "title": string, "purpose": string }] } with exactly ${chapterCount} items.`;
}

function narrationPrompt(ctx: WriterRunContext, chapter: { title: string; purpose: string }, wordBudget: number): string {
  return `PASS:NARRATION
You are the Writer. Topic: "${ctx.topic}". Angle is set.
Write the spoken NARRATION for this chapter only.
Chapter: "${chapter.title}" — purpose: ${chapter.purpose}
Target ~${wordBudget} words. ${FORMAT_RULES}
Do not restate the title. Flow naturally from the prior chapter and set up the next with a turn-word.

Return JSON: { "narration": string }.`;
}

async function callObject<T>(model: ReturnType<typeof getClaudeModel>, schema: import("zod").ZodType<T>, prompt: string): Promise<T> {
  const run = async (): Promise<T> => {
    const result = await generateObject({ model, schema, prompt });
    return schema.parse(result.object);
  };
  try {
    return await run();
  } catch (err) {
    if (!NoObjectGeneratedError.isInstance(err)) throw err;
    return await run();
  }
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export async function runLongformWriter(ctx: WriterRunContext): Promise<WriterOutput> {
  const opus = getClaudeModel("claude-opus-4-7");
  const sonnet = getClaudeModel("claude-sonnet-4-5");
  const chapterCount = deriveChapterCount(ctx.targetDurationSeconds);
  const wordBudget = estimateWordBudget(ctx.targetDurationSeconds);

  // Pass 1: angle + hook.
  const hookOut = await callObject(opus, WriterHookSchema, hookPrompt(ctx));

  // Pass 2: outline (fallback to generic chapter scaffold if it keeps failing).
  let outline: { title: string; purpose: string }[];
  try {
    outline = (await callObject(sonnet, WriterOutlineSchema, outlinePrompt(ctx, chapterCount))).chapters;
  } catch (err) {
    if (!NoObjectGeneratedError.isInstance(err)) throw err;
    outline = Array.from({ length: chapterCount }, (_, i) => ({
      title: `Part ${i + 1}`,
      purpose: i === 0 ? "establish the hook and the stakes" : i === chapterCount - 1 ? "resolve and land the payoff" : "develop the argument with a new reveal",
    }));
  }

  // Pass 3: narration per chapter.
  const perChapterBudget = Math.max(40, Math.round(wordBudget / outline.length));
  const chapters = [];
  for (const ch of outline) {
    let narration: string;
    try {
      narration = (await callObject(opus, WriterChapterNarrationSchema, narrationPrompt(ctx, ch, perChapterBudget))).narration;
    } catch (err) {
      if (!NoObjectGeneratedError.isInstance(err)) throw err;
      narration = `${ch.purpose}. ${ctx.topic}.`; // safe non-empty fallback so render never hard-fails
    }
    chapters.push({ title: ch.title, purpose: ch.purpose, narration });
  }

  const estimatedWords = chapters.reduce((sum, c) => sum + countWords(c.narration), 0) + countWords(hookOut.hook);
  return WriterOutputSchema.parse({ angle: hookOut.angle, hook: hookOut.hook, estimatedWords, chapters });
}
```

Run: `npm test -- longform/writer` → Expected: PASS. Then `npx tsc --noEmit`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agents/longform/writer.ts src/tests/lib/agents/longform/writer.test.ts
git commit -m "feat(longform): multi-pass Writer (angle+hook → outline → per-chapter narration)"
```

### Task 12: Style-picker

**Files:**
- Create: `src/lib/agents/longform/style-picker.ts`
- Test: `src/tests/lib/agents/longform/style-picker.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/ai/gateway", () => ({ getClaudeModel: vi.fn(() => ({ __mock: "model" })) }));
vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateObject: vi.fn() };
});
import { generateObject, NoObjectGeneratedError } from "ai";
import { runStylePicker } from "@/lib/agents/longform/style-picker";
import { EMPTY_LONGFORM_PLAYBOOK } from "@/lib/agents/longform/playbook";

beforeEach(() => vi.mocked(generateObject).mockReset());
const ctx = () => ({ topic: "The IRS is hiding this from you", angle: "a", playbook: EMPTY_LONGFORM_PLAYBOOK });

describe("longform/style-picker", () => {
  it("resolves the chosen preset into a full style bible with the chosen music mood", async () => {
    vi.mocked(generateObject).mockResolvedValue({ object: { presetId: "editorial-graphic", musicMood: "tense corporate", rationale: "a finance explainer reads cleaner as bold editorial graphics than photoreal footage." } } as never);
    const out = await runStylePicker(ctx());
    expect(out.presetId).toBe("editorial-graphic");
    expect(out.styleBible.presetId).toBe("editorial-graphic");
    expect(out.styleBible.musicMood).toBe("tense corporate");
    expect(out.musicMood).toBe("tense corporate");
  });

  it("falls back to cinematic-realistic when the model keeps failing", async () => {
    const err = Object.create(NoObjectGeneratedError.prototype);
    vi.mocked(generateObject).mockRejectedValue(err);
    const out = await runStylePicker(ctx());
    expect(out.presetId).toBe("cinematic-realistic");
    expect(out.styleBible.aspect).toBe("16:9");
  });
});
```

Run: `npm test -- longform/style-picker` → Expected: FAIL.

- [ ] **Step 2: Implement**

```typescript
// src/lib/agents/longform/style-picker.ts
import { generateObject, NoObjectGeneratedError } from "ai";
import { getClaudeModel } from "@/lib/ai/gateway";
import { getStylePreset, PRESET_IDS, type StyleBible } from "@/lib/longform/style-presets";
import { StylePickerOutputSchema } from "@/lib/agents/longform/types";
import type { LongformPlaybook } from "@/lib/agents/longform/playbook";

export interface StylePickerRunContext {
  topic: string;
  angle: string;
  playbook: LongformPlaybook;
}

export interface StylePickerResult {
  presetId: StyleBible["presetId"];
  musicMood: string;
  rationale: string;
  styleBible: StyleBible;
}

function buildPrompt(ctx: StylePickerRunContext): string {
  return `You are the Style Picker for a faceless longform documentary. Choose ONE visual style for the WHOLE video.
Topic: "${ctx.topic}"
Angle: "${ctx.angle}"

Options:
- "cinematic-realistic": photoreal cinematic footage, teal/amber dramatic grade. Best for history, true-story, immersive, science-mystery, human-interest.
- "editorial-graphic": bold flat editorial illustration. Best for finance, economics, tech, abstract/explainer topics where photoreal footage would look generic.

Also choose a short MUSIC MOOD phrase for a subtle, low-energy bed that sits well under the narration.

Return JSON: { "presetId": "cinematic-realistic" | "editorial-graphic", "musicMood": string, "rationale": string }.`;
}

async function callOnce(prompt: string): Promise<{ presetId: StyleBible["presetId"]; musicMood: string; rationale: string }> {
  const result = await generateObject({ model: getClaudeModel("claude-haiku-4-5"), schema: StylePickerOutputSchema, prompt });
  return StylePickerOutputSchema.parse(result.object);
}

function resolve(presetId: StyleBible["presetId"], musicMood: string, rationale: string): StylePickerResult {
  const base = getStylePreset(presetId);
  return { presetId, musicMood, rationale, styleBible: { ...base, musicMood } };
}

export async function runStylePicker(ctx: StylePickerRunContext): Promise<StylePickerResult> {
  const prompt = buildPrompt(ctx);
  try {
    const out = await callOnce(prompt);
    return resolve(out.presetId, out.musicMood, out.rationale);
  } catch (err) {
    if (!NoObjectGeneratedError.isInstance(err)) throw err;
    try {
      const out = await callOnce(prompt);
      return resolve(out.presetId, out.musicMood, out.rationale);
    } catch (retryErr) {
      if (!NoObjectGeneratedError.isInstance(retryErr)) throw retryErr;
      const fallback = PRESET_IDS[0]; // cinematic-realistic
      return resolve(fallback, getStylePreset(fallback).musicMood, "fallback: default cinematic preset");
    }
  }
}
```

Run: `npm test -- longform/style-picker` → Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agents/longform/style-picker.ts src/tests/lib/agents/longform/style-picker.test.ts
git commit -m "feat(longform): Style-picker → preset + music mood + resolved style bible"
```

### Task 13: Beat-planner

**Files:**
- Create: `src/lib/agents/longform/beat-planner.ts`
- Test: `src/tests/lib/agents/longform/beat-planner.test.ts`

The Beat-planner splits each chapter's narration into beats (pure), asks the LLM for one concrete scene description per beat (count must match), then assembles the final image prompts (pure). On LLM failure for a chapter it falls back to using the narration slice itself as the scene description — the video still renders.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/ai/gateway", () => ({ getClaudeModel: vi.fn(() => ({ __mock: "model" })) }));
vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateObject: vi.fn() };
});
import { generateObject, NoObjectGeneratedError } from "ai";
import { runBeatPlanner } from "@/lib/agents/longform/beat-planner";
import { getStylePreset } from "@/lib/longform/style-presets";
import { EMPTY_LONGFORM_PLAYBOOK } from "@/lib/agents/longform/playbook";

beforeEach(() => vi.mocked(generateObject).mockReset());

const ctx = () => ({
  styleBible: getStylePreset("cinematic-realistic"),
  playbook: EMPTY_LONGFORM_PLAYBOOK,
  chapters: [{ index: 0, title: "Reveal", narration: "A man walks on. The lights dim. Behind him, a glass ring. But it is under the sea." }],
});

describe("longform/beat-planner", () => {
  it("returns one beat per slice with an assembled, style-prefixed image prompt", async () => {
    // model returns exactly as many scenes as there are beats
    vi.mocked(generateObject).mockImplementation(async (args: { prompt: string }) => {
      const n = Number(args.prompt.match(/EXACTLY (\d+) scenes/)?.[1] ?? 1);
      return { object: { scenes: Array.from({ length: n }, (_, i) => `cinematic scene ${i}`) } } as never;
    });
    const out = await runBeatPlanner(ctx());
    expect(out.chapters).toHaveLength(1);
    const beats = out.chapters[0].beats;
    expect(beats.length).toBeGreaterThanOrEqual(1);
    beats.forEach((b, i) => {
      expect(b.index).toBe(i);
      expect(b.imagePrompt.startsWith(getStylePreset("cinematic-realistic").positivePrefix)).toBe(true);
      expect(b.negativePrompt).toBe(getStylePreset("cinematic-realistic").negativePrompt);
    });
  });

  it("falls back to the narration slice as the scene when the model fails", async () => {
    const err = Object.create(NoObjectGeneratedError.prototype);
    vi.mocked(generateObject).mockRejectedValue(err);
    const out = await runBeatPlanner(ctx());
    const beats = out.chapters[0].beats;
    expect(beats.length).toBeGreaterThanOrEqual(1);
    expect(beats[0].sceneDescription.length).toBeGreaterThan(0);
  });

  it("repairs a scene-count mismatch by padding/truncating to the beat count", async () => {
    vi.mocked(generateObject).mockResolvedValue({ object: { scenes: ["only one scene"] } } as never);
    const out = await runBeatPlanner(ctx());
    const beats = out.chapters[0].beats;
    expect(beats.every((b) => b.sceneDescription.length > 0)).toBe(true);
  });
});
```

Run: `npm test -- longform/beat-planner` → Expected: FAIL.

- [ ] **Step 2: Implement**

```typescript
// src/lib/agents/longform/beat-planner.ts
import { generateObject, NoObjectGeneratedError } from "ai";
import { getClaudeModel } from "@/lib/ai/gateway";
import { splitNarrationIntoBeats } from "@/lib/longform/beats";
import { assembleImagePrompt } from "@/lib/longform/image-prompt";
import { WORDS_PER_SECOND } from "@/lib/longform/duration";
import { SceneDescriptionsSchema, type BeatPlannerOutput } from "@/lib/agents/longform/types";
import type { StyleBible } from "@/lib/longform/style-presets";
import type { LongformPlaybook } from "@/lib/agents/longform/playbook";

export interface BeatPlannerRunContext {
  styleBible: StyleBible;
  playbook: LongformPlaybook;
  chapters: { index: number; title: string; narration: string }[];
}

function scenePrompt(styleBible: StyleBible, chapterTitle: string, slices: string[]): string {
  const numbered = slices.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return `You are the Beat Planner. For each narration beat below, describe ONE concrete, filmable VISUAL SCENE
that literally illustrates what is said at that moment (no random images). Subjects centered. Think like a
${styleBible.presetId} documentary. Describe the subject and setting only — do NOT include style/lighting/quality
words (those are added automatically). Keep each scene one vivid sentence.

Chapter: "${chapterTitle}"
Return EXACTLY ${slices.length} scenes, in order, as JSON: { "scenes": string[] }.
Beats:
${numbered}`;
}

async function sceneDescriptions(styleBible: StyleBible, chapterTitle: string, slices: string[]): Promise<string[]> {
  const prompt = scenePrompt(styleBible, chapterTitle, slices);
  const run = async () => {
    const result = await generateObject({ model: getClaudeModel("claude-sonnet-4-5"), schema: SceneDescriptionsSchema, prompt });
    return SceneDescriptionsSchema.parse(result.object).scenes;
  };
  let scenes: string[];
  try {
    scenes = await run();
  } catch (err) {
    if (!NoObjectGeneratedError.isInstance(err)) throw err;
    try {
      scenes = await run();
    } catch (retryErr) {
      if (!NoObjectGeneratedError.isInstance(retryErr)) throw retryErr;
      scenes = slices.slice(); // fallback: use the narration slice itself as the scene
    }
  }
  // Repair count mismatch: pad with the slice text, truncate extras.
  return slices.map((slice, i) => scenes[i] ?? slice);
}

export async function runBeatPlanner(ctx: BeatPlannerRunContext): Promise<BeatPlannerOutput> {
  const chapters = [];
  for (const ch of ctx.chapters) {
    const slices = splitNarrationIntoBeats(ch.narration, {
      targetBeatSeconds: ctx.styleBible.targetBeatSeconds,
      wordsPerSecond: WORDS_PER_SECOND,
    });
    const sliceTexts = slices.map((s) => s.text);
    const scenes = await sceneDescriptions(ctx.styleBible, ch.title, sliceTexts);
    const beats = slices.map((slice, i) => {
      const { prompt, negativePrompt } = assembleImagePrompt({ sceneDescription: scenes[i], styleBible: ctx.styleBible });
      return {
        index: i,
        narrationSlice: slice.text,
        estDurationSeconds: slice.estDurationSeconds,
        sceneDescription: scenes[i],
        imagePrompt: prompt,
        negativePrompt,
      };
    });
    chapters.push({ chapterIndex: ch.index, beats });
  }
  return { chapters };
}
```

Run: `npm test -- longform/beat-planner` → Expected: PASS. Then `npx tsc --noEmit`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agents/longform/beat-planner.ts src/tests/lib/agents/longform/beat-planner.test.ts
git commit -m "feat(longform): Beat-planner (pure split → per-beat scene → assembled prompt, with fallback)"
```

### Task 14: Longform voice selection (extend voice-coach.ts)

**Files:**
- Modify: `src/lib/agents/voice-coach.ts`
- Test: `src/tests/lib/agents/longform/voice.test.ts`

Reuse the shared `VOICE_POOL`/`VOICE_POOL_IDS` and the same model + retry/fallback shape, but with a longform-authoritative decision rule. **Read `src/lib/agents/voice-coach.ts` and `src/lib/agents/constants.ts` first** to reuse the exact exported `VOICE_POOL_IDS`, `VOICE_PROVIDERS`, and the `NoObjectGeneratedError` retry pattern already in the file.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/ai/gateway", () => ({ getClaudeModel: vi.fn(() => ({ __mock: "model" })) }));
vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateObject: vi.fn() };
});
import { generateObject, NoObjectGeneratedError } from "ai";
import { pickLongformVoice } from "@/lib/agents/voice-coach";
import { VOICE_POOL_IDS } from "@/lib/agents/constants";

beforeEach(() => vi.mocked(generateObject).mockReset());

describe("pickLongformVoice", () => {
  it("returns a voice from the shared pool at a measured speed", async () => {
    vi.mocked(generateObject).mockResolvedValue({ object: { voiceId: VOICE_POOL_IDS[3], provider: "cartesia", speed: 0.95, stability: 0.6, rationale: "deep, authoritative narrator suits a dramatic documentary cold open." } } as never);
    const out = await pickLongformVoice({ topic: "t", narrationSample: "A man walks on. The lights dim.", playbook: { voice: { bestVoiceIdByGenre: {} } } as never });
    expect(VOICE_POOL_IDS).toContain(out.voiceId);
    expect(out.speed).toBeGreaterThanOrEqual(0.8);
    expect(out.speed).toBeLessThanOrEqual(1.1);
  });

  it("falls back to a default authoritative voice when the model keeps failing", async () => {
    const err = Object.create(NoObjectGeneratedError.prototype);
    vi.mocked(generateObject).mockRejectedValue(err);
    const out = await pickLongformVoice({ topic: "t", narrationSample: "x", playbook: { voice: { bestVoiceIdByGenre: {} } } as never });
    expect(VOICE_POOL_IDS).toContain(out.voiceId);
    expect(out.provider).toBe("cartesia");
  });
});
```

Run: `npm test -- longform/voice` → Expected: FAIL.

- [ ] **Step 2: Implement (append to `src/lib/agents/voice-coach.ts`)**

Add — reusing the file's existing `VOICE_POOL_IDS`, `VOICE_PROVIDERS`, `getClaudeModel`, and `NoObjectGeneratedError` imports (add any that are missing):

```typescript
// --- Longform voice selection (reuses the shared voice pool + retry/fallback) ---
import type { LongformPlaybook } from "@/lib/agents/longform/playbook";

export const LongformVoiceSchema = z.object({
  voiceId: z.enum(VOICE_POOL_IDS),
  provider: z.enum([...VOICE_PROVIDERS]),
  speed: z.number().min(0.8).max(1.1),
  stability: z.number().min(0).max(1),
  rationale: z.string().min(10).max(400),
});
export type LongformVoiceOutput = z.infer<typeof LongformVoiceSchema>;

export interface LongformVoiceArgs {
  topic: string;
  narrationSample: string;
  playbook: LongformPlaybook;
}

// Authoritative narrator default (Ronald — Thinker: intense, deep, dramatic weight).
const LONGFORM_DEFAULT_VOICE_ID = "5ee9feff-1265-424a-9d7f-8e4d431a12c7";

function buildLongformVoicePrompt(args: LongformVoiceArgs): string {
  return `You are the Voice Coach for a faceless longform documentary. Pick ONE narrator voice from the pool.
This is measured, authoritative, suspense-building narration (NOT hype). Prefer a deep, steady, dramatic voice;
choose a speed between 0.90 and 1.00 (measured pacing with room for pauses).

Topic: "${args.topic}"
Narration sample:
${args.narrationSample.slice(0, 600)}

Voice pool (pick a voiceId from this list only):
${VOICE_POOL.map((v) => `- ${v.id} (${v.provider}): ${v.description}`).join("\n")}

Return JSON: { "voiceId", "provider", "speed", "stability", "rationale" }.`;
}

async function callLongformVoiceOnce(prompt: string): Promise<LongformVoiceOutput> {
  const result = await generateObject({ model: getClaudeModel("claude-haiku-4-5"), schema: LongformVoiceSchema, prompt });
  return LongformVoiceSchema.parse(result.object);
}

export async function pickLongformVoice(args: LongformVoiceArgs): Promise<LongformVoiceOutput> {
  const prompt = buildLongformVoicePrompt(args);
  try {
    return await callLongformVoiceOnce(prompt);
  } catch (err) {
    if (!NoObjectGeneratedError.isInstance(err)) throw err;
    try {
      return await callLongformVoiceOnce(prompt);
    } catch (retryErr) {
      if (!NoObjectGeneratedError.isInstance(retryErr)) throw retryErr;
      return { voiceId: LONGFORM_DEFAULT_VOICE_ID, provider: "cartesia", speed: 0.95, stability: 0.6, rationale: "fallback: default authoritative narrator" };
    }
  }
}
```

> If `VOICE_POOL`, `VOICE_POOL_IDS`, or `VOICE_PROVIDERS` are not already imported at the top of `voice-coach.ts`, add them from `@/lib/agents/constants`. Confirm `LONGFORM_DEFAULT_VOICE_ID` is a member of `VOICE_POOL_IDS` (it is the "Ronald — Thinker" id).

Run: `npm test -- longform/voice` → Expected: PASS. Then `npx tsc --noEmit`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agents/voice-coach.ts src/tests/lib/agents/longform/voice.test.ts
git commit -m "feat(longform): pickLongformVoice — authoritative narrator (reuses voice pool + fallback)"
```

### Task 15: Orchestrator + persistence + ledger + enqueue

**Files:**
- Modify: `src/lib/agents/types.ts` (extend `AgentId`)
- Create: `src/lib/agents/longform/orchestrator.ts`
- Create: `src/lib/supabase/repositories/longform.ts`
- Modify: `src/lib/supabase/repositories/decisions.ts` (add `yourVideoId` + `recordLongformLedger`)
- Test: `src/tests/lib/agents/longform/orchestrator.test.ts`

This is the integration seam: it runs the 4 agents, assembles the `LongformPlan`, persists the draft + plan, writes the ledger rows, enqueues the render job, and yields `StreamEvent`s. Agents and DB writes are dependency-injected so the test runs with everything mocked (no network, no DB).

- [ ] **Step 1: Extend `AgentId`** in `src/lib/agents/types.ts`:

```typescript
export type AgentId = "strategist" | "writer" | "voice_coach" | "director" | "composer" | "style_picker" | "beat_planner";
```

- [ ] **Step 2: Add the longform repository** `src/lib/supabase/repositories/longform.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LongformPlan } from "@/lib/agents/longform/types";

export interface CreateLongformDraftArgs {
  channelId: string;
  topic: string;
  targetDurationSeconds: number;
  presetId: string;
  plan: LongformPlan;
  description: string | null;
}

export async function createLongformDraft(supabase: SupabaseClient, args: CreateLongformDraftArgs): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("your_videos")
    .insert({
      channel_id: args.channelId,
      title: args.topic,
      script: args.plan.hook,
      description: args.description,
      status: "draft",
      format: "longform",
      orientation: "16:9",
      target_duration_seconds: args.targetDurationSeconds,
      style_preset_id: args.presetId,
      voice_provider: args.plan.voice.provider,
      voice_id: args.plan.voice.voiceId,
      longform_plan: args.plan as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createLongformDraft: ${error.message}`);
  return { id: data.id };
}
```

- [ ] **Step 3: Extend `recordDecision` + add `recordLongformLedger`** in `src/lib/supabase/repositories/decisions.ts`. Add `yourVideoId?: string` to the existing `recordDecision` args object and include `your_video_id: args.yourVideoId ?? null` in the insert. Then add:

```typescript
import type { LedgerRow } from "@/lib/longform/ledger";

export async function recordLongformLedger(supabase: SupabaseClient, rows: LedgerRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from("decisions").insert(
    rows.map((r) => ({
      agent_id: r.agentId,
      job_id: r.jobId,
      your_video_id: r.yourVideoId,
      decision_type: r.decisionType,
      inputs: r.inputs,
      chosen: r.chosen,
      reasoning: r.reasoning,
    })),
  );
  if (error) throw new Error(`recordLongformLedger: ${error.message}`);
}
```

- [ ] **Step 4: Write the failing orchestrator test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { runLongformPipeline, type LongformPipelineDeps } from "@/lib/agents/longform/orchestrator";
import { getStylePreset } from "@/lib/longform/style-presets";

function deps(): LongformPipelineDeps {
  return {
    runWriter: vi.fn(async () => ({ angle: "a", hook: "h", estimatedWords: 100, chapters: [{ title: "C1", purpose: "p", narration: "A man walks on. The lights dim." }] })),
    runStylePicker: vi.fn(async () => ({ presetId: "cinematic-realistic", musicMood: "cinematic", rationale: "r", styleBible: getStylePreset("cinematic-realistic") })),
    runBeatPlanner: vi.fn(async () => ({ chapters: [{ chapterIndex: 0, beats: [{ index: 0, narrationSlice: "A man walks on.", estDurationSeconds: 4, sceneDescription: "s", imagePrompt: "ip", negativePrompt: "no text" }] }] })),
    pickVoice: vi.fn(async () => ({ voiceId: "5ee9feff-1265-424a-9d7f-8e4d431a12c7", provider: "cartesia", speed: 0.95, stability: 0.6, rationale: "r" })),
    createJob: vi.fn(async () => ({ id: "job1" })),
    createDraft: vi.fn(async () => ({ id: "yv1" })),
    recordLedger: vi.fn(async () => {}),
    enqueueRender: vi.fn(async () => ({ id: "rj1" })),
    finishJob: vi.fn(async () => {}),
    failJob: vi.fn(async () => {}),
  };
}

async function collect(gen: AsyncGenerator<{ type: string }>) {
  const events = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe("longform/orchestrator", () => {
  it("runs all agents, persists, enqueues render, and emits a job_completed event", async () => {
    const d = deps();
    const events = await collect(runLongformPipeline({ topic: "t", targetDurationSeconds: 540, channelId: "ch1" }, d));
    const types = events.map((e) => e.type);
    expect(types).toContain("job_started");
    expect(types).toContain("job_completed");
    expect(d.createDraft).toHaveBeenCalledOnce();
    expect(d.recordLedger).toHaveBeenCalledOnce();
    expect(d.enqueueRender).toHaveBeenCalledWith(expect.objectContaining({ yourVideoId: "yv1" }));
  });

  it("emits job_failed and calls failJob if an agent throws", async () => {
    const d = deps();
    (d.runWriter as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("writer boom"));
    const events = await collect(runLongformPipeline({ topic: "t", targetDurationSeconds: 540, channelId: "ch1" }, d));
    expect(events.some((e) => e.type === "job_failed")).toBe(true);
    expect(d.failJob).toHaveBeenCalledOnce();
    expect(d.enqueueRender).not.toHaveBeenCalled();
  });
});
```

Run: `npm test -- longform/orchestrator` → Expected: FAIL.

- [ ] **Step 5: Implement the orchestrator** `src/lib/agents/longform/orchestrator.ts`:

```typescript
import type { StreamEvent } from "@/lib/agents/types";
import { LongformPlanSchema, type LongformPlan } from "@/lib/agents/longform/types";
import { clampTargetDuration } from "@/lib/longform/duration";
import { buildLongformLedgerRows, type LedgerRow } from "@/lib/longform/ledger";
import { EMPTY_LONGFORM_PLAYBOOK } from "@/lib/agents/longform/playbook";
import { runLongformWriter } from "@/lib/agents/longform/writer";
import { runStylePicker, type StylePickerResult } from "@/lib/agents/longform/style-picker";
import { runBeatPlanner } from "@/lib/agents/longform/beat-planner";
import { pickLongformVoice } from "@/lib/agents/voice-coach";

export interface LongformPipelineArgs {
  topic: string;
  targetDurationSeconds: number;
  channelId: string;
}

// All side-effecting deps are injected so the orchestrator is unit-testable with no network/DB.
export interface LongformPipelineDeps {
  runWriter: typeof runLongformWriter;
  runStylePicker: typeof runStylePicker;
  runBeatPlanner: typeof runBeatPlanner;
  pickVoice: typeof pickLongformVoice;
  createJob: (args: { channelId: string }) => Promise<{ id: string }>;
  createDraft: (args: { channelId: string; topic: string; targetDurationSeconds: number; presetId: string; plan: LongformPlan; description: string | null }) => Promise<{ id: string }>;
  recordLedger: (rows: LedgerRow[]) => Promise<void>;
  enqueueRender: (args: { yourVideoId: string }) => Promise<{ id: string }>;
  finishJob: (jobId: string) => Promise<void>;
  failJob: (jobId: string, error: string) => Promise<void>;
}

export async function* runLongformPipeline(args: LongformPipelineArgs, deps: LongformPipelineDeps): AsyncGenerator<StreamEvent> {
  const target = clampTargetDuration(args.targetDurationSeconds);
  const job = await deps.createJob({ channelId: args.channelId });
  yield { type: "job_started", data: { jobId: job.id, topicId: args.topic, channelId: args.channelId, startedAt: new Date().toISOString() } };
  const playbook = EMPTY_LONGFORM_PLAYBOOK;

  try {
    // 1. Writer
    yield { type: "agent_state", data: { agent: "writer", state: "working" } };
    const writer = await deps.runWriter({ topic: args.topic, targetDurationSeconds: target, playbook });
    yield { type: "agent_output", data: { agent: "writer", output: writer } };
    yield { type: "agent_done", data: { agent: "writer", durationMs: 0 } };

    // 2. Style-picker
    yield { type: "agent_state", data: { agent: "style_picker", state: "working" } };
    const style: StylePickerResult = await deps.runStylePicker({ topic: args.topic, angle: writer.angle, playbook });
    yield { type: "agent_output", data: { agent: "style_picker", output: style } };
    yield { type: "agent_done", data: { agent: "style_picker", durationMs: 0 } };

    // 3. Beat-planner
    yield { type: "agent_state", data: { agent: "beat_planner", state: "working" } };
    const beatPlan = await deps.runBeatPlanner({
      styleBible: style.styleBible,
      playbook,
      chapters: writer.chapters.map((c, i) => ({ index: i, title: c.title, narration: c.narration })),
    });
    yield { type: "agent_output", data: { agent: "beat_planner", output: { beatCount: beatPlan.chapters.flatMap((c) => c.beats).length } } };
    yield { type: "agent_done", data: { agent: "beat_planner", durationMs: 0 } };

    // 4. Voice
    yield { type: "agent_state", data: { agent: "voice_coach", state: "working" } };
    const voice = await deps.pickVoice({ topic: args.topic, narrationSample: writer.hook, playbook });
    yield { type: "agent_output", data: { agent: "voice_coach", output: voice } };
    yield { type: "agent_done", data: { agent: "voice_coach", durationMs: 0 } };

    // Assemble + validate the plan.
    const plan: LongformPlan = LongformPlanSchema.parse({
      topic: args.topic,
      targetDurationSeconds: target,
      presetId: style.presetId,
      styleBible: style.styleBible,
      musicMood: style.musicMood,
      angle: writer.angle,
      hook: writer.hook,
      voice: { provider: voice.provider, voiceId: voice.voiceId, speed: voice.speed, stability: voice.stability },
      estimatedWords: writer.estimatedWords,
      captionsEnabled: false,
      chapters: writer.chapters.map((c, i) => ({
        index: i,
        title: c.title,
        purpose: c.purpose,
        narration: c.narration,
        beats: beatPlan.chapters.find((bp) => bp.chapterIndex === i)?.beats ?? [],
      })),
    });

    const draft = await deps.createDraft({ channelId: args.channelId, topic: args.topic, targetDurationSeconds: target, presetId: style.presetId, plan, description: null });
    await deps.recordLedger(buildLongformLedgerRows(plan, { jobId: job.id, yourVideoId: draft.id }));
    await deps.enqueueRender({ yourVideoId: draft.id });
    await deps.finishJob(job.id);
    yield { type: "job_completed", data: { videoId: draft.id } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.failJob(job.id, message);
    yield { type: "job_failed", data: { agent: "writer", error: message } };
  }
}
```

Run: `npm test -- longform/orchestrator` → Expected: PASS. Then `npx tsc --noEmit` and `npm test`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agents/types.ts src/lib/agents/longform/orchestrator.ts src/lib/supabase/repositories/longform.ts src/lib/supabase/repositories/decisions.ts src/tests/lib/agents/longform/orchestrator.test.ts
git commit -m "feat(longform): pipeline orchestrator — runs agents, persists plan + ledger, enqueues render"
```

---

## Phase 3 — Dispatch route + job/render wiring

### Task 16: Longform job + render-job payload + enqueue

**Files:**
- Modify: `src/lib/supabase/repositories/jobs.ts` (add `createProduceLongformJob`)
- Modify: `src/lib/render/job-payload.ts` (add `RenderLongformPayload`)
- Modify: `src/lib/supabase/repositories/render-jobs.ts` (add `'render_longform'` to `RenderJobType`)
- Test: `src/tests/lib/render/job-payload.test.ts`

- [ ] **Step 1: Add `'render_longform'` to the `RenderJobType` union** in `src/lib/supabase/repositories/render-jobs.ts`:

```typescript
export type RenderJobType = 'clip_ingest' | 'render_f1' | 'render_f2' | 'upload' | 'render_longform';
```

- [ ] **Step 2: Add the payload schema** in `src/lib/render/job-payload.ts`:

```typescript
export const RenderLongformPayload = z.object({
  your_video_id: z.string().uuid(),
});
```

- [ ] **Step 3: Add `createProduceLongformJob`** in `src/lib/supabase/repositories/jobs.ts` — mirror `createProduceVideoJob` but with `kind: 'produce_longform_video'`, `current_agent: 'writer'`, `current_step: 'writer'`, no `topic_queue_id`:

```typescript
export async function createProduceLongformJob(
  supabase: SupabaseClient,
  args: { channelId: string },
): Promise<Job> {
  const { data, error } = await supabase
    .from("jobs")
    .insert({ kind: "produce_longform_video", channel_id: args.channelId, status: "running", current_agent: "writer", current_step: "writer", progress_pct: 0 })
    .select("*")
    .single();
  if (error) throw new Error(`createProduceLongformJob: ${error.message}`);
  return data as Job;
}
```

- [ ] **Step 4: Write + run the payload test**

```typescript
import { describe, it, expect } from "vitest";
import { RenderLongformPayload } from "@/lib/render/job-payload";

describe("RenderLongformPayload", () => {
  it("accepts a uuid your_video_id", () => {
    expect(RenderLongformPayload.parse({ your_video_id: "11111111-1111-1111-1111-111111111111" }).your_video_id).toBeTruthy();
  });
  it("rejects a non-uuid", () => {
    expect(() => RenderLongformPayload.parse({ your_video_id: "nope" })).toThrow();
  });
});
```

Run: `npm test -- job-payload` → Expected: PASS. Then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/repositories/jobs.ts src/lib/render/job-payload.ts src/lib/supabase/repositories/render-jobs.ts src/tests/lib/render/job-payload.test.ts
git commit -m "feat(longform): produce_longform_video job + render_longform payload/type"
```

### Task 17: Dispatch route (SSE)

**Files:**
- Create: `src/lib/agents/longform/deps.ts` (real-deps factory)
- Create: `src/app/api/lab/longform/dispatch/route.ts`

> **Project rule — read first:** before writing this route, read the relevant guide under `node_modules/next/dist/docs/` (App Router route handlers / streaming responses). This route deliberately mirrors the already-working `src/app/api/lab/dispatch/route.ts` (same `export const dynamic = "force-dynamic"`, `export const maxDuration = 300`, same `ReadableStream` + `encodeSseEvent` shape).

- [ ] **Step 1: Real-deps factory** `src/lib/agents/longform/deps.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LongformPipelineDeps } from "@/lib/agents/longform/orchestrator";
import { runLongformWriter } from "@/lib/agents/longform/writer";
import { runStylePicker } from "@/lib/agents/longform/style-picker";
import { runBeatPlanner } from "@/lib/agents/longform/beat-planner";
import { pickLongformVoice } from "@/lib/agents/voice-coach";
import { createProduceLongformJob, finishJobSuccess, finishJobFailure } from "@/lib/supabase/repositories/jobs";
import { createLongformDraft } from "@/lib/supabase/repositories/longform";
import { recordLongformLedger } from "@/lib/supabase/repositories/decisions";
import { enqueueRenderJob } from "@/lib/supabase/repositories/render-jobs";

export function buildLongformDeps(supabase: SupabaseClient): LongformPipelineDeps {
  return {
    runWriter: runLongformWriter,
    runStylePicker,
    runBeatPlanner,
    pickVoice: pickLongformVoice,
    createJob: (a) => createProduceLongformJob(supabase, a),
    createDraft: (a) => createLongformDraft(supabase, a),
    recordLedger: (rows) => recordLongformLedger(supabase, rows),
    enqueueRender: (a) => enqueueRenderJob(supabase, { jobType: "render_longform", payload: { your_video_id: a.yourVideoId }, yourVideoId: a.yourVideoId }).then((j) => ({ id: j.id })),
    finishJob: (jobId) => finishJobSuccess(supabase, jobId),
    failJob: (jobId, error) => finishJobFailure(supabase, jobId, error),
  };
}
```

> Verify `finishJobSuccess`/`finishJobFailure` signatures in `jobs.ts` and adapt the arrow bodies if they differ (e.g. take an args object).

- [ ] **Step 2: The route** `src/app/api/lab/longform/dispatch/route.ts` (mirror the shorts route):

```typescript
import { getServiceClient } from "@/lib/supabase/server";
import { encodeSseEvent } from "@/lib/sse";
import { runLongformPipeline } from "@/lib/agents/longform/orchestrator";
import { buildLongformDeps } from "@/lib/agents/longform/deps";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as { topic?: unknown; targetDurationSeconds?: unknown; channelId?: unknown };
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  const channelId = typeof body.channelId === "string" ? body.channelId : "";
  const targetDurationSeconds = typeof body.targetDurationSeconds === "number" ? body.targetDurationSeconds : 540;
  if (!topic || !channelId) {
    return new Response(JSON.stringify({ error: "topic and channelId are required" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const supabase = getServiceClient();
  const deps = buildLongformDeps(supabase);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runLongformPipeline({ topic, targetDurationSeconds, channelId }, deps)) {
          controller.enqueue(encodeSseEvent(event));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(encodeSseEvent({ type: "job_failed", data: { agent: "writer", error: message } }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit` → Expected: PASS. Run: `npm run build` → Expected: the new route compiles.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agents/longform/deps.ts src/app/api/lab/longform/dispatch/route.ts
git commit -m "feat(longform): SSE dispatch route + real-deps factory"
```

---

## Phase 4 — Render worker (`scripts/render-worker`)

> The worker is a separate Node project (`tsx`, ES2022, strict). It **cannot import `src/*`**. Pure helpers are copied in (the `pexels.ts` precedent). The worker has no vitest runner; its correctness is verified by `cd scripts/render-worker && npx tsc --noEmit` and by the (gated) live render. The pure logic was already unit-tested on the src side (Tasks 6–8). After each worker task: `cd scripts/render-worker && npx tsc --noEmit`.

### Task 18: Mirror pure helpers into the worker

**Files:**
- Create: `scripts/render-worker/lib/ken-burns.ts`
- Create: `scripts/render-worker/lib/chapters.ts`
- Create: `scripts/render-worker/lib/tts-chunks.ts`

- [ ] **Step 1: Copy `ken-burns.ts`** verbatim from `src/lib/longform/ken-burns.ts` into `scripts/render-worker/lib/ken-burns.ts`, prepend the header comment:

```typescript
// Mirror of src/lib/longform/ken-burns.ts — worker cannot import src/*. Keep in sync.
```

- [ ] **Step 2: Copy `chapters.ts`** verbatim from `src/lib/longform/chapters.ts` into `scripts/render-worker/lib/chapters.ts` with the same mirror header.

- [ ] **Step 3: Copy `tts-chunks.ts` — self-contained.** The src version imports `splitIntoSentences` from `beats.ts`; the worker copy must NOT import `src/*`, so inline `splitIntoSentences`:

```typescript
// Mirror of src/lib/longform/tts-chunks.ts (+ splitIntoSentences from beats.ts, inlined) —
// worker cannot import src/*. Keep in sync.

const SENTENCE_RE = /[^.!?]+[.!?]+(?:["'”’)\]]+)?|\S[^.!?]*$/g;

export function splitIntoSentences(text: string): string[] {
  const matches = text.match(SENTENCE_RE);
  if (!matches) return [];
  return matches.map((s) => s.trim()).filter((s) => s.length > 0);
}

export function planTtsChunks(text: string, maxChars: number): string[] {
  const sentences = splitIntoSentences(text);
  const chunks: string[] = [];
  let current = "";
  for (const s of sentences) {
    if (current === "") current = s;
    else if (current.length + 1 + s.length <= maxChars) current = `${current} ${s}`;
    else { chunks.push(current); current = s; }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function cumulativeOffsets(durations: number[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const d of durations) { offsets.push(acc); acc += d; }
  return offsets;
}
```

- [ ] **Step 4: Typecheck + commit**

Run: `cd scripts/render-worker && npx tsc --noEmit` → Expected: PASS.
```bash
git add scripts/render-worker/lib/ken-burns.ts scripts/render-worker/lib/chapters.ts scripts/render-worker/lib/tts-chunks.ts
git commit -m "feat(longform-worker): mirror ken-burns / chapters / tts-chunks pure helpers"
```

### Task 19: Landscape ffmpeg helpers (gradient still, Ken-Burns clip, compose)

**Files:**
- Create: `scripts/render-worker/lib/ffmpeg-longform.ts`

Reuse the existing `runFfmpeg` from `scripts/render-worker/lib/ffmpeg-commands.ts`. **Read that file first** to confirm `runFfmpeg`'s exact export/signature (it wraps `ffmpeg-static`).

- [ ] **Step 1: Implement**

```typescript
// scripts/render-worker/lib/ffmpeg-longform.ts
// Landscape (1920x1080) longform render helpers. Mirrors the vertical helpers in
// ffmpeg-commands.ts but targets 16:9 and adds Ken-Burns + a subtle music bed.
import { runFfmpeg } from "./ffmpeg-commands.js";
import { buildKenBurnsFilter, type KenBurnsDirection } from "./ken-burns.js";
import { buildConcatList } from "./chapters.js";
import { writeFile } from "node:fs/promises";

const FPS = 30;

/** Style-consistent 1920x1080 gradient PNG (degraded fallback when image-gen is unavailable). */
export async function renderGradientStill(args: { hexA: string; hexB: string; outputPath: string }): Promise<void> {
  await runFfmpeg([
    "-y", "-f", "lavfi",
    "-i", `gradients=s=1920x1080:c0=0x${args.hexA}:c1=0x${args.hexB}:x0=0:y0=0:x1=1920:y1=1080`,
    "-frames:v", "1", args.outputPath,
  ]);
}

/** Animate a still into a 1920x1080 H.264 clip with a slow Ken-Burns move (no audio). */
export async function renderKenBurnsClip(args: {
  imagePath: string; durationSeconds: number; direction: KenBurnsDirection; zoom: number; outputPath: string;
}): Promise<void> {
  const filter = buildKenBurnsFilter({ durationSeconds: args.durationSeconds, fps: FPS, direction: args.direction, zoom: args.zoom });
  await runFfmpeg([
    "-y", "-loop", "1", "-i", args.imagePath,
    "-t", args.durationSeconds.toFixed(3),
    "-vf", filter,
    "-r", String(FPS),
    "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
    args.outputPath,
  ]);
}

/** Mux a chapter's voiceover onto its (silent) beat-concat video. */
export async function muxChapterAudio(args: { videoPath: string; voicePath: string; outputPath: string }): Promise<void> {
  await runFfmpeg([
    "-y", "-i", args.videoPath, "-i", args.voicePath,
    "-map", "0:v", "-map", "1:a",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest",
    args.outputPath,
  ]);
}

/** Concat chapter clips (each video+VO) into one continuous track. Re-encodes for safe concat. */
export async function concatChapterClips(args: { clipPaths: string[]; listPath: string; outputPath: string }): Promise<void> {
  await writeFile(args.listPath, buildConcatList(args.clipPaths), "utf8");
  await runFfmpeg([
    "-y", "-f", "concat", "-safe", "0", "-i", args.listPath,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart", args.outputPath,
  ]);
}

/** Mux a subtle music bed under the narration (lower than shorts' 0.25; fade in/out). */
export async function muxMusicBed(args: { videoPath: string; musicPath: string; durationSeconds: number; outputPath: string; volume?: number }): Promise<void> {
  const vol = args.volume ?? 0.12;
  const fadeOutStart = Math.max(0, args.durationSeconds - 2);
  await runFfmpeg([
    "-y", "-i", args.videoPath, "-stream_loop", "-1", "-i", args.musicPath,
    "-filter_complex",
    `[1:a]volume=${vol},afade=t=in:st=0:d=2,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=2[m];[0:a][m]amix=inputs=2:duration=first[a]`,
    "-map", "0:v", "-map", "[a]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
    args.outputPath,
  ]);
}
```

> If `runFfmpeg` is not exported from `ffmpeg-commands.ts`, export it (it is used internally there). Confirm the `.js` import extensions match the worker's module resolution (the worker uses ESM with `allowImportingTsExtensions` — match the existing import style in `render-f1.ts`).

- [ ] **Step 2: Typecheck + commit**

Run: `cd scripts/render-worker && npx tsc --noEmit` → Expected: PASS.
```bash
git add scripts/render-worker/lib/ffmpeg-longform.ts
git commit -m "feat(longform-worker): landscape ffmpeg helpers (gradient, Ken-Burns, concat, music bed)"
```

### Task 20: Chunked Cartesia TTS (worker)

**Files:**
- Create: `scripts/render-worker/lib/cartesia-longform.ts`

Reuse the existing `synthesizeToWav` from `scripts/render-worker/lib/cartesia.ts` per chunk, then concat the chunk WAVs. **Read `cartesia.ts` first** to confirm `synthesizeToWav({ script, voiceId, outputPath }) → { durationSeconds }`.

- [ ] **Step 1: Implement**

```typescript
// scripts/render-worker/lib/cartesia-longform.ts
// Synthesize long chapter narration by chunking at sentence boundaries, synthesizing each
// chunk, and concatenating the WAVs. Reuses the single-shot synthesizeToWav primitive.
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { synthesizeToWav } from "./cartesia.js";
import { runFfmpeg } from "./ffmpeg-commands.js";
import { probeDurationSeconds } from "./probe.js";
import { planTtsChunks } from "./tts-chunks.js";

const MAX_CHUNK_CHARS = 1200; // Cartesia handles long text, but chunking bounds retries + memory.

export async function synthesizeChapterToWav(args: {
  narration: string; voiceId: string; workDir: string; chapterIndex: number;
}): Promise<{ wavPath: string; durationSeconds: number }> {
  const chunks = planTtsChunks(args.narration, MAX_CHUNK_CHARS);
  const chunkPaths: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const out = join(args.workDir, `ch${args.chapterIndex}_chunk${i}.wav`);
    // Per-chunk retry: one bounded retry so a transient failure fails only its chunk.
    try {
      await synthesizeToWav({ script: chunks[i], voiceId: args.voiceId, outputPath: out });
    } catch {
      await synthesizeToWav({ script: chunks[i], voiceId: args.voiceId, outputPath: out });
    }
    chunkPaths.push(out);
  }
  const wavPath = join(args.workDir, `ch${args.chapterIndex}_vo.wav`);
  if (chunkPaths.length === 1) {
    // Single chunk: just re-point.
    const dur = await probeDurationSeconds(chunkPaths[0]);
    return { wavPath: chunkPaths[0], durationSeconds: dur };
  }
  const listPath = join(args.workDir, `ch${args.chapterIndex}_vo_list.txt`);
  await writeFile(listPath, chunkPaths.map((p) => `file '${p}'`).join("\n") + "\n", "utf8");
  await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", wavPath]);
  const durationSeconds = await probeDurationSeconds(wavPath);
  return { wavPath, durationSeconds };
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd scripts/render-worker && npx tsc --noEmit` → Expected: PASS.
```bash
git add scripts/render-worker/lib/cartesia-longform.ts
git commit -m "feat(longform-worker): chunked Cartesia TTS per chapter"
```

### Task 21: Higgsfield image-gen module (gated)

**Files:**
- Create: `scripts/render-worker/lib/higgsfield.ts`

Higgsfield is the **deferred, paid, CLI-authed** dependency. The module exists and is type-correct; the live call is the documented follow-up. When the credential is absent it returns `{ ok: false }` so the handler degrades to a gradient still — the full pipeline runs end-to-end without Higgsfield.

- [ ] **Step 1: Implement**

```typescript
// scripts/render-worker/lib/higgsfield.ts
// Gated Higgsfield (GPT-Image-class) generation. The live CLI/API wiring is deferred to
// Darius's paid plan; until HIGGSFIELD_ENABLED is set with a working credential, this
// returns { ok: false } and the handler falls back to a style-consistent gradient still.

export interface GenerateImageArgs {
  prompt: string;
  negativePrompt: string;
  outputPath: string;
  /** 16:9 target; the model is asked for the widest native aspect it supports. */
  aspect: "16:9";
}

export interface GenerateImageResult { ok: boolean; reason?: string }

function isEnabled(): boolean {
  return process.env.HIGGSFIELD_ENABLED === "1" && Boolean(process.env.HIGGSFIELD_API_KEY || process.env.HIGGSFIELD_TOKEN);
}

export async function generateImage(args: GenerateImageArgs): Promise<GenerateImageResult> {
  if (!isEnabled()) return { ok: false, reason: "higgsfield disabled (no credential)" };
  // DEFERRED: wire the Higgsfield CLI/API here (auth via HIGGSFIELD_TOKEN), write a 1920x1080
  // PNG to args.outputPath using args.prompt/args.negativePrompt, then `return { ok: true }`.
  // One bounded retry on transient failure; on hard failure return { ok: false } to degrade.
  try {
    await callHiggsfield(args);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

// Placeholder for the deferred live integration. Throws until wired so callers degrade safely.
async function callHiggsfield(_args: GenerateImageArgs): Promise<void> {
  throw new Error("higgsfield live integration not yet wired (deferred CLI-auth)");
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd scripts/render-worker && npx tsc --noEmit` → Expected: PASS.
```bash
git add scripts/render-worker/lib/higgsfield.ts
git commit -m "feat(longform-worker): gated Higgsfield image-gen interface (degrades to gradient)"
```

### Task 22: `render-longform` handler + run.ts registration

**Files:**
- Create: `scripts/render-worker/handlers/render-longform.ts`
- Modify: `scripts/render-worker/run.ts` (switch case)

**Read `scripts/render-worker/handlers/render-f1.ts` first** to mirror the `trace`/error-class pattern, work-dir setup, blob upload (`uploadMp4ToBlob`), `probeDurationSeconds`, `pickAndDownloadMusic`, and the `{ render_artifact_url, duration_seconds_actual, debug_trace }` return shape.

**Cost note (log it):** at the per-preset cadence an 8–10 min video is ~110–170 beats and a 20 min video up to ~340. Image generation is the wall-clock + credit bottleneck. In L1 (Higgsfield off) every beat is a fast gradient still, so the full render is cheap; with Higgsfield on, generate beats with bounded concurrency and `log()` the count so cost is never silently large.

- [ ] **Step 1: Implement the handler**

```typescript
// scripts/render-worker/handlers/render-longform.ts
// Chapter-batched longform render: chunked TTS per chapter, one image per beat (Higgsfield
// or gradient fallback), Ken-Burns landscape clips, per-chapter compose, concat, subtle music
// bed, chapter markers. Idempotent per chapter so a failed chapter is resumable.
import type { SupabaseClient } from "@supabase/supabase-js";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { synthesizeChapterToWav } from "../lib/cartesia-longform.js";
import { generateImage } from "../lib/higgsfield.js";
import { renderGradientStill, renderKenBurnsClip, muxChapterAudio, concatChapterClips, muxMusicBed } from "../lib/ffmpeg-longform.js";
import { runFfmpeg } from "../lib/ffmpeg-commands.js";
import { buildChapterMarkers } from "../lib/chapters.js";
import { probeDurationSeconds } from "../lib/probe.js";
import { uploadMp4ToBlob } from "../lib/blob.js";
import { pickAndDownloadMusic } from "../lib/music.js";

export class RenderLongformError extends Error {
  constructor(message: string, public trace: string) { super(message); this.name = "RenderLongformError"; }
}

const KEN_BURNS_DIRECTIONS = ["in", "right", "in", "left"] as const;

// Per-preset gradient fallback colors (teal→amber for cinematic; neutral→accent for editorial).
const GRADIENT_COLORS: Record<string, { hexA: string; hexB: string }> = {
  "cinematic-realistic": { hexA: "0b2027", hexB: "8a5a2b" },
  "editorial-graphic": { hexA: "121316", hexB: "2b6cb0" },
};

interface PlanBeat { index: number; estDurationSeconds: number; imagePrompt: string; negativePrompt: string }
interface PlanChapter { index: number; title: string; narration: string; beats: PlanBeat[] }
interface LongformPlan {
  presetId: string;
  styleBible: { kenBurnsZoom: number };
  voice: { voiceId: string };
  chapters: PlanChapter[];
}

export async function runRenderLongform(job: { id: string; payload: unknown }, supabase: SupabaseClient): Promise<Record<string, unknown>> {
  const trace: string[] = [];
  const log = (m: string) => { trace.push(`[${new Date().toISOString()}] ${m}`); };
  try {
    const payload = job.payload as { your_video_id: string };
    log(`render-longform start video=${payload.your_video_id}`);

    const { data: video, error } = await supabase.from("your_videos").select("id, longform_plan, style_preset_id").eq("id", payload.your_video_id).single();
    if (error || !video) throw new Error(`load draft: ${error?.message ?? "not found"}`);
    const plan = video.longform_plan as unknown as LongformPlan;
    const presetId = video.style_preset_id ?? plan.presetId;
    const gradient = GRADIENT_COLORS[presetId] ?? GRADIENT_COLORS["cinematic-realistic"];
    const zoom = plan.styleBible?.kenBurnsZoom ?? 0.05;

    const workDir = join("/tmp", `lf_${payload.your_video_id}`);
    await mkdir(workDir, { recursive: true });

    const chapterClipPaths: string[] = [];
    const chapterDurations: number[] = [];
    const chapterTitles: string[] = [];

    for (const chapter of plan.chapters) {
      const chapterClip = join(workDir, `chapter_${chapter.index}.mp4`);
      chapterTitles.push(chapter.title);
      // Resumability: skip a chapter already rendered on a prior attempt.
      if (existsSync(chapterClip)) {
        log(`chapter ${chapter.index} already rendered — reusing`);
        chapterClipPaths.push(chapterClip);
        chapterDurations.push(await probeDurationSeconds(chapterClip));
        continue;
      }

      // 1. Chapter voiceover (chunked).
      const vo = await synthesizeChapterToWav({ narration: chapter.narration, voiceId: plan.voice.voiceId, workDir, chapterIndex: chapter.index });
      log(`chapter ${chapter.index} VO ${vo.durationSeconds.toFixed(1)}s`);

      // 2. Rescale beat durations to fill the real VO length (alignment without Whisper in L1).
      const estTotal = chapter.beats.reduce((s, b) => s + b.estDurationSeconds, 0) || 1;
      const scale = vo.durationSeconds / estTotal;

      // 3. One image per beat (Higgsfield or gradient fallback) → Ken-Burns clip.
      const beatClipPaths: string[] = [];
      for (const beat of chapter.beats) {
        const imgPath = join(workDir, `ch${chapter.index}_beat${beat.index}.png`);
        const gen = await generateImage({ prompt: beat.imagePrompt, negativePrompt: beat.negativePrompt, outputPath: imgPath, aspect: "16:9" });
        if (!gen.ok) await renderGradientStill({ ...gradient, outputPath: imgPath });
        const beatDur = Math.max(0.5, beat.estDurationSeconds * scale);
        const clip = join(workDir, `ch${chapter.index}_beat${beat.index}.mp4`);
        await renderKenBurnsClip({ imagePath: imgPath, durationSeconds: beatDur, direction: KEN_BURNS_DIRECTIONS[beat.index % KEN_BURNS_DIRECTIONS.length], zoom, outputPath: clip });
        beatClipPaths.push(clip);
      }
      log(`chapter ${chapter.index} rendered ${beatClipPaths.length} beats`);

      // 4. Concat beat clips → silent chapter video, then mux the chapter VO.
      const silent = join(workDir, `chapter_${chapter.index}_silent.mp4`);
      const listPath = join(workDir, `chapter_${chapter.index}_list.txt`);
      await writeFile(listPath, beatClipPaths.map((p) => `file '${p}'`).join("\n") + "\n", "utf8");
      await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-an", silent]);
      await muxChapterAudio({ videoPath: silent, voicePath: vo.wavPath, outputPath: chapterClip });

      chapterClipPaths.push(chapterClip);
      chapterDurations.push(await probeDurationSeconds(chapterClip));
    }

    // 5. Concat chapters → one continuous video with baked VO.
    const concatPath = join(workDir, "concat.mp4");
    await concatChapterClips({ clipPaths: chapterClipPaths, listPath: join(workDir, "chapters_list.txt"), outputPath: concatPath });
    const totalDuration = await probeDurationSeconds(concatPath);

    // 6. Subtle music bed (best-effort — render still succeeds without music).
    const finalPath = join(workDir, "final.mp4");
    const music = await pickAndDownloadMusic({ supabase, outputPath: join(workDir, "music.mp3") }).catch(() => null);
    if (music) await muxMusicBed({ videoPath: concatPath, musicPath: music.outputPath, durationSeconds: totalDuration, outputPath: finalPath });
    else { await runFfmpeg(["-y", "-i", concatPath, "-c", "copy", finalPath]); log("no music track available — voice only"); }

    // 7. Upload + return.
    const chapterMarkers = buildChapterMarkers(chapterDurations, chapterTitles);
    const blobUrl = await uploadMp4ToBlob(finalPath, `renders/longform/${payload.your_video_id}.mp4`);
    const durationActual = await probeDurationSeconds(finalPath);
    log(`done ${durationActual.toFixed(1)}s → ${blobUrl}`);

    return { render_artifact_url: blobUrl, duration_seconds_actual: durationActual, chapter_markers: chapterMarkers, debug_trace: trace.join("\n") };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    trace.push(`ERROR: ${msg}`);
    throw new RenderLongformError(msg, trace.join("\n"));
  }
}
```

- [ ] **Step 2: Register in `run.ts`** — add the import and the switch case alongside the others:

```typescript
import { runRenderLongform } from './handlers/render-longform.js';
// ...inside the switch on job.job_type:
case 'render_longform': output = await runRenderLongform(job, supabase); break;
```

- [ ] **Step 3: Typecheck + commit**

Run: `cd scripts/render-worker && npx tsc --noEmit` → Expected: PASS.
```bash
git add scripts/render-worker/handlers/render-longform.ts scripts/render-worker/run.ts
git commit -m "feat(longform-worker): chapter-batched render-longform handler + run.ts registration"
```

### Task 23: Complete-callback side-effect for `render_longform`

**Files:**
- Modify: `src/app/api/render/complete/route.ts`

**Read the route first.** Add a branch (mirroring the `render_f1` success branch) that, on `render_longform` success, sets the draft to `status='rendered'`, writes `render_artifact_url`, `duration_seconds`, and stores `chapter_markers` (the handler returns `output.chapter_markers`).

- [ ] **Step 1: Add the success branch** (mirror the existing `render_f1` case shape; field names per the route's existing code):

```typescript
} else if (job.job_type === "render_longform") {
  const out = result.output as { render_artifact_url?: string; duration_seconds_actual?: number; chapter_markers?: unknown };
  const { error: updErr } = await supabase
    .from("your_videos")
    .update({
      render_artifact_url: out.render_artifact_url ?? null,
      duration_seconds: out.duration_seconds_actual ?? null,
      chapter_markers: (out.chapter_markers ?? null) as unknown as Record<string, unknown> | null,
      status: "rendered",
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.your_video_id);
  if (updErr) throw new Error(`render_longform complete: ${updErr.message}`);
}
```

> Match the exact variable names already in the route (`job`, `result`, `supabase`). Keep the existing `debug_trace → render_jobs.last_error` persistence that the route already does for all job types.

- [ ] **Step 2: Typecheck + build + commit**

Run: `npx tsc --noEmit` → PASS. Run: `npm run build` → PASS.
```bash
git add src/app/api/render/complete/route.ts
git commit -m "feat(longform): render_longform completion → mark draft rendered + chapter markers"
```

---

## Phase 5 — Premium UI

> **Project rule — premium UI is first-class (9/10).** Before building these screens, invoke the `frontend-design`, `ui-ux-pro-max`, and `vercel:shadcn` skills and follow them. Match the existing tokens (`bg-app`/`bg-surface`/`bg-elevated`, `text-primary`/`text-secondary`/`text-muted`, `accent-electric`, `border-subtle`, `--glass-blur`, the `--duration-*`/`--ease-*` motion vars) and the existing component patterns (`AppShell` + `AppSidebar`, the `active-run-pane.tsx` SSE reader, `pipeline-strip.tsx`). Use Framer Motion (`motion/react`) for entrance/state transitions, designed empty/loading states, and `sonner` toasts. Lead each screen with the ONE primary thing (information hierarchy). Verify each screen with the preview tools (`preview_start` → `preview_screenshot`) — do not ask the operator to check manually.

### Task 24: Longform pipeline strip + live run pane (SSE)

**Files:**
- Create: `src/components/lab/longform/longform-pipeline-strip.tsx`
- Create: `src/components/lab/longform/longform-run-pane.tsx`

**Read `src/components/lab/pipeline-strip.tsx` and `src/components/lab/active-run-pane.tsx` first** to reuse `STATE_STYLES`, the `parseSseFrame` reader loop, and the `lab:dispatch-start` event pattern.

- [ ] **Step 1: Pipeline strip** `src/components/lab/longform/longform-pipeline-strip.tsx`:

```tsx
"use client";
import type { AgentId } from "@/lib/agents/types";

export type ChipState = "idle" | "working" | "done" | "failed";

const ORDER: { id: AgentId; emoji: string; label: string }[] = [
  { id: "writer", emoji: "✍️", label: "Writer" },
  { id: "style_picker", emoji: "🎨", label: "Style" },
  { id: "beat_planner", emoji: "🎞️", label: "Beats" },
  { id: "voice_coach", emoji: "🎙️", label: "Voice" },
];

const STATE_STYLES: Record<ChipState, string> = {
  idle: "bg-elevated text-text-muted border-subtle",
  working: "bg-elevated text-accent-electric border-accent-electric/40 shadow-[0_0_12px_rgba(0,255,136,0.25)] animate-pulse",
  done: "bg-elevated text-accent-electric border-accent-electric/40",
  failed: "bg-elevated text-accent-red border-accent-red/60",
};

export function LongformPipelineStrip({ states }: { states: Record<AgentId, ChipState> }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-surface border border-subtle sticky top-0 z-10">
      {ORDER.map((a, idx) => (
        <span key={a.id} className="flex items-center gap-2">
          <span
            data-testid={`longform-chip-${a.id}`}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition ${STATE_STYLES[states[a.id] ?? "idle"]}`}
          >
            <span aria-hidden>{a.emoji}</span>
            <span>{a.label}</span>
          </span>
          {idx < ORDER.length - 1 && <span className="text-text-muted text-xs">━━</span>}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Run pane** `src/components/lab/longform/longform-run-pane.tsx` — listens for `lab:longform-dispatch-start`, POSTs to `/api/lab/longform/dispatch`, consumes the SSE stream, drives the strip + output cards:

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { StreamEvent, AgentId } from "@/lib/agents/types";
import { LongformPipelineStrip, type ChipState } from "./longform-pipeline-strip";

interface LongformDispatchDetail { topic: string; targetDurationSeconds: number; channelId: string }

type RunState = {
  active: boolean;
  states: Record<AgentId, ChipState>;
  hook: string | null;
  presetId: string | null;
  beatCount: number | null;
  voiceId: string | null;
  failure: string | null;
  completed: boolean;
};

const INITIAL: RunState = {
  active: false,
  states: { strategist: "idle", writer: "idle", style_picker: "idle", beat_planner: "idle", voice_coach: "idle", director: "idle", composer: "idle" },
  hook: null, presetId: null, beatCount: null, voiceId: null, failure: null, completed: false,
};

function parseSseFrame(frame: string): StreamEvent | null {
  const lines = frame.split("\n");
  let eventName: string | null = null;
  let dataLine: string | null = null;
  for (const line of lines) {
    if (line.startsWith("event: ")) eventName = line.slice(7).trim();
    else if (line.startsWith("data: ")) dataLine = line.slice(6);
  }
  if (!eventName || !dataLine) return null;
  try { return { type: eventName, data: JSON.parse(dataLine) } as StreamEvent; } catch { return null; }
}

export function LongformRunPane() {
  const router = useRouter();
  const [run, setRun] = useState<RunState>(INITIAL);

  useEffect(() => {
    async function handler(e: Event) {
      const detail = (e as CustomEvent<LongformDispatchDetail>).detail;
      setRun({ ...INITIAL, active: true, states: { ...INITIAL.states, writer: "working" } });
      let res: Response;
      try {
        res = await fetch("/api/lab/longform/dispatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(detail) });
      } catch (err) {
        setRun((r) => ({ ...r, active: false, failure: `request failed: ${err}` }));
        return;
      }
      if (!res.ok || !res.body) { setRun((r) => ({ ...r, active: false, failure: `dispatch failed (${res.status})` })); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buf += decoder.decode(chunk.value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const ev = parseSseFrame(frame);
          if (ev) applyEvent(setRun, ev);
          if (ev?.type === "job_completed") { toast.success("Longform draft ready to render"); router.refresh(); setRun((r) => ({ ...r, active: false })); }
          if (ev?.type === "job_failed") { toast.error("Generation failed"); setRun((r) => ({ ...r, active: false })); }
        }
      }
    }
    window.addEventListener("lab:longform-dispatch-start", handler as EventListener);
    return () => window.removeEventListener("lab:longform-dispatch-start", handler as EventListener);
  }, [router]);

  if (!run.active && !run.completed && !run.failure) return null;

  return (
    <section className="space-y-4 rounded-xl border border-subtle bg-surface p-5">
      <LongformPipelineStrip states={run.states} />
      <div className="grid gap-3 sm:grid-cols-2">
        <OutputCard title="Hook" value={run.hook} />
        <OutputCard title="Style" value={run.presetId} />
        <OutputCard title="Image beats" value={run.beatCount != null ? String(run.beatCount) : null} />
        <OutputCard title="Narrator" value={run.voiceId} />
      </div>
      {run.failure && <p className="text-sm text-accent-red">{run.failure}</p>}
    </section>
  );
}

function OutputCard({ title, value }: { title: string; value: string | null }) {
  return (
    <div className="rounded-lg border border-subtle bg-elevated p-3">
      <p className="text-[11px] uppercase tracking-wide text-text-muted">{title}</p>
      <p className="mt-1 text-sm text-text-primary min-h-[1.25rem]">{value ?? <span className="text-text-muted italic">…</span>}</p>
    </div>
  );
}

function applyEvent(setRun: React.Dispatch<React.SetStateAction<RunState>>, ev: StreamEvent) {
  setRun((r) => {
    switch (ev.type) {
      case "agent_state": return { ...r, states: { ...r.states, [ev.data.agent]: "working" } };
      case "agent_done": return { ...r, states: { ...r.states, [ev.data.agent]: "done" } };
      case "agent_output": {
        const out = ev.data.output as Record<string, unknown>;
        if (ev.data.agent === "writer") return { ...r, hook: typeof out.hook === "string" ? out.hook : r.hook };
        if (ev.data.agent === "style_picker") return { ...r, presetId: typeof out.presetId === "string" ? out.presetId : r.presetId };
        if (ev.data.agent === "beat_planner") return { ...r, beatCount: typeof out.beatCount === "number" ? out.beatCount : r.beatCount };
        if (ev.data.agent === "voice_coach") return { ...r, voiceId: typeof out.voiceId === "string" ? out.voiceId : r.voiceId };
        return r;
      }
      case "job_completed": return { ...r, completed: true };
      case "job_failed": return { ...r, failure: ev.data.error, states: { ...r.states, [ev.data.agent]: "failed" } };
      default: return r;
    }
  });
}
```

- [ ] **Step 3: Build + commit**

Run: `npm run build` → Expected: PASS.
```bash
git add src/components/lab/longform/longform-pipeline-strip.tsx src/components/lab/longform/longform-run-pane.tsx
git commit -m "feat(longform-ui): live pipeline strip + SSE run pane"
```

### Task 25: Topic-entry composer + Lab route + sidebar nav

**Files:**
- Create: `src/components/lab/longform/longform-composer.tsx`
- Create: `src/app/lab/longform/page.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`

- [ ] **Step 1: Composer** `src/components/lab/longform/longform-composer.tsx` — the premium primary action: a large topic field, a duration segmented control, an optional style override, and a Generate button that emits the dispatch event:

```tsx
"use client";
import { useState } from "react";
import { Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const DURATIONS = [
  { label: "8 min", value: 480 },
  { label: "10 min", value: 600 },
  { label: "15 min", value: 900 },
  { label: "20 min", value: 1200 },
];

export function LongformComposer({ channelId }: { channelId: string }) {
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState(600);
  const [busy, setBusy] = useState(false);

  function generate() {
    const t = topic.trim();
    if (!t || busy) return;
    setBusy(true);
    window.dispatchEvent(new CustomEvent("lab:longform-dispatch-start", { detail: { topic: t, targetDurationSeconds: duration, channelId } }));
    // run pane drives the rest; re-enable shortly so the operator can queue another.
    setTimeout(() => setBusy(false), 1500);
  }

  return (
    <section className="rounded-xl border border-subtle bg-surface p-6 shadow-[var(--elev-2)]">
      <div className="flex items-center gap-2 text-text-primary">
        <Clapperboard className="h-5 w-5 text-accent-electric" strokeWidth={1.5} />
        <h2 className="text-lg font-semibold">New longform video</h2>
      </div>
      <p className="mt-1 text-sm text-text-secondary">Type a topic or title. The Writer, Style-picker, Beat-planner, and Voice take it from here.</p>

      <Textarea
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder={'e.g. "The IRS is hiding this from you"'}
        rows={2}
        className="mt-4 text-base resize-none"
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate(); }}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-subtle bg-elevated p-1">
          {DURATIONS.map((d) => (
            <button
              key={d.value}
              onClick={() => setDuration(d.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${duration === d.value ? "bg-surface text-text-primary shadow-[var(--elev-1)]" : "text-text-muted hover:text-text-primary"}`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <Button onClick={generate} disabled={!topic.trim() || busy}>
          {busy ? "Dispatching…" : "Generate"}
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: The Lab longform page** `src/app/lab/longform/page.tsx` (server) — loads the default channel + recent longform drafts, composes the screen:

```tsx
import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getServiceClient } from "@/lib/supabase/server";
import { LongformComposer } from "@/components/lab/longform/longform-composer";
import { LongformRunPane } from "@/components/lab/longform/longform-run-pane";
import { LongformReview } from "@/components/lab/longform/longform-review";

export const dynamic = "force-dynamic";

export default async function LongformLabPage() {
  const supabase = getServiceClient();
  const { data: channel } = await supabase.from("channels").select("id").limit(1).maybeSingle();
  const { data: drafts } = await supabase
    .from("your_videos")
    .select("id, title, status, render_artifact_url, duration_seconds, longform_plan, chapter_markers, created_at")
    .eq("format", "longform")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <AppShell bare sidebar={<AppSidebar />}>
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">Longform</h1>
          <p className="mt-1 text-sm text-text-secondary">Type a topic → a finished 16:9 faceless documentary.</p>
        </header>
        {channel?.id ? <LongformComposer channelId={channel.id} /> : <p className="text-sm text-accent-red">No channel configured. Add one in Settings first.</p>}
        <LongformRunPane />
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Recent longform drafts</h2>
          {(drafts ?? []).length === 0
            ? <p className="text-sm text-text-muted">No longform videos yet.</p>
            : (drafts ?? []).map((d) => <LongformReview key={d.id} draft={d} />)}
        </div>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 3: Sidebar nav** — in `src/components/layout/app-sidebar.tsx`, add to the `NAV` array (import `Clapperboard` from `lucide-react`):

```tsx
{ href: "/lab/longform", label: "Longform", icon: Clapperboard },
```

- [ ] **Step 4: Build + verify in preview + commit**

Run: `npm run build` → PASS. Then `preview_start`, navigate to `/lab/longform`, `preview_screenshot` to confirm the composer renders premium (empty state included).
```bash
git add src/components/lab/longform/longform-composer.tsx src/app/lab/longform/page.tsx src/components/layout/app-sidebar.tsx
git commit -m "feat(longform-ui): topic-entry composer + Lab route + sidebar nav"
```

### Task 26: Review screen (16:9 player + chapter markers + plan)

**Files:**
- Create: `src/components/lab/longform/longform-review.tsx`

- [ ] **Step 1: Implement** — a 16:9 player, clickable chapter markers (seek + copy-for-description), and a plan summary. Includes a "Render" button that POSTs the existing render enqueue when the draft is a `draft` (re-using `/api/lab/render` if it accepts longform, else the longform render is auto-enqueued at dispatch — show status instead):

```tsx
"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface ChapterMarker { index: number; title: string; startSeconds: number; timestamp: string }
interface DraftPlan { angle?: string; hook?: string; presetId?: string; chapters?: { beats?: unknown[] }[] }
interface Draft {
  id: string; title: string; status: string;
  render_artifact_url: string | null; duration_seconds: number | null;
  longform_plan: DraftPlan | null; chapter_markers: ChapterMarker[] | null;
}

export function LongformReview({ draft }: { draft: Draft }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const plan = draft.longform_plan ?? {};
  const markers = draft.chapter_markers ?? [];
  const beatCount = (plan.chapters ?? []).reduce((s, c) => s + (c.beats?.length ?? 0), 0);

  function seek(sec: number) { if (videoRef.current) { videoRef.current.currentTime = sec; videoRef.current.play().catch(() => {}); } }
  function copyChapters() {
    const text = markers.map((m) => `${m.timestamp} ${m.title}`).join("\n");
    navigator.clipboard.writeText(text).then(() => toast.success("Chapter timestamps copied")).catch(() => toast.error("Copy failed"));
  }

  return (
    <article className="rounded-xl border border-subtle bg-surface overflow-hidden">
      <header className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-text-primary">{draft.title}</h3>
          <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
            <Badge variant="secondary">{plan.presetId ?? "—"}</Badge>
            <span>{beatCount} beats</span>
            {draft.duration_seconds ? <span>· {Math.round(draft.duration_seconds / 60)} min</span> : null}
            <span>· {draft.status}</span>
          </div>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="text-xs text-accent-electric hover:underline">{open ? "Hide" : "Review"}</button>
      </header>

      {open && (
        <div className="grid gap-4 border-t border-subtle p-4 md:grid-cols-[2fr_1fr]">
          <div>
            {draft.render_artifact_url ? (
              <video ref={videoRef} src={draft.render_artifact_url} controls playsInline className="w-full rounded-lg border border-subtle bg-black" style={{ aspectRatio: "16 / 9" }} />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-subtle text-sm text-text-muted">
                {draft.status === "rendering" ? "Rendering…" : "Not rendered yet"}
              </div>
            )}
            {plan.hook && <p className="mt-3 text-sm text-text-secondary"><span className="text-text-muted">Hook: </span>{plan.hook}</p>}
          </div>
          <aside className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Chapters</h4>
              {markers.length > 0 && <button onClick={copyChapters} className="text-[11px] text-accent-electric hover:underline">Copy</button>}
            </div>
            {markers.length === 0 ? (
              <p className="text-xs text-text-muted">No markers yet.</p>
            ) : (
              <ul className="space-y-1">
                {markers.map((m) => (
                  <li key={m.index}>
                    <button onClick={() => seek(m.startSeconds)} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-text-secondary hover:bg-elevated">
                      <span className="font-mono text-text-muted">{m.timestamp}</span>
                      <span className="truncate">{m.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 2: Build + verify + commit**

Run: `npm run build` → PASS. Verify in preview that a rendered longform draft shows the 16:9 player + clickable chapters.
```bash
git add src/components/lab/longform/longform-review.tsx
git commit -m "feat(longform-ui): review screen — 16:9 player, chapter markers, plan summary"
```

---

## Phase 6 — Outcome join, verification, handoff

### Task 27: Outcome-join read path

**Files:**
- Create: `src/lib/supabase/repositories/longform-outcomes.ts`
- Test: `src/tests/lib/supabase/longform-outcomes.test.ts`

The `longform_decision_outcomes` view (Task 1) already does the join. This adds a typed reader + a pure row-mapper (the unit-testable core). It returns empty until real analytics arrive — exactly the "populates over time" foundation.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { mapOutcomeRow } from "@/lib/supabase/repositories/longform-outcomes";

describe("longform-outcomes/mapOutcomeRow", () => {
  it("maps a joined view row to a typed outcome", () => {
    const row = {
      decision_id: "d1", agent_id: "writer", decision_type: "longform_script",
      chosen: { hook: "h" }, your_video_id: "yv1", title: "T", status: "posted",
      posted_at: "2026-06-01T00:00:00Z", views: 1200, avg_view_duration_seconds: 210,
      ctr_pct: 4.2, watch_time_seconds: 252000, analytics_snapshot_at: "2026-06-02T00:00:00Z",
    };
    const out = mapOutcomeRow(row);
    expect(out.agentId).toBe("writer");
    expect(out.views).toBe(1200);
    expect(out.avgViewDurationSeconds).toBe(210);
  });

  it("tolerates null analytics (no snapshot yet)", () => {
    const out = mapOutcomeRow({ decision_id: "d1", agent_id: "writer", decision_type: "x", chosen: {}, your_video_id: "yv1", title: "T", status: "rendered", posted_at: null, views: null, avg_view_duration_seconds: null, ctr_pct: null, watch_time_seconds: null, analytics_snapshot_at: null });
    expect(out.views).toBeNull();
  });
});
```

Run: `npm test -- longform-outcomes` → Expected: FAIL.

- [ ] **Step 2: Implement**

```typescript
// src/lib/supabase/repositories/longform-outcomes.ts
// Reads the longform_decision_outcomes view (decision ledger ⨝ latest analytics).
// This is the feedback-flywheel join; it returns rows only as posted videos accrue analytics.
// Phase L2's learning engine will mine this; L1 only needs the join to exist + read cleanly.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface LongformOutcome {
  decisionId: string;
  agentId: string;
  decisionType: string;
  chosen: Record<string, unknown>;
  yourVideoId: string;
  title: string;
  status: string;
  postedAt: string | null;
  views: number | null;
  avgViewDurationSeconds: number | null;
  ctrPct: number | null;
  watchTimeSeconds: number | null;
  analyticsSnapshotAt: string | null;
}

export interface OutcomeRow {
  decision_id: string; agent_id: string; decision_type: string; chosen: unknown;
  your_video_id: string; title: string; status: string; posted_at: string | null;
  views: number | null; avg_view_duration_seconds: number | null; ctr_pct: number | null;
  watch_time_seconds: number | null; analytics_snapshot_at: string | null;
}

export function mapOutcomeRow(row: OutcomeRow): LongformOutcome {
  return {
    decisionId: row.decision_id,
    agentId: row.agent_id,
    decisionType: row.decision_type,
    chosen: (row.chosen ?? {}) as Record<string, unknown>,
    yourVideoId: row.your_video_id,
    title: row.title,
    status: row.status,
    postedAt: row.posted_at,
    views: row.views,
    avgViewDurationSeconds: row.avg_view_duration_seconds,
    ctrPct: row.ctr_pct,
    watchTimeSeconds: row.watch_time_seconds,
    analyticsSnapshotAt: row.analytics_snapshot_at,
  };
}

export async function getLongformOutcomes(supabase: SupabaseClient, yourVideoId: string): Promise<LongformOutcome[]> {
  const { data, error } = await supabase.from("longform_decision_outcomes").select("*").eq("your_video_id", yourVideoId);
  if (error) throw new Error(`getLongformOutcomes: ${error.message}`);
  return (data as OutcomeRow[]).map(mapOutcomeRow);
}
```

Run: `npm test -- longform-outcomes` → Expected: PASS.

- [ ] **Step 3: Verify the join end-to-end on the dev branch (no prod)**

Via the Supabase MCP against the **dev branch**: insert a longform draft, a `decisions` row with that `your_video_id`, and a `video_analytics` row; then `select * from longform_decision_outcomes where your_video_id = '<id>'` and confirm the analytics columns join through. Confirms success criterion #3's foundation.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/repositories/longform-outcomes.ts src/tests/lib/supabase/longform-outcomes.test.ts
git commit -m "feat(longform): outcome-join reader (ledger ⨝ analytics) — flywheel foundation"
```

### Task 28: Full verification + live-render gate + handoff

**Files:** none (verification only)

- [ ] **Step 1: Run the full project gate**

Run, in order, and confirm each passes:
```bash
npx tsc --noEmit
npm test
npm run build
cd scripts/render-worker && npx tsc --noEmit && cd ../..
```
Expected: typecheck clean (no `any`), all vitest suites green, Next build succeeds, worker typecheck clean. Per the verification-before-completion rule, do not claim done until all four pass — paste the outputs.

- [ ] **Step 2: Dry-run dispatch (mocked image-gen + TTS)** — confirm success criterion #1

With `HIGGSFIELD_ENABLED` unset, run the dispatch locally (`env -u ANTHROPIC_BASE_URL npm run dev`), POST a topic to `/api/lab/longform/dispatch`, and confirm: the SSE stream emits all four agents → `job_completed`; a `your_videos` row exists with `format='longform'`, a validated `longform_plan`, and four `decisions` rows (`writer`/`style_picker`/`beat_planner`/`voice_coach`) keyed to its `your_video_id`; and a `render_jobs` row of type `render_longform` is enqueued.

- [ ] **Step 3: Document the live-render gate (DO NOT block on it)**

The build is complete without Higgsfield. A **live render with real images** needs: (a) Darius's Higgsfield paid plan, (b) the deferred CLI-auth wiring inside `scripts/render-worker/lib/higgsfield.ts:callHiggsfield` (+ `HIGGSFIELD_ENABLED=1` and the credential env). Until then, `render-longform` produces a complete 1920×1080 video using style-consistent gradient stills (proves the full pipeline). Capture this as the single open follow-up. **Prod deploy of the worker + a prod migration apply are operator-gated — ask Darius before either.**

- [ ] **Step 4: Phase-boundary handoff**

Stop and hand Darius a copy-pasteable prompt to open the next chat (Phase L2 — the learning engine, or the Higgsfield live-wiring follow-up), summarizing what shipped and the one gate that remains.

---

## Self-review checklist (run before handing off the plan)

- **Spec §2 scope:** typed-topic entry (Task 25) ✓ · agent pipeline Writer→Style→Beat→Voice (Tasks 11–15) ✓ · `render-longform` 1920×1080 + chapter markers (Tasks 19–23) ✓ · two presets (Task 4) ✓ · chunked Cartesia (Task 20) ✓ · flywheel foundations: ledger (Tasks 1,10,15) + outcome join (Tasks 1,27) + empty playbook every agent reads (Task 9, used in 11–15) ✓.
- **Spec §1.5 quality bar:** reference formats re-watched and encoded into prompts/presets (Tasks 4, 11, 13) ✓.
- **Spec §5.7 data model:** `your_videos` extended + plan as validated JSONB + `job_type='render_longform'` + ledger on `decisions` keyed to draft (Task 1) ✓.
- **Spec §9 resilience:** per-pass schema + bounded retry + fallback (Tasks 11–14) · image best-effort → gradient (Task 22) · per-chunk TTS retry (Task 20) · chapter-batched idempotent resume (Task 22) ✓.
- **Spec §12 testing:** writer assembly + chapter-count (Tasks 2, 11) · beat splitter + prompt assembler (Tasks 3, 5, 13) · chunked-TTS offsets (Task 7) · Ken-Burns 16:9 args (Task 6) · chapter concat/markers (Task 8) · ledger round-trip (Task 10) · dry-run integration (Task 15 orchestrator + Task 28) ✓.
- **Project rules:** TS strict/no-`any` (every task) · "not the Next.js you know" → read docs before route (Task 17) · worker can't import `src/*` → mirrors (Task 18) · premium UI skills (Phase 5) · prod migration/deploy operator-gated (Tasks 1, 28) · Higgsfield gated, build doesn't block on it (Tasks 21, 28) · `-u ANTHROPIC_BASE_URL` for local AI-SDK runs (Conventions, Task 28).
- **Type consistency:** `LongformPlan`/`StyleBible`/`BeatPlannerOutput` shapes match across types (Task 9), ledger (Task 10), orchestrator (Task 15), worker handler's local `LongformPlan` interface (Task 22) — the worker mirror must stay in sync with the persisted plan shape; if the schema changes, update both.
- **Deferred by design (not gaps):** Whisper word-timing alignment (beats use proportional scaling in L1; Whisper returns with the captions feature) · burned-in captions (only `captionsEnabled=false` plumbing) · the learning *engine* (L2).





