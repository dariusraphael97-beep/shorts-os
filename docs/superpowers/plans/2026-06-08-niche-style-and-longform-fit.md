# Niche Quality: Illustrated-Style Default + Longform-Aware Niche-Picking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the niche pipeline from auto-picking the rejected photoreal style and from forcing short-form niches into longform — by constraining the style picker to proven illustrated styles and making niche-picking length-aware.

**Architecture:** Two independent fixes upstream of the (working) render spine. (A) The style picker's auto menu + Zod enum are narrowed to the proven illustrated `nano_banana_2` presets, defaulting to `naturalist-illustration`. (B) The seed scanner biases to longform YouTube results and records each winner's duration into the existing `explainability_top_signals` JSON; that duration sets the video's target length (clamped 7–15 min) and gates short-form niches out of the auto-pick. No new DB schema; no renderer changes.

**Tech Stack:** TypeScript, Zod, Vitest, Next.js App Router, Vercel AI SDK (`generateObject`), Node `.mjs` (seed), YouTube Data API v3, Supabase.

**Spec:** `docs/superpowers/specs/2026-06-08-niche-style-and-longform-fit-design.md`

---

## File structure

- Modify `src/lib/agents/longform/style-picker.ts` — narrow the auto menu + enum + default/fallback to illustrated.
- Create `src/tests/lib/agents/longform/style-picker-policy.test.ts` — pin the auto policy.
- Modify `src/lib/niches/longform-topic.ts` — `targetFromWinnerDuration` + duration-aware `clusterToLongformInput`.
- Modify `src/tests/lib/niches/longform-topic.test.ts` — cover the duration mapping.
- Modify `src/lib/niches/auto-pick.ts` — short-form guard in `pickBestNiche`.
- Modify `src/tests/lib/niches/auto-pick.test.ts` — cover the guard.
- Modify `src/app/api/niches/studio/plan/route.ts` — thread the winner duration into `buildPlanArgs`.
- Modify `src/tests/app/niches/studio/plan-route.test.ts` — cover the threaded duration.
- Modify `src/app/niches/page.tsx` — pass the winner duration into the hero's `pickBestNiche`.
- Modify `scripts/seed-niches.mjs` — `videoDuration=medium`, capture + store `winnerDurationSeconds`, drop short candidates.

---

# PHASE 1 — Style + longform-fit fixes

## Task 1: Constrain the style picker to proven illustrated styles

**Files:**
- Modify: `src/lib/agents/longform/style-picker.ts`
- Test: `src/tests/lib/agents/longform/style-picker-policy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/lib/agents/longform/style-picker-policy.test.ts
import { describe, it, expect } from "vitest";
import { AUTO_ELIGIBLE_PRESETS, DEFAULT_AUTO_PRESET } from "@/lib/agents/longform/style-picker";

describe("style picker auto policy", () => {
  it("only offers the proven illustrated presets — never the photoreal soul_v2 ones", () => {
    expect(AUTO_ELIGIBLE_PRESETS).toEqual([
      "naturalist-illustration",
      "technical-illustration",
      "stick-figure-animated",
    ]);
    expect(AUTO_ELIGIBLE_PRESETS).not.toContain("cinematic-realistic");
    expect(AUTO_ELIGIBLE_PRESETS).not.toContain("editorial-graphic");
  });

  it("defaults/falls back to the proven naturalist illustration", () => {
    expect(DEFAULT_AUTO_PRESET).toBe("naturalist-illustration");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/agents/longform/style-picker-policy.test.ts`
Expected: FAIL — `AUTO_ELIGIBLE_PRESETS` / `DEFAULT_AUTO_PRESET` are not exported.

- [ ] **Step 3: Rewrite `style-picker.ts`**

Replace the whole file body with the version below. Changes vs. current: adds `z` import + the exported policy constants + a narrowed `AutoStylePickerOutputSchema`; the prompt offers only the three illustrated styles; `callOnce` validates against the narrowed schema; the fallback resolves to `DEFAULT_AUTO_PRESET` instead of `cinematic-realistic`. (The broad `StylePickerOutputSchema` import is dropped — it's no longer used here.)

```ts
// src/lib/agents/longform/style-picker.ts
import { z } from "zod";
import { generateObject, NoObjectGeneratedError } from "ai";
import { getClaudeModel } from "@/lib/ai/gateway";
import { getStylePreset, type StyleBible } from "@/lib/longform/style-presets";
import type { LongformPlaybook } from "@/lib/agents/longform/playbook";

/**
 * The ONLY presets the auto picker may choose — all proven, all high-quality
 * (nano_banana_2 / gpt_image_2), all illustrated. The photoreal soul_v2 presets
 * (cinematic-realistic, editorial-graphic) are deliberately excluded from auto;
 * they stay in STYLE_PRESETS so the Lab can still force them.
 */
export const AUTO_ELIGIBLE_PRESETS = [
  "naturalist-illustration",
  "technical-illustration",
  "stick-figure-animated",
] as const;

/** Proven default + fallback: the inked/watercolor field-guide look that worked. */
export const DEFAULT_AUTO_PRESET: StyleBible["presetId"] = "naturalist-illustration";

const AutoStylePickerOutputSchema = z.object({
  presetId: z.enum(AUTO_ELIGIBLE_PRESETS),
  musicMood: z.string().min(3).max(160),
  rationale: z.string().min(20).max(500),
});

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

The house look is ALWAYS hand-illustrated — never photoreal footage. Choose the best-fitting illustrated style:
- "naturalist-illustration": detailed inked + soft-watercolor field-guide / storybook illustration. The DEFAULT. Best for nature, animals, science, history, human-interest, and most factual topics.
- "technical-illustration": clean illustrated cutaway / labeled diagram. Best for engineering, machines, products, anatomy, "how it works".
- "stick-figure-animated": crude hand-drawn whiteboard stick-figure doodles. Best for playful, relatable, funny explainers about everyday life, psychology, or habits.

When unsure, choose "naturalist-illustration".

Also choose a short MUSIC MOOD phrase for a subtle, low-energy bed that sits well under the narration.

Return JSON: { "presetId": "naturalist-illustration" | "technical-illustration" | "stick-figure-animated", "musicMood": string, "rationale": string }.`;
}

async function callOnce(prompt: string): Promise<z.infer<typeof AutoStylePickerOutputSchema>> {
  const result = await generateObject({ model: getClaudeModel("claude-haiku-4-5"), schema: AutoStylePickerOutputSchema, prompt });
  return AutoStylePickerOutputSchema.parse(result.object);
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
      return resolve(DEFAULT_AUTO_PRESET, getStylePreset(DEFAULT_AUTO_PRESET).musicMood, "fallback: default illustrated preset");
    }
  }
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run src/tests/lib/agents/longform/style-picker-policy.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS + clean. (If an unrelated test imported the now-unused `StylePickerOutputSchema` from `types.ts`, leave that export in `types.ts` — this task does not remove it.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/longform/style-picker.ts src/tests/lib/agents/longform/style-picker-policy.test.ts
git commit -m "fix(longform): style picker auto-selects only proven illustrated styles (no photoreal)"
```

---

## Task 2: Target video length from the winner's duration

**Files:**
- Modify: `src/lib/niches/longform-topic.ts`
- Test: `src/tests/lib/niches/longform-topic.test.ts`

- [ ] **Step 1: Write the failing test** (append these to the existing describe block, and add the `targetFromWinnerDuration` import)

```ts
// src/tests/lib/niches/longform-topic.test.ts — update the import line and ADD tests
import { clusterToLongformInput, targetFromWinnerDuration } from "@/lib/niches/longform-topic";

describe("targetFromWinnerDuration", () => {
  it("matches the winner length when it's already in the 7–15 min band", () => {
    expect(targetFromWinnerDuration(720)).toBe(720); // 12 min winner → 12 min
  });
  it("clamps a very long winner down to 15 min", () => {
    expect(targetFromWinnerDuration(1500)).toBe(900);
  });
  it("clamps a short-ish winner up to 7 min", () => {
    expect(targetFromWinnerDuration(300)).toBe(420);
  });
  it("falls back to the 8-min default when duration is missing", () => {
    expect(targetFromWinnerDuration(undefined)).toBe(480);
    expect(targetFromWinnerDuration(null)).toBe(480);
  });
});

describe("clusterToLongformInput with a winner duration", () => {
  it("uses the winner's length for the target", () => {
    const input = clusterToLongformInput({
      canonical_topic: "deep sea creatures",
      production_fit: "native",
      winnerDurationSeconds: 600,
    });
    expect(input.targetDurationSeconds).toBe(600);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/niches/longform-topic.test.ts`
Expected: FAIL — `targetFromWinnerDuration` not exported; `winnerDurationSeconds` not accepted.

- [ ] **Step 3: Implement** — edit `src/lib/niches/longform-topic.ts`

Add `winnerDurationSeconds` to the input interface, add `targetFromWinnerDuration`, and use it in `clusterToLongformInput`:

```ts
export interface LongformTopicClusterInput {
  canonical_topic: string;
  production_fit: string;
  /** Duration (seconds) of the niche's proven winning video, if known. Sets the target length. */
  winnerDurationSeconds?: number | null;
}
```

```ts
/** Min/max target for a niche longform video: 7–15 min. */
const MIN_NICHE_TARGET_SECONDS = 420;
const MAX_NICHE_TARGET_SECONDS = 900;

/** Target length for a niche video: match the proven winner, clamped to 7–15 min; else the default. */
export function targetFromWinnerDuration(winnerDurationSeconds?: number | null): number {
  if (winnerDurationSeconds == null || !Number.isFinite(winnerDurationSeconds)) {
    return DEFAULT_LONGFORM_DURATION_SECONDS;
  }
  return Math.min(MAX_NICHE_TARGET_SECONDS, Math.max(MIN_NICHE_TARGET_SECONDS, Math.round(winnerDurationSeconds)));
}
```

Then change the `return` in `clusterToLongformInput` so `targetDurationSeconds` uses the helper:

```ts
  return {
    topic: c.canonical_topic.trim(),
    targetDurationSeconds: targetFromWinnerDuration(c.winnerDurationSeconds),
  };
```

(The existing "maps a native niche cluster" test passes no `winnerDurationSeconds`, so it still expects `480` — leave that assertion as-is.)

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run src/tests/lib/niches/longform-topic.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/niches/longform-topic.ts src/tests/lib/niches/longform-topic.test.ts
git commit -m "feat(niches): target video length matches the proven winner (7–15 min)"
```

---

## Task 3: Short-form guard in the auto-pick

**Files:**
- Modify: `src/lib/niches/auto-pick.ts`
- Test: `src/tests/lib/niches/auto-pick.test.ts`

- [ ] **Step 1: Write the failing test** (add to the existing describe; the `base()` helper already spreads overrides)

```ts
// src/tests/lib/niches/auto-pick.test.ts — ADD these cases
  it("excludes a native niche whose proven winner is short-form", () => {
    const picked = pickBestNiche([
      base({ id: "short", first_mover_score: 0.95, winnerDurationSeconds: 45 }),
      base({ id: "long", first_mover_score: 0.8, winnerDurationSeconds: 600 }),
    ]);
    expect(picked?.cluster.id).toBe("long");
  });

  it("keeps niches whose winner duration is unknown (back-compat)", () => {
    const picked = pickBestNiche([base({ id: "u", first_mover_score: 0.9 })]);
    expect(picked?.cluster.id).toBe("u");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/niches/auto-pick.test.ts`
Expected: FAIL — `winnerDurationSeconds` not on `PickableCluster`; the short niche isn't excluded.

- [ ] **Step 3: Implement** — edit `src/lib/niches/auto-pick.ts`

Add the field to `PickableCluster`:

```ts
export interface PickableCluster {
  id: string;
  canonical_topic: string;
  production_fit: string;
  niche_score: number | null;
  proven_score: number | null;
  first_mover_score: number | null;
  /** Proven winner's length (seconds), if known. Known-short niches are not auto-generated as longform. */
  winnerDurationSeconds?: number | null;
}
```

Change the `native` filter line in `pickBestNiche` to also drop known-short niches:

```ts
  const SHORT_FORM_MAX_SECONDS = 240;
  const native = clusters.filter(
    (c) =>
      c.production_fit === "native" &&
      !(c.winnerDurationSeconds != null && c.winnerDurationSeconds < SHORT_FORM_MAX_SECONDS),
  );
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run src/tests/lib/niches/auto-pick.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/niches/auto-pick.ts src/tests/lib/niches/auto-pick.test.ts
git commit -m "feat(niches): auto-pick skips short-form niches (won't make a Short into a longform doc)"
```

---

## Task 4: Thread the winner duration through the plan route + hero

**Files:**
- Modify: `src/app/api/niches/studio/plan/route.ts`
- Modify: `src/app/niches/page.tsx`
- Test: `src/tests/app/niches/studio/plan-route.test.ts`

- [ ] **Step 1: Write the failing test** (add to the existing `buildPlanArgs` describe)

```ts
// src/tests/app/niches/studio/plan-route.test.ts — ADD this case
  it("uses the winner duration for the target when present", () => {
    const args = buildPlanArgs(
      { canonical_topic: "deep sea creatures", production_fit: "native", winnerDurationSeconds: 660 },
      "channel-1",
      undefined,
      "cluster-9",
    );
    expect(args.targetDurationSeconds).toBe(660);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/app/niches/studio/plan-route.test.ts`
Expected: FAIL — `buildPlanArgs`'s cluster param doesn't accept `winnerDurationSeconds`, so the target stays 480.

- [ ] **Step 3: Update `buildPlanArgs` + the POST handler** in `src/app/api/niches/studio/plan/route.ts`

Widen the `cluster` param type and pass it straight through to `clusterToLongformInput`:

```ts
export function buildPlanArgs(
  cluster: { canonical_topic: string; production_fit: string; winnerDurationSeconds?: number | null },
  channelId: string,
  topicOverride: string | undefined,
  sourceNicheClusterId?: string,
): LongformPipelineArgs {
  const base = clusterToLongformInput(cluster);
  return {
    topic: topicOverride?.trim() || base.topic,
    targetDurationSeconds: base.targetDurationSeconds,
    channelId,
    planOnly: true,
    sourceNicheClusterId,
  };
}
```

In the POST handler, pass the duration from the loaded cluster's `explainability_top_signals` (it's typed `Record<string, number>`, and `getClusterById` selects all columns):

```ts
    args = buildPlanArgs(
      {
        canonical_topic: cluster.canonical_topic,
        production_fit: cluster.production_fit ?? "manual_only",
        winnerDurationSeconds: cluster.explainability_top_signals?.winnerDurationSeconds,
      },
      channel.id,
      topicOverride,
      clusterId,
    );
```

- [ ] **Step 4: Pass the duration into the hero's pick** in `src/app/niches/page.tsx`

In the `pickBestNiche(clusters.map((c) => ({ ... })))` mapping, add the field (the cluster row type exposes `explainability_top_signals: Record<string, number>`):

```tsx
      first_mover_score: c.first_mover_score,
      winnerDurationSeconds: c.explainability_top_signals?.winnerDurationSeconds ?? null,
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/tests/app/niches/studio/plan-route.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/niches/studio/plan/route.ts src/app/niches/page.tsx src/tests/app/niches/studio/plan-route.test.ts
git commit -m "feat(niches): thread winner duration into plan target + hero auto-pick"
```

---

## Task 5: Seed scanner — longform bias + duration capture

**Files:**
- Modify: `scripts/seed-niches.mjs`

- [ ] **Step 1: Bias the search to longform + request durations**

In the `search` call (the `yt('search', {...})` line), add `videoDuration: 'medium'` (YouTube "medium" = 4–20 min):

```js
    const j = await yt('search', { part: 'id', q, type: 'video', order: 'viewCount', publishedAfter: PUBLISHED_AFTER, maxResults: '50', regionCode: 'US', relevanceLanguage: 'en', videoDuration: 'medium' });
```

Add `contentDetails` to the `videos.list` part and capture each video's duration. Add this ISO-8601 parser just below the `yt(...)` helper (after its closing `}`):

```js
function iso8601ToSeconds(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  if (!m) return 0;
  return (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0));
}
```

Change the `videos.list` loop to fetch + record duration:

```js
for (let i = 0; i < idArr.length; i += 50) {
  const j = await yt('videos', { part: 'snippet,statistics,contentDetails', id: idArr.slice(i, i + 50).join(',') });
  for (const it of j.items ?? []) vids.push({ id: it.id, title: it.snippet?.title ?? '', channelId: it.snippet?.channelId, views: +(it.statistics?.viewCount ?? 0), published: it.snippet?.publishedAt, durationSeconds: iso8601ToSeconds(it.contentDetails?.duration) });
}
```

- [ ] **Step 2: Carry the winner duration through scoring**

In the `byChannel` loop, record the best video's duration:

```js
  if (!cur || v.views > cur.bestViews) byChannel.set(v.channelId, { ...c, channelId: v.channelId, bestViews: v.views, bestTitle: v.title, bestId: v.id, bestDurationSeconds: v.durationSeconds });
```

In the candidate filter, also drop short winners (belt-and-suspenders behind `videoDuration=medium`):

```js
  if (ageDays > 365 || c.bestViews < 300_000 || ratio < 3 || (c.bestDurationSeconds ?? 0) < 240) continue;
```

- [ ] **Step 3: Store `winnerDurationSeconds` in the cluster row**

In the `rows = top.map(...)` object, extend `explainability_top_signals`:

```js
  explainability_top_signals: { viewsToSubsRatio: Math.round(c.ratio), firstMoverScore: Number(c.firstMover.toFixed(3)), channelAgeDays: Math.round(c.ageDays), winnerDurationSeconds: Math.round(c.bestDurationSeconds ?? 0) },
```

Optionally extend the final log line to show length:

```js
for (const r of rows) console.log(`  - ${r.canonical_topic} (views/subs ~${r.explainability_top_signals.viewsToSubsRatio}x, age ${r.explainability_top_signals.channelAgeDays}d, ~${Math.round(r.explainability_top_signals.winnerDurationSeconds / 60)}min)`);
```

- [ ] **Step 4: Verify the script parses**

Run: `node --check scripts/seed-niches.mjs`
Expected: no output (syntax OK).

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-niches.mjs
git commit -m "feat(niches): seed scanner finds longform winners + records winner duration"
```

---

### Phase 1 verification gate

- [ ] **Full suite + typecheck green:**

```bash
npx vitest run && npx tsc -p tsconfig.json --noEmit
```
Expected: all green; clean.

- [ ] **Re-seed (free — YouTube API + Supabase only):**

Run: `node --env-file=.env.local scripts/seed-niches.mjs`
Expected: logs `found N dominatable channels; seeding top 8…` and the seeded niches now print a `~Nmin` length, all ≥ ~4 min.

- [ ] **Live proof (dev server + `npm run render-worker` running):**
  1. Open `/niches` → the hero's top pick is a longform-worthy niche (not a tier-list Short).
  2. Click **Generate my best niche** → planning runs → checkpoint shows **Style = naturalist-illustration / Model = nano_banana_2** (NOT cinematic-realistic/soul_v2) and a target length near the winner's (7–15 min).
  3. **Approve & render burns real credits — confirm with Darius before firing.** On completion, watch the finished video: illustrated field-guide look matching the bird/B58 quality bar, on a genuinely longform topic.

---

## Notes for the implementer

- Run the dev server with `env -u ANTHROPIC_BASE_URL npm run dev` (or `preview_start` "dev"); the AI SDK 404s otherwise.
- The worker (`npm run render-worker`) must be running for a render to complete; it uses `.env.local` + the Higgsfield CLI on this machine.
- `winnerDurationSeconds` lives in `niche_clusters.explainability_top_signals` (JSON) — no schema migration. Already-seeded rows without it fall back to the 8-min default and are not short-form-excluded (unknown ≠ short).
- Do not touch the render worker or the cockpit UI — this plan is upstream of both.
