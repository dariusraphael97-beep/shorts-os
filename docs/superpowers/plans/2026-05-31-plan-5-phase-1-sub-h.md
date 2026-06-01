# Sub-phase H — Niche Auto-Dispatch + /lab & /clips Redesign + Onboarding Scan Feed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make niche **Generate** drive the orchestrator end-to-end (composed draft → auto-render → review, publish operator-gated), rebuild the `/lab` + `/clips` interiors to the 9/10 design bar, and replace onboarding's silent scan with a live agent-status scan feed.

**Architecture:** Niche Generate returns instantly and runs `runPipeline` in a Next 16 `after()` background callback (bounded by `maxDuration=300`); on success it auto-enqueues `render_f1` ONLY for `your_videos` drafts (the compilation branch lands in `/clips`). The orchestrator threads the source cluster id + brief onto the explainer-branch draft so prediction-close can close the loop. The UI polls a topic-keyed status endpoint that resolves the produced output across `your_videos`/`compilation_drafts`. Onboarding kicks a 3-job scan chain in `after()` and shows a polled live feed.

**Tech Stack:** Next.js 16.2.6 (App Router, `after` from `next/server`), TypeScript strict (no `any` in source), Supabase JS, Vitest (fake-client + `vi.mock` convention), Tailwind design tokens + `motion/react`, Sonner.

**Spec:** `docs/superpowers/specs/2026-05-31-plan-5-phase-1-sub-h-design.md`

**Hard rules (every task):** TS strict, no `any`/`as unknown as` in source (idiomatic jsonb casts only). This is NOT the Next.js you know — read `node_modules/next/dist/docs/` before any new Next API. Premium UI 9/10; preview-verified. Prod migrations operator-gated (expected: none). Use `env -u ANTHROPIC_BASE_URL` for any dev/test/build command. The render worker (`scripts/render-worker`) can't import `src/*` (not touched here). Commit after every task.

---

## File Structure

**Workstream 1 — auto-dispatch**
- Create `src/lib/agents/auto-dispatch.ts` — `drainPipeline()`: drains `runPipeline`, branches on produced kind, enqueues `render_f1` for your_videos drafts.
- Create `src/lib/agents/generation-status.ts` — pure helpers: `resolveGenerationResult()` + `chipStatesFromProgress()`.
- Modify `src/lib/agents/orchestrator.ts` — thread `sourceNicheClusterId` + `scriptBrief` into the explainer-branch `createVideoDraft`.
- Modify `src/lib/supabase/repositories/jobs.ts` — add `getProduceVideoJobByTopic()`.
- Modify `src/lib/supabase/repositories/your-videos.ts` — add `getLatestYourVideoByTopic()`.
- Modify `src/lib/supabase/repositories/compilation-drafts.ts` — add `getLatestCompilationDraftByTopic()`.
- Create `src/app/api/niches/[id]/generation/route.ts` — GET topic-keyed status.
- Modify `src/app/api/niches/[id]/generate/route.ts` — preflight 409, delete stub, `after(drainPipeline)`.
- Create `src/components/niches/generation-progress.tsx` — presentational progress strip (reuses `PipelineStrip`).
- Create `src/components/niches/use-generate-pipeline.ts` — client hook (start + poll).
- Modify `src/app/niches/niches-feed.tsx`, `src/app/niches/[id]/detail-actions.tsx` — wire the hook + progress.

**Workstream 2 — redesign**
- Create `src/lib/lab/drafts-view.ts` — pure draft→row view-model (status, verdict badge, available actions).
- Modify `src/app/lab/page.tsx` + `src/components/lab/{recent-drafts-pane,ready-to-dispatch-pane,active-run-pane,draft-row,...}.tsx`.
- Modify `src/app/lab/drafts/page.tsx` + `src/components/lab/{drafts-list,drafts-tabs,draft-row,rendered-row,scheduled-row,posted-row}.tsx`.
- Modify `src/app/clips/page.tsx` + `src/components/clips/{inbox-tab,candidates-tab,rendered-tab,clips-tabs}.tsx`.

**Workstream 3 — onboarding scan**
- Create `src/lib/onboarding/scan.ts` — `runOnboardingScan()` (3-job chain) + `assembleScanStatus()` (pure).
- Create `src/app/api/onboarding/scan-status/route.ts` — GET live scan state.
- Modify `src/app/api/onboarding/complete/route.ts` — `after(runOnboardingScan)`.
- Modify `src/app/onboarding/onboarding-setup.tsx` — insert the First-scan step + poll.

---

## Task 1: Create branch + preflight prod audit

**Files:** none (setup + read-only audit).

- [ ] **Step 1: Create the H branch off the G branch**

```bash
git checkout plan-5-sub-g-agents-reviewer
git pull --ff-only 2>/dev/null || true
git checkout -b plan-5-sub-h-auto-dispatch
```

- [ ] **Step 2: Read-only prod audit (orchestrator/operator, via Supabase MCP)**

Run these read-only queries against prod `jfmjppzjicvbpnlkmxbg` (Supabase MCP `execute_sql`) and record the answers in the H handoff note later:

```sql
-- Any real render produced a review row yet? (closes part of G verification)
select v.id, v.status, v.review_id, r.overall_verdict, v.updated_at
from your_videos v left join video_reviews r on r.id = v.review_id
where v.status in ('rendered','scheduled','uploading','posted') order by v.updated_at desc limit 10;

-- Render job history (did render_f1 / review jobs run?)
select job_type, status, count(*) from render_jobs group by 1,2 order by 1,2;

-- Niche-sourced drafts so far (linkage sanity)
select id, status, source_niche_cluster_id, created_at from your_videos
where source_niche_cluster_id is not null order by created_at desc limit 10;
```

Record: does a rendered+reviewed video already exist? If YES → G's review pipeline is confirmed on real data (operator still eyeballs the UI + chat streaming). If NO → note that Workstream 1's first run is the verification.

- [ ] **Step 3: Commit a handoff stub capturing the audit**

```bash
mkdir -p docs/superpowers/notes
printf '# Plan #5 Phase 1 Sub-phase H — handoff (WIP)\n\n## Preflight audit (prod jfmjppzjicvbpnlkmxbg)\n- (fill in from Task 1 Step 2)\n' > docs/superpowers/notes/2026-05-31-plan-5-phase-1-sub-h-handoff.md
git add docs/superpowers/notes/2026-05-31-plan-5-phase-1-sub-h-handoff.md
git commit -m "chore(plan-5-h): branch + preflight audit stub"
```

---

## Task 2: Thread cluster linkage through the orchestrator

**Files:**
- Modify: `src/lib/agents/orchestrator.ts`
- Test: `src/tests/lib/agents/orchestrator.test.ts`

- [ ] **Step 1: Add the failing test** (append to the `runPipeline — success path` describe block, after the existing "creates a your_videos draft" test)

```ts
  it("threads sourceNicheClusterId + scriptBrief into the explainer-branch draft", async () => {
    for await (const _ev of runPipeline({
      topicId: "topic-uuid",
      supabase: {} as any,
      sourceNicheClusterId: "cluster-9",
      scriptBrief: { topic: "Vienna", audience: "history buffs" },
    })) { /* drain */ }

    const args = vi.mocked(createVideoDraft).mock.calls[0][1];
    expect(args.sourceNicheClusterId).toBe("cluster-9");
    expect(args.scriptBrief).toEqual({ topic: "Vienna", audience: "history buffs" });
  });

  it("passes null linkage when none supplied (manual Lab dispatch)", async () => {
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) { /* drain */ }
    const args = vi.mocked(createVideoDraft).mock.calls[0][1];
    expect(args.sourceNicheClusterId ?? null).toBeNull();
    expect(args.scriptBrief ?? null).toBeNull();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `env -u ANTHROPIC_BASE_URL npx vitest run src/tests/lib/agents/orchestrator.test.ts`
Expected: FAIL — `args.sourceNicheClusterId` is `undefined` (orchestrator doesn't forward it yet).

- [ ] **Step 3: Update `runPipeline` signature + destructure** (`src/lib/agents/orchestrator.ts`, the `runPipeline` args type and the destructure near line 42–46)

```ts
export async function* runPipeline(args: {
  topicId: string;
  supabase: SupabaseClient;
  sourceNicheClusterId?: string | null;
  scriptBrief?: Record<string, unknown> | null;
}): AsyncGenerator<StreamEvent> {
  const { topicId, supabase, sourceNicheClusterId = null, scriptBrief = null } = args;
```

- [ ] **Step 4: Forward them into the explainer-branch `createVideoDraft`** (the call near line 257 — the Director-branch draft, NOT the composer branch)

```ts
    const draft = await createVideoDraft(supabase, {
      channelId: channel.id,
      topicQueueId: topic.id,
      title: topic.title,
      script: writerOut.script,
      voiceProvider: voiceCoachOut.provider,
      voiceId: voiceCoachOut.voice_id,
      visualTreatment: directorOut.visual_treatment,
      durationSeconds: writerOut.estimated_duration_seconds,
      captionProps: directorOut.caption_props,
      sourceNicheClusterId,
      scriptBrief,
    });
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `env -u ANTHROPIC_BASE_URL npx vitest run src/tests/lib/agents/orchestrator.test.ts`
Expected: PASS (all prior orchestrator tests still green — the compilation branch is untouched).

- [ ] **Step 6: Typecheck + commit**

```bash
env -u ANTHROPIC_BASE_URL npx tsc --noEmit
git add src/lib/agents/orchestrator.ts src/tests/lib/agents/orchestrator.test.ts
git commit -m "feat(plan-5-h): thread niche cluster linkage into explainer-branch draft"
```

---

## Task 3: `drainPipeline` driver

**Files:**
- Create: `src/lib/agents/auto-dispatch.ts`
- Test: `src/tests/lib/agents/auto-dispatch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/repositories/your-videos", () => ({ getYourVideoById: vi.fn() }));
vi.mock("@/lib/supabase/repositories/render-jobs", () => ({ enqueueRenderJob: vi.fn() }));

import { drainPipeline } from "@/lib/agents/auto-dispatch";
import { getYourVideoById } from "@/lib/supabase/repositories/your-videos";
import { enqueueRenderJob } from "@/lib/supabase/repositories/render-jobs";
import type { StreamEvent } from "@/lib/agents/types";

function fakePipeline(events: StreamEvent[]) {
  return async function* () { for (const e of events) yield e; };
}
function supabaseWithUpdate(count: number) {
  return { from: () => ({ update: () => ({ eq: () => ({ eq: async () => ({ error: null, count }) }) }) }) } as never;
}

describe("drainPipeline", () => {
  it("enqueues render_f1 when the produced id is a your_videos draft", async () => {
    vi.mocked(getYourVideoById).mockResolvedValue({ id: "yv-1", status: "draft" } as never);
    await drainPipeline({
      topicId: "t1", sourceNicheClusterId: "c1", scriptBrief: {},
      supabase: supabaseWithUpdate(1),
      pipeline: fakePipeline([{ type: "job_completed", data: { videoId: "yv-1" } }]),
    });
    expect(enqueueRenderJob).toHaveBeenCalledWith(expect.anything(), {
      jobType: "render_f1", payload: { your_video_id: "yv-1" }, yourVideoId: "yv-1",
    });
  });

  it("skips render when the produced id is NOT a your_videos row (compilation)", async () => {
    vi.mocked(getYourVideoById).mockResolvedValue(null);
    await drainPipeline({
      topicId: "t1", sourceNicheClusterId: "c1", scriptBrief: {},
      supabase: {} as never,
      pipeline: fakePipeline([{ type: "job_completed", data: { videoId: "cd-1" } }]),
    });
    expect(enqueueRenderJob).not.toHaveBeenCalled();
  });

  it("does not enqueue on job_failed", async () => {
    await drainPipeline({
      topicId: "t1", sourceNicheClusterId: "c1", scriptBrief: {},
      supabase: {} as never,
      pipeline: fakePipeline([{ type: "job_failed", data: { agent: "writer", error: "x" } }]),
    });
    expect(enqueueRenderJob).not.toHaveBeenCalled();
  });

  it("swallows a pipeline throw (never rethrows)", async () => {
    const throwing = async function* (): AsyncGenerator<StreamEvent> { throw new Error("boom"); };
    await expect(drainPipeline({
      topicId: "t1", sourceNicheClusterId: "c1", scriptBrief: {},
      supabase: {} as never, pipeline: throwing,
    })).resolves.toBeUndefined();
    expect(enqueueRenderJob).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `env -u ANTHROPIC_BASE_URL npx vitest run src/tests/lib/agents/auto-dispatch.test.ts`
Expected: FAIL — module `@/lib/agents/auto-dispatch` not found.

- [ ] **Step 3: Implement `drainPipeline`**

```ts
// src/lib/agents/auto-dispatch.ts
//
// Background driver for niche → video auto-dispatch. Drains runPipeline to
// completion (ignoring the SSE-oriented events), then auto-enqueues render_f1
// ONLY when the orchestrator produced a your_videos draft (explainer branch).
// The compilation branch produces a compilation_drafts row that the operator
// continues from /clips, so it is intentionally skipped here. Everything is
// best-effort: this runs inside a Next `after()` callback and must never throw.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StreamEvent } from "./types";
import { runPipeline } from "./orchestrator";
import { getYourVideoById } from "@/lib/supabase/repositories/your-videos";
import { enqueueRenderJob } from "@/lib/supabase/repositories/render-jobs";

type Pipeline = (args: {
  topicId: string;
  supabase: SupabaseClient;
  sourceNicheClusterId?: string | null;
  scriptBrief?: Record<string, unknown> | null;
}) => AsyncGenerator<StreamEvent>;

export async function drainPipeline(args: {
  topicId: string;
  sourceNicheClusterId: string;
  scriptBrief: Record<string, unknown>;
  supabase: SupabaseClient;
  pipeline?: Pipeline;
}): Promise<void> {
  const { topicId, sourceNicheClusterId, scriptBrief, supabase } = args;
  const pipeline = args.pipeline ?? runPipeline;

  let producedId: string | null = null;
  try {
    for await (const ev of pipeline({ topicId, supabase, sourceNicheClusterId, scriptBrief })) {
      if (ev.type === "job_completed") producedId = ev.data.videoId;
    }
  } catch (err) {
    console.error("drainPipeline: pipeline threw (non-fatal)", err);
    return;
  }
  if (!producedId) return;

  try {
    const yv = await getYourVideoById(supabase, producedId);
    if (!yv) {
      console.info(`drainPipeline: ${producedId} is a compilation draft — skipping render_f1 (continues in /clips)`);
      return;
    }
    if (yv.status !== "draft") return;

    const { error, count } = await supabase
      .from("your_videos")
      .update({ status: "rendering", updated_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", producedId)
      .eq("status", "draft");
    if (error || !count) return;

    await enqueueRenderJob(supabase, {
      jobType: "render_f1",
      payload: { your_video_id: producedId },
      yourVideoId: producedId,
    });
  } catch (err) {
    console.error("drainPipeline: auto-render enqueue failed (non-fatal)", err);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `env -u ANTHROPIC_BASE_URL npx vitest run src/tests/lib/agents/auto-dispatch.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
env -u ANTHROPIC_BASE_URL npx tsc --noEmit
git add src/lib/agents/auto-dispatch.ts src/tests/lib/agents/auto-dispatch.test.ts
git commit -m "feat(plan-5-h): drainPipeline background driver (your_videos→render_f1, compilation→skip)"
```

---

## Task 4: Topic-keyed repo reads

**Files:**
- Modify: `src/lib/supabase/repositories/jobs.ts`
- Modify: `src/lib/supabase/repositories/your-videos.ts`
- Modify: `src/lib/supabase/repositories/compilation-drafts.ts`
- Test: `src/tests/lib/supabase/repositories/generation-reads.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { getProduceVideoJobByTopic } from "@/lib/supabase/repositories/jobs";
import { getLatestYourVideoByTopic } from "@/lib/supabase/repositories/your-videos";
import { getLatestCompilationDraftByTopic } from "@/lib/supabase/repositories/compilation-drafts";

function clientReturning(table: string, row: unknown) {
  return {
    from: (t: string) => {
      if (t !== table) throw new Error(`unexpected table ${t}`);
      return { select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) }) };
    },
  } as never;
}

describe("topic-keyed reads", () => {
  it("getProduceVideoJobByTopic returns the job row", async () => {
    const job = await getProduceVideoJobByTopic(clientReturning("jobs", { id: "j1", status: "running", current_agent: "writer", progress_pct: 60 }), "t1");
    expect(job?.id).toBe("j1");
  });
  it("getLatestYourVideoByTopic returns null when none", async () => {
    const v = await getLatestYourVideoByTopic(clientReturning("your_videos", null), "t1");
    expect(v).toBeNull();
  });
  it("getLatestCompilationDraftByTopic returns the id row", async () => {
    const d = await getLatestCompilationDraftByTopic(clientReturning("compilation_drafts", { id: "cd1" }), "t1");
    expect(d?.id).toBe("cd1");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `env -u ANTHROPIC_BASE_URL npx vitest run src/tests/lib/supabase/repositories/generation-reads.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Add `getProduceVideoJobByTopic`** (`src/lib/supabase/repositories/jobs.ts`, after `getActiveProduceVideoJob`)

```ts
export async function getProduceVideoJobByTopic(
  supabase: SupabaseClient,
  topicId: string,
): Promise<Job | null> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("kind", "produce_video")
    .eq("topic_queue_id", topicId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getProduceVideoJobByTopic: ${error.message}`);
  return (data ?? null) as Job | null;
}
```

- [ ] **Step 4: Add `getLatestYourVideoByTopic`** (`src/lib/supabase/repositories/your-videos.ts`, after `getYourVideoById`)

```ts
export async function getLatestYourVideoByTopic(
  supabase: SupabaseClient,
  topicId: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("your_videos")
    .select("id")
    .eq("topic_queue_id", topicId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestYourVideoByTopic: ${error.message}`);
  return (data ?? null) as { id: string } | null;
}
```

- [ ] **Step 5: Add `getLatestCompilationDraftByTopic`** (`src/lib/supabase/repositories/compilation-drafts.ts`, at the end)

```ts
export async function getLatestCompilationDraftByTopic(
  supabase: SupabaseClient,
  topicId: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("compilation_drafts")
    .select("id")
    .eq("topic_queue_id", topicId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestCompilationDraftByTopic: ${error.message}`);
  return (data ?? null) as { id: string } | null;
}
```

> Note: confirm `compilation_drafts` imports `SupabaseClient` already (it does — `insertCompilationDraft` uses it). If not, add `import type { SupabaseClient } from "@supabase/supabase-js";`.

- [ ] **Step 6: Run the test + typecheck + commit**

```bash
env -u ANTHROPIC_BASE_URL npx vitest run src/tests/lib/supabase/repositories/generation-reads.test.ts
env -u ANTHROPIC_BASE_URL npx tsc --noEmit
git add src/lib/supabase/repositories/jobs.ts src/lib/supabase/repositories/your-videos.ts src/lib/supabase/repositories/compilation-drafts.ts src/tests/lib/supabase/repositories/generation-reads.test.ts
git commit -m "feat(plan-5-h): topic-keyed reads for produce_video job + produced draft"
```

---

## Task 5: Pure generation-status helpers (resolver + chip mapper)

**Files:**
- Create: `src/lib/agents/generation-status.ts`
- Test: `src/tests/lib/agents/generation-status.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { resolveGenerationResult, chipStatesFromProgress } from "@/lib/agents/generation-status";

describe("resolveGenerationResult", () => {
  it("returns null while the job is still running", () => {
    expect(resolveGenerationResult({ jobStatus: "running", yourVideoId: null, compilationDraftId: null })).toBeNull();
  });
  it("returns your_video when a your_videos row exists on success", () => {
    expect(resolveGenerationResult({ jobStatus: "succeeded", yourVideoId: "yv1", compilationDraftId: "cd1" }))
      .toEqual({ kind: "your_video", videoId: "yv1" });
  });
  it("returns compilation when only a compilation draft exists on success", () => {
    expect(resolveGenerationResult({ jobStatus: "succeeded", yourVideoId: null, compilationDraftId: "cd1" }))
      .toEqual({ kind: "compilation", draftId: "cd1" });
  });
});

describe("chipStatesFromProgress", () => {
  it("marks agents before the current one done, current working, rest idle", () => {
    const s = chipStatesFromProgress({ currentAgent: "voice_coach", status: "running" });
    expect(s.strategist).toBe("done");
    expect(s.writer).toBe("done");
    expect(s.voice_coach).toBe("working");
    expect(s.director).toBe("idle");
  });
  it("marks everything done on success", () => {
    const s = chipStatesFromProgress({ currentAgent: "director", status: "succeeded" });
    expect(s.strategist).toBe("done");
    expect(s.director).toBe("done");
  });
  it("marks the current agent failed on failure", () => {
    const s = chipStatesFromProgress({ currentAgent: "writer", status: "failed" });
    expect(s.strategist).toBe("done");
    expect(s.writer).toBe("failed");
    expect(s.voice_coach).toBe("idle");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `env -u ANTHROPIC_BASE_URL npx vitest run src/tests/lib/agents/generation-status.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

```ts
// src/lib/agents/generation-status.ts
//
// Pure helpers for the niche-Generate live poll. No IO.

import type { AgentId } from "./types";
import type { JobStatus } from "@/lib/supabase/repositories/jobs";
import type { AgentChipState } from "@/components/lab/pipeline-strip";

export type GenerationResult =
  | { kind: "your_video"; videoId: string }
  | { kind: "compilation"; draftId: string }
  | null;

export function resolveGenerationResult(args: {
  jobStatus: JobStatus | null;
  yourVideoId: string | null;
  compilationDraftId: string | null;
}): GenerationResult {
  if (args.jobStatus !== "succeeded") return null;
  if (args.yourVideoId) return { kind: "your_video", videoId: args.yourVideoId };
  if (args.compilationDraftId) return { kind: "compilation", draftId: args.compilationDraftId };
  return null;
}

const ALL_AGENTS: AgentId[] = ["strategist", "writer", "voice_coach", "director", "composer"];
const STRIP_ORDER: AgentId[] = ["strategist", "writer", "voice_coach", "director"];

export function chipStatesFromProgress(args: {
  currentAgent: string | null;
  status: JobStatus | null;
}): Record<AgentId, AgentChipState> {
  const out = Object.fromEntries(ALL_AGENTS.map((a) => [a, "idle"])) as Record<AgentId, AgentChipState>;
  const done = args.status === "succeeded";
  const failed = args.status === "failed";
  const idx = args.currentAgent ? STRIP_ORDER.indexOf(args.currentAgent as AgentId) : -1;

  STRIP_ORDER.forEach((id, i) => {
    if (done) { out[id] = "done"; return; }
    if (failed) { out[id] = i < idx ? "done" : i === idx ? "failed" : "idle"; return; }
    if (idx < 0) { out[id] = i === 0 ? "working" : "idle"; return; }
    out[id] = i < idx ? "done" : i === idx ? "working" : "idle";
  });
  return out;
}
```

> If TS complains that `AgentId` has members beyond `ALL_AGENTS`, add the missing ids to `ALL_AGENTS` (the compile error is the signal). `AgentChipState` is a type-only import — no runtime coupling to the client component.

- [ ] **Step 4: Run + typecheck + commit**

```bash
env -u ANTHROPIC_BASE_URL npx vitest run src/tests/lib/agents/generation-status.test.ts
env -u ANTHROPIC_BASE_URL npx tsc --noEmit
git add src/lib/agents/generation-status.ts src/tests/lib/agents/generation-status.test.ts
git commit -m "feat(plan-5-h): pure generation-status resolver + chip mapper"
```

---

## Task 6: `GET /api/niches/[id]/generation` status endpoint

**Files:**
- Create: `src/app/api/niches/[id]/generation/route.ts`
- Test: `src/tests/app/api/niches-generation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getServiceClient: vi.fn(() => ({})) }));
const getProduceVideoJobByTopic = vi.fn();
const getLatestYourVideoByTopic = vi.fn();
const getLatestCompilationDraftByTopic = vi.fn();
vi.mock("@/lib/supabase/repositories/jobs", () => ({
  getProduceVideoJobByTopic: (...a: unknown[]) => getProduceVideoJobByTopic(...a),
}));
vi.mock("@/lib/supabase/repositories/your-videos", () => ({
  getLatestYourVideoByTopic: (...a: unknown[]) => getLatestYourVideoByTopic(...a),
}));
vi.mock("@/lib/supabase/repositories/compilation-drafts", () => ({
  getLatestCompilationDraftByTopic: (...a: unknown[]) => getLatestCompilationDraftByTopic(...a),
}));

import { GET } from "@/app/api/niches/[id]/generation/route";

function req(topicId?: string) {
  const url = topicId ? `http://x/api/niches/c1/generation?topicId=${topicId}` : `http://x/api/niches/c1/generation`;
  return new Request(url);
}
const ctx = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => { vi.clearAllMocks(); });

describe("GET /api/niches/[id]/generation", () => {
  it("400s without topicId", async () => {
    const res = await GET(req(), ctx);
    expect(res.status).toBe(400);
  });
  it("returns running job + null result", async () => {
    getProduceVideoJobByTopic.mockResolvedValue({ status: "running", current_agent: "writer", progress_pct: 60 });
    const res = await GET(req("t1"), ctx);
    const body = await res.json();
    expect(body.job).toEqual({ status: "running", currentAgent: "writer", progressPct: 60 });
    expect(body.result).toBeNull();
  });
  it("resolves your_video on success", async () => {
    getProduceVideoJobByTopic.mockResolvedValue({ status: "succeeded", current_agent: "director", progress_pct: 100 });
    getLatestYourVideoByTopic.mockResolvedValue({ id: "yv1" });
    const res = await GET(req("t1"), ctx);
    const body = await res.json();
    expect(body.result).toEqual({ kind: "your_video", videoId: "yv1" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `env -u ANTHROPIC_BASE_URL npx vitest run src/tests/app/api/niches-generation.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/niches/[id]/generation/route.ts
//
// GET /api/niches/[id]/generation?topicId=<id>
// Topic-keyed poll for the niche-Generate live state. Resolves the produced
// output across your_videos / compilation_drafts (the jobs row has no
// your_video_id column).

import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import { getProduceVideoJobByTopic } from "@/lib/supabase/repositories/jobs";
import { getLatestYourVideoByTopic } from "@/lib/supabase/repositories/your-videos";
import { getLatestCompilationDraftByTopic } from "@/lib/supabase/repositories/compilation-drafts";
import { resolveGenerationResult } from "@/lib/agents/generation-status";

export const dynamic = "force-dynamic";

export async function GET(req: Request, _ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const topicId = new URL(req.url).searchParams.get("topicId");
  if (!topicId) return Response.json({ error: "topicId required" }, { status: 400 });

  const supabase = getServiceClient();
  const job = await getProduceVideoJobByTopic(supabase, topicId);
  if (!job) return Response.json({ job: null, result: null });

  let yourVideoId: string | null = null;
  let compilationDraftId: string | null = null;
  if (job.status === "succeeded") {
    const yv = await getLatestYourVideoByTopic(supabase, topicId);
    yourVideoId = yv?.id ?? null;
    if (!yourVideoId) {
      const cd = await getLatestCompilationDraftByTopic(supabase, topicId);
      compilationDraftId = cd?.id ?? null;
    }
  }

  return Response.json({
    job: { status: job.status, currentAgent: job.current_agent, progressPct: job.progress_pct },
    result: resolveGenerationResult({ jobStatus: job.status, yourVideoId, compilationDraftId }),
  });
}
```

- [ ] **Step 4: Run + typecheck + commit**

```bash
env -u ANTHROPIC_BASE_URL npx vitest run src/tests/app/api/niches-generation.test.ts
env -u ANTHROPIC_BASE_URL npx tsc --noEmit
git add src/app/api/niches/[id]/generation/route.ts src/tests/app/api/niches-generation.test.ts
git commit -m "feat(plan-5-h): topic-keyed generation status endpoint"
```

---

## Task 7: Refactor `POST /api/niches/[id]/generate`

**Files:**
- Modify: `src/app/api/niches/[id]/generate/route.ts`
- Test: `src/tests/app/api/niches-generate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/server", async (orig) => {
  const actual = await orig<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => { void fn(); } };
});
vi.mock("@/lib/supabase/server", () => ({ getServiceClient: vi.fn(() => ({})) }));
const getClusterById = vi.fn();
vi.mock("@/lib/supabase/repositories/niche-clusters", () => ({ getClusterById: (...a: unknown[]) => getClusterById(...a) }));
const clusterToBrief = vi.fn();
vi.mock("@/lib/niches/cluster-brief", () => ({ clusterToBrief: (...a: unknown[]) => clusterToBrief(...a) }));
const insertManualTopic = vi.fn();
vi.mock("@/lib/supabase/repositories/topic-queue", () => ({ insertManualTopic: (...a: unknown[]) => insertManualTopic(...a) }));
const recordNicheAction = vi.fn();
vi.mock("@/lib/supabase/repositories/niche-actions", () => ({ recordNicheAction: (...a: unknown[]) => recordNicheAction(...a) }));
const getActiveProduceVideoJob = vi.fn();
vi.mock("@/lib/supabase/repositories/jobs", () => ({ getActiveProduceVideoJob: (...a: unknown[]) => getActiveProduceVideoJob(...a) }));
const drainPipeline = vi.fn();
vi.mock("@/lib/agents/auto-dispatch", () => ({ drainPipeline: (...a: unknown[]) => drainPipeline(...a) }));

import { POST } from "@/app/api/niches/[id]/generate/route";

const ctx = { params: Promise.resolve({ id: "c1" }) };
function post() { return new Request("http://x/api/niches/c1/generate", { method: "POST" }); }

beforeEach(() => {
  vi.clearAllMocks();
  getClusterById.mockResolvedValue({ id: "c1", canonical_topic: "Vienna", format_label: "narrated_history", audience_signal: "x", example_video_ids: [], production_fit: "native" });
  clusterToBrief.mockReturnValue({ title: "Vienna", summary: "s", rawPayload: { clusterId: "c1" } });
  insertManualTopic.mockResolvedValue({ id: "t1" });
  recordNicheAction.mockResolvedValue(undefined);
});

describe("POST /api/niches/[id]/generate", () => {
  it("404s on unknown cluster", async () => {
    getClusterById.mockResolvedValue(null);
    const res = await POST(post(), ctx);
    expect(res.status).toBe(404);
  });
  it("409s when a generation is already running", async () => {
    getActiveProduceVideoJob.mockResolvedValue({ id: "job-x" });
    const res = await POST(post(), ctx);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("generation_in_progress");
    expect(drainPipeline).not.toHaveBeenCalled();
  });
  it("dispatches: schedules drainPipeline + returns dispatched true (no stub draft)", async () => {
    getActiveProduceVideoJob.mockResolvedValue(null);
    const res = await POST(post(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, dispatched: true, topicId: "t1" });
    expect(drainPipeline).toHaveBeenCalledWith(expect.objectContaining({ topicId: "t1", sourceNicheClusterId: "c1", scriptBrief: { clusterId: "c1" } }));
    expect(recordNicheAction).toHaveBeenCalled();
  });
  it("422s on non-native (clusterToBrief throws)", async () => {
    getActiveProduceVideoJob.mockResolvedValue(null);
    clusterToBrief.mockImplementation(() => { throw new Error("not native"); });
    const res = await POST(post(), ctx);
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `env -u ANTHROPIC_BASE_URL npx vitest run src/tests/app/api/niches-generate.test.ts`
Expected: FAIL — current route returns `dispatched: false`, creates a stub draft, has no 409 path.

- [ ] **Step 3: Rewrite the route**

```ts
import { NextResponse } from "next/server";
import { after } from "next/server";
import { serializeError } from "@/lib/scrapers/shared";
import { getServiceClient } from "@/lib/supabase/server";
import { getClusterById } from "@/lib/supabase/repositories/niche-clusters";
import { clusterToBrief } from "@/lib/niches/cluster-brief";
import { insertManualTopic } from "@/lib/supabase/repositories/topic-queue";
import { recordNicheAction } from "@/lib/supabase/repositories/niche-actions";
import { getActiveProduceVideoJob } from "@/lib/supabase/repositories/jobs";
import { drainPipeline } from "@/lib/agents/auto-dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // the after() pipeline runs up to this long

// POST /api/niches/[id]/generate
//
// Auto-dispatch: cluster → brief → manual topic, then drive the orchestrator
// end-to-end in a background `after()` callback. On success drainPipeline
// auto-enqueues render_f1 (your_videos) so the video lands at the review page.
// Returns immediately; the UI polls GET /api/niches/[id]/generation?topicId=.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = getServiceClient();

  const cluster = await getClusterById(supabase, id);
  if (!cluster) return NextResponse.json({ ok: false, error: "cluster_not_found" }, { status: 404 });

  let brief;
  try {
    brief = clusterToBrief({
      id: cluster.id,
      canonical_topic: cluster.canonical_topic,
      format_label: cluster.format_label,
      audience_signal: cluster.audience_signal,
      example_video_ids: cluster.example_video_ids,
      production_fit: cluster.production_fit ?? "manual_only",
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 422 });
  }

  // One generation at a time (Sub-phase H decision: reject the 2nd).
  const active = await getActiveProduceVideoJob(supabase);
  if (active) {
    return NextResponse.json({ ok: false, error: "generation_in_progress", activeJobId: active.id }, { status: 409 });
  }

  try {
    const topic = await insertManualTopic(supabase, {
      title: brief.title,
      summary: brief.summary,
      rawPayload: brief.rawPayload,
      state: "reviewed",
    });
    await recordNicheAction(supabase, { nicheClusterId: cluster.id, action: "generated_from" });

    // Drive the orchestrator after the response is sent (bounded by maxDuration).
    after(() =>
      drainPipeline({
        topicId: topic.id,
        sourceNicheClusterId: cluster.id,
        scriptBrief: brief.rawPayload,
        supabase,
      }),
    );

    return NextResponse.json({ ok: true, dispatched: true, topicId: topic.id });
  } catch (e) {
    console.error("niche generate failed", e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
```

> Removed: `getDefaultChannel`, `createVideoDraft` imports + the stub-draft creation (the orchestrator now creates the real draft). Verify `brief.rawPayload` is typed `Record<string, unknown>`; if `clusterToBrief`'s return type is narrower, cast at the `scriptBrief:` arg with a typed `as Record<string, unknown>` only if necessary (prefer widening the brief type).

- [ ] **Step 4: Run the test to verify it passes**

Run: `env -u ANTHROPIC_BASE_URL npx vitest run src/tests/app/api/niches-generate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
env -u ANTHROPIC_BASE_URL npx tsc --noEmit
git add src/app/api/niches/[id]/generate/route.ts src/tests/app/api/niches-generate.test.ts
git commit -m "feat(plan-5-h): niche Generate drives orchestrator via after() (preflight 409, no stub)"
```

---

## Task 8: Niche Generate live-progress UI

**Files:**
- Create: `src/components/niches/use-generate-pipeline.ts`
- Create: `src/components/niches/generation-progress.tsx`
- Modify: `src/app/niches/niches-feed.tsx` (`handleGenerate`)
- Modify: `src/app/niches/[id]/detail-actions.tsx` (`handleGenerate`)
- Test: covered by Task 5 (pure mapper). UI is preview-verified.

- [ ] **Step 1: Create the client hook**

```ts
// src/components/niches/use-generate-pipeline.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { GenerationResult } from "@/lib/agents/generation-status";
import type { JobStatus } from "@/lib/supabase/repositories/jobs";

type Phase = "idle" | "generating" | "done" | "error";

export interface GenerateState {
  phase: Phase;
  currentAgent: string | null;
  status: JobStatus | null;
  result: GenerationResult;
}

export function useGeneratePipeline(clusterId: string) {
  const [state, setState] = useState<GenerateState>({ phase: "idle", currentAgent: null, status: null, result: null });
  const topicRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);
  useEffect(() => stop, [stop]);

  const poll = useCallback(async () => {
    const topicId = topicRef.current;
    if (!topicId) return;
    try {
      const res = await fetch(`/api/niches/${clusterId}/generation?topicId=${topicId}`);
      const body = (await res.json()) as { job: { status: JobStatus; currentAgent: string | null } | null; result: GenerationResult };
      if (!body.job) return;
      if (body.job.status === "succeeded") {
        stop();
        setState({ phase: "done", currentAgent: body.job.currentAgent, status: "succeeded", result: body.result });
      } else if (body.job.status === "failed") {
        stop();
        setState({ phase: "error", currentAgent: body.job.currentAgent, status: "failed", result: null });
        toast.error("Generation failed — try again");
      } else {
        setState({ phase: "generating", currentAgent: body.job.currentAgent, status: body.job.status, result: null });
      }
    } catch { /* transient; next tick retries */ }
  }, [clusterId, stop]);

  const start = useCallback(async () => {
    if (state.phase === "generating") return;
    setState({ phase: "generating", currentAgent: "strategist", status: "running", result: null });
    try {
      const res = await fetch(`/api/niches/${clusterId}/generate`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; topicId?: string };
      if (res.status === 409) {
        setState({ phase: "idle", currentAgent: null, status: null, result: null });
        toast.error("A generation is already running — finish it first");
        return;
      }
      if (!res.ok || !body.ok || !body.topicId) {
        setState({ phase: "error", currentAgent: null, status: "failed", result: null });
        toast.error(body.error ?? `Generate failed (${res.status})`);
        return;
      }
      topicRef.current = body.topicId;
      stop();
      timerRef.current = setInterval(poll, 2500);
    } catch (e) {
      setState({ phase: "error", currentAgent: null, status: "failed", result: null });
      toast.error(e instanceof Error ? e.message : "Generate request failed");
    }
  }, [clusterId, poll, state.phase, stop]);

  return { state, start };
}
```

- [ ] **Step 2: Create the presentational progress component**

```tsx
// src/components/niches/generation-progress.tsx
"use client";

import Link from "next/link";
import { PipelineStrip } from "@/components/lab/pipeline-strip";
import { chipStatesFromProgress } from "@/lib/agents/generation-status";
import type { GenerateState } from "./use-generate-pipeline";

export function GenerationProgress({ state }: { state: GenerateState }) {
  if (state.phase === "idle") return null;

  const chips = chipStatesFromProgress({ currentAgent: state.currentAgent, status: state.status });

  return (
    <div className="mt-3 flex flex-col gap-2">
      <PipelineStrip states={chips} />
      {state.phase === "generating" && (
        <p className="text-xs text-[var(--text-tertiary)]">Generating your draft…</p>
      )}
      {state.phase === "done" && state.result?.kind === "your_video" && (
        <Link href={`/lab/${state.result.videoId}/review`} className="text-xs font-medium text-[var(--accent)] hover:underline">
          Review →
        </Link>
      )}
      {state.phase === "done" && state.result?.kind === "compilation" && (
        <Link href="/clips" className="text-xs font-medium text-[var(--accent)] hover:underline">
          Open Clips →
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire `niches-feed.tsx`**

Replace the current `handleGenerate` (which fetches + toasts "Seeded a draft"). Per-card: instantiate the hook keyed by the card's cluster id and render `<GenerationProgress state={state} />` under the card's CTA row. Since `niches-feed` renders a list, lift a small `GenerateCell` wrapper that calls `useGeneratePipeline(card.id)` so each card has its own state. The card's Generate button calls `start()` and shows a spinner while `state.phase === "generating"`. Remove the old "Open Lab" toast path.

Acceptance: clicking Generate shows the pipeline strip animating; on completion the "Review →" (or "Open Clips →") link appears; a 2nd click while running shows the "already running" toast.

- [ ] **Step 4: Wire `detail-actions.tsx`**

Same: replace `handleGenerate`'s body with `useGeneratePipeline(clusterId).start()` and render `<GenerationProgress />` in the action panel. Keep the `canGenerate`/`busy` guards (disable the button while `state.phase === "generating"`). Remove the old "Seeded a draft" toast.

- [ ] **Step 5: Typecheck + build + commit**

```bash
env -u ANTHROPIC_BASE_URL npx tsc --noEmit
env -u ANTHROPIC_BASE_URL npm run build
git add src/components/niches/use-generate-pipeline.ts src/components/niches/generation-progress.tsx src/app/niches/niches-feed.tsx "src/app/niches/[id]/detail-actions.tsx"
git commit -m "feat(plan-5-h): niche Generate live pipeline progress + verdict deep-links"
```

- [ ] **Step 6: Preview verification (operator-gated)**

On the Vercel preview: Generate from a native niche → watch the strip → confirm it lands at `/lab/[videoId]/review` (renders + reviews via cron, the review page polls). This run is also the **G chain verification** (real render → `video_reviews` row). Record the result in the handoff.

---

## Task 9: `/lab` recent-drafts → premium drafts table (view-model + render)

**Files:**
- Create: `src/lib/lab/drafts-view.ts` — pure view-model.
- Test: `src/tests/lib/lab/drafts-view.test.ts`
- Modify: `src/components/lab/recent-drafts-pane.tsx`, `src/components/lab/draft-row.tsx`

- [ ] **Step 1: Write the failing test for the view-model**

```ts
import { describe, it, expect } from "vitest";
import { toDraftRow } from "@/lib/lab/drafts-view";

describe("toDraftRow", () => {
  it("a rendered draft with a ship verdict shows Review + Upload actions", () => {
    const row = toDraftRow({ id: "v1", title: "T", status: "rendered", review_verdict: "ship", thumbnail_url: null });
    expect(row.statusLabel).toBe("Rendered");
    expect(row.verdict).toBe("ship");
    expect(row.actions).toEqual(["review", "upload"]);
  });
  it("a draft (not yet rendered) shows the Render action only", () => {
    const row = toDraftRow({ id: "v1", title: "T", status: "draft", review_verdict: null, thumbnail_url: null });
    expect(row.actions).toEqual(["render"]);
    expect(row.verdict).toBeNull();
  });
  it("a blocked verdict still allows Review (the gate lives on the review page)", () => {
    const row = toDraftRow({ id: "v1", title: "T", status: "rendered", review_verdict: "block", thumbnail_url: null });
    expect(row.actions).toContain("review");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `env -u ANTHROPIC_BASE_URL npx vitest run src/tests/lib/lab/drafts-view.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the view-model**

```ts
// src/lib/lab/drafts-view.ts
//
// Pure mapping from a your_videos row (+ its review verdict) to a drafts-table
// row view-model. No JSX, no IO.

export type DraftStatus = "draft" | "rendering" | "rendered" | "scheduled" | "uploading" | "posted" | "failed";
export type ReviewVerdict = "ship" | "revise" | "block";
export type DraftAction = "render" | "review" | "upload";

const STATUS_LABEL: Record<DraftStatus, string> = {
  draft: "Draft", rendering: "Rendering", rendered: "Rendered",
  scheduled: "Scheduled", uploading: "Uploading", posted: "Posted", failed: "Failed",
};

export interface DraftRowVM {
  id: string;
  title: string;
  status: DraftStatus;
  statusLabel: string;
  verdict: ReviewVerdict | null;
  thumbnailUrl: string | null;
  actions: DraftAction[];
}

export function toDraftRow(input: {
  id: string; title: string; status: DraftStatus;
  review_verdict: ReviewVerdict | null; thumbnail_url: string | null;
}): DraftRowVM {
  const actions: DraftAction[] = [];
  if (input.status === "draft") actions.push("render");
  if (input.status === "rendered" || input.status === "scheduled") {
    actions.push("review", "upload");
  }
  return {
    id: input.id,
    title: input.title,
    status: input.status,
    statusLabel: STATUS_LABEL[input.status],
    verdict: input.verdict ?? input.review_verdict ?? null,
    thumbnailUrl: input.thumbnail_url,
    actions,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `env -u ANTHROPIC_BASE_URL npx vitest run src/tests/lib/lab/drafts-view.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Rebuild `recent-drafts-pane.tsx` + `draft-row.tsx` to premium**

Render the recent drafts as a real table/card-list using `toDraftRow`. Match the `/niches` and `/agents` design vocabulary: design tokens, `PageHeader`-consistent section header, `fadeRise` staggered rows, `HoverLift`, status pill, a verdict badge (ship=success / revise=warning / block=danger tokens), thumbnail (fallback placeholder), and the row's `actions` as buttons (Render → POST `/api/lab/render`; Review → link `/lab/[id]/review`; Upload → POST `/api/lab/upload`). Add a designed empty state ("No drafts yet — generate one from a niche") and a skeleton loading state. The pane reads `your_videos` joined to `video_reviews.overall_verdict` (extend the existing server fetch to select the verdict; if the current pane uses `listRecentDrafts`, add a sibling read that left-joins the verdict, or select `review:video_reviews(overall_verdict)`).

> Column note: `your_videos` has **no `thumbnail_url`** column in Phase 1 — it has `render_artifact_url` (nullable, the rendered MP4). Pass `thumbnail_url: null` to `toDraftRow` for now (the VM handles null → placeholder); a poster frame can be derived from `render_artifact_url` later. `video_reviews.overall_verdict` is the verdict source (join via `your_videos.review_id`).

Acceptance (preview): drafts render as a premium table with verdict badges + working row actions; empty + loading states look designed.

- [ ] **Step 6: Typecheck + build + commit**

```bash
env -u ANTHROPIC_BASE_URL npx tsc --noEmit
env -u ANTHROPIC_BASE_URL npm run build
git add src/lib/lab/drafts-view.ts src/tests/lib/lab/drafts-view.test.ts src/components/lab/recent-drafts-pane.tsx src/components/lab/draft-row.tsx
git commit -m "feat(plan-5-h): premium /lab drafts table with verdict badges + row actions"
```

---

## Task 10: `/lab` ready-to-dispatch + active-run interior elevation

**Files:**
- Modify: `src/app/lab/page.tsx`, `src/components/lab/ready-to-dispatch-pane.tsx`, `src/components/lab/active-run-pane.tsx`, and the agent cards (`strategist-card.tsx`, `writer-card.tsx`, `voice-coach-card.tsx`, `director-card.tsx`, `agent-card-shell.tsx`) as needed.
- No new pure logic → no new unit test; preview-verified.

- [ ] **Step 1: Elevate the page hierarchy** (`src/app/lab/page.tsx`)

Keep the 3-pane model. Lead with the ONE primary thing: when a run is live, the active run is the hero; otherwise lead with "drafts needing your review" (rendered + verdict) then "ready to dispatch". Use the `PageHeader` already present; tighten spacing/containers to match `/niches`.

- [ ] **Step 2: Rebuild `ready-to-dispatch-pane.tsx`** — premium queue cards: each reviewed topic shows niche provenance (source cluster topic + format chip when available), a brief preview, and a primary Dispatch button (existing `DispatchButton`). `fadeRise` stagger, `HoverLift`, designed empty state ("Nothing queued — generate from a niche").

- [ ] **Step 3: Elevate `active-run-pane.tsx`** — richer live pipeline: the `PipelineStrip` plus per-agent cards with current-agent emphasis and output peeks; smooth motion; reduced-motion honored. Reuse existing agent-card components; raise their visual fidelity to token-driven surfaces.

- [ ] **Step 4: Preview verification + commit**

```bash
env -u ANTHROPIC_BASE_URL npx tsc --noEmit
env -u ANTHROPIC_BASE_URL npm run build
git add src/app/lab/page.tsx src/components/lab/ready-to-dispatch-pane.tsx src/components/lab/active-run-pane.tsx src/components/lab/agent-card-shell.tsx src/components/lab/strategist-card.tsx src/components/lab/writer-card.tsx src/components/lab/voice-coach-card.tsx src/components/lab/director-card.tsx
git commit -m "feat(plan-5-h): elevate /lab ready-to-dispatch + active-run interiors"
```

---

## Task 11: `/lab/drafts` rebuild

**Files:**
- Modify: `src/app/lab/drafts/page.tsx`, `src/components/lab/{drafts-list,drafts-tabs,draft-row,rendered-row,scheduled-row,posted-row}.tsx`
- Reuse: `toDraftRow` from Task 9.

- [ ] **Step 1: Rebuild the page** — status-grouped tabs (`drafts-tabs`) over the premium row component from Task 9 (`toDraftRow`-driven). Each group (draft / rendering / rendered / scheduled / posted / failed) renders the same row composition with verdict badges and status-appropriate actions. Designed empty state per tab + skeleton loading. Match `/niches`/`/agents` vocabulary.

- [ ] **Step 2: Preview verification + commit**

```bash
env -u ANTHROPIC_BASE_URL npx tsc --noEmit
env -u ANTHROPIC_BASE_URL npm run build
git add src/app/lab/drafts/page.tsx src/components/lab/drafts-list.tsx src/components/lab/drafts-tabs.tsx src/components/lab/draft-row.tsx src/components/lab/rendered-row.tsx src/components/lab/scheduled-row.tsx src/components/lab/posted-row.tsx
git commit -m "feat(plan-5-h): rebuild /lab/drafts as premium status-grouped table"
```

---

## Task 12: `/clips` interior rebuild

**Files:**
- Modify: `src/app/clips/page.tsx`, `src/components/clips/{inbox-tab,candidates-tab,rendered-tab,clips-tabs}.tsx`

- [ ] **Step 1: Replace the bare header** (`src/app/clips/page.tsx`) — swap the `<h1 className="text-2xl …">` + `<p>` for the shared `PageHeader` (title "Clips", description as today). Keep `ClipsTabs`.

- [ ] **Step 2: Rebuild the three tabs** — Inbox / Candidates / Rendered as premium card/table compositions: thumbnails, velocity, source pills, a clear primary action per row (existing approve/promote routes), `fadeRise` stagger, `HoverLift`, designed empty + skeleton loading states. Match `/niches` vocabulary.

- [ ] **Step 3: Preview verification + commit**

```bash
env -u ANTHROPIC_BASE_URL npx tsc --noEmit
env -u ANTHROPIC_BASE_URL npm run build
git add src/app/clips/page.tsx src/components/clips/inbox-tab.tsx src/components/clips/candidates-tab.tsx src/components/clips/rendered-tab.tsx src/components/clips/clips-tabs.tsx
git commit -m "feat(plan-5-h): rebuild /clips header + tab interiors to design system"
```

---

## Task 13: Onboarding scan chain + status assembler (pure)

**Files:**
- Create: `src/lib/onboarding/scan.ts` — `runOnboardingScan()` + `assembleScanStatus()`.
- Test: `src/tests/lib/onboarding/scan.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { runOnboardingScan, assembleScanStatus } from "@/lib/onboarding/scan";
import type { IngestionRunRow } from "@/lib/supabase/repositories/ingestion-runs";

function run(job: IngestionRunRow["job"], status: IngestionRunRow["status"], items = 0): IngestionRunRow {
  return { id: job, job, status, started_at: "2026-05-31T00:00:00Z", finished_at: status === "partial" ? null : "2026-05-31T00:01:00Z", items_ingested: items, items_skipped: 0, quota_units: 0, error: null, context: {} };
}

describe("runOnboardingScan", () => {
  it("runs the 3 scan jobs in order, continuing past a failure", async () => {
    const calls: string[] = [];
    const trigger = vi.fn(async ({ job }: { job: string }) => { calls.push(job); if (job === "classify_observations") throw new Error("x"); return { ok: false, status: 500, body: null }; });
    await runOnboardingScan({ origin: "http://x", secret: "s", trigger });
    expect(calls).toEqual(["youtube_shorts_search", "classify_observations", "cluster_niches"]);
  });
});

describe("assembleScanStatus", () => {
  it("derives ordered steps + clustersFound + done", () => {
    const out = assembleScanStatus([
      run("youtube_shorts_search", "success", 40),
      run("classify_observations", "success", 38),
      run("cluster_niches", "success", 6),
    ]);
    expect(out.steps.map((s) => s.job)).toEqual(["youtube_shorts_search", "classify_observations", "cluster_niches"]);
    expect(out.clustersFound).toBe(6);
    expect(out.done).toBe(true);
  });
  it("done is false while any step is still partial/missing", () => {
    const out = assembleScanStatus([run("youtube_shorts_search", "partial")]);
    expect(out.done).toBe(false);
    expect(out.steps.find((s) => s.job === "cluster_niches")?.status).toBe("pending");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `env -u ANTHROPIC_BASE_URL npx vitest run src/tests/lib/onboarding/scan.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement scan chain + assembler**

```ts
// src/lib/onboarding/scan.ts
//
// The onboarding "first scan": a best-effort 3-job mini-run that materializes
// real niches (search → classify → cluster) so onboarding ends on niches, not
// raw observations. Plus a pure assembler that turns ingestion_runs into the
// scan-status feed payload.

import "server-only";
import { triggerIngestion } from "@/lib/ingestion/registry";
import type { IngestionJob, IngestionRunRow, IngestionStatus } from "@/lib/supabase/repositories/ingestion-runs";

export const SCAN_JOBS: IngestionJob[] = ["youtube_shorts_search", "classify_observations", "cluster_niches"];

type Trigger = typeof triggerIngestion;

export async function runOnboardingScan(args: { origin: string; secret: string; trigger?: Trigger }): Promise<void> {
  const trigger = args.trigger ?? triggerIngestion;
  for (const job of SCAN_JOBS) {
    try {
      await trigger({ job, origin: args.origin, secret: args.secret });
    } catch {
      // best-effort: a step failure must not abort the chain; first niches still
      // arrive at Monday's digest run.
    }
  }
}

export type ScanStepStatus = IngestionStatus | "pending";

export interface ScanStatus {
  steps: { job: IngestionJob; status: ScanStepStatus; itemsIngested: number }[];
  clustersFound: number;
  done: boolean;
}

export function assembleScanStatus(latestRuns: IngestionRunRow[]): ScanStatus {
  const byJob = new Map(latestRuns.map((r) => [r.job, r]));
  const steps = SCAN_JOBS.map((job) => {
    const r = byJob.get(job);
    return {
      job,
      status: (r ? (r.finished_at ? r.status : "partial") : "pending") as ScanStepStatus,
      itemsIngested: r?.items_ingested ?? 0,
    };
  });
  const clustersFound = byJob.get("cluster_niches")?.items_ingested ?? 0;
  const done = steps.every((s) => s.status === "success" || s.status === "partial" || s.status === "skipped" || s.status === "failed") &&
    steps.every((s) => s.status !== "pending") &&
    (byJob.get("cluster_niches")?.finished_at != null);
  return { steps, clustersFound, done };
}
```

> `done` is true only when all three jobs have a terminal row AND cluster_niches finished. Adjust the `done` predicate if the test reveals an edge (the test is the source of truth).

- [ ] **Step 4: Run the test to verify it passes**

Run: `env -u ANTHROPIC_BASE_URL npx vitest run src/tests/lib/onboarding/scan.test.ts`
Expected: PASS. If `done` logic mismatches the test, simplify to: `done = SCAN_JOBS.every(j => byJob.get(j)?.finished_at != null)`.

- [ ] **Step 5: Typecheck + commit**

```bash
env -u ANTHROPIC_BASE_URL npx tsc --noEmit
git add src/lib/onboarding/scan.ts src/tests/lib/onboarding/scan.test.ts
git commit -m "feat(plan-5-h): onboarding scan chain + status assembler"
```

---

## Task 14: `GET /api/onboarding/scan-status` + refactor `complete`

**Files:**
- Create: `src/app/api/onboarding/scan-status/route.ts`
- Modify: `src/app/api/onboarding/complete/route.ts`
- Test: `src/tests/api/onboarding-scan-status.test.ts`, update `src/tests/api/onboarding-complete.test.ts`

- [ ] **Step 1: Write the failing scan-status test**

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getServiceClient: vi.fn(() => ({})) }));
const listLatestRunPerJob = vi.fn();
vi.mock("@/lib/supabase/repositories/ingestion-runs", () => ({
  listLatestRunPerJob: (...a: unknown[]) => listLatestRunPerJob(...a),
}));

import { GET } from "@/app/api/onboarding/scan-status/route";

describe("GET /api/onboarding/scan-status", () => {
  it("returns the assembled scan status", async () => {
    listLatestRunPerJob.mockResolvedValue([
      { id: "1", job: "youtube_shorts_search", status: "success", started_at: "t", finished_at: "t", items_ingested: 40, items_skipped: 0, quota_units: 0, error: null, context: {} },
      { id: "2", job: "cluster_niches", status: "success", started_at: "t", finished_at: "t", items_ingested: 6, items_skipped: 0, quota_units: 0, error: null, context: {} },
    ]);
    const res = await GET();
    const body = await res.json();
    expect(body.clustersFound).toBe(6);
    expect(body.steps).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `env -u ANTHROPIC_BASE_URL npx vitest run src/tests/api/onboarding-scan-status.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement the scan-status route**

```ts
// src/app/api/onboarding/scan-status/route.ts
import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import { listLatestRunPerJob } from "@/lib/supabase/repositories/ingestion-runs";
import { assembleScanStatus } from "@/lib/onboarding/scan";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const supabase = getServiceClient();
  const latest = await listLatestRunPerJob(supabase);
  return Response.json(assembleScanStatus(latest));
}
```

- [ ] **Step 4: Refactor `complete/route.ts` to use `after`**

Replace the awaited single-trigger block with a backgrounded chain. Add at top:

```ts
import { after } from "next/server";
import { runOnboardingScan } from "@/lib/onboarding/scan";
```

Set `export const maxDuration = 300;` and replace the existing `try { await triggerIngestion(...) } catch {}` block with:

```ts
  const env = loadEnv();
  const origin = new URL(req.url).origin;
  after(() => runOnboardingScan({ origin, secret: env.CRON_SECRET }));

  return Response.json({ ok: true }, { status: 200 });
```

Remove the now-unused `triggerIngestion` import.

- [ ] **Step 5: Update the existing `onboarding-complete.test.ts`**

The old test asserted `triggerIngestion` ran synchronously inside POST. Now the scan runs in `after()`. Update the mock + assertions:

```ts
// add at top, alongside the other vi.mock calls:
vi.mock("next/server", async (orig) => {
  const actual = await orig<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => { void fn(); } };
});
const runOnboardingScan = vi.fn(async () => {});
vi.mock("@/lib/onboarding/scan", () => ({ runOnboardingScan: (...a: unknown[]) => runOnboardingScan(...a) }));
```

Replace the `triggerIngestion`-based assertions: the "persists, marks complete, enqueues a scan" test asserts `expect(runOnboardingScan).toHaveBeenCalled();`; the "still returns 200 when the scan enqueue fails" test makes `runOnboardingScan.mockRejectedValueOnce(new Error("network"))` and still expects 200 (the `after` wrapper swallows). Drop the now-irrelevant `@/lib/ingestion/registry` mock if unused (or keep it harmless).

- [ ] **Step 6: Run both tests + typecheck + commit**

```bash
env -u ANTHROPIC_BASE_URL npx vitest run src/tests/api/onboarding-scan-status.test.ts src/tests/api/onboarding-complete.test.ts
env -u ANTHROPIC_BASE_URL npx tsc --noEmit
git add src/app/api/onboarding/scan-status/route.ts src/app/api/onboarding/complete/route.ts src/tests/api/onboarding-scan-status.test.ts src/tests/api/onboarding-complete.test.ts
git commit -m "feat(plan-5-h): onboarding scan-status endpoint + backgrounded scan chain"
```

---

## Task 15: Onboarding First-scan step UI

**Files:**
- Modify: `src/app/onboarding/onboarding-setup.tsx`
- (Optional) Create: `src/components/onboarding/scan-feed.tsx` — the live feed component.

- [ ] **Step 1: Insert the First-scan step**

Change the finish flow (currently: POST `/api/onboarding/complete` then `router.push("/niches")`). Instead, on a successful complete response, switch the component into a `scanning` view (don't navigate yet). Render a live feed:
- A progress checklist mapped from `GET /api/onboarding/scan-status` (poll every ~2.5s): Searching YouTube → Classifying → Clustering, each step showing a spinner/check from `steps[].status` (`pending`/`partial` = active, `success` = done, `failed` = warn), and a running "N niches found" from `clustersFound`.
- Reuse the agents activity-feed vocabulary (tokens, `fadeRise`, check/spinner icons). Honor reduced-motion.
- A **"See your niches →"** CTA that routes to `/niches`. Auto-route when `done === true` (or let the operator click early). Designed slow/error fallback: if still not done after ~5 min, show "Still scanning — your niches will be ready by Monday's digest" + the CTA so the operator is never stuck.

- [ ] **Step 2: Typecheck + build + commit**

```bash
env -u ANTHROPIC_BASE_URL npx tsc --noEmit
env -u ANTHROPIC_BASE_URL npm run build
git add src/app/onboarding/onboarding-setup.tsx src/components/onboarding/scan-feed.tsx
git commit -m "feat(plan-5-h): onboarding first-scan live feed step"
```

- [ ] **Step 3: Preview verification (operator-gated, clean DB)**

On a clean-DB preview, run onboarding end-to-end: finish → watch the scan feed progress → confirm niches appear and "See your niches →" lands on `/niches`.

---

## Task 16: Full verification + handoff

**Files:**
- Modify: `docs/superpowers/notes/2026-05-31-plan-5-phase-1-sub-h-handoff.md`

- [ ] **Step 1: Run the full gate suite**

```bash
env -u ANTHROPIC_BASE_URL npx tsc --noEmit
env -u ANTHROPIC_BASE_URL npx vitest run
env -u ANTHROPIC_BASE_URL npm run build
```
Expected: `tsc` clean; vitest shows **no NEW failures** vs the G baseline (619 passing / 11 pre-existing env-gated failures — the new H suites all pass); build passes with the new routes (`/api/niches/[id]/generation`, `/api/onboarding/scan-status`) registered.

- [ ] **Step 2: Confirm no `any` introduced in source**

```bash
git diff plan-5-sub-g-agents-reviewer...HEAD -- 'src/**/*.ts' 'src/**/*.tsx' | grep -nE '\bany\b|as unknown as' | grep -v '/tests/' || echo "no new any in source"
```
Expected: `no new any in source` (test files may use `as never`/`as any` per the existing convention).

- [ ] **Step 3: Write the H handoff note**

Fill in `docs/superpowers/notes/2026-05-31-plan-5-phase-1-sub-h-handoff.md`: what shipped (3 workstreams), the preflight audit result, autonomous deviations, the OPERATOR TODO (preview UI pass for /lab, /lab/drafts, /clips, the onboarding scan feed on a clean DB, and — the big one — actually posting ≥1 niche-generated video toward §4.16's ≥3), and what's deferred (compilation→cluster linkage, concurrency queue). Include a copy-pasteable fresh-chat kickoff prompt for the next sub-phase (carry-forward: phase-boundary handoff feedback).

- [ ] **Step 4: Commit + finish the branch**

```bash
git add docs/superpowers/notes/2026-05-31-plan-5-phase-1-sub-h-handoff.md
git commit -m "docs(plan-5-h): Sub-phase H handoff note"
```

Then follow superpowers:finishing-a-development-branch to decide merge/PR.

---

## Self-Review (completed by plan author)

**Spec coverage:**
- §2 auto-dispatch → Tasks 2–8 (orchestrator linkage, drainPipeline, reads, status endpoint, generate route, UI). ✓
- §3 /lab + /clips redesign → Tasks 9–12. ✓
- §4 onboarding scan feed → Tasks 13–15. ✓
- §1 preflight G verification → Task 1 (audit) + Task 8 Step 6 (first real run closes the chain). ✓
- §5 migrations (zero) → no migration task; verified by build/types. ✓
- §8 verification gates → Task 16. ✓

**Placeholder scan:** logic tasks (2–7, 9, 13, 14) carry complete test + impl code. UI tasks (8, 10, 11, 12, 15) are design-quality work in an existing codebase — they give exact files, data contracts, and acceptance criteria referencing the `/niches`+`/agents` reference surfaces, with all pure helpers (chip mapper, drafts-view, scan assembler) fully TDD'd. This matches writing-plans guidance for visual work that can't be unit-tested.

**Type consistency:** `drainPipeline` args, `GenerationResult`, `resolveGenerationResult`, `chipStatesFromProgress`, `toDraftRow`/`DraftRowVM`, `runOnboardingScan`/`assembleScanStatus`/`ScanStatus`, and the repo read return shapes are referenced identically across tasks. `enqueueRenderJob` call shape matches `src/tests/api/lab-render.test.ts`. The `after` mock pattern is identical in Tasks 7 and 14.
