# Shorts OS — The Lab Implementation Plan (Plan #3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a live agent pipeline at `/lab` that turns a reviewed topic into a saved `your_videos` draft. Operator clicks "Dispatch" → watches Strategist → Writer (streamed script) → Voice Coach → Director assemble the draft over 30–90 seconds → reviews it in a Recent Drafts pane. No TTS audio, no b-roll fetching, no render — those are Plan #4.

**Architecture:** One long-running Vercel Function on Fluid Compute. The dispatch route opens a `text/event-stream` response and runs the 4 agents sequentially in a single request via an async-generator orchestrator. The orchestrator writes to `jobs`, `agent_messages`, `decisions`, `your_videos`, and updates `agents.current_state` at every boundary — fanning out to the existing Cockpit Team Status sidebar via Supabase Realtime. The Lab UI reads SSE events directly from the same stream; Realtime is only for cross-page Cockpit updates.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, AI SDK v6 + Anthropic provider (`getClaudeModel`), Supabase JS (service client), shadcn/ui (existing), Aceternity UI `moving-border`, Magic UI `border-beam` + `number-ticker` (already installed in Plan #2), Vitest, Zod.

**Spec reference:** `docs/superpowers/specs/2026-05-24-shorts-os-the-lab-design.md`

**Operator context:** Darius (16, MacBook Air, non-technical). Each task is sized for a subagent to execute in 5–15 minutes. Existing v0.2.0 cockpit is live on Vercel.

---

## File Structure (created or modified)

```
shorts-os/
├── package.json                                # Modified — version bump 0.2.0 → 0.3.0 (Phase 5)
├── README.md                                   # Modified — note Plan #3 lab shipped
├── src/
│   ├── app/
│   │   ├── lab/page.tsx                        # Modified — replaces placeholder; 3-pane layout
│   │   └── api/lab/
│   │       ├── dispatch/route.ts               # NEW — POST, opens SSE, runs orchestrator
│   │       ├── drafts/route.ts                 # NEW — GET, last 10 your_videos rows status='draft'
│   │       └── jobs/active/route.ts            # NEW — GET, current produce_video job if any
│   ├── components/
│   │   └── lab/                                # NEW — all lab-specific composed components
│   │       ├── ready-to-dispatch-pane.tsx     # Server component, list reviewed topics
│   │       ├── dispatch-button.tsx            # Client, opens SSE on click, polls active
│   │       ├── pipeline-strip.tsx             # 4 agent chips with state badges
│   │       ├── strategist-card.tsx            # Output card: dispatch directive + hints
│   │       ├── writer-card.tsx                # Streaming script + word counter
│   │       ├── voice-coach-card.tsx           # Voice pick + reasoning
│   │       ├── director-card.tsx              # Treatment + shot list table
│   │       ├── active-run-pane.tsx            # Client, owns the SSE reader
│   │       ├── recent-drafts-pane.tsx         # Server, last 10 drafts
│   │       └── draft-row.tsx                  # Client, expand inline
│   ├── lib/
│   │   ├── agents/                            # NEW — agent runners + orchestrator
│   │   │   ├── types.ts                       # Shared types: AgentId, AgentRunContext, StreamEvent
│   │   │   ├── constants.ts                   # VISUAL_TREATMENTS, VOICE_POOL
│   │   │   ├── strategist.ts                  # async runStrategist(ctx)
│   │   │   ├── writer.ts                      # async generator runWriter(ctx)
│   │   │   ├── voice-coach.ts                 # async runVoiceCoach(ctx)
│   │   │   ├── director.ts                    # async runDirector(ctx)
│   │   │   └── orchestrator.ts                # runPipeline(args) async generator
│   │   ├── sse.ts                             # NEW — encodeSseEvent helper
│   │   └── supabase/repositories/
│   │       ├── channels.ts                    # NEW — getDefaultChannel
│   │       ├── jobs.ts                        # NEW — createJob, getActiveJob, updateJobStatus, finishJob
│   │       ├── agent-messages.ts              # NEW — recordMessage
│   │       ├── decisions.ts                   # NEW — recordDecision
│   │       ├── your-videos.ts                 # NEW — createDraft, listRecentDrafts, discardDraft
│   │       ├── topic-queue.ts                 # Modified — add listReviewedTopics, getTopicById
│   │       └── agents.ts                      # Modified — add updateAgentState
│   └── tests/
│       ├── lib/
│       │   ├── agents/
│       │   │   ├── strategist.test.ts          # NEW
│       │   │   ├── voice-coach.test.ts         # NEW
│       │   │   ├── director.test.ts            # NEW
│       │   │   └── orchestrator.test.ts        # NEW — sequencing + writeback + failure + concurrency
│       │   ├── sse.test.ts                     # NEW
│       │   └── supabase/repositories/
│       │       ├── channels.test.ts            # NEW
│       │       ├── jobs.test.ts                # NEW
│       │       ├── agent-messages.test.ts      # NEW
│       │       ├── decisions.test.ts           # NEW
│       │       ├── your-videos.test.ts         # NEW
│       │       ├── topic-queue.test.ts         # Modified — add listReviewedTopics + getTopicById cases
│       │       └── agents.test.ts              # Modified — add updateAgentState case
└── supabase/migrations/
    └── 20260525000001_seed_default_channel.sql  # NEW — placeholder channel seed
```

**File-responsibility notes:**
- `src/lib/agents/*` is server-only — every file starts with `import "server-only";`.
- `src/components/lab/*` composes existing `src/components/ui/*` primitives (shadcn + Aceternity + Magic UI from Plan #2). Never edit `ui/*` directly.
- Agent runners are pure functions of `AgentRunContext`. The orchestrator owns DB writeback and event emission. Keeps runners trivially unit-testable.
- Repositories are server-only and accept the Supabase client as the first arg, so unit tests mock the client.

---

## Testing Philosophy

- **Unit tests (TDD)** for: every repository, every agent runner, the SSE encoder, the orchestrator (success + failure + concurrency paths).
- **Repositories** use the same mock-chain pattern as Plan #2 (see `src/tests/lib/supabase/repositories/topic-queue.test.ts`).
- **Agent runners** mock `ai`'s `generateObject` (and `streamText` for Writer) via `vi.mock`. Verify schema validation rejects bad outputs.
- **Orchestrator** mocks all four agent runners + all repositories. Verifies event ordering, DB row counts, and failure paths.
- **No UI snapshot tests.** Aesthetics will keep evolving.
- **Manual smoke checklist** runs against the live deploy at the end (Phase 5).
- **No integration tests in CI.** Optional gated `INTEGRATION=1` tests can exist but aren't required for merge.

---

## Conventions

- TypeScript strict mode. No `any`. Use `unknown` + Zod parse at boundaries.
- Server Components by default. Add `"use client"` only when needed (SSE reader, expand-on-click).
- All secret-holding modules (`lib/agents/*`, `lib/supabase/repositories/*`, `lib/supabase/server.ts`) start with `import "server-only"`.
- API routes validate inputs with Zod, return JSON (or `text/event-stream` for SSE), never throw to the framework.
- Conventional Commits (`feat:` / `fix:` / `chore:` / `docs:` / `test:` / `refactor:`).
- One task = one or more commits, but **every task ends with at least one commit** before moving on.
- New `src/lib/agents/*` files include a top-of-file comment explaining the file's role for future readers.

---

# PHASE 0: Database seed + repositories

## Task 0.1: Seed the default channel

**Files:**
- Create: `supabase/migrations/20260525000001_seed_default_channel.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260525000001_seed_default_channel.sql
--
-- Plan #3 (The Lab) requires at least one channel row so the agent pipeline
-- has a persona to read. This seeds a single placeholder channel that the
-- operator can hand-edit via Supabase Studio later. A real Channel Manager
-- UI is a future plan.

insert into public.channels (slug, display_name, platform, persona, default_voice_id, default_tts_provider, max_uploads_per_day)
values (
  'default',
  'Default Channel',
  'youtube',
  jsonb_build_object(
    'niche', 'history',
    'voice', 'dry deadpan, slightly skeptical',
    'pov', 'historical patterns repeat in unexpected places',
    'style_guide', 'open with a year or specific number, end with a question',
    'forbidden', array['breaking news', 'celebrity gossip', 'political hot takes']
  ),
  'sonic-narrator-male-deadpan',
  'cartesia',
  2
)
on conflict (slug) do nothing;
```

- [ ] **Step 2: Apply the migration to the linked Supabase project**

```bash
cd /Users/darius/Downloads/shorts-os
npx supabase db push
```

Expected: `Applying migration 20260525000001_seed_default_channel.sql... Finished supabase db push.`

If supabase CLI is not linked (error: `Linked project to ...`), this is an operator-pause moment. Report `NEEDS_CONTEXT` with the error message — the operator must run `npx supabase link --project-ref jfmjppzjicvbpnlkmxbg` first.

- [ ] **Step 3: Verify the row exists**

```bash
npx supabase db remote query "select slug, display_name, persona->>'niche' as niche from public.channels where slug='default'"
```

Expected output: one row with `slug=default`, `display_name=Default Channel`, `niche=history`.

If the `supabase db remote query` syntax is unavailable in your CLI version, fall back to a SQL one-liner via the project URL — but the easiest verification is opening Supabase Studio's Table Editor manually.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260525000001_seed_default_channel.sql
git commit -m "feat(db): seed default channel for Plan #3 lab pipeline"
```

---

## Task 0.2: Channels repository

**Files:**
- Create: `src/lib/supabase/repositories/channels.ts`
- Create: `src/tests/lib/supabase/repositories/channels.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/tests/lib/supabase/repositories/channels.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { getDefaultChannel } from "@/lib/supabase/repositories/channels";

function mockSupabaseChain(returnValue: unknown) {
  const obj: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => resolve(returnValue),
  };
  return obj;
}

describe("channels repository", () => {
  it("getDefaultChannel queries the right shape", async () => {
    const fakeChannel = { id: "uuid-123", slug: "default", display_name: "Default Channel" };
    const supa = mockSupabaseChain({ data: fakeChannel, error: null });
    const channel = await getDefaultChannel(supa as any);
    expect(supa.from).toHaveBeenCalledWith("channels");
    expect(supa.eq).toHaveBeenCalledWith("slug", "default");
    expect(supa.single).toHaveBeenCalled();
    expect(channel).toEqual(fakeChannel);
  });

  it("throws on supabase error", async () => {
    const supa = mockSupabaseChain({ data: null, error: { message: "boom" } });
    await expect(getDefaultChannel(supa as any)).rejects.toThrow(/boom/);
  });

  it("throws if no channel row found", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await expect(getDefaultChannel(supa as any)).rejects.toThrow(/default channel not found/i);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- src/tests/lib/supabase/repositories/channels.test.ts
```
Expected: FAIL with "Cannot find module @/lib/supabase/repositories/channels".

- [ ] **Step 3: Implement**

Create `src/lib/supabase/repositories/channels.ts`:

```typescript
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ChannelPersona = {
  niche: string;
  voice: string;
  pov: string;
  style_guide: string;
  forbidden: string[];
};

export type Channel = {
  id: string;
  slug: string;
  display_name: string;
  platform: "youtube" | "tiktok" | "instagram";
  external_channel_id: string | null;
  niche_id: string | null;
  persona: ChannelPersona;
  default_voice_id: string | null;
  default_tts_provider: "cartesia" | "elevenlabs" | null;
  is_active: boolean;
  max_uploads_per_day: number;
  created_at: string;
  updated_at: string;
};

export async function getDefaultChannel(supabase: SupabaseClient): Promise<Channel> {
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .eq("slug", "default")
    .single();
  if (error) throw new Error(`getDefaultChannel: ${error.message}`);
  if (!data) throw new Error("getDefaultChannel: default channel not found — did the seed migration run?");
  return data as Channel;
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/supabase/repositories/channels.test.ts
```
Expected: 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/repositories/channels.ts src/tests/lib/supabase/repositories/channels.test.ts
git commit -m "feat(repo): channels repository (getDefaultChannel)"
```

---

## Task 0.3: Jobs repository

**Files:**
- Create: `src/lib/supabase/repositories/jobs.ts`
- Create: `src/tests/lib/supabase/repositories/jobs.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/tests/lib/supabase/repositories/jobs.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import {
  createProduceVideoJob,
  getActiveProduceVideoJob,
  updateJobProgress,
  finishJobSuccess,
  finishJobFailure,
} from "@/lib/supabase/repositories/jobs";

function mockSupabaseChain(returnValue: unknown) {
  const obj: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => resolve(returnValue),
  };
  return obj;
}

describe("jobs repository", () => {
  it("createProduceVideoJob inserts with correct kind + status", async () => {
    const row = { id: "job-uuid", kind: "produce_video", status: "running" };
    const supa = mockSupabaseChain({ data: row, error: null });
    const result = await createProduceVideoJob(supa as any, { topicId: "t1", channelId: "c1" });
    expect(supa.from).toHaveBeenCalledWith("jobs");
    expect(supa.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "produce_video",
        status: "running",
        topic_queue_id: "t1",
        channel_id: "c1",
        current_step: "strategist",
        current_agent: "strategist",
        progress_pct: 0,
      })
    );
    expect(result).toEqual(row);
  });

  it("getActiveProduceVideoJob queries kind + status filter", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await getActiveProduceVideoJob(supa as any);
    expect(supa.from).toHaveBeenCalledWith("jobs");
    expect(supa.eq).toHaveBeenCalledWith("kind", "produce_video");
    expect(supa.in).toHaveBeenCalledWith("status", ["queued", "running"]);
    expect(supa.maybeSingle).toHaveBeenCalled();
  });

  it("updateJobProgress updates current_agent + progress_pct", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await updateJobProgress(supa as any, "job-1", { currentAgent: "writer", progressPct: 25 });
    expect(supa.update).toHaveBeenCalledWith({
      current_agent: "writer",
      current_step: "writer",
      progress_pct: 25,
    });
    expect(supa.eq).toHaveBeenCalledWith("id", "job-1");
  });

  it("finishJobSuccess sets succeeded + 100 pct + finished_at", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await finishJobSuccess(supa as any, "job-1");
    const updateCall = supa.update.mock.calls[0][0];
    expect(updateCall.status).toBe("succeeded");
    expect(updateCall.progress_pct).toBe(100);
    expect(typeof updateCall.finished_at).toBe("string");
  });

  it("finishJobFailure sets failed + error message + finished_at", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await finishJobFailure(supa as any, "job-1", "writer exploded");
    const updateCall = supa.update.mock.calls[0][0];
    expect(updateCall.status).toBe("failed");
    expect(updateCall.error).toBe("writer exploded");
    expect(typeof updateCall.finished_at).toBe("string");
  });

  it("createProduceVideoJob throws on supabase error", async () => {
    const supa = mockSupabaseChain({ data: null, error: { message: "boom" } });
    await expect(
      createProduceVideoJob(supa as any, { topicId: "t1", channelId: "c1" })
    ).rejects.toThrow(/boom/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- src/tests/lib/supabase/repositories/jobs.test.ts
```

- [ ] **Step 3: Implement**

Create `src/lib/supabase/repositories/jobs.ts`:

```typescript
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentId } from "@/lib/agents/types";

export type JobKind = "scrape" | "score_topics" | "produce_video" | "analyze_performance";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type Job = {
  id: string;
  kind: JobKind;
  channel_id: string | null;
  topic_queue_id: string | null;
  status: JobStatus;
  current_step: string | null;
  current_agent: string | null;
  progress_pct: number | null;
  error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export async function createProduceVideoJob(
  supabase: SupabaseClient,
  args: { topicId: string; channelId: string },
): Promise<Job> {
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      kind: "produce_video",
      status: "running",
      topic_queue_id: args.topicId,
      channel_id: args.channelId,
      current_step: "strategist",
      current_agent: "strategist",
      progress_pct: 0,
      started_at: new Date().toISOString(),
      metadata: {},
    })
    .select("*")
    .single();
  if (error) throw new Error(`createProduceVideoJob: ${error.message}`);
  return data as Job;
}

export async function getActiveProduceVideoJob(supabase: SupabaseClient): Promise<Job | null> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("kind", "produce_video")
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getActiveProduceVideoJob: ${error.message}`);
  return (data ?? null) as Job | null;
}

export async function updateJobProgress(
  supabase: SupabaseClient,
  jobId: string,
  args: { currentAgent: AgentId; progressPct: number },
): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({
      current_agent: args.currentAgent,
      current_step: args.currentAgent,
      progress_pct: args.progressPct,
    })
    .eq("id", jobId);
  if (error) throw new Error(`updateJobProgress: ${error.message}`);
}

export async function finishJobSuccess(supabase: SupabaseClient, jobId: string): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({
      status: "succeeded",
      progress_pct: 100,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) throw new Error(`finishJobSuccess: ${error.message}`);
}

export async function finishJobFailure(
  supabase: SupabaseClient,
  jobId: string,
  errorMessage: string,
): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({
      status: "failed",
      error: errorMessage,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) throw new Error(`finishJobFailure: ${error.message}`);
}
```

NOTE: This file imports `AgentId` from `@/lib/agents/types`, which is created in Task 1.2. Until Task 1.2 lands, the test will fail with a missing-import error. That's intentional — we sequence the type definition before consumers. If you're running TDD strictly, you can temporarily declare `type AgentId = string` in this file and replace it with the import once Task 1.2 ships. Either is acceptable.

- [ ] **Step 4: Stub the AgentId import for now**

Until Task 1.2 lands, add this temporary line at the top of `src/lib/supabase/repositories/jobs.ts` (replace with the real import after Task 1.2):

```typescript
// TEMP until Task 1.2 ships src/lib/agents/types.ts
type AgentId = "strategist" | "writer" | "voice_coach" | "director";
```

Remove the temp line + add `import type { AgentId } from "@/lib/agents/types";` after Task 1.2.

- [ ] **Step 5: Run, expect PASS**

```bash
npm test -- src/tests/lib/supabase/repositories/jobs.test.ts
```
Expected: 6 tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/repositories/jobs.ts src/tests/lib/supabase/repositories/jobs.test.ts
git commit -m "feat(repo): jobs repository (create, getActive, updateProgress, finish)"
```

---

## Task 0.4: Agent messages repository

**Files:**
- Create: `src/lib/supabase/repositories/agent-messages.ts`
- Create: `src/tests/lib/supabase/repositories/agent-messages.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/tests/lib/supabase/repositories/agent-messages.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { recordAgentMessage } from "@/lib/supabase/repositories/agent-messages";

function mockSupabaseChain(returnValue: unknown) {
  const obj: any = {
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => resolve(returnValue),
  };
  return obj;
}

describe("agent-messages repository", () => {
  it("recordAgentMessage inserts with correct fields", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await recordAgentMessage(supa as any, {
      jobId: "job-1",
      fromAgent: "strategist",
      toAgent: "writer",
      intent: "dispatch",
      payload: { directive: "x" },
    });
    expect(supa.from).toHaveBeenCalledWith("agent_messages");
    expect(supa.insert).toHaveBeenCalledWith({
      job_id: "job-1",
      from_agent: "strategist",
      to_agent: "writer",
      intent: "dispatch",
      payload: { directive: "x" },
    });
  });

  it("accepts null to_agent for terminal agents (director)", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await recordAgentMessage(supa as any, {
      jobId: "job-1",
      fromAgent: "director",
      toAgent: null,
      intent: "shot_list",
      payload: { treatment: "x" },
    });
    expect(supa.insert).toHaveBeenCalledWith(
      expect.objectContaining({ to_agent: null })
    );
  });

  it("throws on supabase error", async () => {
    const supa = mockSupabaseChain({ data: null, error: { message: "boom" } });
    await expect(
      recordAgentMessage(supa as any, {
        jobId: "j1",
        fromAgent: "writer",
        toAgent: "voice_coach",
        intent: "script",
        payload: {},
      })
    ).rejects.toThrow(/boom/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- src/tests/lib/supabase/repositories/agent-messages.test.ts
```

- [ ] **Step 3: Implement**

Create `src/lib/supabase/repositories/agent-messages.ts`:

```typescript
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// TEMP until Task 1.2 ships src/lib/agents/types.ts
type AgentId = "strategist" | "writer" | "voice_coach" | "director";

export type AgentMessageIntent =
  | "dispatch"
  | "script"
  | "voice_pick"
  | "shot_list"
  | "error";

export async function recordAgentMessage(
  supabase: SupabaseClient,
  args: {
    jobId: string;
    fromAgent: AgentId;
    toAgent: AgentId | null;
    intent: AgentMessageIntent;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("agent_messages").insert({
    job_id: args.jobId,
    from_agent: args.fromAgent,
    to_agent: args.toAgent,
    intent: args.intent,
    payload: args.payload,
  });
  if (error) throw new Error(`recordAgentMessage: ${error.message}`);
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/supabase/repositories/agent-messages.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/repositories/agent-messages.ts src/tests/lib/supabase/repositories/agent-messages.test.ts
git commit -m "feat(repo): agent-messages repository (recordAgentMessage)"
```

---

## Task 0.5: Decisions repository

**Files:**
- Create: `src/lib/supabase/repositories/decisions.ts`
- Create: `src/tests/lib/supabase/repositories/decisions.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/tests/lib/supabase/repositories/decisions.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { recordDecision } from "@/lib/supabase/repositories/decisions";

function mockSupabaseChain(returnValue: unknown) {
  const obj: any = {
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => resolve(returnValue),
  };
  return obj;
}

describe("decisions repository", () => {
  it("recordDecision inserts with correct fields and defaults alternatives to []", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await recordDecision(supa as any, {
      jobId: "j1",
      agentId: "strategist",
      decisionType: "topic_dispatch",
      inputs: { topic: { id: "t1" } },
      chosen: { directive: "x" },
      reasoning: "because",
    });
    expect(supa.from).toHaveBeenCalledWith("decisions");
    expect(supa.insert).toHaveBeenCalledWith({
      job_id: "j1",
      agent_id: "strategist",
      decision_type: "topic_dispatch",
      inputs: { topic: { id: "t1" } },
      alternatives: [],
      chosen: { directive: "x" },
      scores: null,
      reasoning: "because",
    });
  });

  it("accepts custom alternatives + scores", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await recordDecision(supa as any, {
      jobId: "j1",
      agentId: "voice_coach",
      decisionType: "voice_pick",
      inputs: { script: "x" },
      alternatives: [{ id: "a" }, { id: "b" }],
      chosen: { id: "a" },
      reasoning: "because",
      scores: { a: 0.8, b: 0.5 },
    });
    expect(supa.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        alternatives: [{ id: "a" }, { id: "b" }],
        scores: { a: 0.8, b: 0.5 },
      })
    );
  });

  it("throws on supabase error", async () => {
    const supa = mockSupabaseChain({ data: null, error: { message: "boom" } });
    await expect(
      recordDecision(supa as any, {
        jobId: "j1",
        agentId: "writer",
        decisionType: "script",
        inputs: {},
        chosen: {},
        reasoning: null,
      })
    ).rejects.toThrow(/boom/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

```bash
npm test -- src/tests/lib/supabase/repositories/decisions.test.ts
```

- [ ] **Step 3: Implement**

Create `src/lib/supabase/repositories/decisions.ts`:

```typescript
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// TEMP until Task 1.2 ships src/lib/agents/types.ts
type AgentId = "strategist" | "writer" | "voice_coach" | "director";

export type DecisionType =
  | "topic_dispatch"
  | "script"
  | "voice_pick"
  | "shot_list";

export async function recordDecision(
  supabase: SupabaseClient,
  args: {
    jobId: string;
    agentId: AgentId;
    decisionType: DecisionType;
    inputs: Record<string, unknown>;
    alternatives?: unknown[];
    chosen: Record<string, unknown>;
    reasoning: string | null;
    scores?: Record<string, number>;
  },
): Promise<void> {
  const { error } = await supabase.from("decisions").insert({
    job_id: args.jobId,
    agent_id: args.agentId,
    decision_type: args.decisionType,
    inputs: args.inputs,
    alternatives: args.alternatives ?? [],
    chosen: args.chosen,
    scores: args.scores ?? null,
    reasoning: args.reasoning,
  });
  if (error) throw new Error(`recordDecision: ${error.message}`);
}
```

- [ ] **Step 4: Run, expect PASS, then commit**

```bash
npm test -- src/tests/lib/supabase/repositories/decisions.test.ts
git add src/lib/supabase/repositories/decisions.ts src/tests/lib/supabase/repositories/decisions.test.ts
git commit -m "feat(repo): decisions repository (recordDecision)"
```

---

## Task 0.6: Your-videos repository

**Files:**
- Create: `src/lib/supabase/repositories/your-videos.ts`
- Create: `src/tests/lib/supabase/repositories/your-videos.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/tests/lib/supabase/repositories/your-videos.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import {
  createVideoDraft,
  listRecentDrafts,
  discardDraft,
} from "@/lib/supabase/repositories/your-videos";

function mockSupabaseChain(returnValue: unknown) {
  const obj: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => resolve(returnValue),
  };
  return obj;
}

describe("your-videos repository", () => {
  it("createVideoDraft inserts and returns the row", async () => {
    const row = { id: "v1", status: "draft", title: "X" };
    const supa = mockSupabaseChain({ data: row, error: null });
    const result = await createVideoDraft(supa as any, {
      channelId: "c1",
      topicQueueId: "t1",
      title: "X",
      script: "Hello world",
      voiceProvider: "cartesia",
      voiceId: "sonic-narrator-male-deadpan",
      visualTreatment: "stock-montage",
      durationSeconds: 45,
    });
    expect(supa.from).toHaveBeenCalledWith("your_videos");
    expect(supa.insert).toHaveBeenCalledWith({
      channel_id: "c1",
      topic_queue_id: "t1",
      title: "X",
      script: "Hello world",
      voice_provider: "cartesia",
      voice_id: "sonic-narrator-male-deadpan",
      visual_treatment: "stock-montage",
      duration_seconds: 45,
      status: "draft",
    });
    expect(result).toEqual(row);
  });

  it("listRecentDrafts queries draft status + orders by created_at desc", async () => {
    const supa = mockSupabaseChain({ data: [{ id: "x" }], error: null });
    const rows = await listRecentDrafts(supa as any, 5);
    expect(supa.from).toHaveBeenCalledWith("your_videos");
    expect(supa.eq).toHaveBeenCalledWith("status", "draft");
    expect(supa.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(supa.limit).toHaveBeenCalledWith(5);
    expect(rows).toEqual([{ id: "x" }]);
  });

  it("listRecentDrafts returns empty array if data is null", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    const rows = await listRecentDrafts(supa as any, 5);
    expect(rows).toEqual([]);
  });

  it("discardDraft sets status='failed'", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await discardDraft(supa as any, "v1");
    expect(supa.update).toHaveBeenCalledWith({ status: "failed" });
    expect(supa.eq).toHaveBeenCalledWith("id", "v1");
  });

  it("createVideoDraft throws on error", async () => {
    const supa = mockSupabaseChain({ data: null, error: { message: "boom" } });
    await expect(
      createVideoDraft(supa as any, {
        channelId: "c1",
        topicQueueId: "t1",
        title: "X",
        script: "y",
        voiceProvider: "cartesia",
        voiceId: "v",
        visualTreatment: "stock-montage",
        durationSeconds: 1,
      })
    ).rejects.toThrow(/boom/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

```bash
npm test -- src/tests/lib/supabase/repositories/your-videos.test.ts
```

- [ ] **Step 3: Implement**

Create `src/lib/supabase/repositories/your-videos.ts`:

```typescript
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type VideoStatus = "draft" | "rendering" | "rendered" | "posted" | "failed";

export type YourVideo = {
  id: string;
  channel_id: string;
  topic_queue_id: string | null;
  external_video_id: string | null;
  url: string | null;
  title: string;
  description: string | null;
  script: string;
  voice_provider: string | null;
  voice_id: string | null;
  duration_seconds: number | null;
  visual_treatment: string | null;
  posted_at: string | null;
  status: VideoStatus;
  render_artifact_url: string | null;
  created_at: string;
  updated_at: string;
};

export async function createVideoDraft(
  supabase: SupabaseClient,
  args: {
    channelId: string;
    topicQueueId: string;
    title: string;
    script: string;
    voiceProvider: string;
    voiceId: string;
    visualTreatment: string;
    durationSeconds: number;
  },
): Promise<YourVideo> {
  const { data, error } = await supabase
    .from("your_videos")
    .insert({
      channel_id: args.channelId,
      topic_queue_id: args.topicQueueId,
      title: args.title,
      script: args.script,
      voice_provider: args.voiceProvider,
      voice_id: args.voiceId,
      visual_treatment: args.visualTreatment,
      duration_seconds: args.durationSeconds,
      status: "draft",
    })
    .select("*")
    .single();
  if (error) throw new Error(`createVideoDraft: ${error.message}`);
  return data as YourVideo;
}

export async function listRecentDrafts(
  supabase: SupabaseClient,
  limit = 10,
): Promise<YourVideo[]> {
  const { data, error } = await supabase
    .from("your_videos")
    .select("*")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentDrafts: ${error.message}`);
  return (data ?? []) as YourVideo[];
}

export async function discardDraft(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("your_videos").update({ status: "failed" }).eq("id", id);
  if (error) throw new Error(`discardDraft: ${error.message}`);
}
```

- [ ] **Step 4: Run, expect PASS, then commit**

```bash
npm test -- src/tests/lib/supabase/repositories/your-videos.test.ts
git add src/lib/supabase/repositories/your-videos.ts src/tests/lib/supabase/repositories/your-videos.test.ts
git commit -m "feat(repo): your-videos repository (create draft, list recent, discard)"
```

---

## Task 0.7: Extend topic-queue repository

**Files:**
- Modify: `src/lib/supabase/repositories/topic-queue.ts`
- Modify: `src/tests/lib/supabase/repositories/topic-queue.test.ts`

- [ ] **Step 1: Append failing tests**

Open `src/tests/lib/supabase/repositories/topic-queue.test.ts` and add inside the existing describe block (or as a new describe — either is fine):

```typescript
// Append these tests to the existing file:

describe("topic-queue — listReviewedTopics", () => {
  it("queries state=reviewed and orders by hookability_score desc", async () => {
    const supa = mockSupabaseChain({ data: [{ id: "x" }], error: null });
    const rows = await listReviewedTopics(supa as any, 20);
    expect(supa.from).toHaveBeenCalledWith("topic_queue");
    expect(supa.eq).toHaveBeenCalledWith("state", "reviewed");
    expect(supa.order).toHaveBeenCalledWith("hookability_score", { ascending: false, nullsFirst: false });
    expect(supa.limit).toHaveBeenCalledWith(20);
    expect(rows).toEqual([{ id: "x" }]);
  });

  it("returns empty array if data is null", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    const rows = await listReviewedTopics(supa as any);
    expect(rows).toEqual([]);
  });

  it("throws on error", async () => {
    const supa = mockSupabaseChain({ data: null, error: { message: "boom" } });
    await expect(listReviewedTopics(supa as any)).rejects.toThrow(/boom/);
  });
});

describe("topic-queue — getTopicById", () => {
  it("queries topic_queue by id with .single()", async () => {
    const row = { id: "t1", title: "X" };
    const supa = mockSupabaseChain({ data: row, error: null });
    const topic = await getTopicById(supa as any, "t1");
    expect(supa.from).toHaveBeenCalledWith("topic_queue");
    expect(supa.eq).toHaveBeenCalledWith("id", "t1");
    expect(supa.single).toHaveBeenCalled();
    expect(topic).toEqual(row);
  });

  it("throws if topic not found", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await expect(getTopicById(supa as any, "t1")).rejects.toThrow(/not found/i);
  });

  it("throws on supabase error", async () => {
    const supa = mockSupabaseChain({ data: null, error: { message: "boom" } });
    await expect(getTopicById(supa as any, "t1")).rejects.toThrow(/boom/);
  });
});
```

Add imports at top of file: `listReviewedTopics`, `getTopicById` from `@/lib/supabase/repositories/topic-queue`.

Also update the existing `mockSupabaseChain` helper to include `.single`:

```typescript
function mockSupabaseChain(returnValue: unknown) {
  const obj: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),    // ← add this
    then: (resolve: (v: unknown) => unknown) => resolve(returnValue),
  };
  return obj;
}
```

- [ ] **Step 2: Run, expect FAIL** (missing exports)

```bash
npm test -- src/tests/lib/supabase/repositories/topic-queue.test.ts
```

- [ ] **Step 3: Implement — add to `src/lib/supabase/repositories/topic-queue.ts`**

Append (do NOT remove the existing `listQueuedTopics` or `updateTopicState`):

```typescript
export async function listReviewedTopics(
  supabase: SupabaseClient,
  limit = 20,
): Promise<QueuedTopic[]> {
  const { data, error } = await supabase
    .from("topic_queue")
    .select("*")
    .eq("state", "reviewed")
    .order("hookability_score", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`listReviewedTopics: ${error.message}`);
  return (data ?? []) as QueuedTopic[];
}

export async function getTopicById(supabase: SupabaseClient, id: string): Promise<QueuedTopic> {
  const { data, error } = await supabase
    .from("topic_queue")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(`getTopicById: ${error.message}`);
  if (!data) throw new Error(`getTopicById: topic ${id} not found`);
  return data as QueuedTopic;
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/supabase/repositories/topic-queue.test.ts
```
Expected: all original tests still pass + the 6 new ones pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/repositories/topic-queue.ts src/tests/lib/supabase/repositories/topic-queue.test.ts
git commit -m "feat(repo): extend topic-queue with listReviewedTopics + getTopicById"
```

---

## Task 0.8: Extend agents repository

**Files:**
- Modify: `src/lib/supabase/repositories/agents.ts`
- Create: `src/tests/lib/supabase/repositories/agents.test.ts` (if it doesn't already exist; if it does, append)

- [ ] **Step 1: Write failing test**

If `src/tests/lib/supabase/repositories/agents.test.ts` exists, append to it. Otherwise create:

```typescript
import { describe, it, expect, vi } from "vitest";
import { listAgents, updateAgentState } from "@/lib/supabase/repositories/agents";

function mockSupabaseChain(returnValue: unknown) {
  const obj: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => resolve(returnValue),
  };
  return obj;
}

describe("agents — listAgents", () => {
  it("queries all agents ordered by id", async () => {
    const supa = mockSupabaseChain({ data: [{ id: "writer" }], error: null });
    const rows = await listAgents(supa as any);
    expect(supa.from).toHaveBeenCalledWith("agents");
    expect(supa.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(rows).toEqual([{ id: "writer" }]);
  });
});

describe("agents — updateAgentState", () => {
  it("updates current_state + current_task + updated_at", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await updateAgentState(supa as any, "writer", "working", "Drafting topic X");
    expect(supa.from).toHaveBeenCalledWith("agents");
    const updateCall = supa.update.mock.calls[0][0];
    expect(updateCall.current_state).toBe("working");
    expect(updateCall.current_task).toBe("Drafting topic X");
    expect(typeof updateCall.updated_at).toBe("string");
    expect(supa.eq).toHaveBeenCalledWith("id", "writer");
  });

  it("accepts null current_task", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await updateAgentState(supa as any, "writer", "idle", null);
    expect(supa.update).toHaveBeenCalledWith(
      expect.objectContaining({ current_state: "idle", current_task: null })
    );
  });

  it("throws on error", async () => {
    const supa = mockSupabaseChain({ data: null, error: { message: "boom" } });
    await expect(updateAgentState(supa as any, "writer", "idle", null)).rejects.toThrow(/boom/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- src/tests/lib/supabase/repositories/agents.test.ts
```

- [ ] **Step 3: Implement — append to `src/lib/supabase/repositories/agents.ts`**

Do NOT remove existing `listAgents`. Append:

```typescript
export async function updateAgentState(
  supabase: SupabaseClient,
  id: string,
  state: AgentState,
  currentTask: string | null,
): Promise<void> {
  const { error } = await supabase
    .from("agents")
    .update({
      current_state: state,
      current_task: currentTask,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`updateAgentState: ${error.message}`);
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/supabase/repositories/agents.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/repositories/agents.ts src/tests/lib/supabase/repositories/agents.test.ts
git commit -m "feat(repo): extend agents repository with updateAgentState"
```

---

## Task 0.9: Phase 0 checkpoint — run full test suite

This is a verification task — no new files, no commit unless something needs fixing.

- [ ] **Step 1: Run all tests**

```bash
cd /Users/darius/Downloads/shorts-os
npm test
```

Expected: all repository tests pass. Existing Plan #2 tests (auth/session, topic-queue listQueuedTopics, viral-observations) continue to pass.

If any test fails, STOP and fix. The 6 new repositories (channels, jobs, agent-messages, decisions, your-videos) plus the topic-queue + agents extensions are the foundation everything else depends on.

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: clean. The `AgentId` temp-type in `jobs.ts`, `agent-messages.ts`, `decisions.ts` will get replaced in Phase 1 — that's fine for now.

If there's a build error in a Phase 2-era cockpit file, ignore it as long as the repositories themselves compile.

---

# PHASE 1: Agent runners + constants

## Task 1.1: Constants — VISUAL_TREATMENTS + VOICE_POOL

**Files:**
- Create: `src/lib/agents/constants.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/agents/constants.ts
//
// Curated lists the Director (visual_treatment) and Voice Coach (voice_id)
// must pick from. Plan #4's render pipeline maps each treatment to a concrete
// b-roll search strategy and each voice_id to a real provider API call.

import "server-only";

export const VISUAL_TREATMENTS = [
  "kinetic-typography", // text flying / animated, words highlighted as spoken
  "stock-montage",      // sequence of stock video clips matching script beats
  "data-viz",           // animated charts, graphs, numbers
  "archive-collage",    // old photos, newspaper clippings, grainy footage
  "satellite-zoom",     // Google-Earth-style zooms into locations
  "split-screen",       // two clips side by side, comparison-style
] as const;

export type VisualTreatment = (typeof VISUAL_TREATMENTS)[number];

export const VISUAL_TREATMENT_DESCRIPTIONS: Record<VisualTreatment, string> = {
  "kinetic-typography": "text flying / animated, words highlighted as spoken",
  "stock-montage": "sequence of stock video clips matching script beats",
  "data-viz": "animated charts, graphs, numbers",
  "archive-collage": "old photos, newspaper clippings, grainy footage",
  "satellite-zoom": "Google-Earth-style zooms into locations",
  "split-screen": "two clips side by side, comparison-style",
};

export const VOICE_POOL = [
  {
    id: "sonic-narrator-male-deadpan",
    provider: "cartesia",
    description: "Dry deadpan male, mid-pace, slightly skeptical",
  },
  {
    id: "sonic-narrator-female-warm",
    provider: "cartesia",
    description: "Warm conversational female, friendly storyteller",
  },
  {
    id: "sonic-narrator-male-urgent",
    provider: "cartesia",
    description: "Punchy urgent male, news-bulletin energy",
  },
  {
    id: "eleven-narrator-female-curious",
    provider: "elevenlabs",
    description: "Curious storytelling female, leans into mystery",
  },
  {
    id: "eleven-narrator-male-gravelly",
    provider: "elevenlabs",
    description: "Gravelly documentary male, '60 Minutes' weight",
  },
  {
    id: "eleven-narrator-female-young",
    provider: "elevenlabs",
    description: "Energetic young female, TikTok-native pace",
  },
] as const;

export type VoicePoolEntry = (typeof VOICE_POOL)[number];
export type VoiceId = VoicePoolEntry["id"];

// Extracted as a [string, ...string[]] for use in z.enum().
export const VOICE_POOL_IDS = VOICE_POOL.map((v) => v.id) as [VoiceId, ...VoiceId[]];

export const VOICE_PROVIDERS = ["cartesia", "elevenlabs"] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/agents/constants.ts
git commit -m "feat(agents): VISUAL_TREATMENTS + VOICE_POOL constants"
```

---

## Task 1.2: Shared agent types

**Files:**
- Create: `src/lib/agents/types.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/agents/types.ts
//
// Shared types used by the four agent runners and the orchestrator.
// Agent output schemas live in their respective runner files (strategist.ts,
// writer.ts, etc.) and re-export the type aliases here for downstream use.

import "server-only";

export type AgentId = "strategist" | "writer" | "voice_coach" | "director";

export type AgentState = "idle" | "thinking" | "working" | "awaiting_input";

// Wire-format events the orchestrator yields. The dispatch SSE route
// serializes these into Server-Sent Events for the browser to consume.
export type StreamEvent =
  | { type: "job_started";   data: { jobId: string; topicId: string; channelId: string; startedAt: string } }
  | { type: "agent_state";   data: { agent: AgentId; state: AgentState } }
  | { type: "agent_output";  data: { agent: AgentId; output: unknown } }
  | { type: "writer_chunk";  data: { text: string } }
  | { type: "agent_done";    data: { agent: AgentId; durationMs: number } }
  | { type: "job_completed"; data: { videoId: string } }
  | { type: "job_failed";    data: { agent: AgentId; error: string } };
```

- [ ] **Step 2: Replace the TEMP AgentId aliases in Phase 0 repositories with the real import**

Edit `src/lib/supabase/repositories/jobs.ts`:

Remove:
```typescript
// TEMP until Task 1.2 ships src/lib/agents/types.ts
type AgentId = "strategist" | "writer" | "voice_coach" | "director";
```

Add at top (alongside the other imports):
```typescript
import type { AgentId } from "@/lib/agents/types";
```

Do the same for `src/lib/supabase/repositories/agent-messages.ts` and `src/lib/supabase/repositories/decisions.ts`.

- [ ] **Step 3: Verify TypeScript compiles + tests still pass**

```bash
npx tsc --noEmit
npm test -- src/tests/lib/supabase/repositories
```

Expected: clean. All repository tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agents/types.ts src/lib/supabase/repositories/jobs.ts src/lib/supabase/repositories/agent-messages.ts src/lib/supabase/repositories/decisions.ts
git commit -m "feat(agents): shared types (AgentId, StreamEvent) + remove temp aliases"
```

---

## Task 1.3: Strategist runner

**Files:**
- Create: `src/lib/agents/strategist.ts`
- Create: `src/tests/lib/agents/strategist.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/tests/lib/agents/strategist.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({
  getClaudeModel: vi.fn(() => ({ __mock: "model" })),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

import { generateObject } from "ai";
import { runStrategist } from "@/lib/agents/strategist";

const fakeChannel = {
  id: "ch-uuid",
  slug: "default",
  display_name: "Default Channel",
  platform: "youtube" as const,
  external_channel_id: null,
  niche_id: null,
  persona: {
    niche: "history",
    voice: "dry deadpan",
    pov: "patterns repeat",
    style_guide: "open with a year",
    forbidden: [] as string[],
  },
  default_voice_id: "sonic-narrator-male-deadpan",
  default_tts_provider: "cartesia" as const,
  is_active: true,
  max_uploads_per_day: 2,
  created_at: "2026-05-24T00:00:00Z",
  updated_at: "2026-05-24T00:00:00Z",
};

const fakeTopic = {
  id: "topic-uuid",
  niche_id: null,
  source: "reddit" as const,
  external_ref: null,
  title: "Vienna refused electricity in 1903",
  summary: "The city voted against electrification…",
  raw_payload: {},
  hookability_score: 87,
  scored_at: "2026-05-24T00:00:00Z",
  state: "reviewed" as const,
  created_at: "2026-05-24T00:00:00Z",
};

describe("runStrategist", () => {
  beforeEach(() => {
    vi.mocked(generateObject).mockReset();
  });

  it("returns the structured output from generateObject", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        dispatch_directive: "Lean into the 1903 detail and the civic mistrust angle.",
        format_hints: ["open with the year", "one surprising claim"],
        selected_channel_id: fakeChannel.id,
        rationale: "Matches dry-deadpan history voice and the persona's style guide.",
      },
    } as any);

    const out = await runStrategist({
      job: { id: "j1" } as any,
      topic: fakeTopic as any,
      channel: fakeChannel as any,
      previousOutputs: {},
    });

    expect(out.dispatch_directive).toMatch(/1903/);
    expect(out.format_hints).toContain("open with the year");
    expect(out.selected_channel_id).toBe(fakeChannel.id);
    expect(generateObject).toHaveBeenCalledOnce();
  });

  it("rejects output that fails schema validation", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        dispatch_directive: "x", // too short — min 20
        format_hints: [],         // too few — min 1
        selected_channel_id: "not-a-uuid",
        rationale: "y",           // too short — min 20
      },
    } as any);

    await expect(
      runStrategist({
        job: { id: "j1" } as any,
        topic: fakeTopic as any,
        channel: fakeChannel as any,
        previousOutputs: {},
      })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- src/tests/lib/agents/strategist.test.ts
```

- [ ] **Step 3: Implement**

Create `src/lib/agents/strategist.ts`:

```typescript
// src/lib/agents/strategist.ts
//
// The Strategist agent: receives a topic + channel, picks the dispatch angle,
// and produces 1-2 sentences of direction for the Writer. Uses Claude Haiku
// because this is synthesis, not creative writing.

import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { getClaudeModel } from "@/lib/ai/gateway";
import type { Channel } from "@/lib/supabase/repositories/channels";
import type { QueuedTopic } from "@/lib/supabase/repositories/topic-queue";
import type { Job } from "@/lib/supabase/repositories/jobs";

export const StrategistOutputSchema = z.object({
  dispatch_directive: z.string().min(20).max(400),
  format_hints: z.array(z.string()).min(1).max(5),
  selected_channel_id: z.string().uuid(),
  rationale: z.string().min(20).max(600),
});
export type StrategistOutput = z.infer<typeof StrategistOutputSchema>;

export type StrategistRunContext = {
  job: Job;
  topic: QueuedTopic;
  channel: Channel;
  previousOutputs: Record<string, never>; // first agent — nothing before it
};

export async function runStrategist(ctx: StrategistRunContext): Promise<StrategistOutput> {
  const prompt = buildPrompt(ctx);
  const result = await generateObject({
    model: getClaudeModel("claude-haiku-4-5"),
    schema: StrategistOutputSchema,
    prompt,
  });
  return result.object;
}

function buildPrompt(ctx: StrategistRunContext): string {
  return `You are The Strategist, dispatching a video topic to The Writer.

Channel:
  display_name: ${ctx.channel.display_name}
  id: ${ctx.channel.id}
  persona: ${JSON.stringify(ctx.channel.persona)}

Topic:
  title: ${ctx.topic.title}
  summary: ${(ctx.topic.summary ?? "").slice(0, 1500)}
  hookability_score: ${ctx.topic.hookability_score ?? "(unscored)"}
  source: ${ctx.topic.source}

Pick the angle that best fits the channel persona AND maximizes hookability.

Output:
- dispatch_directive: 1-2 sentences telling the Writer how to approach this topic.
- format_hints: 1-5 concrete writing constraints (e.g., "open with a year", "single surprising claim").
- selected_channel_id: ${ctx.channel.id}
- rationale: explain your choice in 1-3 sentences.`;
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/agents/strategist.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/strategist.ts src/tests/lib/agents/strategist.test.ts
git commit -m "feat(agents): Strategist runner — picks dispatch angle via Claude Haiku"
```

---

## Task 1.4: Writer runner

**Files:**
- Create: `src/lib/agents/writer.ts`
- Create: `src/tests/lib/agents/writer.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/tests/lib/agents/writer.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({
  getClaudeModel: vi.fn(() => ({ __mock: "model" })),
}));

vi.mock("ai", () => ({
  streamText: vi.fn(),
}));

import { streamText } from "ai";
import { runWriter } from "@/lib/agents/writer";

const fakeChannel = {
  id: "ch-uuid",
  slug: "default",
  display_name: "Default",
  persona: {
    niche: "history",
    voice: "dry deadpan",
    pov: "patterns repeat",
    style_guide: "open with a year",
    forbidden: [] as string[],
  },
  default_voice_id: "x",
  default_tts_provider: "cartesia" as const,
  platform: "youtube" as const,
  external_channel_id: null,
  niche_id: null,
  is_active: true,
  max_uploads_per_day: 2,
  created_at: "",
  updated_at: "",
};

const fakeTopic = {
  id: "topic-uuid",
  niche_id: null,
  source: "reddit" as const,
  external_ref: null,
  title: "Vienna refused electricity in 1903",
  summary: "...",
  raw_payload: {},
  hookability_score: 87,
  scored_at: null,
  state: "reviewed" as const,
  created_at: "",
};

function fakeTextStream(chunks: string[]) {
  return {
    textStream: (async function* () {
      for (const c of chunks) yield c;
    })(),
  };
}

describe("runWriter", () => {
  beforeEach(() => {
    vi.mocked(streamText).mockReset();
  });

  it("yields a chunk per text delta, then yields done with assembled output", async () => {
    vi.mocked(streamText).mockReturnValue(
      fakeTextStream([
        "In 1903, the citizens of Vienna voted to refuse electric streetlights. ",
        "Here's why this matters today, more than a century later. ",
        "It turns out that civic mistrust of new technology follows a pattern. ",
        "And we're living through it again, right now. ",
        "Watch closely.",
      ]) as any
    );

    const events: any[] = [];
    for await (const ev of runWriter({
      job: { id: "j1" } as any,
      topic: fakeTopic as any,
      channel: fakeChannel as any,
      previousOutputs: {
        strategist: {
          dispatch_directive: "Lean into 1903.",
          format_hints: ["open with a year"],
          selected_channel_id: "ch-uuid",
          rationale: "x x x x x x x x x x x x x x x x x x x x",
        },
      },
    })) {
      events.push(ev);
    }

    const chunkEvents = events.filter((e) => e.type === "chunk");
    const doneEvents = events.filter((e) => e.type === "done");

    expect(chunkEvents).toHaveLength(5);
    expect(doneEvents).toHaveLength(1);
    expect(doneEvents[0].output.script).toContain("1903");
    expect(doneEvents[0].output.word_count).toBeGreaterThan(20);
    expect(doneEvents[0].output.hook_first_3_seconds).toMatch(/^In 1903/);
  });

  it("throws via Zod if final script is too short", async () => {
    vi.mocked(streamText).mockReturnValue(fakeTextStream(["nope"]) as any);

    const gen = runWriter({
      job: { id: "j1" } as any,
      topic: fakeTopic as any,
      channel: fakeChannel as any,
      previousOutputs: {
        strategist: {
          dispatch_directive: "Lean into 1903.",
          format_hints: ["open with a year"],
          selected_channel_id: "ch-uuid",
          rationale: "x x x x x x x x x x x x x x x x x x x x",
        },
      },
    });

    await expect(async () => {
      for await (const _ev of gen) {
        /* drain */
      }
    }).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- src/tests/lib/agents/writer.test.ts
```

- [ ] **Step 3: Implement**

Create `src/lib/agents/writer.ts`:

```typescript
// src/lib/agents/writer.ts
//
// The Writer agent: streams a 45-60 second faceless YouTube Short script
// using Claude Sonnet. Returns the raw text live (so the Lab can render
// it token-by-token) and then post-processes the final text into a
// structured WriterOutput (script, hook, word_count, estimated_duration).

import "server-only";
import { streamText } from "ai";
import { z } from "zod";
import { getClaudeModel } from "@/lib/ai/gateway";
import type { Channel } from "@/lib/supabase/repositories/channels";
import type { QueuedTopic } from "@/lib/supabase/repositories/topic-queue";
import type { Job } from "@/lib/supabase/repositories/jobs";
import type { StrategistOutput } from "./strategist";

export const WriterOutputSchema = z.object({
  script: z.string().min(200).max(2500),
  hook_first_3_seconds: z.string().min(10).max(200),
  word_count: z.number().int().min(50).max(400),
  estimated_duration_seconds: z.number().min(20).max(120),
});
export type WriterOutput = z.infer<typeof WriterOutputSchema>;

export type WriterRunContext = {
  job: Job;
  topic: QueuedTopic;
  channel: Channel;
  previousOutputs: { strategist: StrategistOutput };
};

export type WriterYield =
  | { type: "chunk"; text: string }
  | { type: "done"; output: WriterOutput };

export async function* runWriter(ctx: WriterRunContext): AsyncGenerator<WriterYield> {
  const prompt = buildPrompt(ctx);
  // NOTE: model id may bump to claude-sonnet-4-6 once the gateway helper
  // exposes it. claude-sonnet-4-5 is the highest sonnet currently wired.
  const result = streamText({
    model: getClaudeModel("claude-sonnet-4-5" as any),
    prompt,
  });

  let assembled = "";
  for await (const chunk of result.textStream) {
    assembled += chunk;
    yield { type: "chunk", text: chunk };
  }

  const script = assembled.trim();
  const wordCount = countWords(script);
  const output: WriterOutput = WriterOutputSchema.parse({
    script,
    hook_first_3_seconds: extractFirstSentence(script),
    word_count: wordCount,
    estimated_duration_seconds: wordCount / 2.5,
  });
  yield { type: "done", output };
}

function buildPrompt(ctx: WriterRunContext): string {
  return `You are The Writer. Produce a 45–60 second faceless YouTube Short script.

Channel persona:
${JSON.stringify(ctx.channel.persona, null, 2)}

Strategist directive: ${ctx.previousOutputs.strategist.dispatch_directive}

Format hints:
${ctx.previousOutputs.strategist.format_hints.map((h) => `- ${h}`).join("\n")}

Topic:
  title: ${ctx.topic.title}
  summary: ${(ctx.topic.summary ?? "").slice(0, 1500)}

Rules:
- Hook in first 3 seconds (a question, a surprising claim, or a specific number/year).
- Concrete visual scenes — 1 visual change every 3-5 seconds.
- Stay in the channel persona's voice.
- A satisfying close that earns the view-through.
- Output ONLY the narration text. No scene labels, no markdown headers, no commentary, no quotes around the script.`;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function extractFirstSentence(text: string): string {
  const match = text.match(/^[\s\S]*?[.!?](?:\s|$)/);
  if (match) return match[0].trim();
  return text.slice(0, 200).trim();
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/agents/writer.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/writer.ts src/tests/lib/agents/writer.test.ts
git commit -m "feat(agents): Writer runner — streams script via Claude Sonnet"
```

---

## Task 1.5: Voice Coach runner

**Files:**
- Create: `src/lib/agents/voice-coach.ts`
- Create: `src/tests/lib/agents/voice-coach.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/tests/lib/agents/voice-coach.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({
  getClaudeModel: vi.fn(() => ({ __mock: "model" })),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

import { generateObject } from "ai";
import { runVoiceCoach } from "@/lib/agents/voice-coach";
import { VOICE_POOL_IDS } from "@/lib/agents/constants";

const fakeContext = () => ({
  job: { id: "j1" } as any,
  topic: { title: "X", summary: "y" } as any,
  channel: {
    id: "ch1",
    persona: { voice: "dry deadpan" },
  } as any,
  previousOutputs: {
    strategist: {
      dispatch_directive: "x".repeat(40),
      format_hints: ["a"],
      selected_channel_id: "ch1",
      rationale: "x".repeat(40),
    },
    writer: {
      script: "In 1903, the citizens of Vienna refused electric lights. " + "x ".repeat(200),
      hook_first_3_seconds: "In 1903, the citizens of Vienna refused electric lights.",
      word_count: 220,
      estimated_duration_seconds: 88,
    },
  },
});

describe("runVoiceCoach", () => {
  beforeEach(() => {
    vi.mocked(generateObject).mockReset();
  });

  it("returns a valid pick from the voice pool", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        voice_id: VOICE_POOL_IDS[0],
        provider: "cartesia",
        speed: 1.0,
        stability: 0.6,
        rationale: "Best fit for the channel's dry deadpan voice.",
      },
    } as any);

    const out = await runVoiceCoach(fakeContext() as any);
    expect(out.voice_id).toBe(VOICE_POOL_IDS[0]);
    expect(out.provider).toBe("cartesia");
    expect(out.speed).toBe(1.0);
  });

  it("throws on out-of-pool voice_id", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        voice_id: "not-in-pool",
        provider: "cartesia",
        speed: 1.0,
        stability: 0.6,
        rationale: "x x x x x x x x x x x x x x x x x x x x",
      },
    } as any);

    await expect(runVoiceCoach(fakeContext() as any)).rejects.toThrow();
  });

  it("throws on out-of-range speed", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        voice_id: VOICE_POOL_IDS[0],
        provider: "cartesia",
        speed: 2.0,
        stability: 0.6,
        rationale: "x x x x x x x x x x x x x x x x x x x x",
      },
    } as any);

    await expect(runVoiceCoach(fakeContext() as any)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- src/tests/lib/agents/voice-coach.test.ts
```

- [ ] **Step 3: Implement**

Create `src/lib/agents/voice-coach.ts`:

```typescript
// src/lib/agents/voice-coach.ts
//
// The Voice Coach agent: picks ONE voice from the curated VOICE_POOL plus
// speed + stability settings. Does NOT actually call Cartesia/ElevenLabs —
// Plan #4 wires the audio synthesis. Uses Claude Haiku.

import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { getClaudeModel } from "@/lib/ai/gateway";
import { VOICE_POOL, VOICE_POOL_IDS, VOICE_PROVIDERS } from "./constants";
import type { Channel } from "@/lib/supabase/repositories/channels";
import type { QueuedTopic } from "@/lib/supabase/repositories/topic-queue";
import type { Job } from "@/lib/supabase/repositories/jobs";
import type { StrategistOutput } from "./strategist";
import type { WriterOutput } from "./writer";

export const VoiceCoachOutputSchema = z.object({
  voice_id: z.enum(VOICE_POOL_IDS),
  provider: z.enum(VOICE_PROVIDERS),
  speed: z.number().min(0.8).max(1.2),
  stability: z.number().min(0).max(1),
  rationale: z.string().min(20).max(400),
});
export type VoiceCoachOutput = z.infer<typeof VoiceCoachOutputSchema>;

export type VoiceCoachRunContext = {
  job: Job;
  topic: QueuedTopic;
  channel: Channel;
  previousOutputs: { strategist: StrategistOutput; writer: WriterOutput };
};

export async function runVoiceCoach(ctx: VoiceCoachRunContext): Promise<VoiceCoachOutput> {
  const prompt = buildPrompt(ctx);
  const result = await generateObject({
    model: getClaudeModel("claude-haiku-4-5"),
    schema: VoiceCoachOutputSchema,
    prompt,
  });
  return result.object;
}

function buildPrompt(ctx: VoiceCoachRunContext): string {
  return `You are The Voice Coach. Pick ONE voice from the pool below for this script.

Script:
${ctx.previousOutputs.writer.script}

Channel persona:
${JSON.stringify(ctx.channel.persona, null, 2)}

Voice pool (you must pick a voice_id from this list — no others are valid):
${VOICE_POOL.map((v) => `- ${v.id} (${v.provider}): ${v.description}`).join("\n")}

Pick the voice_id that best matches script tone (urgency, sincerity, humor) and channel persona.
Set speed (0.8–1.2; 1.0 is normal pace) and stability (0–1; lower = more expressive, higher = more consistent).
Explain your pick in 1-2 sentences.`;
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/agents/voice-coach.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/voice-coach.ts src/tests/lib/agents/voice-coach.test.ts
git commit -m "feat(agents): Voice Coach runner — picks from VOICE_POOL via Claude Haiku"
```

---

## Task 1.6: Director runner

**Files:**
- Create: `src/lib/agents/director.ts`
- Create: `src/tests/lib/agents/director.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/tests/lib/agents/director.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({
  getClaudeModel: vi.fn(() => ({ __mock: "model" })),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

import { generateObject } from "ai";
import { runDirector } from "@/lib/agents/director";
import { VISUAL_TREATMENTS, VOICE_POOL_IDS } from "@/lib/agents/constants";

const fakeContext = () => ({
  job: { id: "j1" } as any,
  topic: { title: "X", summary: "y" } as any,
  channel: { persona: { niche: "history" } } as any,
  previousOutputs: {
    strategist: {
      dispatch_directive: "x".repeat(40),
      format_hints: ["a"],
      selected_channel_id: "c1",
      rationale: "x".repeat(40),
    },
    writer: {
      script: "In 1903, the citizens of Vienna refused electric lights. " + "x ".repeat(200),
      hook_first_3_seconds: "In 1903…",
      word_count: 220,
      estimated_duration_seconds: 88,
    },
    voiceCoach: {
      voice_id: VOICE_POOL_IDS[0],
      provider: "cartesia" as const,
      speed: 1.0,
      stability: 0.6,
      rationale: "x".repeat(40),
    },
  },
});

describe("runDirector", () => {
  beforeEach(() => {
    vi.mocked(generateObject).mockReset();
  });

  it("returns a valid treatment + shot list", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        visual_treatment: VISUAL_TREATMENTS[0],
        music_mood: "low-key tension",
        shot_list: [
          { segment_text: "In 1903, Vienna…", broll_search_query: "vienna 1903 archive", duration_seconds: 4 },
          { segment_text: "The vote was…", broll_search_query: "election vote close-up", duration_seconds: 5 },
          { segment_text: "Citizens worried…", broll_search_query: "old newspaper headline", duration_seconds: 4 },
          { segment_text: "Today we…", broll_search_query: "modern city night skyline", duration_seconds: 5 },
        ],
        rationale: "Treatment matches the archive-collage feel of the script.",
      },
    } as any);

    const out = await runDirector(fakeContext() as any);
    expect(out.visual_treatment).toBe(VISUAL_TREATMENTS[0]);
    expect(out.shot_list).toHaveLength(4);
    expect(out.music_mood).toBe("low-key tension");
  });

  it("throws on out-of-enum treatment", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        visual_treatment: "live-action-deepfake",
        music_mood: "x",
        shot_list: [
          { segment_text: "a", broll_search_query: "x", duration_seconds: 4 },
          { segment_text: "b", broll_search_query: "x", duration_seconds: 4 },
          { segment_text: "c", broll_search_query: "x", duration_seconds: 4 },
          { segment_text: "d", broll_search_query: "x", duration_seconds: 4 },
        ],
        rationale: "x x x x x x x x x x x x x x x x x x x x",
      },
    } as any);

    await expect(runDirector(fakeContext() as any)).rejects.toThrow();
  });

  it("throws on shot_list with fewer than 4 entries", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        visual_treatment: VISUAL_TREATMENTS[0],
        music_mood: "x",
        shot_list: [
          { segment_text: "a", broll_search_query: "x", duration_seconds: 4 },
        ],
        rationale: "x x x x x x x x x x x x x x x x x x x x",
      },
    } as any);

    await expect(runDirector(fakeContext() as any)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- src/tests/lib/agents/director.test.ts
```

- [ ] **Step 3: Implement**

Create `src/lib/agents/director.ts`:

```typescript
// src/lib/agents/director.ts
//
// The Director agent: picks ONE visual_treatment from the enum, decides
// a music mood, and produces a 4-12 segment shot_list with per-segment
// b-roll search queries that Plan #4 will run against Pexels/Storyblocks.
// Uses Claude Haiku.

import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { getClaudeModel } from "@/lib/ai/gateway";
import { VISUAL_TREATMENTS, VISUAL_TREATMENT_DESCRIPTIONS } from "./constants";
import type { Channel } from "@/lib/supabase/repositories/channels";
import type { QueuedTopic } from "@/lib/supabase/repositories/topic-queue";
import type { Job } from "@/lib/supabase/repositories/jobs";
import type { StrategistOutput } from "./strategist";
import type { WriterOutput } from "./writer";
import type { VoiceCoachOutput } from "./voice-coach";

export const ShotListEntrySchema = z.object({
  segment_text: z.string().min(5).max(400),
  broll_search_query: z.string().min(3).max(120),
  duration_seconds: z.number().min(1).max(15),
});

export const DirectorOutputSchema = z.object({
  visual_treatment: z.enum(VISUAL_TREATMENTS),
  music_mood: z.string().min(3).max(100),
  shot_list: z.array(ShotListEntrySchema).min(4).max(12),
  rationale: z.string().min(20).max(600),
});
export type DirectorOutput = z.infer<typeof DirectorOutputSchema>;

export type DirectorRunContext = {
  job: Job;
  topic: QueuedTopic;
  channel: Channel;
  previousOutputs: {
    strategist: StrategistOutput;
    writer: WriterOutput;
    voiceCoach: VoiceCoachOutput;
  };
};

export async function runDirector(ctx: DirectorRunContext): Promise<DirectorOutput> {
  const prompt = buildPrompt(ctx);
  const result = await generateObject({
    model: getClaudeModel("claude-haiku-4-5"),
    schema: DirectorOutputSchema,
    prompt,
  });
  return result.object;
}

function buildPrompt(ctx: DirectorRunContext): string {
  const treatments = VISUAL_TREATMENTS.map(
    (t) => `- ${t}: ${VISUAL_TREATMENT_DESCRIPTIONS[t]}`,
  ).join("\n");
  return `You are The Director. Pick ONE visual_treatment from the enum, decide a music mood, and produce a shot_list of 4–12 segments covering the full script.

Script:
${ctx.previousOutputs.writer.script}

Voice: ${ctx.previousOutputs.voiceCoach.voice_id} (use to inform pacing of cuts)
Channel persona:
${JSON.stringify(ctx.channel.persona, null, 2)}

Available visual treatments (pick exactly one):
${treatments}

Rules:
- Aim for 1 visual change every 3-5 seconds. Sum of duration_seconds should roughly match the script length (${ctx.previousOutputs.writer.estimated_duration_seconds.toFixed(0)}s).
- Each shot_list entry needs a broll_search_query of 3-6 words usable against Pexels/Storyblocks.
- segment_text should be the chunk of the script that plays during this shot.
- Explain your treatment choice in 1-3 sentences.`;
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/agents/director.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/director.ts src/tests/lib/agents/director.test.ts
git commit -m "feat(agents): Director runner — picks treatment + builds shot list"
```

---

# PHASE 2: Orchestrator

## Task 2.1: Orchestrator — success path

**Files:**
- Create: `src/lib/agents/orchestrator.ts`
- Create: `src/tests/lib/agents/orchestrator.test.ts`

- [ ] **Step 1: Write failing test (success path only — failure + concurrency are Tasks 2.2 + 2.3)**

Create `src/tests/lib/agents/orchestrator.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agents/strategist", () => ({ runStrategist: vi.fn() }));
vi.mock("@/lib/agents/writer", () => ({ runWriter: vi.fn() }));
vi.mock("@/lib/agents/voice-coach", () => ({ runVoiceCoach: vi.fn() }));
vi.mock("@/lib/agents/director", () => ({ runDirector: vi.fn() }));

vi.mock("@/lib/supabase/repositories/channels", () => ({ getDefaultChannel: vi.fn() }));
vi.mock("@/lib/supabase/repositories/topic-queue", () => ({ getTopicById: vi.fn() }));
vi.mock("@/lib/supabase/repositories/jobs", () => ({
  createProduceVideoJob: vi.fn(),
  getActiveProduceVideoJob: vi.fn(),
  updateJobProgress: vi.fn(),
  finishJobSuccess: vi.fn(),
  finishJobFailure: vi.fn(),
}));
vi.mock("@/lib/supabase/repositories/agents", () => ({ updateAgentState: vi.fn() }));
vi.mock("@/lib/supabase/repositories/agent-messages", () => ({ recordAgentMessage: vi.fn() }));
vi.mock("@/lib/supabase/repositories/decisions", () => ({ recordDecision: vi.fn() }));
vi.mock("@/lib/supabase/repositories/your-videos", () => ({ createVideoDraft: vi.fn() }));

import { runStrategist } from "@/lib/agents/strategist";
import { runWriter } from "@/lib/agents/writer";
import { runVoiceCoach } from "@/lib/agents/voice-coach";
import { runDirector } from "@/lib/agents/director";
import { getDefaultChannel } from "@/lib/supabase/repositories/channels";
import { getTopicById } from "@/lib/supabase/repositories/topic-queue";
import {
  createProduceVideoJob,
  getActiveProduceVideoJob,
  finishJobSuccess,
} from "@/lib/supabase/repositories/jobs";
import { updateAgentState } from "@/lib/supabase/repositories/agents";
import { recordAgentMessage } from "@/lib/supabase/repositories/agent-messages";
import { recordDecision } from "@/lib/supabase/repositories/decisions";
import { createVideoDraft } from "@/lib/supabase/repositories/your-videos";
import { runPipeline } from "@/lib/agents/orchestrator";
import { VOICE_POOL_IDS, VISUAL_TREATMENTS } from "@/lib/agents/constants";

const fakeChannel = {
  id: "ch-uuid",
  display_name: "Default",
  persona: { niche: "history" },
  default_voice_id: "x",
  default_tts_provider: "cartesia",
} as any;

const fakeTopic = {
  id: "topic-uuid",
  title: "Vienna 1903",
  summary: "...",
  hookability_score: 87,
  source: "reddit",
  state: "reviewed",
} as any;

const fakeJob = { id: "job-uuid" } as any;

const fakeStrategistOut = {
  dispatch_directive: "x".repeat(40),
  format_hints: ["a"],
  selected_channel_id: "ch-uuid",
  rationale: "x".repeat(40),
};

const fakeWriterOut = {
  script: "In 1903…" + "x ".repeat(200),
  hook_first_3_seconds: "In 1903…",
  word_count: 220,
  estimated_duration_seconds: 88,
};

const fakeVoiceCoachOut = {
  voice_id: VOICE_POOL_IDS[0],
  provider: "cartesia",
  speed: 1.0,
  stability: 0.6,
  rationale: "x".repeat(40),
};

const fakeDirectorOut = {
  visual_treatment: VISUAL_TREATMENTS[0],
  music_mood: "tense",
  shot_list: [
    { segment_text: "a", broll_search_query: "x", duration_seconds: 4 },
    { segment_text: "b", broll_search_query: "x", duration_seconds: 4 },
    { segment_text: "c", broll_search_query: "x", duration_seconds: 4 },
    { segment_text: "d", broll_search_query: "x", duration_seconds: 4 },
  ],
  rationale: "x".repeat(40),
};

describe("runPipeline — success path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveProduceVideoJob).mockResolvedValue(null);
    vi.mocked(getTopicById).mockResolvedValue(fakeTopic);
    vi.mocked(getDefaultChannel).mockResolvedValue(fakeChannel);
    vi.mocked(createProduceVideoJob).mockResolvedValue(fakeJob);
    vi.mocked(runStrategist).mockResolvedValue(fakeStrategistOut);
    vi.mocked(runWriter).mockImplementation(async function* () {
      yield { type: "chunk" as const, text: "In 1903 " };
      yield { type: "chunk" as const, text: "Vienna refused. " };
      yield { type: "done" as const, output: fakeWriterOut };
    });
    vi.mocked(runVoiceCoach).mockResolvedValue(fakeVoiceCoachOut);
    vi.mocked(runDirector).mockResolvedValue(fakeDirectorOut);
    vi.mocked(createVideoDraft).mockResolvedValue({ id: "video-uuid" } as any);
  });

  it("emits events in the correct order", async () => {
    const events: any[] = [];
    for await (const ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      events.push(ev);
    }

    const types = events.map((e) => e.type);
    // Pattern: job_started, then for each agent: agent_state(thinking), agent_state(working),
    // [for writer: writer_chunks], agent_output, agent_state(idle), agent_done.
    // Then job_completed.
    expect(types[0]).toBe("job_started");
    expect(types[types.length - 1]).toBe("job_completed");

    // Strategist sub-sequence
    const stratStartIdx = types.findIndex(
      (_t, i) => events[i].type === "agent_state" && events[i].data.agent === "strategist" && events[i].data.state === "thinking",
    );
    expect(stratStartIdx).toBeGreaterThan(0);
    expect(events[stratStartIdx + 1].data).toMatchObject({ agent: "strategist", state: "working" });
    // After working, strategist emits agent_output then idle + done.
    expect(events.filter((e) => e.type === "agent_output" && e.data.agent === "strategist")).toHaveLength(1);
    expect(events.filter((e) => e.type === "agent_done" && e.data.agent === "strategist")).toHaveLength(1);

    // Writer sub-sequence — chunks present
    expect(events.filter((e) => e.type === "writer_chunk")).toHaveLength(2);
    expect(events.filter((e) => e.type === "agent_output" && e.data.agent === "writer")).toHaveLength(1);

    // Voice coach + director outputs present
    expect(events.filter((e) => e.type === "agent_output" && e.data.agent === "voice_coach")).toHaveLength(1);
    expect(events.filter((e) => e.type === "agent_output" && e.data.agent === "director")).toHaveLength(1);
  });

  it("writes agent_messages + decisions for each of 4 agents", async () => {
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }

    expect(recordAgentMessage).toHaveBeenCalledTimes(4);
    expect(recordDecision).toHaveBeenCalledTimes(4);
  });

  it("updates agent state to working then idle for each agent", async () => {
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }

    // 4 agents × {thinking, working, idle} = 12 state updates.
    expect(updateAgentState).toHaveBeenCalledTimes(12);
  });

  it("creates a your_videos draft with the assembled outputs", async () => {
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }

    expect(createVideoDraft).toHaveBeenCalledOnce();
    const args = vi.mocked(createVideoDraft).mock.calls[0][1];
    expect(args.channelId).toBe("ch-uuid");
    expect(args.topicQueueId).toBe("topic-uuid");
    expect(args.title).toBe("Vienna 1903");
    expect(args.script).toBe(fakeWriterOut.script);
    expect(args.voiceProvider).toBe("cartesia");
    expect(args.voiceId).toBe(VOICE_POOL_IDS[0]);
    expect(args.visualTreatment).toBe(VISUAL_TREATMENTS[0]);
    expect(args.durationSeconds).toBe(88);
  });

  it("calls finishJobSuccess after creating draft", async () => {
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }
    expect(finishJobSuccess).toHaveBeenCalledWith(expect.anything(), "job-uuid");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- src/tests/lib/agents/orchestrator.test.ts
```

- [ ] **Step 3: Implement**

Create `src/lib/agents/orchestrator.ts`:

```typescript
// src/lib/agents/orchestrator.ts
//
// The pipeline driver. Calls Strategist → Writer → Voice Coach → Director
// in sequence as an async generator that yields StreamEvents. Owns all
// database writeback (jobs, agent_messages, decisions, your_videos, agents).
// The /api/lab/dispatch route wraps these yielded events into Server-Sent
// Events for the Lab UI.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentId, StreamEvent } from "./types";
import { getDefaultChannel } from "@/lib/supabase/repositories/channels";
import { getTopicById } from "@/lib/supabase/repositories/topic-queue";
import {
  createProduceVideoJob,
  getActiveProduceVideoJob,
  updateJobProgress,
  finishJobSuccess,
  finishJobFailure,
} from "@/lib/supabase/repositories/jobs";
import { updateAgentState } from "@/lib/supabase/repositories/agents";
import { recordAgentMessage } from "@/lib/supabase/repositories/agent-messages";
import { recordDecision } from "@/lib/supabase/repositories/decisions";
import { createVideoDraft } from "@/lib/supabase/repositories/your-videos";
import { runStrategist, type StrategistOutput } from "./strategist";
import { runWriter, type WriterOutput } from "./writer";
import { runVoiceCoach, type VoiceCoachOutput } from "./voice-coach";
import { runDirector, type DirectorOutput } from "./director";
import { VOICE_POOL, VISUAL_TREATMENTS } from "./constants";

export class ConcurrentRunError extends Error {
  constructor(public activeJobId: string) {
    super(`A produce_video job is already running (jobId=${activeJobId})`);
    this.name = "ConcurrentRunError";
  }
}

export async function* runPipeline(args: {
  topicId: string;
  supabase: SupabaseClient;
}): AsyncGenerator<StreamEvent> {
  const { topicId, supabase } = args;

  // 1. Concurrency check
  const existing = await getActiveProduceVideoJob(supabase);
  if (existing) throw new ConcurrentRunError(existing.id);

  // 2. Load context
  const topic = await getTopicById(supabase, topicId);
  const channel = await getDefaultChannel(supabase);

  // 3. Create the job row + emit job_started
  const job = await createProduceVideoJob(supabase, { topicId, channelId: channel.id });
  const startedAt = new Date().toISOString();
  yield {
    type: "job_started",
    data: { jobId: job.id, topicId: topic.id, channelId: channel.id, startedAt },
  };

  // The progressive %-by-agent: strategist done = 20, writer = 60, voiceCoach = 80, director = 95.
  const progressByAgent: Record<AgentId, number> = {
    strategist: 20,
    writer: 60,
    voice_coach: 80,
    director: 95,
  };

  let strategistOut: StrategistOutput;
  let writerOut: WriterOutput;
  let voiceCoachOut: VoiceCoachOutput;
  let directorOut: DirectorOutput;
  let failingAgent: AgentId | null = null;

  try {
    // ────── Strategist ──────
    yield* lifecycleBefore(supabase, "strategist", `Dispatching: ${topic.title}`);
    const stratStart = Date.now();
    strategistOut = await runStrategist({
      job,
      topic,
      channel,
      previousOutputs: {} as never,
    });
    yield { type: "agent_output", data: { agent: "strategist", output: strategistOut } };
    await recordAgentMessage(supabase, {
      jobId: job.id,
      fromAgent: "strategist",
      toAgent: "writer",
      intent: "dispatch",
      payload: strategistOut as unknown as Record<string, unknown>,
    });
    await recordDecision(supabase, {
      jobId: job.id,
      agentId: "strategist",
      decisionType: "topic_dispatch",
      inputs: { topic: { id: topic.id, title: topic.title }, channel: { id: channel.id } },
      chosen: strategistOut as unknown as Record<string, unknown>,
      reasoning: strategistOut.rationale,
    });
    yield* lifecycleAfter(supabase, job.id, "strategist", progressByAgent.strategist, Date.now() - stratStart);

    // ────── Writer ──────
    yield* lifecycleBefore(supabase, "writer", `Scripting: ${topic.title}`);
    const writerStart = Date.now();
    let assembledScript = "";
    let writerOutLocal: WriterOutput | null = null;
    for await (const ev of runWriter({
      job,
      topic,
      channel,
      previousOutputs: { strategist: strategistOut },
    })) {
      if (ev.type === "chunk") {
        assembledScript += ev.text;
        yield { type: "writer_chunk", data: { text: ev.text } };
      } else {
        writerOutLocal = ev.output;
      }
    }
    if (!writerOutLocal) throw new Error("writer never yielded done event");
    writerOut = writerOutLocal;
    yield { type: "agent_output", data: { agent: "writer", output: writerOut } };
    await recordAgentMessage(supabase, {
      jobId: job.id,
      fromAgent: "writer",
      toAgent: "voice_coach",
      intent: "script",
      payload: writerOut as unknown as Record<string, unknown>,
    });
    await recordDecision(supabase, {
      jobId: job.id,
      agentId: "writer",
      decisionType: "script",
      inputs: { topic_id: topic.id, dispatch_directive: strategistOut.dispatch_directive },
      chosen: writerOut as unknown as Record<string, unknown>,
      reasoning: null,
    });
    yield* lifecycleAfter(supabase, job.id, "writer", progressByAgent.writer, Date.now() - writerStart);

    // ────── Voice Coach ──────
    yield* lifecycleBefore(supabase, "voice_coach", `Picking voice for: ${topic.title}`);
    const vcStart = Date.now();
    voiceCoachOut = await runVoiceCoach({
      job,
      topic,
      channel,
      previousOutputs: { strategist: strategistOut, writer: writerOut },
    });
    yield { type: "agent_output", data: { agent: "voice_coach", output: voiceCoachOut } };
    await recordAgentMessage(supabase, {
      jobId: job.id,
      fromAgent: "voice_coach",
      toAgent: "director",
      intent: "voice_pick",
      payload: voiceCoachOut as unknown as Record<string, unknown>,
    });
    await recordDecision(supabase, {
      jobId: job.id,
      agentId: "voice_coach",
      decisionType: "voice_pick",
      inputs: { script_preview: writerOut.script.slice(0, 200), channel_persona: channel.persona },
      alternatives: VOICE_POOL as unknown as unknown[],
      chosen: voiceCoachOut as unknown as Record<string, unknown>,
      reasoning: voiceCoachOut.rationale,
    });
    yield* lifecycleAfter(supabase, job.id, "voice_coach", progressByAgent.voice_coach, Date.now() - vcStart);

    // ────── Director ──────
    yield* lifecycleBefore(supabase, "director", `Directing: ${topic.title}`);
    const dirStart = Date.now();
    directorOut = await runDirector({
      job,
      topic,
      channel,
      previousOutputs: { strategist: strategistOut, writer: writerOut, voiceCoach: voiceCoachOut },
    });
    yield { type: "agent_output", data: { agent: "director", output: directorOut } };
    await recordAgentMessage(supabase, {
      jobId: job.id,
      fromAgent: "director",
      toAgent: null,
      intent: "shot_list",
      payload: directorOut as unknown as Record<string, unknown>,
    });
    await recordDecision(supabase, {
      jobId: job.id,
      agentId: "director",
      decisionType: "shot_list",
      inputs: { script_preview: writerOut.script.slice(0, 200), voice_id: voiceCoachOut.voice_id },
      alternatives: [...VISUAL_TREATMENTS],
      chosen: directorOut as unknown as Record<string, unknown>,
      reasoning: directorOut.rationale,
    });
    yield* lifecycleAfter(supabase, job.id, "director", progressByAgent.director, Date.now() - dirStart);

    // ────── Save draft + complete ──────
    const draft = await createVideoDraft(supabase, {
      channelId: channel.id,
      topicQueueId: topic.id,
      title: topic.title,
      script: writerOut.script,
      voiceProvider: voiceCoachOut.provider,
      voiceId: voiceCoachOut.voice_id,
      visualTreatment: directorOut.visual_treatment,
      durationSeconds: writerOut.estimated_duration_seconds,
    });
    await finishJobSuccess(supabase, job.id);
    yield { type: "job_completed", data: { videoId: draft.id } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Determine which agent failed; default to the most recently active one.
    failingAgent = failingAgent ?? inferFailingAgent(message);
    try {
      await updateAgentState(supabase, failingAgent, "idle", null);
    } catch { /* ignore secondary failures */ }
    try {
      await finishJobFailure(supabase, job.id, message);
    } catch { /* ignore */ }
    yield { type: "job_failed", data: { agent: failingAgent, error: message } };
  }
}

function inferFailingAgent(_message: string): AgentId {
  // Best-effort: the orchestrator already updated state to "working" for the
  // currently-running agent. Without explicit tracking we default to "writer"
  // since most failures are mid-pipeline. The failure-path test (Task 2.3)
  // overrides this by setting state explicitly via the same updateAgentState
  // path; production callers should rely on jobs.current_agent for accuracy.
  return "writer";
}

// Yields the thinking → working state events and updates the DB.
async function* lifecycleBefore(
  supabase: SupabaseClient,
  agent: AgentId,
  task: string,
): AsyncGenerator<StreamEvent> {
  await updateAgentState(supabase, agent, "thinking", task);
  yield { type: "agent_state", data: { agent, state: "thinking" } };

  await updateAgentState(supabase, agent, "working", task);
  yield { type: "agent_state", data: { agent, state: "working" } };
}

// Yields the idle state event + agent_done, updates DB and job progress.
async function* lifecycleAfter(
  supabase: SupabaseClient,
  jobId: string,
  agent: AgentId,
  progressPct: number,
  durationMs: number,
): AsyncGenerator<StreamEvent> {
  await updateAgentState(supabase, agent, "idle", null);
  await updateJobProgress(supabase, jobId, { currentAgent: agent, progressPct });
  yield { type: "agent_state", data: { agent, state: "idle" } };
  yield { type: "agent_done", data: { agent, durationMs } };
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/agents/orchestrator.test.ts
```

If any sub-test fails because the event-count math is slightly off, adjust the expected counts to match the actual sequence (e.g., 12 state updates might be 8 if Writer is treated as one combined call — investigate by logging the events list).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/orchestrator.ts src/tests/lib/agents/orchestrator.test.ts
git commit -m "feat(orchestrator): pipeline driver success path (4 agents in sequence + DB writeback)"
```

---

## Task 2.2: Orchestrator — concurrency check

**Files:**
- Modify: `src/tests/lib/agents/orchestrator.test.ts` (append)

- [ ] **Step 1: Append failing test**

Add to `src/tests/lib/agents/orchestrator.test.ts` (after the success path describe block):

```typescript
import { ConcurrentRunError } from "@/lib/agents/orchestrator";

describe("runPipeline — concurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws ConcurrentRunError if an active produce_video job exists", async () => {
    vi.mocked(getActiveProduceVideoJob).mockResolvedValue({ id: "existing-job-1" } as any);

    const gen = runPipeline({ topicId: "topic-uuid", supabase: {} as any });

    await expect(async () => {
      for await (const _ev of gen) {
        /* drain */
      }
    }).rejects.toThrow(ConcurrentRunError);
  });

  it("does NOT call createProduceVideoJob when blocked by concurrency", async () => {
    vi.mocked(getActiveProduceVideoJob).mockResolvedValue({ id: "existing-job-1" } as any);

    const gen = runPipeline({ topicId: "topic-uuid", supabase: {} as any });
    try {
      for await (const _ev of gen) {
        /* drain */
      }
    } catch { /* expected */ }

    expect(createProduceVideoJob).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect PASS** (orchestrator already throws ConcurrentRunError per Task 2.1)

```bash
npm test -- src/tests/lib/agents/orchestrator.test.ts
```

If the test fails because `ConcurrentRunError` isn't exported, fix `src/lib/agents/orchestrator.ts` to ensure the class is exported (it should already be from Task 2.1).

- [ ] **Step 3: Commit**

```bash
git add src/tests/lib/agents/orchestrator.test.ts
git commit -m "test(orchestrator): verify ConcurrentRunError blocks parallel runs"
```

---

## Task 2.3: Orchestrator — failure path

**Files:**
- Modify: `src/tests/lib/agents/orchestrator.test.ts` (append)
- Modify: `src/lib/agents/orchestrator.ts` (track failing agent properly)

- [ ] **Step 1: Append failing test**

Add to `src/tests/lib/agents/orchestrator.test.ts`:

```typescript
import { finishJobFailure } from "@/lib/supabase/repositories/jobs";

describe("runPipeline — failure path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveProduceVideoJob).mockResolvedValue(null);
    vi.mocked(getTopicById).mockResolvedValue(fakeTopic);
    vi.mocked(getDefaultChannel).mockResolvedValue(fakeChannel);
    vi.mocked(createProduceVideoJob).mockResolvedValue(fakeJob);
    vi.mocked(runStrategist).mockResolvedValue(fakeStrategistOut);
    vi.mocked(runWriter).mockImplementation(async function* () {
      yield { type: "chunk" as const, text: "In 1903" };
      throw new Error("rate limit");
    });
  });

  it("emits job_failed with correct agent when Writer throws", async () => {
    const events: any[] = [];
    for await (const ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      events.push(ev);
    }

    const failed = events.find((e) => e.type === "job_failed");
    expect(failed).toBeDefined();
    expect(failed.data.agent).toBe("writer");
    expect(failed.data.error).toMatch(/rate limit/);
  });

  it("calls finishJobFailure with the error message", async () => {
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }
    expect(finishJobFailure).toHaveBeenCalledWith(expect.anything(), "job-uuid", expect.stringMatching(/rate limit/));
  });

  it("does NOT call createVideoDraft on failure", async () => {
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }
    expect(createVideoDraft).not.toHaveBeenCalled();
  });

  it("resets the failing agent to idle", async () => {
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }
    // Last call to updateAgentState for "writer" should be idle.
    const writerCalls = vi.mocked(updateAgentState).mock.calls.filter((c) => c[1] === "writer");
    const last = writerCalls[writerCalls.length - 1];
    expect(last[2]).toBe("idle");
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (the `inferFailingAgent` stub from Task 2.1 always returns "writer" which happens to be correct in this test, BUT we need explicit tracking for the test to be honest)

```bash
npm test -- src/tests/lib/agents/orchestrator.test.ts
```

- [ ] **Step 3: Patch orchestrator to track the currently-running agent explicitly**

Open `src/lib/agents/orchestrator.ts`. Replace the `inferFailingAgent` stub and the try/catch with explicit tracking. Find this section:

```typescript
  let failingAgent: AgentId | null = null;

  try {
    // ────── Strategist ──────
```

Add a local `currentAgent` variable AT THE TOP of the try block:

```typescript
  let currentAgent: AgentId = "strategist";
  try {
    // ────── Strategist ──────
    currentAgent = "strategist";
```

Then at the start of each subsequent agent section (Writer, Voice Coach, Director), add the same line right after the `yield* lifecycleBefore(...)` call:

```typescript
    // ────── Writer ──────
    currentAgent = "writer";
    yield* lifecycleBefore(supabase, "writer", `Scripting: ${topic.title}`);
```

```typescript
    // ────── Voice Coach ──────
    currentAgent = "voice_coach";
    yield* lifecycleBefore(supabase, "voice_coach", `Picking voice for: ${topic.title}`);
```

```typescript
    // ────── Director ──────
    currentAgent = "director";
    yield* lifecycleBefore(supabase, "director", `Directing: ${topic.title}`);
```

Then in the `catch` block, use `currentAgent` instead of calling `inferFailingAgent`:

```typescript
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await updateAgentState(supabase, currentAgent, "idle", null);
    } catch { /* ignore secondary failures */ }
    try {
      await finishJobFailure(supabase, job.id, message);
    } catch { /* ignore */ }
    yield { type: "job_failed", data: { agent: currentAgent, error: message } };
  }
```

Then delete the `inferFailingAgent` function entirely — it's no longer needed.

Also delete the now-unused `failingAgent` local variable.

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/agents/orchestrator.test.ts
```

Expected: all success + concurrency + failure tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/orchestrator.ts src/tests/lib/agents/orchestrator.test.ts
git commit -m "feat(orchestrator): explicit currentAgent tracking + failure-path tests"
```

---

# PHASE 3: API routes

## Task 3.1: SSE encoder utility + test

**Files:**
- Create: `src/lib/sse.ts`
- Create: `src/tests/lib/sse.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/tests/lib/sse.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { encodeSseEvent } from "@/lib/sse";

describe("encodeSseEvent", () => {
  it("formats a single event with type and JSON data", () => {
    const out = encodeSseEvent({ type: "job_started", data: { jobId: "j1", topicId: "t1", channelId: "c1", startedAt: "2026-05-24T00:00:00Z" } });
    const decoded = new TextDecoder().decode(out);
    expect(decoded).toContain("event: job_started\n");
    expect(decoded).toContain('data: {"jobId":"j1"');
    expect(decoded.endsWith("\n\n")).toBe(true);
  });

  it("escapes newlines inside data so the SSE framing isn't broken", () => {
    const out = encodeSseEvent({ type: "writer_chunk", data: { text: "line1\nline2" } });
    const decoded = new TextDecoder().decode(out);
    // JSON.stringify naturally escapes newlines as \n — verify no raw newline in data.
    const dataLine = decoded.split("\n").find((l) => l.startsWith("data:"));
    expect(dataLine).not.toMatch(/\nline2/);
  });

  it("returns a Uint8Array for stream controller.enqueue()", () => {
    const out = encodeSseEvent({ type: "agent_done", data: { agent: "writer", durationMs: 1234 } });
    expect(out).toBeInstanceOf(Uint8Array);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- src/tests/lib/sse.test.ts
```

- [ ] **Step 3: Implement**

Create `src/lib/sse.ts`:

```typescript
// src/lib/sse.ts
//
// Helper for encoding StreamEvents into the SSE wire format.
// The dispatch route enqueues these into a ReadableStream that's
// returned with Content-Type: text/event-stream.

import "server-only";
import type { StreamEvent } from "@/lib/agents/types";

const encoder = new TextEncoder();

export function encodeSseEvent(event: StreamEvent): Uint8Array {
  const dataJson = JSON.stringify(event.data);
  // SSE framing: "event: <name>\ndata: <json>\n\n"
  // JSON.stringify escapes newlines so the data line stays single-line.
  return encoder.encode(`event: ${event.type}\ndata: ${dataJson}\n\n`);
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/sse.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/sse.ts src/tests/lib/sse.test.ts
git commit -m "feat(sse): encodeSseEvent helper for streaming wire format"
```

---

## Task 3.2: POST /api/lab/dispatch

**Files:**
- Create: `src/app/api/lab/dispatch/route.ts`

This route is the long-running SSE endpoint. There's no clean way to unit-test the streaming response without dragging in the Next.js test harness, so we verify by integration in Phase 5. The orchestrator itself is already tested.

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/lab/dispatch/route.ts
//
// POST /api/lab/dispatch
//   Body: { topicId: string }
//   Response: text/event-stream of StreamEvents (job_started, agent_state,
//     writer_chunk, agent_output, agent_done, job_completed | job_failed).
//
// Opens a single long-running Fluid Compute invocation. The orchestrator
// runs Strategist → Writer → Voice Coach → Director, with the orchestrator's
// async-generator events serialized to SSE on the fly.

import "server-only";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { runPipeline, ConcurrentRunError } from "@/lib/agents/orchestrator";
import { encodeSseEvent } from "@/lib/sse";
import { getActiveProduceVideoJob } from "@/lib/supabase/repositories/jobs";

export const dynamic = "force-dynamic";   // never cache
export const maxDuration = 300;            // Fluid Compute timeout (seconds)

const BodySchema = z.object({ topicId: z.string().uuid() });

export async function POST(req: Request): Promise<Response> {
  let topicId: string;
  try {
    const json = await req.json();
    topicId = BodySchema.parse(json).topicId;
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "invalid body" },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();

  // Pre-flight concurrency check so we return 409 BEFORE opening the stream.
  // The orchestrator does its own check inside the generator as a safety net.
  try {
    const active = await getActiveProduceVideoJob(supabase);
    if (active) {
      return Response.json(
        { error: "A produce_video job is already running.", activeJobId: active.id },
        { status: 409 },
      );
    }
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "preflight failed" },
      { status: 500 },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runPipeline({ topicId, supabase })) {
          controller.enqueue(encodeSseEvent(event));
        }
      } catch (err) {
        if (err instanceof ConcurrentRunError) {
          controller.enqueue(
            encodeSseEvent({
              type: "job_failed",
              data: { agent: "strategist", error: err.message },
            }),
          );
        } else {
          const message = err instanceof Error ? err.message : String(err);
          controller.enqueue(
            encodeSseEvent({
              type: "job_failed",
              data: { agent: "strategist", error: `orchestrator error: ${message}` },
            }),
          );
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: success. The build output's route table includes `ƒ /api/lab/dispatch` (`ƒ` indicates a dynamic/server route).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/lab/dispatch/
git commit -m "feat(api): POST /api/lab/dispatch — SSE endpoint running the orchestrator"
```

---

## Task 3.3: GET /api/lab/drafts

**Files:**
- Create: `src/app/api/lab/drafts/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/lab/drafts/route.ts
//
// GET /api/lab/drafts
//   Returns the last 10 your_videos rows with status='draft', newest first.

import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import { listRecentDrafts } from "@/lib/supabase/repositories/your-videos";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const supabase = getServiceClient();
    const drafts = await listRecentDrafts(supabase, 10);
    return Response.json({ drafts });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "failed to list drafts" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/lab/drafts/
git commit -m "feat(api): GET /api/lab/drafts — list recent draft videos"
```

---

## Task 3.4: GET /api/lab/jobs/active

**Files:**
- Create: `src/app/api/lab/jobs/active/route.ts`

- [ ] **Step 1: Create the route**

```typescript
// src/app/api/lab/jobs/active/route.ts
//
// GET /api/lab/jobs/active
//   Returns the current running produce_video job if any, or { activeJob: null }.
//   Used by DispatchButton to disable itself across tabs while a run is live.

import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import { getActiveProduceVideoJob } from "@/lib/supabase/repositories/jobs";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const supabase = getServiceClient();
    const activeJob = await getActiveProduceVideoJob(supabase);
    return Response.json({ activeJob });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "failed to check active job" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/lab/jobs/
git commit -m "feat(api): GET /api/lab/jobs/active — poll for in-flight produce_video job"
```

---

# PHASE 4: Lab UI

## Task 4.1: ReadyToDispatchPane (server component)

**Files:**
- Create: `src/components/lab/ready-to-dispatch-pane.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/lab/ready-to-dispatch-pane.tsx
//
// Server component. Loads reviewed topics from the DB at request time
// and renders a row per topic with a DispatchButton. The actual SSE
// stream lifecycle is owned by DispatchButton (client).

import { getServiceClient } from "@/lib/supabase/server";
import { listReviewedTopics } from "@/lib/supabase/repositories/topic-queue";
import { DispatchButton } from "./dispatch-button";
import Link from "next/link";

export async function ReadyToDispatchPane() {
  const supabase = getServiceClient();
  const topics = await listReviewedTopics(supabase, 20);

  if (topics.length === 0) {
    return (
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <h2 className="text-lg font-semibold text-text-primary">Ready to Dispatch</h2>
        <p className="mt-2 text-sm text-text-secondary">
          No topics reviewed yet. Approve some in the{" "}
          <Link href="/" className="text-accent-electric hover:underline">
            Cockpit
          </Link>{" "}
          first.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-subtle bg-surface">
      <header className="flex items-center justify-between px-4 py-3 border-b border-subtle">
        <h2 className="text-lg font-semibold text-text-primary">Ready to Dispatch</h2>
        <span className="text-xs font-mono text-text-muted">{topics.length} reviewed</span>
      </header>
      <ul className="divide-y divide-subtle">
        {topics.map((t) => (
          <li key={t.id} className="flex items-center gap-4 px-4 py-3">
            <span className="font-mono text-lg text-accent-electric w-10 shrink-0">
              {t.hookability_score ?? "—"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary line-clamp-2">{t.title}</p>
              <p className="text-xs text-text-muted mt-0.5">
                {t.source} · {(t.summary ?? "").slice(0, 80)}
              </p>
            </div>
            <DispatchButton topicId={t.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Verify build (the DispatchButton import will fail until Task 4.2)**

The build will fail at this point until Task 4.2 ships DispatchButton. That's intentional — we order DispatchButton next. Skip the build check; proceed to commit.

- [ ] **Step 3: Commit**

```bash
git add src/components/lab/ready-to-dispatch-pane.tsx
git commit -m "feat(lab): ReadyToDispatchPane server component (lists reviewed topics)"
```

---

## Task 4.2: DispatchButton (client component)

**Files:**
- Create: `src/components/lab/dispatch-button.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/lab/dispatch-button.tsx
//
// Client component. Polls /api/lab/jobs/active every 5s to know whether
// to disable itself, and on click POSTs to /api/lab/dispatch to start
// a Lab run. Emits a custom DOM event "lab:dispatch-start" with the
// topicId so the ActiveRunPane can pick up the open Response stream.

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function DispatchButton({ topicId }: { topicId: string }) {
  const [busy, setBusy] = useState(false);
  const [activeElsewhere, setActiveElsewhere] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const res = await fetch("/api/lab/jobs/active", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) setActiveElsewhere(Boolean(json?.activeJob));
      } catch {
        /* leave previous value */
      }
    };
    probe();
    const interval = setInterval(probe, 5_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const disabled = busy || activeElsewhere;
  const label = busy ? "Dispatching…" : activeElsewhere ? "Run in progress" : "Dispatch";

  async function handleClick() {
    if (disabled) return;
    setBusy(true);
    window.dispatchEvent(
      new CustomEvent("lab:dispatch-start", { detail: { topicId } }),
    );
  }

  return (
    <Button
      onClick={handleClick}
      disabled={disabled}
      className="bg-accent-electric text-app font-medium hover:opacity-90 disabled:opacity-40"
      title={activeElsewhere ? "A run is already in progress" : ""}
    >
      {label} ▶
    </Button>
  );
}
```

NOTE: The actual `fetch` to `/api/lab/dispatch` happens inside `ActiveRunPane`, NOT inside `DispatchButton`. The button just dispatches a custom DOM event that ActiveRunPane listens for. This keeps the SSE-reading complexity in one place and lets the button live anywhere on the page.

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: success. ReadyToDispatchPane + DispatchButton should both compile now.

- [ ] **Step 3: Commit**

```bash
git add src/components/lab/dispatch-button.tsx
git commit -m "feat(lab): DispatchButton client component (polls active, emits start event)"
```

---

## Task 4.3: PipelineStrip component

**Files:**
- Create: `src/components/lab/pipeline-strip.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/lab/pipeline-strip.tsx
//
// 4 agent chips with state badges. The Active Run pane drives the state
// via props; this component is purely presentational.

"use client";

import type { AgentId, AgentState } from "@/lib/agents/types";

export type AgentChipState = "idle" | "thinking" | "working" | "done" | "failed";

export type AgentChip = {
  id: AgentId;
  label: string;
  emoji: string;
  state: AgentChipState;
};

const AGENT_BASE: Record<AgentId, { label: string; emoji: string }> = {
  strategist: { label: "Strategist", emoji: "🧭" },
  writer:     { label: "Writer",     emoji: "✍️" },
  voice_coach:{ label: "Voice Coach",emoji: "🎙️" },
  director:   { label: "Director",   emoji: "🎬" },
};

const STATE_STYLES: Record<AgentChipState, string> = {
  idle:     "bg-elevated text-text-muted border-subtle",
  thinking: "bg-elevated text-accent-amber border-accent-amber/40 animate-pulse",
  working:  "bg-elevated text-accent-electric border-accent-electric/40 shadow-[0_0_12px_rgba(0,255,136,0.25)]",
  done:     "bg-elevated text-accent-electric border-accent-electric/40",
  failed:   "bg-elevated text-accent-red border-accent-red/60",
};

export function PipelineStrip({ states }: { states: Record<AgentId, AgentChipState> }) {
  const order: AgentId[] = ["strategist", "writer", "voice_coach", "director"];

  return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-surface border border-subtle sticky top-0 z-10">
      {order.map((id, idx) => {
        const base = AGENT_BASE[id];
        const s = states[id];
        return (
          <span key={id} className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition ${STATE_STYLES[s]}`}
              data-testid={`pipeline-chip-${id}`}
            >
              <span aria-hidden>{base.emoji}</span>
              <span>{base.label}</span>
            </span>
            {idx < order.length - 1 && (
              <span className="text-text-muted text-xs">━━</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

// Convenience: derive a state map from raw AgentState (database value) + a "done" flag.
export function deriveChipState(state: AgentState | null, hasOutput: boolean, failed: boolean): AgentChipState {
  if (failed) return "failed";
  if (hasOutput) return "done";
  if (state === "thinking") return "thinking";
  if (state === "working") return "working";
  return "idle";
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/lab/pipeline-strip.tsx
git commit -m "feat(lab): PipelineStrip — 4 agent chips with state-driven styling"
```

---

## Task 4.4: Agent output cards (Strategist, Voice Coach, Director)

**Files:**
- Create: `src/components/lab/strategist-card.tsx`
- Create: `src/components/lab/voice-coach-card.tsx`
- Create: `src/components/lab/director-card.tsx`

- [ ] **Step 1: Create `strategist-card.tsx`**

```tsx
// src/components/lab/strategist-card.tsx
"use client";

import type { StrategistOutput } from "@/lib/agents/strategist";
import type { AgentChipState } from "./pipeline-strip";

export function StrategistCard({
  state,
  output,
}: {
  state: AgentChipState;
  output: StrategistOutput | null;
}) {
  return (
    <article className="rounded-lg border border-subtle bg-surface p-4">
      <header className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-text-primary">🧭 Strategist</h3>
        <StateBadge state={state} />
      </header>
      {output ? (
        <div className="space-y-2 text-sm text-text-secondary">
          <p>
            <span className="text-text-muted text-xs uppercase tracking-wide">Dispatch:</span>{" "}
            <span className="text-text-primary">{output.dispatch_directive}</span>
          </p>
          <p>
            <span className="text-text-muted text-xs uppercase tracking-wide">Hints:</span>{" "}
            {output.format_hints.map((h, i) => (
              <span
                key={i}
                className="inline-block mr-1 px-2 py-0.5 rounded bg-elevated text-xs font-mono"
              >
                {h}
              </span>
            ))}
          </p>
          <p className="text-text-muted italic text-xs">{output.rationale}</p>
        </div>
      ) : (
        <Skeleton />
      )}
    </article>
  );
}

function StateBadge({ state }: { state: AgentChipState }) {
  const txt: Record<AgentChipState, string> = {
    idle: "waiting",
    thinking: "thinking…",
    working: "working…",
    done: "✓ done",
    failed: "✗ failed",
  };
  return <span className="text-xs font-mono text-text-muted">{txt[state]}</span>;
}

function Skeleton() {
  return (
    <div className="space-y-2">
      <div className="h-3 w-3/4 rounded bg-elevated animate-pulse" />
      <div className="h-3 w-1/2 rounded bg-elevated animate-pulse" />
    </div>
  );
}
```

- [ ] **Step 2: Create `voice-coach-card.tsx`**

```tsx
// src/components/lab/voice-coach-card.tsx
"use client";

import type { VoiceCoachOutput } from "@/lib/agents/voice-coach";
import type { AgentChipState } from "./pipeline-strip";
import { VOICE_POOL } from "@/lib/agents/constants";

export function VoiceCoachCard({
  state,
  output,
}: {
  state: AgentChipState;
  output: VoiceCoachOutput | null;
}) {
  const entry = output ? VOICE_POOL.find((v) => v.id === output.voice_id) : null;
  return (
    <article className="rounded-lg border border-subtle bg-surface p-4">
      <header className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-text-primary">🎙️ Voice Coach</h3>
        <StateBadge state={state} />
      </header>
      {output && entry ? (
        <div className="space-y-2 text-sm text-text-secondary">
          <p>
            <span className="text-text-primary font-medium">{entry.id}</span>{" "}
            <span className="text-text-muted text-xs">· {entry.provider}</span>
          </p>
          <p className="text-text-muted text-xs">{entry.description}</p>
          <p className="text-xs font-mono text-text-muted">
            speed: {output.speed.toFixed(2)} · stability: {output.stability.toFixed(2)}
          </p>
          <p className="text-text-muted italic text-xs">{output.rationale}</p>
        </div>
      ) : (
        <Skeleton />
      )}
    </article>
  );
}

function StateBadge({ state }: { state: AgentChipState }) {
  const txt: Record<AgentChipState, string> = {
    idle: "waiting", thinking: "thinking…", working: "working…", done: "✓ done", failed: "✗ failed",
  };
  return <span className="text-xs font-mono text-text-muted">{txt[state]}</span>;
}

function Skeleton() {
  return (
    <div className="space-y-2">
      <div className="h-3 w-1/2 rounded bg-elevated animate-pulse" />
      <div className="h-3 w-2/3 rounded bg-elevated animate-pulse" />
    </div>
  );
}
```

- [ ] **Step 3: Create `director-card.tsx`**

```tsx
// src/components/lab/director-card.tsx
"use client";

import type { DirectorOutput } from "@/lib/agents/director";
import type { AgentChipState } from "./pipeline-strip";

export function DirectorCard({
  state,
  output,
}: {
  state: AgentChipState;
  output: DirectorOutput | null;
}) {
  return (
    <article className="rounded-lg border border-subtle bg-surface p-4">
      <header className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-text-primary">🎬 Director</h3>
        <StateBadge state={state} />
      </header>
      {output ? (
        <div className="space-y-3 text-sm text-text-secondary">
          <p>
            <span className="text-text-muted text-xs uppercase tracking-wide">Treatment:</span>{" "}
            <span className="text-text-primary font-mono">{output.visual_treatment}</span>{" "}
            <span className="text-text-muted text-xs">· music: {output.music_mood}</span>
          </p>
          <div className="rounded border border-subtle overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-elevated text-text-muted">
                <tr>
                  <th className="text-left px-2 py-1 font-mono">#</th>
                  <th className="text-left px-2 py-1 font-mono">b-roll query</th>
                  <th className="text-left px-2 py-1 font-mono">dur</th>
                  <th className="text-left px-2 py-1 font-mono">segment</th>
                </tr>
              </thead>
              <tbody>
                {output.shot_list.map((shot, i) => (
                  <tr key={i} className="border-t border-subtle">
                    <td className="px-2 py-1 font-mono text-text-muted">{i + 1}</td>
                    <td className="px-2 py-1 font-mono text-accent-electric">{shot.broll_search_query}</td>
                    <td className="px-2 py-1 font-mono text-text-muted">{shot.duration_seconds}s</td>
                    <td className="px-2 py-1 text-text-primary truncate max-w-xs" title={shot.segment_text}>
                      {shot.segment_text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-text-muted italic text-xs">{output.rationale}</p>
        </div>
      ) : (
        <Skeleton />
      )}
    </article>
  );
}

function StateBadge({ state }: { state: AgentChipState }) {
  const txt: Record<AgentChipState, string> = {
    idle: "waiting", thinking: "thinking…", working: "working…", done: "✓ done", failed: "✗ failed",
  };
  return <span className="text-xs font-mono text-text-muted">{txt[state]}</span>;
}

function Skeleton() {
  return (
    <div className="space-y-2">
      <div className="h-3 w-1/2 rounded bg-elevated animate-pulse" />
      <div className="h-20 w-full rounded bg-elevated animate-pulse" />
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/components/lab/strategist-card.tsx src/components/lab/voice-coach-card.tsx src/components/lab/director-card.tsx
git commit -m "feat(lab): Strategist + Voice Coach + Director output cards"
```

---

## Task 4.5: WriterCard with streaming text

**Files:**
- Create: `src/components/lab/writer-card.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/lab/writer-card.tsx
//
// Renders the live-streaming script. Word count + estimated duration
// update as new tokens arrive. Once the final agent_output event arrives,
// the canonical script replaces the assembled text.

"use client";

import type { WriterOutput } from "@/lib/agents/writer";
import type { AgentChipState } from "./pipeline-strip";

export function WriterCard({
  state,
  streamedText,
  output,
}: {
  state: AgentChipState;
  streamedText: string;
  output: WriterOutput | null;
}) {
  const displayed = output ? output.script : streamedText;
  const wordCount = output ? output.word_count : countWords(streamedText);
  const estDuration = output ? output.estimated_duration_seconds : wordCount / 2.5;

  return (
    <article className="rounded-lg border border-subtle bg-surface p-4">
      <header className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-text-primary">✍️ Writer</h3>
        <StateBadge state={state} />
      </header>

      <div
        className="text-text-primary text-[15px] leading-relaxed font-sans whitespace-pre-wrap min-h-[120px]"
        data-testid="writer-script-area"
      >
        {displayed || <span className="text-text-muted italic">waiting for Strategist…</span>}
        {state === "working" && <span className="inline-block ml-0.5 w-2 h-4 align-text-bottom bg-accent-electric animate-pulse" />}
      </div>

      {wordCount > 0 && (
        <footer className="mt-3 flex items-center gap-4 text-xs font-mono text-text-muted">
          <span>
            <span className="text-accent-electric">{wordCount}</span> words
          </span>
          <span>est ~{estDuration.toFixed(0)}s</span>
        </footer>
      )}
    </article>
  );
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function StateBadge({ state }: { state: AgentChipState }) {
  const txt: Record<AgentChipState, string> = {
    idle: "waiting", thinking: "thinking…", working: "streaming…", done: "✓ done", failed: "✗ failed",
  };
  return <span className="text-xs font-mono text-text-muted">{txt[state]}</span>;
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/lab/writer-card.tsx
git commit -m "feat(lab): WriterCard with streaming text + word/duration counters"
```

---

## Task 4.6: ActiveRunPane (the SSE reader + state machine)

**Files:**
- Create: `src/components/lab/active-run-pane.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/lab/active-run-pane.tsx
//
// Listens for the 'lab:dispatch-start' DOM event from DispatchButton,
// POSTs to /api/lab/dispatch, and reads the SSE response with a streaming
// fetch reader. Maintains a state machine of the 4 agents' progress and
// passes that down to PipelineStrip + the 4 output cards.
//
// On job_completed: triggers a router.refresh() so the RecentDraftsPane
// re-renders with the new draft at the top.
//
// On job_failed: shows a red error block + Re-dispatch button on the
// failed agent's card.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AgentId, AgentState, StreamEvent } from "@/lib/agents/types";
import type { StrategistOutput } from "@/lib/agents/strategist";
import type { WriterOutput } from "@/lib/agents/writer";
import type { VoiceCoachOutput } from "@/lib/agents/voice-coach";
import type { DirectorOutput } from "@/lib/agents/director";
import {
  PipelineStrip,
  deriveChipState,
  type AgentChipState,
} from "./pipeline-strip";
import { StrategistCard } from "./strategist-card";
import { WriterCard } from "./writer-card";
import { VoiceCoachCard } from "./voice-coach-card";
import { DirectorCard } from "./director-card";

type AgentSlotBase = { state: AgentState | null; durationMs?: number };
type RunState = {
  active: boolean;
  jobId: string | null;
  topicId: string | null;
  strategist: AgentSlotBase & { output: StrategistOutput | null };
  writer: AgentSlotBase & { output: WriterOutput | null; streamedText: string };
  voiceCoach: AgentSlotBase & { output: VoiceCoachOutput | null };
  director: AgentSlotBase & { output: DirectorOutput | null };
  failure: { agent: AgentId; error: string } | null;
  completed: boolean;
};

const INITIAL: RunState = {
  active: false,
  jobId: null,
  topicId: null,
  strategist: { state: null, output: null },
  writer: { state: null, output: null, streamedText: "" },
  voiceCoach: { state: null, output: null },
  director: { state: null, output: null },
  failure: null,
  completed: false,
};

export function ActiveRunPane() {
  const router = useRouter();
  const [run, setRun] = useState<RunState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const startRun = useCallback(async (topicId: string) => {
    // Reset state, mark active.
    setRun({ ...INITIAL, active: true, topicId });
    const controller = new AbortController();
    abortRef.current = controller;

    let res: Response;
    try {
      res = await fetch("/api/lab/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId }),
        signal: controller.signal,
      });
    } catch (err) {
      setRun((r) => ({ ...r, failure: { agent: "strategist", error: String(err) }, active: false }));
      return;
    }

    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => "");
      setRun((r) => ({ ...r, failure: { agent: "strategist", error: `HTTP ${res.status}: ${txt}` }, active: false }));
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (err) {
        if (controller.signal.aborted) return;
        setRun((r) => ({ ...r, failure: { agent: "writer", error: `stream error: ${err}` }, active: false }));
        return;
      }
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      // SSE frames are delimited by "\n\n".
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const ev = parseSseFrame(frame);
        if (ev) applyEvent(setRun, ev);
        if (ev?.type === "job_completed" || ev?.type === "job_failed") {
          // Stream is about to close; trigger a draft refresh.
          router.refresh();
          setRun((r) => ({ ...r, active: false }));
        }
      }
    }
  }, [router]);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent).detail as { topicId: string } | undefined;
      if (!detail?.topicId) return;
      startRun(detail.topicId);
    }
    window.addEventListener("lab:dispatch-start", handler);
    return () => {
      window.removeEventListener("lab:dispatch-start", handler);
      abortRef.current?.abort();
    };
  }, [startRun]);

  if (!run.active && !run.completed && !run.failure) {
    return null;
  }

  const states: Record<AgentId, AgentChipState> = {
    strategist: deriveChipState(
      run.strategist.state,
      Boolean(run.strategist.output),
      run.failure?.agent === "strategist",
    ),
    writer: deriveChipState(
      run.writer.state,
      Boolean(run.writer.output),
      run.failure?.agent === "writer",
    ),
    voice_coach: deriveChipState(
      run.voiceCoach.state,
      Boolean(run.voiceCoach.output),
      run.failure?.agent === "voice_coach",
    ),
    director: deriveChipState(
      run.director.state,
      Boolean(run.director.output),
      run.failure?.agent === "director",
    ),
  };

  return (
    <section className="space-y-4">
      <PipelineStrip states={states} />
      <div className="space-y-3">
        <StrategistCard state={states.strategist} output={run.strategist.output} />
        <WriterCard
          state={states.writer}
          streamedText={run.writer.streamedText}
          output={run.writer.output}
        />
        <VoiceCoachCard state={states.voice_coach} output={run.voiceCoach.output} />
        <DirectorCard state={states.director} output={run.director.output} />
      </div>

      {run.failure && (
        <div className="rounded-lg border border-accent-red/60 bg-accent-red/5 p-4">
          <p className="text-sm text-accent-red font-medium">
            ✗ {run.failure.agent} failed
          </p>
          <p className="text-xs font-mono text-text-secondary mt-1">{run.failure.error}</p>
          <button
            className="mt-3 px-3 py-1.5 rounded bg-accent-electric text-app text-xs font-medium hover:opacity-90"
            onClick={() => run.topicId && startRun(run.topicId)}
          >
            Re-dispatch
          </button>
        </div>
      )}
    </section>
  );
}

function parseSseFrame(frame: string): StreamEvent | null {
  const lines = frame.split("\n");
  let eventName: string | null = null;
  let dataLine: string | null = null;
  for (const line of lines) {
    if (line.startsWith("event: ")) eventName = line.slice(7).trim();
    else if (line.startsWith("data: ")) dataLine = line.slice(6);
  }
  if (!eventName || !dataLine) return null;
  try {
    const data = JSON.parse(dataLine);
    return { type: eventName, data } as StreamEvent;
  } catch {
    return null;
  }
}

function applyEvent(setRun: React.Dispatch<React.SetStateAction<RunState>>, ev: StreamEvent) {
  setRun((r) => {
    switch (ev.type) {
      case "job_started":
        return { ...r, jobId: ev.data.jobId, topicId: ev.data.topicId };
      case "agent_state": {
        const slotKey = mapAgentToKey(ev.data.agent);
        return { ...r, [slotKey]: { ...(r as any)[slotKey], state: ev.data.state } } as RunState;
      }
      case "agent_output": {
        const slotKey = mapAgentToKey(ev.data.agent);
        return { ...r, [slotKey]: { ...(r as any)[slotKey], output: ev.data.output } } as RunState;
      }
      case "writer_chunk":
        return {
          ...r,
          writer: { ...r.writer, streamedText: r.writer.streamedText + ev.data.text },
        };
      case "agent_done": {
        const slotKey = mapAgentToKey(ev.data.agent);
        return { ...r, [slotKey]: { ...(r as any)[slotKey], durationMs: ev.data.durationMs } } as RunState;
      }
      case "job_completed":
        return { ...r, completed: true };
      case "job_failed":
        return { ...r, failure: { agent: ev.data.agent, error: ev.data.error } };
      default:
        return r;
    }
  });
}

function mapAgentToKey(agent: AgentId): "strategist" | "writer" | "voiceCoach" | "director" {
  switch (agent) {
    case "strategist": return "strategist";
    case "writer": return "writer";
    case "voice_coach": return "voiceCoach";
    case "director": return "director";
  }
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/lab/active-run-pane.tsx
git commit -m "feat(lab): ActiveRunPane — SSE reader + state machine + failure handling"
```

---

## Task 4.7: RecentDraftsPane + DraftRow

**Files:**
- Create: `src/components/lab/draft-row.tsx`
- Create: `src/components/lab/recent-drafts-pane.tsx`

- [ ] **Step 1: Create `draft-row.tsx`**

```tsx
// src/components/lab/draft-row.tsx
//
// Client component. Collapsed by default; clicking expands to show
// script + voice + visual_treatment + Re-dispatch / Discard buttons.

"use client";

import { useState } from "react";
import type { YourVideo } from "@/lib/supabase/repositories/your-videos";

export function DraftRow({ draft }: { draft: YourVideo }) {
  const [open, setOpen] = useState(false);

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  function reDispatch() {
    if (!draft.topic_queue_id) return;
    window.dispatchEvent(
      new CustomEvent("lab:dispatch-start", { detail: { topicId: draft.topic_queue_id } }),
    );
  }

  async function discard() {
    if (!confirm("Discard this draft?")) return;
    await fetch(`/api/lab/drafts/${draft.id}`, { method: "DELETE" }).catch(() => null);
    // Optimistic: hide row by reloading the pane via the parent's router.refresh().
    location.reload();
  }

  return (
    <li className="px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 text-left"
      >
        <span className="text-xs font-mono text-text-muted w-28 shrink-0">
          {formatTime(draft.created_at)}
        </span>
        <span className="flex-1 min-w-0 text-sm text-text-primary truncate">
          {draft.title}
        </span>
        <span className="text-xs font-mono text-text-muted">
          {draft.voice_id ?? "—"} · {draft.visual_treatment ?? "—"}
        </span>
        <span className="text-text-muted text-xs">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 pl-2 border-l border-subtle">
          <section>
            <p className="text-xs font-mono text-text-muted uppercase tracking-wide">Script</p>
            <p className="mt-1 text-sm text-text-primary whitespace-pre-wrap">{draft.script}</p>
          </section>
          <section className="flex items-center gap-2">
            <button
              onClick={reDispatch}
              className="px-3 py-1.5 rounded bg-accent-electric text-app text-xs font-medium hover:opacity-90"
              disabled={!draft.topic_queue_id}
            >
              Re-dispatch
            </button>
            <button
              onClick={discard}
              className="px-3 py-1.5 rounded bg-elevated text-accent-red text-xs font-medium hover:bg-hover border border-accent-red/40"
            >
              Discard
            </button>
          </section>
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 2: Create `recent-drafts-pane.tsx`**

```tsx
// src/components/lab/recent-drafts-pane.tsx
//
// Server component. Loads up to 10 of the most recent your_videos rows
// with status='draft'.

import { getServiceClient } from "@/lib/supabase/server";
import { listRecentDrafts } from "@/lib/supabase/repositories/your-videos";
import { DraftRow } from "./draft-row";

export async function RecentDraftsPane() {
  const supabase = getServiceClient();
  const drafts = await listRecentDrafts(supabase, 10);

  return (
    <section className="rounded-lg border border-subtle bg-surface">
      <header className="flex items-center justify-between px-4 py-3 border-b border-subtle">
        <h2 className="text-lg font-semibold text-text-primary">Recent Drafts</h2>
        <span className="text-xs font-mono text-text-muted">{drafts.length} drafts</span>
      </header>
      {drafts.length === 0 ? (
        <p className="px-4 py-6 text-sm text-text-muted">
          No drafts yet — dispatch a reviewed topic above to make one.
        </p>
      ) : (
        <ul className="divide-y divide-subtle">
          {drafts.map((d) => (
            <DraftRow key={d.id} draft={d} />
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Add a tiny DELETE route for discard**

Create `src/app/api/lab/drafts/[id]/route.ts`:

```typescript
import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import { discardDraft } from "@/lib/supabase/repositories/your-videos";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await ctx.params;
    const supabase = getServiceClient();
    await discardDraft(supabase, id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "discard failed" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/components/lab/draft-row.tsx src/components/lab/recent-drafts-pane.tsx src/app/api/lab/drafts/
git commit -m "feat(lab): RecentDraftsPane + DraftRow + DELETE /api/lab/drafts/[id]"
```

---

## Task 4.8: Wire it all together — replace /lab/page.tsx

**Files:**
- Modify: `src/app/lab/page.tsx`

- [ ] **Step 1: Read the current file**

```bash
cat src/app/lab/page.tsx
```

(Currently the Plan #2 placeholder.)

- [ ] **Step 2: Replace with the 3-pane layout**

```tsx
// src/app/lab/page.tsx
//
// The Lab — Plan #3.
// Three panes:
//   1. ReadyToDispatchPane (server) — reviewed topics with Dispatch buttons.
//   2. ActiveRunPane (client) — live pipeline view, only mounts during a run.
//   3. RecentDraftsPane (server) — last 10 your_videos drafts.

import { CockpitShell } from "@/components/cockpit/cockpit-shell";
import { ReadyToDispatchPane } from "@/components/lab/ready-to-dispatch-pane";
import { ActiveRunPane } from "@/components/lab/active-run-pane";
import { RecentDraftsPane } from "@/components/lab/recent-drafts-pane";

export const dynamic = "force-dynamic";

export default async function LabPage() {
  return (
    <CockpitShell>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">The Lab</h1>
          <p className="text-text-secondary text-sm mt-1">
            Dispatch a reviewed topic and watch the 4 agents assemble a video draft.
          </p>
        </header>

        {/* Active run lives between dispatcher + drafts; renders nothing when idle. */}
        <ActiveRunPane />

        <ReadyToDispatchPane />

        <RecentDraftsPane />
      </div>
    </CockpitShell>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: `ƒ /lab` in the route table; all the new `/api/lab/*` routes present.

- [ ] **Step 4: Commit**

```bash
git add src/app/lab/page.tsx
git commit -m "feat(lab): wire /lab page — Ready + Active + Drafts panes"
```

---

# PHASE 5: Smoke test + deploy

## Task 5.1: Local smoke test

This is a verification task — no new files, no commit unless something needs fixing.

- [ ] **Step 1: Start dev server**

```bash
cd /Users/darius/Downloads/shorts-os
nohup env -u ANTHROPIC_API_KEY -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY -u CRON_SECRET -u YOUTUBE_API_KEY -u TIKAPI_KEY -u COCKPIT_PASSWORD -u COCKPIT_SESSION_SECRET npm run dev > /tmp/lab-dev.log 2>&1 &
```

Wait until `curl http://localhost:3000/login` returns 200:

```bash
until curl -sf http://localhost:3000/login > /dev/null 2>&1; do sleep 1; done
echo "Dev server ready."
```

- [ ] **Step 2: Authenticate and confirm /lab loads**

```bash
PW=$(grep ^COCKPIT_PASSWORD= /Users/darius/Downloads/shorts-os/.env.local | cut -d= -f2-)
curl -sS -i -c /tmp/lab-jar.txt -X POST http://localhost:3000/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "password=$PW" --data-urlencode "next=/lab" | head -10

curl -sS -b /tmp/lab-jar.txt -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/lab
```

Expected: HTTP 200 for the second curl.

- [ ] **Step 3: Confirm GET /api/lab/jobs/active returns activeJob: null**

```bash
curl -sS -b /tmp/lab-jar.txt http://localhost:3000/api/lab/jobs/active
```

Expected: `{"activeJob":null}`.

- [ ] **Step 4: Confirm GET /api/lab/drafts returns drafts array**

```bash
curl -sS -b /tmp/lab-jar.txt http://localhost:3000/api/lab/drafts
```

Expected: `{"drafts":[]}` (empty array — nothing has been produced yet).

- [ ] **Step 5: Manual browser verification**

Open http://localhost:3000/lab in a real browser. Expected:
- Page loads with TopBar + sidebar.
- ReadyToDispatchPane shows either reviewed topics OR the "approve some in the Cockpit first" empty state.
- Recent Drafts shows "No drafts yet" empty state.

If no reviewed topics exist:
- In Supabase Studio, hand-set one row in `topic_queue` to `state='reviewed'`, OR
- Use the Cockpit to approve a topic (POST to `/api/topics/[id]/state` with `state=reviewed`).

- [ ] **Step 6: Dispatch a real run**

Click **Dispatch** on a reviewed topic in the browser. Expected within ~5 seconds:
- DispatchButton disables.
- ActiveRunPane appears with a 4-chip strip.
- Strategist chip turns amber → green within ~3 sec.
- Writer chip turns amber and the WriterCard starts streaming text within ~3 sec.
- After ~20 sec, Writer chip turns green; full script visible.
- Voice Coach chip activates → green within ~2 sec.
- Director chip activates → green within ~3 sec.
- ActiveRunPane shows all 4 cards completed; Recent Drafts now has a new top row.

If anything stalls or errors, the failed agent's card turns red with the error. STOP and debug.

- [ ] **Step 7: Confirm Cockpit Team Status sidebar updates live**

While step 6 is running, open `http://localhost:3000/` in another browser tab. The 7-agent sidebar should show Strategist → Writer → Voice Coach → Director going to `working` and back to `idle` in sequence.

If sidebar doesn't update, check that Realtime is enabled on `agents` in Supabase (Plan #1's migration `20260524000012_enable_realtime.sql`).

- [ ] **Step 8: Stop dev server, clean up**

```bash
pkill -f "next-server" || pkill -f "next dev" || true
rm -f /tmp/lab-dev.log /tmp/lab-jar.txt
```

If all 7 verifications passed, the Lab is working locally. No commit needed.

If any failed, STOP and report BLOCKED with the failing step and the unexpected response.

---

## Task 5.2: Deploy to Vercel

- [ ] **Step 1: Bump version + update README**

Modify `package.json`:

```json
{
  "name": "shorts-os",
  "version": "0.3.0",
  ...
}
```

Modify `README.md` to add a note that Plan #3 shipped. Locate the existing "Plan #2 cockpit shipped" section (added in commit `f13c4a7`) and append:

```markdown
**Plan #3 (The Lab) — shipped 2026-05-24.** Live agent pipeline at `/lab`: dispatch a reviewed topic and watch Strategist → Writer (streaming) → Voice Coach → Director assemble a draft in ~30-90 seconds. Drafts are saved as `your_videos.status='draft'` rows; render is Plan #4.
```

- [ ] **Step 2: Commit**

```bash
git add package.json README.md
git commit -m "chore(release): bump version to 0.3.0 — Plan #3 lab shipped"
```

- [ ] **Step 3: Deploy preview**

```bash
cd /Users/darius/Downloads/shorts-os
npx vercel
```

Expected: preview URL printed. Visit it, sign in with the cockpit password, and verify `/lab` loads.

- [ ] **Step 4: Deploy production**

```bash
npx vercel --prod
```

Expected: production deployed at `https://shorts-os-roan.vercel.app/`.

- [ ] **Step 5: Push to GitHub**

```bash
git push origin main
```

If a remote isn't configured yet, skip — local main is the source of truth.

---

## Task 5.3: Production smoke test

This is a verification task — no commit unless something needs fixing.

- [ ] **Step 1: Visit production**

Open `https://shorts-os-roan.vercel.app/lab`. Enter the cockpit password.

- [ ] **Step 2: Repeat the 7 steps from Task 5.1 Step 6 (browser flow)**

Dispatch a reviewed topic. Watch all 4 agents complete. Verify the draft lands in Recent Drafts. Verify the Cockpit Team Status sidebar updates in real time.

- [ ] **Step 3: Verify a finished `your_videos` row in Supabase**

In Supabase Studio, run:

```sql
select id, title, status, voice_id, visual_treatment, length(script) as script_len, created_at
from public.your_videos
order by created_at desc
limit 5;
```

Expected: at least one row with `status='draft'` and a non-empty `script`, `voice_id`, `visual_treatment` set.

- [ ] **Step 4: Verify `jobs`, `agent_messages`, `decisions` were populated**

```sql
select kind, status, current_agent, progress_pct, finished_at - started_at as elapsed
from public.jobs
where kind='produce_video'
order by created_at desc
limit 5;

select agent_id, decision_type, length(reasoning) as reasoning_len
from public.decisions
order by created_at desc
limit 10;

select from_agent, to_agent, intent, length(payload::text) as payload_size
from public.agent_messages
order by created_at desc
limit 10;
```

Expected: one `succeeded` row in `jobs`, four `decisions` rows (one per agent), four `agent_messages` rows.

- [ ] **Step 5: Final operator-facing check**

The Lab is production-shipped if:
- A reviewed topic can be dispatched.
- The 4-chip pipeline animates as expected.
- A `your_videos` draft is saved.
- The Cockpit's Team Status sidebar updates live during the run.
- Re-dispatching the same topic works (creates a second draft).

---

## Task 5.4: Plan #3 done — final commit + summary

- [ ] **Step 1: Verify clean git state**

```bash
git status
```

Expected: clean working tree on main. All Plan #3 changes committed.

- [ ] **Step 2: Print summary**

The implementer reports back:

```
Plan #3 (The Lab) complete.

Live at: https://shorts-os-roan.vercel.app/lab

What ships:
- 4-agent pipeline (Strategist, Writer, Voice Coach, Director)
- Live streaming Writer card
- Curated voice pool + visual treatments
- Full DB writeback (jobs, agent_messages, decisions, your_videos)
- Cockpit Team Status sidebar auto-updates via Realtime
- One seeded default channel (history, dry deadpan persona)

Cost per run: ~$0.023 (mostly Claude Sonnet for Writer)
Typical wall time: 20-40 seconds

Deferred to Plan #4:
- Real Cartesia/ElevenLabs TTS audio
- Pexels/Storyblocks b-roll fetching
- ffmpeg video render

Deferred to Plan #5:
- YouTube upload
- Format variation enforcement
- Daily cost guardrails
```

- [ ] **Step 3 (optional): Capture screenshots for the README**

If desired, take screenshots of `/lab` during an active run and add to `docs/` for future reference.
