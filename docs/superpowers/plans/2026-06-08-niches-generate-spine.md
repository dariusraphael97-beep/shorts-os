# Niches → Video "Generate Spine" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the dead-end "Generate" in `/niches` into a real in-app flow that runs the proven longform reference-driven pipeline (plan → operator checkpoint → render) and ends in a playable video, driven from a dedicated cockpit.

**Architecture:** Two phases with an operator checkpoint between them. Phase 1 (cheap) reuses `runLongformPipeline` in a new `planOnly` mode that persists the draft + `longform_plan` but skips the render enqueue. The operator reviews and approves. Phase 2 (heavy) enqueues a `render_jobs` row that a new **local render-worker daemon** claims and runs via the existing `runRenderLongform` handler, writing the finished mp4 url back to the draft. A cockpit at `/niches/studio/[draftId]` shows all four states. Forward-compatible with the deferred cloud render (same queue, same handler).

**Tech Stack:** Next.js (App Router, server components + route handlers), TypeScript, Zod, Supabase (`render_jobs` queue + RPCs), Vitest, tsx (render-worker), ElevenLabs/Higgsfield/ffmpeg (existing render handler), Tailwind + shadcn design system.

**Spec:** `docs/superpowers/specs/2026-06-08-niches-generate-spine-design.md`

---

## File structure

**Phase 1 — backend spine + local render**
- Modify `src/lib/agents/longform/orchestrator.ts` — add `planOnly` to args; gate the render enqueue.
- Create `src/lib/longform/estimate.ts` — credits + minutes estimate for the checkpoint.
- Create `src/lib/niches/longform-topic.ts` — niche cluster → longform topic + target duration.
- Create `src/lib/niches/auto-pick.ts` — pick the single best dominatable niche.
- Create `src/lib/render/longform-complete.ts` — shared "render output → your_videos update" mapping.
- Modify `src/app/api/render/complete/route.ts` — use the shared mapping (DRY).
- Create `src/app/api/niches/studio/plan/route.ts` — Phase 1 SSE (planOnly).
- Create `src/app/api/niches/studio/[draftId]/approve/route.ts` — enqueue render (idempotent).
- Create `src/app/api/niches/studio/[draftId]/status/route.ts` — cockpit polling read.
- Modify `src/lib/supabase/repositories/your-videos.ts` — add `getYourVideoById`.
- Modify `src/lib/supabase/repositories/render-jobs.ts` — add `getLatestRenderJobForVideo`.
- Create `scripts/render-worker/lib/longform-complete.ts` — mirror of the shared mapping.
- Create `scripts/render-worker/lib/jobs.ts` — worker-side claim/mark helpers.
- Create `scripts/render-worker/poll.ts` — the local polling daemon.
- Modify `package.json` (root) — add `render-worker` script.
- Create `scripts/seed-niches.mjs` — productized one-off scanner that writes `niche_clusters`.

**Phase 2 — cockpit UI + entry points**
- Create `src/app/niches/studio/page.tsx` — Phase 1 cockpit (planning → redirect).
- Create `src/app/niches/studio/[draftId]/page.tsx` — draft-keyed cockpit (server load → phase router).
- Create `src/components/niches/studio/studio-cockpit.tsx` — client phase router.
- Create `src/components/niches/studio/sse.ts` — shared SSE frame parser.
- Create `src/components/niches/studio/checkpoint.tsx` — approve card.
- Create `src/components/niches/studio/render-progress.tsx` — render state + worker hint.
- Create `src/components/niches/studio/done-panel.tsx` — video player + actions.
- Create `src/components/compositions/generate-best-niche.tsx` — the hero.
- Modify `src/app/niches/page.tsx` — mount the hero; pass auto-pick.
- Modify `src/app/niches/niches-feed.tsx` — rewire per-niche Generate to the cockpit.
- Modify `src/components/compositions/niche-card.tsx` — fix the gate tooltip copy.

---

# PHASE 1 — Backend spine + local render

*Independently testable: after Phase 1 you can plan + approve + render a niche entirely via API + the local worker, with no cockpit UI.*

## Task 1: `planOnly` mode on the longform pipeline

**Files:**
- Modify: `src/lib/agents/longform/orchestrator.ts` (args interface ~16-22; enqueue ~107)
- Test: `src/tests/lib/agents/longform/plan-only.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/lib/agents/longform/plan-only.test.ts
import { describe, it, expect } from "vitest";
import { shouldEnqueueRender } from "@/lib/agents/longform/orchestrator";

describe("shouldEnqueueRender (planOnly gate)", () => {
  it("enqueues a render by default (planOnly absent or false)", () => {
    expect(shouldEnqueueRender({})).toBe(true);
    expect(shouldEnqueueRender({ planOnly: false })).toBe(true);
  });
  it("skips the render when planOnly is true (operator checkpoint)", () => {
    expect(shouldEnqueueRender({ planOnly: true })).toBe(false);
  });
});
```

We test a pure gate helper rather than mocking the whole pipeline — the orchestrator assembles + Zod-validates a `LongformPlan` from four agents, so a full mock would be brittle. The helper makes the one behavioral decision testable in isolation, and the orchestrator calls it on the single enqueue line.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/agents/longform/plan-only.test.ts`
Expected: FAIL — `shouldEnqueueRender` is not exported from the orchestrator.

- [ ] **Step 3: Add the flag, the gate helper, and gate the enqueue**

In `src/lib/agents/longform/orchestrator.ts`, add `planOnly` to the args interface (the block at ~16-22):

```ts
export interface LongformPipelineArgs {
  topic: string;
  targetDurationSeconds: number;
  channelId: string;
  /** When set, the operator forced this preset in the UI — skip the style-picker LLM and lock it. */
  presetId?: PresetId;
  /** When true, persist the draft + plan but do NOT enqueue a render job (operator checkpoint). */
  planOnly?: boolean;
}
```

Add the exported pure helper near the top of the file (after the imports):

```ts
/** The single planOnly decision — extracted so it is testable in isolation. */
export function shouldEnqueueRender(args: { planOnly?: boolean }): boolean {
  return !args.planOnly;
}
```

Then gate the enqueue line (currently `await deps.enqueueRender({ yourVideoId: draft.id });` at ~107):

```ts
    if (shouldEnqueueRender(args)) {
      await deps.enqueueRender({ yourVideoId: draft.id });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/lib/agents/longform/plan-only.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc -p tsconfig.json --noEmit
git add src/lib/agents/longform/orchestrator.ts src/tests/lib/agents/longform/plan-only.test.ts
git commit -m "feat(longform): planOnly mode — persist plan without enqueuing render"
```

---

## Task 2: Render estimate helper

**Files:**
- Create: `src/lib/longform/estimate.ts`
- Test: `src/tests/lib/longform/estimate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/lib/longform/estimate.test.ts
import { describe, it, expect } from "vitest";
import { estimateRender } from "@/lib/longform/estimate";

describe("estimateRender", () => {
  it("estimates credits + minutes for a 68-beat nano_banana_2 run at concurrency 2", () => {
    const e = estimateRender({ beatCount: 68, model: "nano_banana_2", concurrency: 2 });
    expect(e.credits).toBe(136); // 68 beats * 2 cr/image
    expect(e.minutes).toBe(17);  // ceil(68/2)*28s + 90s overhead ≈ 1042s
  });

  it("uses a cheaper, faster profile for gpt_image_2", () => {
    const e = estimateRender({ beatCount: 40, model: "gpt_image_2", concurrency: 3 });
    expect(e.credits).toBe(30);  // 40 * 0.75
    expect(e.minutes).toBe(4);   // ceil(40/3)*10s + 90s = 230s
  });

  it("falls back to a default profile for an unknown model", () => {
    const e = estimateRender({ beatCount: 10, model: "mystery_model" });
    expect(e.credits).toBe(15);  // 10 * 1.5
    expect(e.minutes).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/longform/estimate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/longform/estimate.ts
// Rough, honest estimate of render cost + wall time for the operator checkpoint.
// Calibrated against observed local runs (e.g. 66 nano_banana_2 frames ≈ 16 min at concurrency 2).

interface ModelProfile {
  /** Higgsfield credits per generated image. */
  creditsPerImage: number;
  /** Approx wall seconds per image (the gen step dominates). */
  secondsPerImage: number;
}

const MODEL_PROFILES: Record<string, ModelProfile> = {
  gpt_image_2: { creditsPerImage: 0.75, secondsPerImage: 10 },
  flux_2: { creditsPerImage: 1, secondsPerImage: 16 },
  seedream_v4_5: { creditsPerImage: 1, secondsPerImage: 16 },
  seedream_v5: { creditsPerImage: 1, secondsPerImage: 16 },
  nano_banana: { creditsPerImage: 2, secondsPerImage: 28 },
  nano_banana_2: { creditsPerImage: 2, secondsPerImage: 28 },
  nano_banana_2_ai_stylist: { creditsPerImage: 2, secondsPerImage: 28 },
  recraft_v4_1: { creditsPerImage: 1, secondsPerImage: 16 },
  grok_image: { creditsPerImage: 1, secondsPerImage: 16 },
  soul_v2: { creditsPerImage: 1, secondsPerImage: 16 },
};

const DEFAULT_PROFILE: ModelProfile = { creditsPerImage: 1.5, secondsPerImage: 20 };
const OVERHEAD_SECONDS = 90; // voice synth + sfx + ffmpeg mux, roughly constant.

export interface EstimateInput {
  beatCount: number;
  model: string;
  /** Higgsfield image concurrency the worker will use. Default 2 (safe for reference-driven). */
  concurrency?: number;
}

export interface RenderEstimate {
  credits: number;
  minutes: number;
}

export function estimateRender({ beatCount, model, concurrency = 2 }: EstimateInput): RenderEstimate {
  const profile = MODEL_PROFILES[model] ?? DEFAULT_PROFILE;
  const credits = Math.round(beatCount * profile.creditsPerImage);
  const batches = Math.ceil(beatCount / Math.max(1, concurrency));
  const seconds = batches * profile.secondsPerImage + OVERHEAD_SECONDS;
  const minutes = Math.round(seconds / 60);
  return { credits, minutes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/lib/longform/estimate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/longform/estimate.ts src/tests/lib/longform/estimate.test.ts
git commit -m "feat(longform): render credits+time estimate for the checkpoint"
```

---

## Task 3: Cluster → longform topic

**Files:**
- Create: `src/lib/niches/longform-topic.ts`
- Test: `src/tests/lib/niches/longform-topic.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/lib/niches/longform-topic.test.ts
import { describe, it, expect } from "vitest";
import { clusterToLongformInput } from "@/lib/niches/longform-topic";

describe("clusterToLongformInput", () => {
  it("maps a native niche cluster to a longform topic + target duration", () => {
    const input = clusterToLongformInput({
      canonical_topic: "backyard birds ranked",
      production_fit: "native",
    });
    expect(input.topic).toBe("backyard birds ranked");
    expect(input.targetDurationSeconds).toBe(210);
  });

  it("throws for non-native production fit (cannot auto-generate)", () => {
    expect(() =>
      clusterToLongformInput({ canonical_topic: "asmr carving", production_fit: "needs_manual_recording" }),
    ).toThrow(/native/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/niches/longform-topic.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/niches/longform-topic.ts
// A niche cluster is a broad label ("backyard birds ranked"); the longform writer agent
// turns it into a specific scripted video. This maps the cluster to the pipeline's input.
// The operator can edit `topic` at the cockpit entry before planning (steerable per the checkpoint).

export interface LongformTopicClusterInput {
  canonical_topic: string;
  production_fit: string;
}

export interface LongformPipelineInput {
  topic: string;
  targetDurationSeconds: number;
}

/** Default longform target — ~3.5 min, matching the proven B58 / bird renders. */
export const DEFAULT_LONGFORM_DURATION_SECONDS = 210;

export function clusterToLongformInput(c: LongformTopicClusterInput): LongformPipelineInput {
  if (c.production_fit !== "native") {
    throw new Error(
      `clusterToLongformInput: only 'native' production_fit auto-generates (got '${c.production_fit}')`,
    );
  }
  return {
    topic: c.canonical_topic.trim(),
    targetDurationSeconds: DEFAULT_LONGFORM_DURATION_SECONDS,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/lib/niches/longform-topic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/niches/longform-topic.ts src/tests/lib/niches/longform-topic.test.ts
git commit -m "feat(niches): cluster → longform topic input"
```

---

## Task 4: Auto-pick the best dominatable niche

**Files:**
- Create: `src/lib/niches/auto-pick.ts`
- Test: `src/tests/lib/niches/auto-pick.test.ts`

Reuses `assignBand` from `src/lib/scoring/select.ts` (`Band = "proven" | "unproven" | "none"`; unproven = the dominatable/first-mover band).

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/lib/niches/auto-pick.test.ts
import { describe, it, expect } from "vitest";
import { pickBestNiche, type PickableCluster } from "@/lib/niches/auto-pick";

const base = (over: Partial<PickableCluster>): PickableCluster => ({
  id: "x", canonical_topic: "t", production_fit: "native",
  niche_score: 0.5, proven_score: 0.1, first_mover_score: 0.1, ...over,
});

describe("pickBestNiche", () => {
  it("returns null when there are no native, banded clusters", () => {
    expect(pickBestNiche([])).toBeNull();
    expect(pickBestNiche([base({ production_fit: "manual_only", first_mover_score: 0.9 })])).toBeNull();
    expect(pickBestNiche([base({ first_mover_score: 0.1, proven_score: 0.1 })])).toBeNull(); // band "none"
  });

  it("prefers the highest first-mover (dominatable) native cluster", () => {
    const picked = pickBestNiche([
      base({ id: "a", first_mover_score: 0.75, niche_score: 0.6 }),
      base({ id: "b", first_mover_score: 0.92, niche_score: 0.55 }),
      base({ id: "c", proven_score: 0.8, first_mover_score: 0.1, niche_score: 0.9 }),
    ]);
    expect(picked?.cluster.id).toBe("b");
    expect(picked?.band).toBe("unproven");
    expect(picked?.reason).toMatch(/first-mover|dominatable/i);
  });

  it("falls back to the highest niche_score proven cluster when no dominatable exists", () => {
    const picked = pickBestNiche([
      base({ id: "p1", proven_score: 0.7, first_mover_score: 0.1, niche_score: 0.65 }),
      base({ id: "p2", proven_score: 0.8, first_mover_score: 0.1, niche_score: 0.82 }),
    ]);
    expect(picked?.cluster.id).toBe("p2");
    expect(picked?.band).toBe("proven");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/niches/auto-pick.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/niches/auto-pick.ts
// Picks the single best niche for the "Generate my best niche" hero.
// Prefers the dominatable (first-mover / "unproven") band per the niche playbook;
// falls back to the strongest proven niche. Only native-fit niches are auto-generatable.
import { assignBand, type Band } from "@/lib/scoring/select";

export interface PickableCluster {
  id: string;
  canonical_topic: string;
  production_fit: string;
  niche_score: number | null;
  proven_score: number | null;
  first_mover_score: number | null;
}

export interface NichePick {
  cluster: PickableCluster;
  band: Band;
  reason: string;
}

export function pickBestNiche(clusters: PickableCluster[]): NichePick | null {
  const native = clusters.filter((c) => c.production_fit === "native");
  const banded = native
    .map((c) => ({
      cluster: c,
      band: assignBand({
        id: c.id,
        nicheScore: c.niche_score ?? 0,
        provenScore: c.proven_score,
        firstMoverScore: c.first_mover_score,
        embedding: [],
      }),
    }))
    .filter((x) => x.band !== "none");

  if (banded.length === 0) return null;

  const dominatable = banded.filter((x) => x.band === "unproven");
  if (dominatable.length > 0) {
    const best = dominatable.sort(
      (a, b) => (b.cluster.first_mover_score ?? 0) - (a.cluster.first_mover_score ?? 0),
    )[0];
    return {
      cluster: best.cluster,
      band: "unproven",
      reason: "Highest first-mover signal — a dominatable niche (algorithm-driven, views ≫ subs).",
    };
  }

  const best = banded.sort((a, b) => (b.cluster.niche_score ?? 0) - (a.cluster.niche_score ?? 0))[0];
  return { cluster: best.cluster, band: best.band, reason: "Strongest proven niche this week." };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/lib/niches/auto-pick.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/niches/auto-pick.ts src/tests/lib/niches/auto-pick.test.ts
git commit -m "feat(niches): auto-pick the best dominatable niche for the hero"
```

---

## Task 5: Shared longform render-complete mapping (DRY) + refactor callback

**Files:**
- Create: `src/lib/render/longform-complete.ts`
- Modify: `src/app/api/render/complete/route.ts` (the `render_longform` branch ~83-96)
- Test: `src/tests/lib/render/longform-complete.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/lib/render/longform-complete.test.ts
import { describe, it, expect } from "vitest";
import { longformRenderUpdate } from "@/lib/render/longform-complete";

describe("longformRenderUpdate", () => {
  it("maps a successful render output to the your_videos update fields", () => {
    const upd = longformRenderUpdate({
      render_artifact_url: "https://blob/x.mp4",
      duration_seconds_actual: 185.4,
      chapter_markers: [{ index: 0, startMs: 0 }],
    });
    expect(upd.render_artifact_url).toBe("https://blob/x.mp4");
    expect(upd.duration_seconds).toBe(185.4);
    expect(upd.chapter_markers).toEqual([{ index: 0, startMs: 0 }]);
    expect(upd.status).toBe("rendered");
    expect(typeof upd.updated_at).toBe("string");
  });

  it("tolerates missing optional fields", () => {
    const upd = longformRenderUpdate({});
    expect(upd.render_artifact_url).toBeNull();
    expect(upd.duration_seconds).toBeNull();
    expect(upd.chapter_markers).toBeNull();
    expect(upd.status).toBe("rendered");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/render/longform-complete.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the shared mapping**

```ts
// src/lib/render/longform-complete.ts
// Single source of truth for how a successful render_longform output maps onto the
// your_videos draft. Used by BOTH the HTTP callback (cloud path) and the local worker
// daemon (mirrored copy in scripts/render-worker/lib/longform-complete.ts — keep in sync).

export interface LongformRenderOutput {
  render_artifact_url?: string;
  duration_seconds_actual?: number;
  chapter_markers?: unknown;
}

export interface LongformDraftUpdate {
  render_artifact_url: string | null;
  duration_seconds: number | null;
  chapter_markers: Record<string, unknown> | unknown[] | null;
  status: "rendered";
  updated_at: string;
}

export function longformRenderUpdate(out: LongformRenderOutput): LongformDraftUpdate {
  return {
    render_artifact_url: out.render_artifact_url ?? null,
    duration_seconds: out.duration_seconds_actual ?? null,
    chapter_markers: (out.chapter_markers ?? null) as LongformDraftUpdate["chapter_markers"],
    status: "rendered",
    updated_at: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Refactor the callback route to use it**

In `src/app/api/render/complete/route.ts`, replace the inline `render_longform` update object (the `.update({...})` at ~86-94) with the shared helper. Add the import at the top:

```ts
import { longformRenderUpdate } from "@/lib/render/longform-complete";
```

Change the branch body to:

```ts
if (jobRow.job_type === 'render_longform') {
  const longformOut = out as { render_artifact_url?: string; duration_seconds_actual?: number; chapter_markers?: unknown };
  const { error: updErr } = await supabase
    .from('your_videos')
    .update(longformRenderUpdate(longformOut))
    .eq('id', jobRow.your_video_id);
  // ...keep the existing updErr handling below unchanged...
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/tests/lib/render/longform-complete.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/render/longform-complete.ts src/app/api/render/complete/route.ts src/tests/lib/render/longform-complete.test.ts
git commit -m "refactor(render): shared longform render-complete mapping (callback + worker)"
```

---

## Task 6: Plan API route (Phase 1 SSE, planOnly)

**Files:**
- Create: `src/app/api/niches/studio/plan/route.ts`
- Test: `src/tests/app/niches/studio/plan-route.test.ts`

Mirrors `src/app/api/lab/longform/dispatch/route.ts` but loads a cluster, builds the longform input, and runs `planOnly`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/app/niches/studio/plan-route.test.ts
import { describe, it, expect } from "vitest";
import { buildPlanArgs } from "@/app/api/niches/studio/plan/route";

describe("buildPlanArgs", () => {
  it("builds planOnly pipeline args from a cluster + channel + optional topic override", () => {
    const args = buildPlanArgs(
      { canonical_topic: "backyard birds ranked", production_fit: "native" },
      "channel-1",
      undefined,
    );
    expect(args).toEqual({
      topic: "backyard birds ranked",
      targetDurationSeconds: 210,
      channelId: "channel-1",
      planOnly: true,
    });
  });

  it("honors an operator topic override", () => {
    const args = buildPlanArgs(
      { canonical_topic: "backyard birds ranked", production_fit: "native" },
      "channel-1",
      "Backyard birds ranked by how terrifying they are",
    );
    expect(args.topic).toBe("Backyard birds ranked by how terrifying they are");
    expect(args.planOnly).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/app/niches/studio/plan-route.test.ts`
Expected: FAIL — module/export not found.

- [ ] **Step 3: Implement the route + the exported helper**

```ts
// src/app/api/niches/studio/plan/route.ts
import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import { encodeSseEvent } from "@/lib/sse";
import { runLongformPipeline, type LongformPipelineArgs } from "@/lib/agents/longform/orchestrator";
import { buildLongformDeps } from "@/lib/agents/longform/deps";
import { getClusterById } from "@/lib/supabase/repositories/niche-clusters";
import { getDefaultChannel } from "@/lib/supabase/repositories/channels";
import { clusterToLongformInput } from "@/lib/niches/longform-topic";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Pure, testable: cluster + channel + optional topic override → planOnly pipeline args. */
export function buildPlanArgs(
  cluster: { canonical_topic: string; production_fit: string },
  channelId: string,
  topicOverride: string | undefined,
): LongformPipelineArgs {
  const base = clusterToLongformInput(cluster);
  return {
    topic: topicOverride?.trim() || base.topic,
    targetDurationSeconds: base.targetDurationSeconds,
    channelId,
    planOnly: true,
  };
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as { clusterId?: unknown; topic?: unknown };
  const clusterId = typeof body.clusterId === "string" ? body.clusterId : "";
  const topicOverride = typeof body.topic === "string" ? body.topic : undefined;
  if (!clusterId) {
    return new Response(JSON.stringify({ error: "clusterId is required" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = getServiceClient();
  const cluster = await getClusterById(supabase, clusterId);
  if (!cluster) {
    return new Response(JSON.stringify({ error: "cluster_not_found" }), {
      status: 404, headers: { "Content-Type": "application/json" },
    });
  }

  let args: LongformPipelineArgs;
  try {
    const channel = await getDefaultChannel(supabase);
    args = buildPlanArgs(
      { canonical_topic: cluster.canonical_topic, production_fit: cluster.production_fit ?? "manual_only" },
      channel.id,
      topicOverride,
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 422, headers: { "Content-Type": "application/json" },
    });
  }

  const deps = buildLongformDeps(supabase);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runLongformPipeline(args, deps)) {
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

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run src/tests/app/niches/studio/plan-route.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/niches/studio/plan/route.ts src/tests/app/niches/studio/plan-route.test.ts
git commit -m "feat(niches): studio plan API — Phase 1 planOnly SSE from a cluster"
```

---

## Task 7: Approve API route (idempotent render enqueue)

**Files:**
- Create: `src/app/api/niches/studio/[draftId]/approve/route.ts`
- Modify: `src/lib/supabase/repositories/render-jobs.ts` (add `getLatestRenderJobForVideo`)
- Test: `src/tests/app/niches/studio/approve-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/app/niches/studio/approve-route.test.ts
import { describe, it, expect, vi } from "vitest";
import { approveDraftForRender } from "@/app/api/niches/studio/[draftId]/approve/route";

function supa(existingJob: unknown) {
  const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: "job-new", status: "pending" }, error: null }) }) });
  const updateEq = vi.fn().mockResolvedValue({ data: null, error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  // latest render job lookup
  const maybeSingle = vi.fn().mockResolvedValue({ data: existingJob, error: null });
  const order = vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ maybeSingle }) });
  const eqSel = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq: eqSel });
  const from = vi.fn().mockReturnValue({ insert, update, select });
  return { client: { from } as never, insert, update };
}

describe("approveDraftForRender", () => {
  it("enqueues a render job + sets status rendering when none exists", async () => {
    const { client, insert, update } = supa(null);
    const res = await approveDraftForRender(client, "draft-1");
    expect(res.enqueued).toBe(true);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ job_type: "render_longform", payload: { your_video_id: "draft-1" }, your_video_id: "draft-1" }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "rendering" }));
  });

  it("is idempotent — does NOT enqueue a second job if one is already active", async () => {
    const { client, insert } = supa({ id: "job-old", status: "pending" });
    const res = await approveDraftForRender(client, "draft-1");
    expect(res.enqueued).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/app/niches/studio/approve-route.test.ts`
Expected: FAIL — module/export not found.

- [ ] **Step 3: Add the latest-job repository read**

In `src/lib/supabase/repositories/render-jobs.ts`, add:

```ts
/** Most recent render job for a draft (any status), or null. */
export async function getLatestRenderJobForVideo(
  supabase: SupabaseClient,
  yourVideoId: string,
): Promise<RenderJobRow | null> {
  const { data, error } = await supabase
    .from("render_jobs")
    .select()
    .eq("your_video_id", yourVideoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== "PGRST116") {
    throw new Error(`getLatestRenderJobForVideo: ${error.message}`);
  }
  return (data as RenderJobRow | null) ?? null;
}
```

- [ ] **Step 4: Implement the route + the exported helper**

```ts
// src/app/api/niches/studio/[draftId]/approve/route.ts
import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase/server";
import { enqueueRenderJob, getLatestRenderJobForVideo } from "@/lib/supabase/repositories/render-jobs";

const ACTIVE_STATUSES = new Set(["pending", "claimed", "running", "succeeded"]);

/** Pure, testable: enqueue exactly one render job for a draft, idempotently. */
export async function approveDraftForRender(
  supabase: SupabaseClient,
  draftId: string,
): Promise<{ enqueued: boolean; jobId: string | null }> {
  const existing = await getLatestRenderJobForVideo(supabase, draftId);
  if (existing && ACTIVE_STATUSES.has(existing.status)) {
    return { enqueued: false, jobId: existing.id };
  }
  const job = await enqueueRenderJob(supabase, {
    jobType: "render_longform",
    payload: { your_video_id: draftId },
    yourVideoId: draftId,
  });
  await supabase
    .from("your_videos")
    .update({ status: "rendering", updated_at: new Date().toISOString() })
    .eq("id", draftId);
  return { enqueued: true, jobId: job.id };
}

export async function POST(_req: Request, ctx: { params: Promise<{ draftId: string }> }): Promise<Response> {
  const { draftId } = await ctx.params;
  const supabase = getServiceClient();
  try {
    const res = await approveDraftForRender(supabase, draftId);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    console.error("approve failed", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/tests/app/niches/studio/approve-route.test.ts src/tests/lib/supabase/repositories/render-jobs.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/niches/studio/ src/lib/supabase/repositories/render-jobs.ts src/tests/app/niches/studio/approve-route.test.ts
git commit -m "feat(niches): studio approve API — idempotent render enqueue"
```

---

## Task 8: Studio status API + draft read

**Files:**
- Create: `src/app/api/niches/studio/[draftId]/status/route.ts`
- Modify: `src/lib/supabase/repositories/your-videos.ts` (add `getYourVideoById`)
- Test: `src/tests/app/niches/studio/status-route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/app/niches/studio/status-route.test.ts
import { describe, it, expect } from "vitest";
import { deriveStudioPhase, isWorkerStale } from "@/app/api/niches/studio/[draftId]/status/route";

describe("deriveStudioPhase", () => {
  it("checkpoint when draft + plan present, no render", () => {
    expect(deriveStudioPhase({ status: "draft", longform_plan: { hook: "h" } }, null)).toBe("checkpoint");
  });
  it("planning when draft + no plan yet", () => {
    expect(deriveStudioPhase({ status: "draft", longform_plan: null }, null)).toBe("planning");
  });
  it("rendering when status rendering", () => {
    expect(deriveStudioPhase({ status: "rendering", longform_plan: { hook: "h" } }, { status: "running" })).toBe("rendering");
  });
  it("done when rendered", () => {
    expect(deriveStudioPhase({ status: "rendered", longform_plan: { hook: "h" } }, { status: "succeeded" })).toBe("done");
  });
  it("error when failed", () => {
    expect(deriveStudioPhase({ status: "failed", longform_plan: { hook: "h" } }, { status: "failed" })).toBe("error");
  });
});

describe("isWorkerStale", () => {
  it("true when a job has sat pending with no claim past the threshold", () => {
    const old = new Date(Date.now() - 90_000).toISOString();
    expect(isWorkerStale({ status: "pending", claimed_at: null, created_at: old }, 60_000)).toBe(true);
  });
  it("false when claimed", () => {
    const old = new Date(Date.now() - 90_000).toISOString();
    expect(isWorkerStale({ status: "claimed", claimed_at: old, created_at: old }, 60_000)).toBe(false);
  });
  it("false when pending but still fresh", () => {
    const now = new Date().toISOString();
    expect(isWorkerStale({ status: "pending", claimed_at: null, created_at: now }, 60_000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/app/niches/studio/status-route.test.ts`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Add the draft read**

In `src/lib/supabase/repositories/your-videos.ts`, add:

```ts
export interface StudioDraft {
  id: string;
  status: string;
  title: string;
  longform_plan: Record<string, unknown> | null;
  render_artifact_url: string | null;
  duration_seconds: number | null;
  source_niche_cluster_id: string | null;
}

export async function getYourVideoById(
  supabase: SupabaseClient,
  id: string,
): Promise<StudioDraft | null> {
  const { data, error } = await supabase
    .from("your_videos")
    .select("id, status, title, longform_plan, render_artifact_url, duration_seconds, source_niche_cluster_id")
    .eq("id", id)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== "PGRST116") {
    throw new Error(`getYourVideoById: ${error.message}`);
  }
  return (data as StudioDraft | null) ?? null;
}
```

- [ ] **Step 4: Implement the route + pure helpers**

```ts
// src/app/api/niches/studio/[draftId]/status/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getYourVideoById } from "@/lib/supabase/repositories/your-videos";
import { getLatestRenderJobForVideo } from "@/lib/supabase/repositories/render-jobs";
import { estimateRender } from "@/lib/longform/estimate";

export const dynamic = "force-dynamic";

export type StudioPhase = "planning" | "checkpoint" | "rendering" | "done" | "error";

const WORKER_STALE_MS = 60_000;

/** Pure: derive the cockpit phase from the draft status + the latest render job. */
export function deriveStudioPhase(
  draft: { status: string; longform_plan: unknown },
  job: { status: string } | null,
): StudioPhase {
  if (draft.status === "failed" || job?.status === "failed") return "error";
  if (draft.status === "rendered") return "done";
  if (draft.status === "rendering") return "rendering";
  if (draft.status === "draft" && draft.longform_plan) return "checkpoint";
  return "planning";
}

/** Pure: a render job that has sat pending past the threshold with no claim → no worker running. */
export function isWorkerStale(
  job: { status: string; claimed_at: string | null; created_at: string },
  thresholdMs: number,
): boolean {
  if (job.status !== "pending" || job.claimed_at) return false;
  return Date.now() - new Date(job.created_at).getTime() > thresholdMs;
}

export async function GET(_req: Request, ctx: { params: Promise<{ draftId: string }> }): Promise<Response> {
  const { draftId } = await ctx.params;
  const supabase = getServiceClient();
  const draft = await getYourVideoById(supabase, draftId);
  if (!draft) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const job = await getLatestRenderJobForVideo(supabase, draftId);
  const phase = deriveStudioPhase(draft, job);

  const plan = draft.longform_plan as Record<string, unknown> | null;
  const beatCount = plan ? countBeats(plan) : 0;
  const model = plan ? String((plan.styleBible as Record<string, unknown> | undefined)?.model ?? "") : "";
  const estimate = beatCount > 0 && model ? estimateRender({ beatCount, model }) : null;

  return NextResponse.json({
    ok: true,
    phase,
    draft: {
      id: draft.id,
      title: draft.title,
      status: draft.status,
      renderArtifactUrl: draft.render_artifact_url,
      durationSeconds: draft.duration_seconds,
      sourceNicheClusterId: draft.source_niche_cluster_id,
      plan,
    },
    estimate,
    job: job
      ? { status: job.status, attempts: job.attempts, lastError: job.last_error, workerStale: isWorkerStale(job, WORKER_STALE_MS) }
      : null,
  });
}

function countBeats(plan: Record<string, unknown>): number {
  const chapters = (plan.chapters as Array<{ beats?: unknown[] }> | undefined) ?? [];
  return chapters.reduce((n, c) => n + (Array.isArray(c.beats) ? c.beats.length : 0), 0);
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/tests/app/niches/studio/status-route.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/niches/studio/ src/lib/supabase/repositories/your-videos.ts src/tests/app/niches/studio/status-route.test.ts
git commit -m "feat(niches): studio status API + phase/worker-staleness derivation"
```

---

## Task 9: Local render-worker daemon

**Files:**
- Create: `scripts/render-worker/lib/longform-complete.ts` (mirror of `src/lib/render/longform-complete.ts`)
- Create: `scripts/render-worker/lib/jobs.ts`
- Create: `scripts/render-worker/poll.ts`
- Modify: `package.json` (root) — add the `render-worker` script
- Test: `src/tests/render-worker/longform-complete-mirror.test.ts` (asserts the mirror matches the src mapping)

The worker cannot import `src/*`, so the render-complete mapping is mirrored. A test pins the mirror to the source so they cannot drift.

- [ ] **Step 1: Write the failing mirror-parity test**

```ts
// src/tests/render-worker/longform-complete-mirror.test.ts
import { describe, it, expect } from "vitest";
import { longformRenderUpdate as src } from "@/lib/render/longform-complete";
import { longformRenderUpdate as worker } from "../../../scripts/render-worker/lib/longform-complete";

describe("render-worker longform-complete mirror", () => {
  it("produces the same fields as the src mapping", () => {
    const out = { render_artifact_url: "https://blob/x.mp4", duration_seconds_actual: 100, chapter_markers: [{ i: 0 }] };
    const a = src(out); const b = worker(out);
    expect(b.render_artifact_url).toBe(a.render_artifact_url);
    expect(b.duration_seconds).toBe(a.duration_seconds);
    expect(b.chapter_markers).toEqual(a.chapter_markers);
    expect(b.status).toBe(a.status);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/render-worker/longform-complete-mirror.test.ts`
Expected: FAIL — worker mirror module not found.

- [ ] **Step 3: Create the mirror**

```ts
// scripts/render-worker/lib/longform-complete.ts
// MIRROR of src/lib/render/longform-complete.ts — keep in sync (pinned by a parity test).
export interface LongformRenderOutput {
  render_artifact_url?: string;
  duration_seconds_actual?: number;
  chapter_markers?: unknown;
}

export function longformRenderUpdate(out: LongformRenderOutput) {
  return {
    render_artifact_url: out.render_artifact_url ?? null,
    duration_seconds: out.duration_seconds_actual ?? null,
    chapter_markers: (out.chapter_markers ?? null) as Record<string, unknown> | unknown[] | null,
    status: "rendered" as const,
    updated_at: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Create the worker job helpers**

```ts
// scripts/render-worker/lib/jobs.ts
// Worker-side queue helpers (mirror of the relevant src render-jobs repo logic).
import type { SupabaseClient } from '@supabase/supabase-js';

export interface RenderJob {
  id: string;
  job_type: string;
  payload: unknown;
  status: string;
  your_video_id: string | null;
}

export async function claimOne(supabase: SupabaseClient): Promise<RenderJob | null> {
  const { data, error } = await supabase.rpc('claim_render_jobs', { p_limit: 1 });
  if (error) throw new Error(`claim_render_jobs: ${error.message}`);
  const rows = (data as RenderJob[] | null) ?? [];
  return rows[0] ?? null;
}

export async function markRunning(supabase: SupabaseClient, jobId: string): Promise<void> {
  const { error } = await supabase
    .from('render_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw new Error(`markRunning: ${error.message}`);
}

export async function markSucceeded(supabase: SupabaseClient, jobId: string): Promise<void> {
  const { error } = await supabase
    .from('render_jobs')
    .update({ status: 'succeeded', finished_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw new Error(`markSucceeded: ${error.message}`);
}

export async function markFailed(supabase: SupabaseClient, jobId: string, message: string): Promise<void> {
  const { error } = await supabase
    .from('render_jobs')
    .update({ status: 'failed', last_error: message.slice(0, 2000), finished_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw new Error(`markFailed: ${error.message}`);
}
```

- [ ] **Step 5: Create the polling daemon**

```ts
// scripts/render-worker/poll.ts
//
// Local render-worker daemon. Polls the render_jobs queue, runs longform renders on THIS
// machine (Higgsfield CLI + ffmpeg), and writes results straight back to Supabase. This is
// the local counterpart to the cloud Sandbox path (scripts/render-worker/run.ts).
//
// Run from the repo root:  npm run render-worker
//
// Defensive env: the daemon talks to Anthropic (vision) during reference-driven renders,
// so we unset ANTHROPIC_BASE_URL (a Claude Code shell sets it, which 404s the AI SDK),
// and default Higgsfield on with a safe concurrency for reference-driven gens.
delete process.env.ANTHROPIC_BASE_URL;
process.env.HIGGSFIELD_ENABLED ??= '1';
process.env.HIGGSFIELD_CONCURRENCY ??= '2';

import { getSupabase } from './lib/supabase.ts';
import { runRenderLongform } from './handlers/render-longform.ts';
import { claimOne, markRunning, markSucceeded, markFailed } from './lib/jobs.ts';
import { longformRenderUpdate, type LongformRenderOutput } from './lib/longform-complete.ts';

const IDLE_POLL_MS = 4_000;

async function processJob(supabase: ReturnType<typeof getSupabase>, job: Awaited<ReturnType<typeof claimOne>>): Promise<void> {
  if (!job) return;
  console.log(`[worker] claimed job ${job.id} (${job.job_type})`);
  await markRunning(supabase, job.id);
  try {
    if (job.job_type !== 'render_longform') {
      throw new Error(`local worker only handles render_longform (got ${job.job_type})`);
    }
    const output = (await runRenderLongform(job, supabase)) as LongformRenderOutput;
    if (job.your_video_id) {
      const { error } = await supabase.from('your_videos').update(longformRenderUpdate(output)).eq('id', job.your_video_id);
      if (error) throw new Error(`apply result: ${error.message}`);
    }
    await markSucceeded(supabase, job.id);
    console.log(`[worker] job ${job.id} done → ${output.render_artifact_url ?? '(no url)'}`);
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    console.error(`[worker] job ${job.id} failed:`, msg);
    await markFailed(supabase, job.id, msg);
    if (job.your_video_id) {
      await supabase.from('your_videos').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', job.your_video_id);
    }
  }
}

async function main(): Promise<void> {
  const supabase = getSupabase();
  console.log('[worker] local render-worker started — polling render_jobs…');
  let running = true;
  process.on('SIGINT', () => { console.log('\n[worker] shutting down after current job…'); running = false; });
  while (running) {
    let job = null;
    try {
      job = await claimOne(supabase);
    } catch (e) {
      console.error('[worker] claim error:', e instanceof Error ? e.message : e);
    }
    if (job) {
      await processJob(supabase, job);
    } else {
      await new Promise((r) => setTimeout(r, IDLE_POLL_MS));
    }
  }
  console.log('[worker] stopped.');
}

main().catch((err) => { console.error('[worker] fatal:', err); process.exit(1); });
```

- [ ] **Step 6: Add the root npm script**

In the root `package.json` `scripts` block, add (uses Node's `--env-file` to load `.env.local`):

```json
"render-worker": "node --import tsx --env-file=.env.local scripts/render-worker/poll.ts"
```

- [ ] **Step 7: Run the parity test + worker typecheck**

Run: `npx vitest run src/tests/render-worker/longform-complete-mirror.test.ts`
Expected: PASS.

Run: `cd scripts/render-worker && npx tsc --noEmit; cd ../..`
Expected: clean (no new errors from poll.ts / lib/jobs.ts / lib/longform-complete.ts).

- [ ] **Step 8: Commit**

```bash
git add scripts/render-worker/lib/longform-complete.ts scripts/render-worker/lib/jobs.ts scripts/render-worker/poll.ts package.json src/tests/render-worker/longform-complete-mirror.test.ts
git commit -m "feat(render-worker): local polling daemon for render_longform jobs"
```

---

## Task 10: Seed a few real dominatable niches (one-off)

**Files:**
- Create: `scripts/seed-niches.mjs`

Productizes the proven `/tmp/niche-scan.mjs` playbook into a committed script that writes real `niche_clusters` rows (so both entry points have data). Run once by the operator/agent. Uses `YOUTUBE_API_KEY` (present in `.env.local`) + Supabase service role.

- [ ] **Step 1: Create the script**

```js
// scripts/seed-niches.mjs
//
// One-off: run the dominatable-niche playbook against the YouTube Data API and write a
// handful of REAL niche_clusters rows so the /niches Generate Spine has data to pick from.
// This is a down payment on slice #2 (full productized ingestion) — NOT the recurring pipeline.
//
// Run:  node --env-file=.env.local scripts/seed-niches.mjs
//
// Requires: YOUTUBE_API_KEY, SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from '@supabase/supabase-js';

const KEY = process.env.YOUTUBE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('YOUTUBE_API_KEY missing'); process.exit(1); }
if (!SUPABASE_URL || !SERVICE_ROLE) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing'); process.exit(1); }

const SEEDS = [
  'ranked tier list', 'backyard birds', 'weird animals', 'deep sea creatures',
  'space facts', 'how it works', 'psychology facts', 'money mistakes',
  'the history of', 'what happens to your', 'unsolved mysteries', 'how the body works',
];
const PUBLISHED_AFTER = new Date(Date.now() - 120 * 86400000).toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function yt(path, params) {
  const u = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries({ ...params, key: KEY })) u.searchParams.set(k, v);
  const res = await fetch(u);
  const j = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(j.error?.errors ?? j).slice(0, 200)}`);
  return j;
}

// 1. search → video ids
const videoIds = new Set();
for (const q of SEEDS) {
  try {
    const j = await yt('search', { part: 'id', q, type: 'video', order: 'viewCount', publishedAfter: PUBLISHED_AFTER, maxResults: '50', regionCode: 'US', relevanceLanguage: 'en' });
    for (const it of j.items ?? []) if (it.id?.videoId) videoIds.add(it.id.videoId);
  } catch (e) { console.error(`search "${q}": ${e.message}`); }
  await sleep(40);
}

// 2. videos.list → stats + channel + title (batched 50)
const vids = [];
const idArr = [...videoIds];
for (let i = 0; i < idArr.length; i += 50) {
  const j = await yt('videos', { part: 'snippet,statistics', id: idArr.slice(i, i + 50).join(',') });
  for (const it of j.items ?? []) vids.push({ id: it.id, title: it.snippet?.title ?? '', channelId: it.snippet?.channelId, views: +(it.statistics?.viewCount ?? 0), published: it.snippet?.publishedAt });
}

// 3. channels.list → subs, age (batched 50)
const channelIds = [...new Set(vids.map((v) => v.channelId).filter(Boolean))];
const chan = new Map();
for (let i = 0; i < channelIds.length; i += 50) {
  const j = await yt('channels', { part: 'snippet,statistics', id: channelIds.slice(i, i + 50).join(',') });
  for (const it of j.items ?? []) chan.set(it.id, { created: it.snippet?.publishedAt, subs: +(it.statistics?.subscriberCount ?? 0) });
}

// 4. dominatable filter + score (same playbook as /tmp/niche-scan.mjs)
const squashRatio = (r) => r / (r + 10);
const squashViews = (v) => Math.min(1, Math.max(0, Math.log10(Math.max(1, v)) / 7));
const now = Date.now();
const byChannel = new Map();
for (const v of vids) {
  const c = chan.get(v.channelId); if (!c) continue;
  const cur = byChannel.get(v.channelId);
  if (!cur || v.views > cur.bestViews) byChannel.set(v.channelId, { ...c, channelId: v.channelId, bestViews: v.views, bestTitle: v.title, bestId: v.id });
}
const cands = [];
for (const c of byChannel.values()) {
  const ageDays = c.created ? (now - new Date(c.created).getTime()) / 86400000 : 99999;
  const ratio = c.subs > 0 ? c.bestViews / c.subs : (c.bestViews > 0 ? 999 : 0);
  if (ageDays > 365 || c.bestViews < 300_000 || ratio < 3) continue;
  const recency = Math.max(0.2, 1 - ageDays / 365);
  const firstMover = Math.sqrt(squashRatio(ratio) * squashViews(c.bestViews)) * recency;
  cands.push({ ...c, ageDays, ratio, firstMover });
}
cands.sort((a, b) => b.firstMover - a.firstMover);
const top = cands.slice(0, 8);
console.log(`found ${cands.length} dominatable channels; seeding top ${top.length} as niche_clusters`);

// 5. write niche_clusters rows for the current ISO week
function isoWeekStart(d = new Date()) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() - day + 1);
  return dt.toISOString().slice(0, 10);
}
const weekStart = isoWeekStart();
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
const rows = top.map((c, i) => ({
  week_start: weekStart,
  canonical_topic: c.bestTitle.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).slice(0, 6).join(' '),
  format_label: 'youtube_long',
  example_video_ids: [c.bestId],
  channel_count: 1,
  avg_views: c.bestViews,
  first_seen_at: c.created ?? null,
  first_mover_score: Math.min(0.99, Math.max(0.71, c.firstMover)), // ensure it lands in the dominatable band
  proven_score: 0.1,
  niche_score: Math.min(0.99, c.firstMover),
  discovery_state: 'public',
  production_fit: 'native',
  audience_signal: 'general',
  digest_rank: i + 1,
  explainability_top_signals: { viewsToSubsRatio: Math.round(c.ratio), firstMoverScore: Number(c.firstMover.toFixed(3)), channelAgeDays: Math.round(c.ageDays) },
}));

// Idempotent for the week: clear this week's seeded rows, then insert.
await supabase.from('niche_clusters').delete().eq('week_start', weekStart);
const { error } = await supabase.from('niche_clusters').insert(rows);
if (error) { console.error('insert failed:', error.message); process.exit(1); }
console.log(`seeded ${rows.length} niches for week ${weekStart}:`);
for (const r of rows) console.log(`  - ${r.canonical_topic} (views/subs ~${r.explainability_top_signals.viewsToSubsRatio}x, age ${r.explainability_top_signals.channelAgeDays}d)`);
```

- [ ] **Step 2: Verify the script typechecks as plain JS (syntax)**

Run: `node --check scripts/seed-niches.mjs`
Expected: no output (syntax OK).

- [ ] **Step 3: Run the seed (operator/agent — writes real rows)**

Run: `node --env-file=.env.local scripts/seed-niches.mjs`
Expected: logs `found N dominatable channels; seeding top 8…` then a list of seeded niches. (If `niche_clusters.format_label` rejects `youtube_long`, fall back to the value the niches feed already renders — check an existing row's `format_label` and reuse it.)

- [ ] **Step 4: Commit the script**

```bash
git add scripts/seed-niches.mjs
git commit -m "feat(niches): one-off seed script — real dominatable niches via the playbook"
```

---

### Phase 1 verification gate

- [ ] Run the full suite + both typechecks:

```bash
npx vitest run
npx tsc -p tsconfig.json --noEmit
( cd scripts/render-worker && npx tsc --noEmit )
```
Expected: all green; no new tsc errors.

- [ ] **End-to-end smoke (no UI):** with the dev server running (`env -u ANTHROPIC_BASE_URL npm run dev`) and a cockpit cookie, POST `/api/niches/studio/plan` with a seeded `clusterId` → confirm SSE ends with `job_completed` and a draft with `longform_plan` and NO render job. Then POST `/api/niches/studio/[draftId]/approve` → confirm one `render_jobs` row. Start `npm run render-worker` → confirm it claims the job, renders, and `your_videos.render_artifact_url` gets a playable URL with status `rendered`.

**→ Phase boundary. Stop here, hand off to a new chat for Phase 2 (see handoff at the end).**

---

# PHASE 2 — Cockpit UI + entry points

*The visible dashboard flow. Depends on Phase 1's APIs.*

## Task 11: Shared SSE parser + studio planning page

**Files:**
- Create: `src/components/niches/studio/sse.ts`
- Create: `src/app/niches/studio/page.tsx`
- Test: `src/tests/components/niches/studio/sse.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/components/niches/studio/sse.test.ts
import { describe, it, expect } from "vitest";
import { parseSseFrame } from "@/components/niches/studio/sse";

describe("parseSseFrame", () => {
  it("parses an event + data frame", () => {
    const ev = parseSseFrame('event: job_completed\ndata: {"videoId":"d1"}');
    expect(ev).toEqual({ type: "job_completed", data: { videoId: "d1" } });
  });
  it("returns null for malformed frames", () => {
    expect(parseSseFrame("nonsense")).toBeNull();
    expect(parseSseFrame("event: x\ndata: {bad json")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/components/niches/studio/sse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the parser (extracted from the lab run pane)**

```ts
// src/components/niches/studio/sse.ts
import type { StreamEvent } from "@/lib/agents/types";

/** Parse a single SSE frame ("event: <name>\ndata: <json>") into a StreamEvent, or null. */
export function parseSseFrame(frame: string): StreamEvent | null {
  const lines = frame.split("\n");
  let eventName: string | null = null;
  let dataLine: string | null = null;
  for (const line of lines) {
    if (line.startsWith("event: ")) eventName = line.slice(7).trim();
    else if (line.startsWith("data: ")) dataLine = line.slice(6);
  }
  if (!eventName || !dataLine) return null;
  try {
    return { type: eventName, data: JSON.parse(dataLine) } as StreamEvent;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Implement the planning page**

```tsx
// src/app/niches/studio/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageHeader } from "@/components/layout/page-header";
import { parseSseFrame } from "@/components/niches/studio/sse";
import type { AgentId } from "@/lib/agents/types";

const STEPS: { id: AgentId; label: string }[] = [
  { id: "writer", label: "Writer" },
  { id: "style_picker", label: "Style picker" },
  { id: "beat_planner", label: "Beat planner" },
  { id: "voice_coach", label: "Voice" },
];

export default function StudioPlanningPage() {
  const router = useRouter();
  const params = useSearchParams();
  const clusterId = params.get("cluster");
  const topic = params.get("topic") ?? undefined;
  const [states, setStates] = useState<Record<string, "idle" | "working" | "done" | "failed">>({});
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !clusterId) return;
    started.current = true;
    void (async () => {
      const res = await fetch("/api/niches/studio/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterId, topic }),
      });
      if (!res.ok || !res.body) { setFailure(`Plan failed (${res.status})`); return; }
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
          if (!ev) continue;
          if (ev.type === "agent_state") setStates((s) => ({ ...s, [ev.data.agent]: "working" }));
          if (ev.type === "agent_done") setStates((s) => ({ ...s, [ev.data.agent]: "done" }));
          if (ev.type === "job_failed") setFailure(ev.data.error);
          if (ev.type === "job_completed") router.replace(`/niches/studio/${ev.data.videoId}`);
        }
      }
    })();
  }, [clusterId, topic, router]);

  return (
    <AppShell sidebar={<AppSidebar activeHref="/niches" />}>
      <PageHeader title="Planning your video" description="Writing the script, picking the style, planning the beats…" />
      {!clusterId && <p className="text-sm text-[var(--danger)]">Missing niche. Go back to /niches and pick one.</p>}
      <ol className="mt-4 space-y-2">
        {STEPS.map((step) => {
          const st = states[step.id] ?? "idle";
          return (
            <li key={step.id} className="flex items-center gap-3 font-mono text-sm">
              <span className={st === "done" ? "text-[var(--accent)]" : st === "working" ? "text-amber-500" : "text-[var(--text-tertiary)]"}>
                {st === "done" ? "✓" : st === "working" ? "●" : "·"}
              </span>
              <span className="text-[var(--text-secondary)]">{step.label}</span>
            </li>
          );
        })}
      </ol>
      {failure && <p className="mt-4 text-sm text-[var(--danger)]">Planning failed: {failure}</p>}
    </AppShell>
  );
}
```

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run src/tests/components/niches/studio/sse.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS + clean. (If `AppShell`/`AppSidebar`/`PageHeader` import paths differ, match them to `src/app/niches/page.tsx`'s imports — quoted in the spec recon.)

- [ ] **Step 6: Commit**

```bash
git add src/components/niches/studio/sse.ts src/app/niches/studio/page.tsx src/tests/components/niches/studio/sse.test.ts
git commit -m "feat(niches): studio planning page — Phase 1 SSE → redirect to draft"
```

---

## Task 12: Draft-keyed cockpit (server load → phase router)

**Files:**
- Create: `src/app/niches/studio/[draftId]/page.tsx`
- Create: `src/components/niches/studio/studio-cockpit.tsx`

- [ ] **Step 1: Create the server page (loads the draft, derives phase, renders the cockpit)**

```tsx
// src/app/niches/studio/[draftId]/page.tsx
import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageHeader } from "@/components/layout/page-header";
import { getServiceClient } from "@/lib/supabase/server";
import { getYourVideoById } from "@/lib/supabase/repositories/your-videos";
import { getLatestRenderJobForVideo } from "@/lib/supabase/repositories/render-jobs";
import { deriveStudioPhase } from "@/app/api/niches/studio/[draftId]/status/route";
import { StudioCockpit } from "@/components/niches/studio/studio-cockpit";

export const dynamic = "force-dynamic";

export default async function StudioDraftPage({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  const supabase = getServiceClient();
  const draft = await getYourVideoById(supabase, draftId);
  if (!draft) {
    return (
      <AppShell sidebar={<AppSidebar activeHref="/niches" />}>
        <PageHeader title="Not found" description="That draft does not exist." />
      </AppShell>
    );
  }
  const job = await getLatestRenderJobForVideo(supabase, draftId);
  const initialPhase = deriveStudioPhase(draft, job);

  return (
    <AppShell sidebar={<AppSidebar activeHref="/niches" />}>
      <PageHeader title={draft.title} description="Generation cockpit" />
      <StudioCockpit draftId={draftId} initialPhase={initialPhase} />
    </AppShell>
  );
}
```

- [ ] **Step 2: Create the client cockpit (polls status, renders the right phase)**

```tsx
// src/components/niches/studio/studio-cockpit.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import type { StudioPhase } from "@/app/api/niches/studio/[draftId]/status/route";
import { Checkpoint } from "@/components/niches/studio/checkpoint";
import { RenderProgress } from "@/components/niches/studio/render-progress";
import { DonePanel } from "@/components/niches/studio/done-panel";

export interface StudioStatus {
  phase: StudioPhase;
  draft: {
    id: string; title: string; status: string;
    renderArtifactUrl: string | null; durationSeconds: number | null;
    sourceNicheClusterId: string | null;
    plan: Record<string, unknown> | null;
  };
  estimate: { credits: number; minutes: number } | null;
  job: { status: string; attempts: number; lastError: string | null; workerStale: boolean } | null;
}

export function StudioCockpit({ draftId, initialPhase }: { draftId: string; initialPhase: StudioPhase }) {
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const phase = status?.phase ?? initialPhase;

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/niches/studio/${draftId}/status`, { cache: "no-store" });
    if (res.ok) setStatus((await res.json()) as StudioStatus);
  }, [draftId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Poll while rendering.
  useEffect(() => {
    if (phase !== "rendering") return;
    const t = setInterval(() => void refresh(), 5_000);
    return () => clearInterval(t);
  }, [phase, refresh]);

  if (!status) return <p className="text-sm text-[var(--text-tertiary)]">Loading…</p>;

  if (phase === "checkpoint") return <Checkpoint draftId={draftId} status={status} onApproved={refresh} />;
  if (phase === "rendering") return <RenderProgress status={status} />;
  if (phase === "done") return <DonePanel status={status} />;
  if (phase === "error") return <p className="text-sm text-[var(--danger)]">Render failed: {status.job?.lastError ?? "unknown error"}</p>;
  return <p className="text-sm text-[var(--text-tertiary)]">Planning… reload if this persists.</p>;
}
```

- [ ] **Step 3: Typecheck (components referenced next exist after Tasks 13-15)**

Defer the typecheck until Task 15 (Checkpoint/RenderProgress/DonePanel are created there). For now:

Run: `node -e "require('fs').accessSync('src/components/niches/studio/studio-cockpit.tsx')"`
Expected: no output (file exists).

- [ ] **Step 4: Commit**

```bash
git add src/app/niches/studio/[draftId]/page.tsx src/components/niches/studio/studio-cockpit.tsx
git commit -m "feat(niches): studio cockpit shell — server load + phase router"
```

---

## Task 13: Checkpoint component

**Files:**
- Create: `src/components/niches/studio/checkpoint.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/niches/studio/checkpoint.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { StudioStatus } from "@/components/niches/studio/studio-cockpit";

function planField(plan: Record<string, unknown> | null, path: string[]): string {
  let cur: unknown = plan;
  for (const k of path) cur = (cur as Record<string, unknown> | null)?.[k];
  return typeof cur === "string" || typeof cur === "number" ? String(cur) : "—";
}

export function Checkpoint({ draftId, status, onApproved }: { draftId: string; status: StudioStatus; onApproved: () => void }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const plan = status.draft.plan;
  const chapters = (plan?.chapters as Array<{ title?: string; beats?: unknown[] }> | undefined) ?? [];
  const beatCount = chapters.reduce((n, c) => n + (Array.isArray(c.beats) ? c.beats.length : 0), 0);
  const chapterTitles = chapters.map((c) => (typeof c.title === "string" ? c.title : "Untitled"));

  const approve = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/niches/studio/${draftId}/approve`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && body.ok) { toast.success("Rendering started"); onApproved(); }
      else toast.error(body.error ?? `Approve failed (${res.status})`);
    } finally { setSubmitting(false); }
  };

  return (
    <Card>
      <CardHeader>
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Ready to render — approve before any credits burn</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">Hook</p>
          <p className="text-[var(--text-primary)]">{planField(plan, ["hook"])}</p>
        </div>
        {chapterTitles.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">Script · {chapterTitles.length} chapters</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-[var(--text-secondary)]">
              {chapterTitles.map((t, i) => <li key={i}>{t}</li>)}
            </ol>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4 font-mono text-xs text-[var(--text-secondary)]">
          <div>Style · <span className="text-[var(--text-primary)]">{planField(plan, ["presetId"])}</span></div>
          <div>Model · <span className="text-[var(--text-primary)]">{planField(plan, ["styleBible", "model"])}</span></div>
          <div>Beats · <span className="text-[var(--text-primary)]">{beatCount}</span> images</div>
          <div>Voice · <span className="text-[var(--text-primary)]">{planField(plan, ["voice", "provider"])}</span></div>
          {status.estimate && <div>Est · <span className="text-[var(--text-primary)]">~{status.estimate.credits} cr · ~{status.estimate.minutes} min</span></div>}
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={approve} disabled={submitting}>Approve &amp; render</Button>
          {status.draft.sourceNicheClusterId && (
            <Button variant="outline" onClick={() => router.push(`/niches/studio?cluster=${status.draft.sourceNicheClusterId}`)}>Regenerate plan</Button>
          )}
          <Button variant="ghost" onClick={() => router.push("/niches")}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

"Regenerate plan" re-runs Phase 1 (a fresh draft) for the same niche via its `sourceNicheClusterId` (returned by the status route, surfaced on `StudioStatus.draft`). It's hidden if the draft has no source cluster.

- [ ] **Step 2: Commit**

```bash
git add src/components/niches/studio/checkpoint.tsx
git commit -m "feat(niches): studio checkpoint — approve before render"
```

---

## Task 14: Render-progress component

**Files:**
- Create: `src/components/niches/studio/render-progress.tsx`

- [ ] **Step 1: Implement (honest coarse progress + worker-not-running hint)**

```tsx
// src/components/niches/studio/render-progress.tsx
"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { StudioStatus } from "@/components/niches/studio/studio-cockpit";

export function RenderProgress({ status }: { status: StudioStatus }) {
  const jobStatus = status.job?.status ?? "pending";
  const stale = status.job?.workerStale ?? false;
  const label =
    jobStatus === "pending" ? "Queued"
    : jobStatus === "claimed" ? "Starting"
    : jobStatus === "running" ? "Rendering frames + voice"
    : jobStatus;

  return (
    <Card>
      <CardHeader>
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]">
          <div className="h-full animate-pulse bg-[var(--accent)]" style={{ width: jobStatus === "running" ? "66%" : "20%" }} />
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          {status.estimate ? `This takes roughly ${status.estimate.minutes} minutes. ` : ""}
          You can leave this page and come back — the render keeps going.
        </p>
        {stale && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
            No render worker has picked this up. Start it locally: <code className="font-mono">npm run render-worker</code>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/niches/studio/render-progress.tsx
git commit -m "feat(niches): studio render-progress + worker-not-running hint"
```

---

## Task 15: Done panel + cockpit typecheck

**Files:**
- Create: `src/components/niches/studio/done-panel.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/niches/studio/done-panel.tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioStatus } from "@/components/niches/studio/studio-cockpit";

export function DonePanel({ status }: { status: StudioStatus }) {
  const router = useRouter();
  const url = status.draft.renderArtifactUrl;
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {url ? (
          <video src={url} controls className="aspect-video w-full rounded-lg bg-black" />
        ) : (
          <p className="text-sm text-[var(--danger)]">Render finished but no video URL was recorded.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {url && <Button asChild><a href={url} download>Download</a></Button>}
          <Button variant="outline" onClick={() => router.push("/lab")}>Open in Lab</Button>
          <Button variant="ghost" onClick={() => router.push("/niches")}>Generate another</Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck the whole cockpit now that all phase components exist**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: clean. (Fix import paths for `Button`/`Card` if your shadcn paths differ — confirmed `@/components/ui/button` + `@/components/ui/card` from the niche-card recon.)

- [ ] **Step 3: Commit**

```bash
git add src/components/niches/studio/done-panel.tsx
git commit -m "feat(niches): studio done panel — in-app video player + actions"
```

---

## Task 16: Hero + entry-point rewiring

**Files:**
- Create: `src/components/compositions/generate-best-niche.tsx`
- Modify: `src/app/niches/page.tsx` (mount the hero; compute the pick server-side)
- Modify: `src/app/niches/niches-feed.tsx` (`handleGenerate` → navigate to the cockpit; `g` shortcut)
- Modify: `src/components/compositions/niche-card.tsx` (fix the gate tooltip copy)

- [ ] **Step 1: Implement the hero**

```tsx
// src/components/compositions/generate-best-niche.tsx
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export interface BestNichePreview {
  clusterId: string;
  title: string;
  reason: string;
}

export function GenerateBestNiche({ pick }: { pick: BestNichePreview | null }) {
  const router = useRouter();
  if (!pick) {
    return (
      <div className="mb-8 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-raised)]/40 px-5 py-4 text-sm text-[var(--text-secondary)]">
        No dominatable niche to auto-generate yet — seed or ingest niches first.
      </div>
    );
  }
  return (
    <div className="mb-8 flex items-center justify-between gap-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-5 py-4">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">Tool's top pick</p>
        <p className="truncate text-base font-semibold text-[var(--text-primary)]">{pick.title}</p>
        <p className="truncate text-xs text-[var(--text-secondary)]">{pick.reason}</p>
      </div>
      <Button className="shrink-0" onClick={() => router.push(`/niches/studio?cluster=${pick.clusterId}`)}>
        Generate my best niche
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Mount the hero in the niches page**

In `src/app/niches/page.tsx`, after computing `clusters` and before `partitionBands`, add the pick + render the hero between `<PageHeader>` and `<NichesFeed>`:

```tsx
import { pickBestNiche } from "@/lib/niches/auto-pick";
import { GenerateBestNiche } from "@/components/compositions/generate-best-niche";

// …inside the component, after clusters are resolved:
const pick = pickBestNiche(
  clusters.map((c) => ({
    id: c.id, canonical_topic: c.canonical_topic, production_fit: c.production_fit ?? "manual_only",
    niche_score: c.niche_score, proven_score: c.proven_score, first_mover_score: c.first_mover_score,
  })),
);
const heroPick = pick ? { clusterId: pick.cluster.id, title: pick.cluster.canonical_topic, reason: pick.reason } : null;

// …in the returned JSX, between PageHeader and NichesFeed:
<GenerateBestNiche pick={heroPick} />
```

- [ ] **Step 3: Rewire per-niche Generate to the cockpit**

In `src/app/niches/niches-feed.tsx`, replace the body of `handleGenerate` (the `fetch('/api/niches/${id}/generate'…)` block, ~221-240) with a navigation:

```tsx
  const handleGenerate = useCallback(
    (id: string) => {
      router.push(`/niches/studio?cluster=${id}`);
    },
    [router],
  );
```

(The `g` keyboard shortcut already calls `handleGenerate`, so it now routes to the cockpit too.)

- [ ] **Step 4: Fix the gate tooltip copy**

In `src/components/compositions/niche-card.tsx`, the disabled-Generate tooltip currently says "Add to watch-list to unlock generation". Replace that `TooltipContent` text (and the `aria-label` fallback) with the real gate reason:

```tsx
              <TooltipContent side="top">
                Only native-format niches can auto-generate
              </TooltipContent>
```

And update the `aria-label` ternary's false branch to: `"Generate — only native-format niches can auto-generate"`.

- [ ] **Step 5: Typecheck + run the suite**

Run: `npx tsc -p tsconfig.json --noEmit && npx vitest run`
Expected: clean + all green.

- [ ] **Step 6: Commit**

```bash
git add src/components/compositions/generate-best-niche.tsx src/app/niches/page.tsx src/app/niches/niches-feed.tsx src/components/compositions/niche-card.tsx
git commit -m "feat(niches): auto-pick hero + route per-niche Generate into the cockpit"
```

---

### Phase 2 verification gate

- [ ] Full suite + typecheck green:

```bash
npx vitest run && npx tsc -p tsconfig.json --noEmit
```

- [ ] **Browser verification** (dev server running, `npm run render-worker` running):
  1. Open `/niches` → the "Generate my best niche" hero shows the top pick.
  2. Click it → cockpit planning steps animate → lands on the checkpoint with hook/style/beats/estimate.
  3. Click **Approve & render** → progress state; with the worker running, it renders.
  4. On completion → the finished video plays in the Done panel; Download works.
  5. Stop the worker, generate again, approve → confirm the "start the render worker" hint appears.
  6. Click **Generate** on a specific niche card → routes into the same cockpit.

---

## Notes for the implementer

- **Run the dev server** with `env -u ANTHROPIC_BASE_URL npm run dev` (or via `.claude/launch.json` "dev") — the AI SDK 404s otherwise.
- **The local worker** (`npm run render-worker`) must be running for any render to complete; it uses `.env.local` + Higgsfield CLI device-login on this machine.
- **Render-worker `src/*` boundary:** the worker can't import from `src/`. The only shared logic is the render-complete mapping, mirrored with a parity test (Task 9).
- **`render_jobs.job_type`:** `render_longform` is already enqueued in production today, so the DB check constraint already permits it. If a fresh DB rejects it, add a migration widening the constraint.
