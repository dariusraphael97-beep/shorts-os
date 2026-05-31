# Sub-phase G — Agents Dashboard + Video Reviewer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the dormant `assistants` + `video_reviews` schema into a premium agent dashboard (`/agents`, `/agents/[id]`) and an end-to-end pre-publish Video Reviewer (`/lab/[videoId]/review`), with per-agent learning loops.

**Architecture:** Mostly wiring + UI over schema that already exists in prod (Sub-phase A). Pure logic (verdict mapping, health derivation, settings schemas, chat tool registry) lives in tested `src/lib/agents/*` modules; thin DB wrappers extend `src/lib/supabase/repositories/assistants.ts`. The Video Reviewer runs as a new `review` worker job (the worker already has ffmpeg/ffprobe/Claude-vision) auto-enqueued on render-complete; the dashboard refreshes by 15s polling. The agent Chat tab is one generic AI-SDK `streamText` engine + per-assistant read-only tool registries.

**Tech Stack:** Next.js (App Router — *this is NOT the Next.js you know; read `node_modules/next/dist/docs/` before writing Next code*), TypeScript strict (no `any`), Supabase (service client), AI SDK v6 + AI Gateway (`getGatewayModel`), base-ui Tabs, motion/react, Vitest.

Spec: `docs/superpowers/specs/2026-05-31-plan-5-sub-g-agents-reviewer-design.md`.

---

## Conventions & hard rules (read before every task)

- **TS strict, no new `any` / `as unknown as`.** Repos cast `data as T` (existing convention) — that is allowed; do not add new `as unknown as`.
- **This is NOT the Next.js you know** — read the relevant guide under `node_modules/next/dist/docs/` before writing route/page/handler code.
- **Repos take the Supabase client as the first arg.** Get it with `getServiceClient()` from `@/lib/supabase/server` in routes/pages/crons.
- **Cron/route auth:** `assertCronAuth(req)` from `@/lib/scrapers/shared`.
- **AI calls:** `getGatewayModel(modelString)` from `@/lib/ai/models`; `streamText`/`generateObject`/`generateText` from `ai`. Default model strings live in `@/lib/ai/models`.
- **Local dev/test:** run with `env -u ANTHROPIC_BASE_URL npm run dev` (otherwise AI SDK 404s). Tests: `env -u ANTHROPIC_BASE_URL npx vitest run <path>`.
- **Prod migrations are operator-gated.** Write the migration file, then STOP and ask Darius in-chat with the exact phrase: "Apply migration `<name>` to prod `jfmjppzjicvbpnlkmxbg`." Do not apply without that. After applying, regen `src/lib/supabase/types.ts` (Supabase MCP `generate_typescript_types` for `jfmjppzjicvbpnlkmxbg`).
- **UI verification is operator-gated on the Vercel preview** (local pages 500 with blank `.env.local`, same wall as C–F). UI tasks finish at: `npx tsc --noEmit` clean + `env -u ANTHROPIC_BASE_URL npm run build` passes + a note of exactly what to screenshot on preview. Do not claim a UI looks 9/10 without preview proof.
- **Commit after every task.** Commit messages: `feat(plan-5-g): <thing>` / `test(plan-5-g): <thing>` / `chore(plan-5-g): <thing>`.
- Premium bar: design tokens only (`var(--accent)`, `var(--text-primary)`, `var(--surface-2)`, etc. from `src/app/globals.css`), motion variants from `@/lib/motion`, base-ui Tabs, skeleton/shimmer loading, designed empty states. Reference `/niches` + `/sandbox`.

---

## File structure (what gets created / modified)

**Migrations**
- Create `supabase/migrations/20260531000001_render_jobs_review_type.sql`
- Create `supabase/migrations/20260531000002_your_videos_generator_edits.sql`

**Pure logic (tested) — `src/lib/agents/`**
- `dashboard/health.ts` — health-pill derivation
- `dashboard/activity-format.ts` — activity-row formatting helpers
- `review/verdict.ts` — DB review → `ReviewScorecard` mapping + overall roll-up
- `review/components.ts` — pure scoring helpers that don't need ffmpeg (description-SEO, hook-from-transcript heuristics) + types shared with the worker
- `settings/schemas.ts` — per-assistant settings zod schemas
- `chat/tools.ts` — per-assistant read-only tool registry (definitions)
- `chat/engine.ts` — builds the `streamText` config (model + system prompt + tools)
- `chat/system-prompts.ts` — per-assistant system prompts

**Repo extensions**
- Modify `src/lib/supabase/repositories/assistants.ts` (activity log r/w, status read, settings r/w, memory delete, chat thread/message CRUD)
- Modify `src/lib/supabase/repositories/render-jobs.ts` (add `'review'` to `RenderJobType`)

**Writers (status/activity injection)**
- Modify `src/lib/agents/orchestrator.ts` (generator status)
- Modify `src/app/api/cron/cluster-niches/route.ts` + `classify-observations/route.ts` (niche_scout)
- Modify `src/app/api/cron/watch-list-sync/route.ts` (watch_list_curator)
- Modify `src/app/api/cron/prediction-close/route.ts` (niche_scout learning loop)

**Dashboard UI — `src/app/agents/`**
- `page.tsx` (grid + feed + health pill), plus `_components/agent-card.tsx`, `_components/activity-feed.tsx`, `_components/health-pill.tsx`, `_components/agents-refresh.tsx` (client poller)
- `[id]/page.tsx` + `[id]/_components/{activity-tab,memory-tab,settings-tab,chat-tab}.tsx`
- `src/app/api/agents/status/route.ts` (poll JSON), `src/app/api/agents/[id]/memory/route.ts`, `.../settings/route.ts`, `.../chat/route.ts` (streaming)

**Admin health**
- `src/app/admin/health/page.tsx` + `src/lib/admin/health.ts` (pure aggregation)

**Video Reviewer**
- Worker: `scripts/render-worker/handlers/review.ts` + route it in `scripts/render-worker/run.ts`; reuse `lib/probe.ts`, `lib/frames.ts`, `lib/claude-vision.ts`, `lib/blob.ts`, `lib/ffmpeg-commands.ts`
- Enqueue: modify `src/app/api/render/complete/route.ts`
- UI: `src/app/lab/[videoId]/review/page.tsx` + `_components/review-client.tsx` + reuse `src/components/compositions/review-scorecard.tsx`, `review-suggestion-item.tsx`
- Feedback: `src/app/api/lab/[videoId]/review/feedback/route.ts`; entry point in `src/app/lab/drafts/*`

**Nav/palette**
- Modify `src/components/layout/app-sidebar.tsx` (+ Agents item)
- Modify `src/components/layout/app-command-palette.tsx` (+ Agents group)

---

# Pre-flight

### Task 0: Branch + prod-schema verification

**Files:** none (verification only)

- [ ] **Step 1: Create the working branch**

```bash
git checkout -b plan-5-sub-g-agents-reviewer
```

(If executing in a worktree via `superpowers:using-git-worktrees`, that supersedes this.)

- [ ] **Step 2: Confirm the dormant schema is live in prod**

Use the Supabase MCP (`list_tables` for `jfmjppzjicvbpnlkmxbg`) or `execute_sql` to confirm these tables exist: `assistants`, `assistant_status`, `assistant_activity_log`, `assistant_memory`, `assistant_settings`, `assistant_chat_threads`, `assistant_chat_messages`, `video_reviews`, `video_review_feedback`. Confirm `assistants` has 6 rows (analyst/editor `is_enabled=false`).
Expected: all present (they ship in Sub-phase A migrations, which are live). If any are missing, STOP and report — the plan assumes they exist.

- [ ] **Step 3: Baseline checks**

```bash
npx tsc --noEmit
env -u ANTHROPIC_BASE_URL npx vitest run 2>&1 | tail -5
```
Expected: tsc clean; vitest matches the known baseline (≈520 pass / 11 env-gated fails). Record the failing count so you can detect new failures later.

---

# Migrations (operator-gated)

### Task 1: Add `review` render-job type

**Files:**
- Create: `supabase/migrations/20260531000001_render_jobs_review_type.sql`
- Modify: `src/lib/supabase/repositories/render-jobs.ts:9`

- [ ] **Step 1: Write the migration**

```sql
-- Allow a 'review' render job (pre-publish QA pass on a rendered MP4).
alter table public.render_jobs
  drop constraint if exists render_jobs_job_type_check;

alter table public.render_jobs
  add constraint render_jobs_job_type_check
  check (job_type in ('clip_ingest','render_f1','render_f2','upload','review'));
```

- [ ] **Step 2: Extend the TS enum**

In `src/lib/supabase/repositories/render-jobs.ts`, update the `RenderJobType` union (currently `'clip_ingest' | 'render_f1' | 'render_f2' | 'upload'`) to add `| 'review'`.

- [ ] **Step 3: Operator-gated apply**

STOP. Ask Darius in chat: "Apply migration `render_jobs_review_type` to prod `jfmjppzjicvbpnlkmxbg`." After he confirms, apply via Supabase MCP `apply_migration` (name `render_jobs_review_type`).

- [ ] **Step 4: tsc + commit**

```bash
npx tsc --noEmit
git add supabase/migrations/20260531000001_render_jobs_review_type.sql src/lib/supabase/repositories/render-jobs.ts
git commit -m "feat(plan-5-g): add 'review' render-job type"
```

### Task 2: Add `generator_edits` to `your_videos`

**Files:**
- Create: `supabase/migrations/20260531000002_your_videos_generator_edits.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Generator learning-loop signal: operator script edits vs the original draft.
alter table public.your_videos
  add column if not exists generator_edits jsonb;
```

- [ ] **Step 2: Operator-gated apply**

STOP. Ask: "Apply migration `your_videos_generator_edits` to prod `jfmjppzjicvbpnlkmxbg`." After confirmation, apply via MCP.

- [ ] **Step 3: Regenerate types**

Supabase MCP `generate_typescript_types` for `jfmjppzjicvbpnlkmxbg`; overwrite `src/lib/supabase/types.ts`. Then:

```bash
npx tsc --noEmit
git add supabase/migrations/20260531000002_your_videos_generator_edits.sql src/lib/supabase/types.ts
git commit -m "feat(plan-5-g): add your_videos.generator_edits + regen types"
```

---

# Thread A — Assistants repo, writers, dashboard

### Task A1: Extend the assistants repo (status read, activity log, settings, memory delete)

**Files:**
- Modify: `src/lib/supabase/repositories/assistants.ts`
- Test: `src/tests/lib/supabase/assistants-extended.test.ts` (env-gated live-DB style — mirror an existing repo test; assert shape only when `SUPABASE_URL` present)

- [ ] **Step 1: Add interfaces + functions**

Append to `assistants.ts` (client passed as arg, `data as T` cast convention):

```typescript
export interface AssistantActivity {
  id: string;
  assistant_id: string;
  activity_type: string;
  summary: string;
  payload: unknown;
  created_at: string;
}

export async function recordAssistantActivity(
  supabase: SupabaseClient,
  params: { assistantId: string; activityType: string; summary: string; payload?: unknown },
): Promise<void> {
  const { error } = await supabase.from('assistant_activity_log').insert({
    assistant_id: params.assistantId,
    activity_type: params.activityType,
    summary: params.summary,
    payload: (params.payload ?? {}) as never,
  });
  if (error) throw new Error(`recordAssistantActivity: ${error.message}`);
}

export async function listAssistantActivity(
  supabase: SupabaseClient,
  params: { assistantId?: string; activityType?: string; limit?: number; offset?: number },
): Promise<AssistantActivity[]> {
  let q = supabase.from('assistant_activity_log').select('*').order('created_at', { ascending: false });
  if (params.assistantId) q = q.eq('assistant_id', params.assistantId);
  if (params.activityType) q = q.eq('activity_type', params.activityType);
  q = q.range(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 50) - 1);
  const { data, error } = await q;
  if (error) throw new Error(`listAssistantActivity: ${error.message}`);
  return (data ?? []) as AssistantActivity[];
}

export async function listAssistantStatuses(
  supabase: SupabaseClient,
): Promise<AssistantStatus[]> {
  const { data, error } = await supabase.from('assistant_status').select('*');
  if (error) throw new Error(`listAssistantStatuses: ${error.message}`);
  return (data ?? []) as AssistantStatus[];
}

export interface AssistantSettings { assistant_id: string; settings: Record<string, unknown>; updated_at: string }

export async function getAssistantSettings(
  supabase: SupabaseClient, assistantId: string,
): Promise<AssistantSettings | null> {
  const { data, error } = await supabase.from('assistant_settings').select('*').eq('assistant_id', assistantId).maybeSingle();
  if (error) throw new Error(`getAssistantSettings: ${error.message}`);
  return data as AssistantSettings | null;
}

export async function updateAssistantSettings(
  supabase: SupabaseClient, assistantId: string, settings: Record<string, unknown>,
): Promise<AssistantSettings> {
  const { data, error } = await supabase.from('assistant_settings')
    .upsert({ assistant_id: assistantId, settings: settings as never, updated_at: new Date().toISOString() })
    .select().single();
  if (error) throw new Error(`updateAssistantSettings: ${error.message}`);
  return data as AssistantSettings;
}

export async function deleteAssistantMemory(
  supabase: SupabaseClient, id: string,
): Promise<void> {
  const { error } = await supabase.from('assistant_memory').delete().eq('id', id);
  if (error) throw new Error(`deleteAssistantMemory: ${error.message}`);
}
```

- [ ] **Step 2: Add an env-gated test mirroring an existing repo test**

Look at an existing repo test (e.g. `src/tests/lib/supabase/video-reviews.test.ts`) for the env-gate pattern (`describe.skipIf(!process.env.SUPABASE_URL)`). Write `assistants-extended.test.ts` that, when DB env present, inserts an activity row and lists it back; asserts `recordAssistantActivity` then `listAssistantActivity({ assistantId })` returns it. Skips cleanly without DB env.

- [ ] **Step 3: Run + verify**

```bash
npx tsc --noEmit
env -u ANTHROPIC_BASE_URL npx vitest run src/tests/lib/supabase/assistants-extended.test.ts
```
Expected: tsc clean; test passes or skips (no DB env).

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/repositories/assistants.ts src/tests/lib/supabase/assistants-extended.test.ts
git commit -m "feat(plan-5-g): extend assistants repo (activity log, status list, settings, memory delete)"
```

### Task A2: Health-pill derivation (pure logic, TDD)

**Files:**
- Create: `src/lib/agents/dashboard/health.ts`
- Test: `src/tests/lib/agents/dashboard/health.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { deriveHealthPill } from '@/lib/agents/dashboard/health';

describe('deriveHealthPill', () => {
  it('healthy when no errored agents and crons fresh', () => {
    const r = deriveHealthPill({ erroredAgents: [], staleCrons: [], failedCrons: [] });
    expect(r.level).toBe('healthy');
  });
  it('attention when an agent errored', () => {
    const r = deriveHealthPill({ erroredAgents: ['niche_scout'], staleCrons: [], failedCrons: [] });
    expect(r.level).toBe('attention');
    expect(r.summary).toContain('1');
  });
  it('critical when a cron failed', () => {
    const r = deriveHealthPill({ erroredAgents: [], staleCrons: [], failedCrons: ['cluster-niches'] });
    expect(r.level).toBe('critical');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
env -u ANTHROPIC_BASE_URL npx vitest run src/tests/lib/agents/dashboard/health.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```typescript
export type HealthLevel = 'healthy' | 'attention' | 'critical';
export interface HealthInputs { erroredAgents: string[]; staleCrons: string[]; failedCrons: string[] }
export interface HealthPill { level: HealthLevel; summary: string }

export function deriveHealthPill(i: HealthInputs): HealthPill {
  if (i.failedCrons.length > 0) {
    return { level: 'critical', summary: `${i.failedCrons.length} system error${i.failedCrons.length > 1 ? 's' : ''}` };
  }
  const attention = i.erroredAgents.length + i.staleCrons.length;
  if (attention > 0) {
    return { level: 'attention', summary: `${attention} need${attention > 1 ? '' : 's'} attention` };
  }
  return { level: 'healthy', summary: 'All systems healthy' };
}
```

- [ ] **Step 4: Run to verify it passes** — `env -u ANTHROPIC_BASE_URL npx vitest run src/tests/lib/agents/dashboard/health.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/dashboard/health.ts src/tests/lib/agents/dashboard/health.test.ts
git commit -m "feat(plan-5-g): health-pill derivation"
```

### Task A3: Wire status + activity writers into the 4 active agents

**Files:**
- Modify: `src/lib/agents/orchestrator.ts` (generator)
- Modify: `src/app/api/cron/cluster-niches/route.ts`, `src/app/api/cron/classify-observations/route.ts` (niche_scout)
- Modify: `src/app/api/cron/watch-list-sync/route.ts` (watch_list_curator)

There is no clean unit test for these side-effecting injections; verification is tsc + build + (operator) observing rows after a cron run. Keep each injection a try/catch that NEVER throws into the host (a status-write failure must not fail a cron or a render).

- [ ] **Step 1: Add a safe helper**

Create `src/lib/agents/dashboard/report.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { updateAssistantStatus, recordAssistantActivity, type AssistantState } from '@/lib/supabase/repositories/assistants';

export async function reportAssistant(
  supabase: SupabaseClient,
  assistantId: string,
  state: AssistantState,
  activity: string | null,
  log?: { activityType: string; summary: string; payload?: unknown },
): Promise<void> {
  try {
    await updateAssistantStatus(supabase, assistantId, state, activity);
    if (log) await recordAssistantActivity(supabase, { assistantId, ...log });
  } catch (e) {
    console.error(`reportAssistant(${assistantId}) failed (non-fatal):`, e);
  }
}
```

- [ ] **Step 2: Inject `niche_scout` into cluster-niches**

In `cluster-niches/route.ts`, after `const supabase = getServiceClient();`: `await reportAssistant(supabase, 'niche_scout', 'working', 'Clustering this week\'s observations…');`. On success (after `runWithIngestionLog` resolves), before the JSON return: `await reportAssistant(supabase, 'niche_scout', 'idle', null, { activityType: 'clustering', summary: \`Clustered week ${weekStart}\`, payload: { weekStart } });`. In the catch: `await reportAssistant(supabase, 'niche_scout', 'errored', serializeError(e).slice(0,160));`. Mirror the same pattern in `classify-observations/route.ts` (`activityType: 'classification'`).

- [ ] **Step 3: Inject `watch_list_curator` into watch-list-sync**

Same pattern: `working` at start, `idle` + activity (`activityType: 'watch_list_sync'`, summary `Synced N channels`) on success, `errored` in catch.

- [ ] **Step 4: Inject `generator` into the orchestrator**

In `src/lib/agents/orchestrator.ts` `runPipeline`, after the `job_started` yield (≈line 59): `await reportAssistant(args.supabase, 'generator', 'working', \`Producing draft for topic ${topic.id}\`);`. Before the `job_completed` yield (≈line 266): `await reportAssistant(args.supabase, 'generator', 'idle', null, { activityType: 'produced_draft', summary: \`Produced draft ${draft.id}\`, payload: { videoId: draft.id } });`. In the failure path before `job_failed` (≈line 275): `await reportAssistant(args.supabase, 'generator', 'errored', message.slice(0,160));`.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit
env -u ANTHROPIC_BASE_URL npm run build
```
Expected: clean. (Operator: after deploy, hit a cron and confirm `assistant_status` updates + `assistant_activity_log` rows appear.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/agents/dashboard/report.ts src/lib/agents/orchestrator.ts src/app/api/cron/cluster-niches/route.ts src/app/api/cron/classify-observations/route.ts src/app/api/cron/watch-list-sync/route.ts
git commit -m "feat(plan-5-g): emit assistant status + activity from the 4 active agents"
```

### Task A4: Status poll route + dashboard data loader

**Files:**
- Create: `src/lib/agents/dashboard/load.ts` (assembles dashboard view-model)
- Create: `src/app/api/agents/status/route.ts` (GET JSON for the client poller)
- Test: `src/tests/lib/agents/dashboard/load.test.ts` (pure assembly — inject fake repo results)

- [ ] **Step 1: Write the assembler with a failing test**

`load.ts` exports `assembleDashboard(inputs: { assistants: Assistant[]; statuses: AssistantStatus[]; recentByAssistant: Record<string, AssistantActivity[]> }): AgentCardVM[]` where `AgentCardVM = { id, displayName, roleDescription, iconName, accentColorVar, isEnabled, state, currentActivity, recent: AssistantActivity[] }`. Disabled assistants get `state: 'idle'`, `currentActivity: null`. Test: given 2 assistants (one disabled) + a status row for the enabled one + 3 recent rows, returns matching VMs with `recent` truncated to 3.

- [ ] **Step 2–4: Run-fail, implement (pure map/merge), run-pass.**

- [ ] **Step 5: GET route**

`src/app/api/agents/status/route.ts`: `export const dynamic = 'force-dynamic'`; GET → `getServiceClient()`, `listAssistants`, `listAssistantStatuses`, and `listAssistantActivity({ limit: 3 })` per enabled assistant (or one query + group), return `assembleDashboard(...)` as JSON. (Read `node_modules/next/dist/docs/` route-handler guide first.)

- [ ] **Step 6: tsc + commit**

```bash
git add src/lib/agents/dashboard/load.ts src/app/api/agents/status/route.ts src/tests/lib/agents/dashboard/load.test.ts
git commit -m "feat(plan-5-g): agents dashboard data loader + status poll route"
```

### Task A5: `/agents` dashboard page + components (UI)

**Files:**
- Create: `src/app/agents/page.tsx`, `src/app/agents/_components/agent-card.tsx`, `.../activity-feed.tsx`, `.../health-pill.tsx`, `.../agents-refresh.tsx`
- Modify: `src/components/layout/app-sidebar.tsx` (add Agents item), `src/components/layout/app-command-palette.tsx` (Agents group)

UI task — finishes at tsc+build; preview screenshot operator-gated.

- [ ] **Step 1: Read the design references**

Read `src/app/lab/page.tsx` (AppShell usage), `src/components/compositions/assistant-status-dot.tsx` (reuse for the dot), `src/components/ui/card.tsx`, `@/lib/motion` (`fadeRise`), `src/app/niches/page.tsx` (stagger + skeleton patterns).

- [ ] **Step 2: Add the nav item**

In `src/components/layout/app-sidebar.tsx`, import an icon (e.g. `Bot` from lucide-react) and add `{ href: "/agents", label: "Agents", icon: Bot }` to `NAV` after the Lab entry.

- [ ] **Step 3: Build `agent-card.tsx`**

Client component. Props: `vm: AgentCardVM`. Renders `Card` → icon (map `iconName` → lucide icon via a small lookup) + `display_name` + role (1 line) → `AssistantStatusDot status={vm.state}` + `currentActivity` → last 3 `recent` summaries (truncated, `text-tertiary`). Disabled → muted styles + a `Badge variant="outline"` "Coming in Phase N" (Analyst = Phase 4, Editor = Phase 3). Wrap in `HoverLift`. Card is a `next/link` to `/agents/${vm.id}` when enabled.

- [ ] **Step 4: Build `activity-feed.tsx` + `health-pill.tsx`**

`activity-feed.tsx`: paginated list of `AssistantActivity` rows (icon by assistant, summary, relative time, link to `/agents/[id]`). `health-pill.tsx`: props `{ level, summary }` → colored pill (`success`/`warning`/`danger` tokens) linking to `/admin/health`.

- [ ] **Step 5: Build `agents-refresh.tsx` (15s poller)**

Client component: holds initial `vm[]` from the server, `useEffect` polls `/api/agents/status` every 15s (`setInterval`, cleared on unmount), updates state, renders the grid of `AgentCard`s with `fadeRise` stagger (50ms). Respect `useReducedMotion`.

- [ ] **Step 6: Build `page.tsx`**

```tsx
import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageHeader } from "@/components/layout/page-header";
import { getServiceClient } from "@/lib/supabase/server";
// ...load assembleDashboard(...) server-side, derive health pill...
export const dynamic = "force-dynamic";
export default async function AgentsPage() {
  const supabase = getServiceClient();
  // load vms + health
  return (
    <AppShell bare sidebar={<AppSidebar activeHref="/agents" />}>
      <div className="mx-auto max-w-[1080px] px-8 py-8">
        <div className="flex items-center justify-between">
          <PageHeader title="Agents" description="What every agent is working on right now." />
          <HealthPill {...health} />
        </div>
        <AgentsRefresh initial={vms} />
        <ActivityFeed initial={feed} />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 7: Add palette entries**

In `app-command-palette.tsx`, add an "Agents" group: `Agents: dashboard` → `go("/agents")`, plus one entry per enabled assistant `Agents: [Niche Scout]` → `go("/agents/niche_scout")` etc.

- [ ] **Step 8: Verify + commit**

```bash
npx tsc --noEmit && env -u ANTHROPIC_BASE_URL npm run build
git add src/app/agents src/components/layout/app-sidebar.tsx src/components/layout/app-command-palette.tsx
git commit -m "feat(plan-5-g): /agents dashboard (cards, feed, health pill, nav, palette)"
```
Preview to screenshot: `/agents` grid (6 cards, correct status dots, Analyst/Editor "Coming in Phase N"), activity feed, health pill.

---

# Thread B — Per-agent pages (`/agents/[id]`)

### Task B1: Per-agent settings schemas (pure, TDD)

**Files:**
- Create: `src/lib/agents/settings/schemas.ts`
- Test: `src/tests/lib/agents/settings/schemas.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { getSettingsSchema, validateSettings } from '@/lib/agents/settings/schemas';

describe('assistant settings schemas', () => {
  it('niche_scout accepts a valid taste slider + model', () => {
    const r = validateSettings('niche_scout', { model: 'anthropic/claude-haiku-4-5', proven_vs_firstmover: 0.6, confidence_floor: 0.5 });
    expect(r.success).toBe(true);
  });
  it('rejects out-of-range slider', () => {
    const r = validateSettings('niche_scout', { proven_vs_firstmover: 2 });
    expect(r.success).toBe(false);
  });
  it('unknown assistant returns a passthrough empty schema', () => {
    expect(getSettingsSchema('analyst')).toBeDefined();
  });
});
```

- [ ] **Step 2–4:** Run-fail; implement per-assistant `z.object`s (niche_scout: `model`, `proven_vs_firstmover` 0–1, `confidence_floor` 0–1; video_reviewer: `model`, `block_threshold` 0–1; generator: `model`; watch_list_curator: `model`, `evict_after_zero_signal_weeks` int) keyed by id with a fallback `z.object({}).passthrough()`; `validateSettings(id, input)` → `{ success, data?, error? }`. Run-pass.

- [ ] **Step 5: Commit** — `feat(plan-5-g): per-assistant settings schemas`.

### Task B2: Memory + Settings API routes

**Files:**
- Create: `src/app/api/agents/[id]/memory/route.ts` (GET list, DELETE by id, PATCH upsert)
- Create: `src/app/api/agents/[id]/settings/route.ts` (GET, PUT validated)
- Test: `src/tests/app/api/agents-settings.test.ts` (validation path — call the validate fn, not the route)

- [ ] **Step 1:** Read `node_modules/next/dist/docs/` for the dynamic route-handler params shape (it differs from older Next — `params` is async). 

- [ ] **Step 2: Implement memory route** — GET → `listAssistantMemory(supabase, id)`; DELETE (`?rowId=`) → `deleteAssistantMemory`; PATCH (body `{ memoryKey, memoryValue, confidence? }`) → `upsertAssistantMemory`. Guard `id` against the known assistant ids (`getAssistantById` → 404 if null).

- [ ] **Step 3: Implement settings route** — GET → `getAssistantSettings`; PUT → `validateSettings(id, body)`; on success `updateAssistantSettings`, else 400 with issues.

- [ ] **Step 4: Test** the validation branch (unit-call `validateSettings`), tsc, build.

- [ ] **Step 5: Commit** — `feat(plan-5-g): agent memory + settings API routes`.

### Task B3: Chat tool registry + engine (pure-ish, TDD the registry)

**Files:**
- Create: `src/lib/agents/chat/system-prompts.ts`, `src/lib/agents/chat/tools.ts`, `src/lib/agents/chat/engine.ts`
- Test: `src/tests/lib/agents/chat/tools.test.ts`

Read the AI SDK v6 tool-calling docs first (use the `vercel:ai-sdk` skill or `node_modules` AI SDK types) — `streamText({ model, messages, tools })` with `tool({ description, inputSchema: z…, execute })`.

- [ ] **Step 1: Failing test for the registry shape**

```typescript
import { describe, it, expect } from 'vitest';
import { getToolsForAssistant, ASSISTANT_TOOL_IDS } from '@/lib/agents/chat/tools';

describe('chat tool registry', () => {
  it('niche_scout exposes only read tools over its domain', () => {
    expect(ASSISTANT_TOOL_IDS.niche_scout).toEqual(
      expect.arrayContaining(['list_week_niches', 'get_niche', 'list_predictions']),
    );
  });
  it('disabled assistants expose no tools', () => {
    expect(ASSISTANT_TOOL_IDS.analyst).toEqual([]);
  });
});
```

- [ ] **Step 2–4:** Implement `tools.ts`: a factory `getToolsForAssistant(supabase, assistantId)` returning an AI-SDK tools object built from read-only wrappers over existing repos:
  - `niche_scout`: `list_week_niches` (`getLatestWeekStart`+`listDigestRankedClusters`), `get_niche` (`getClusterById`), `list_predictions` (`listClosedPredictions`/`listPredictionsByCluster`).
  - `watch_list_curator`: `list_watched_channels` (`listActiveWatchedChannels`).
  - `generator`: `get_active_run` (`getActiveProduceVideoJob`), `get_video_review` (`getVideoReviewByVideoId`).
  - `video_reviewer`: `get_video_review` (`getVideoReviewByVideoId`).
  - `analyst`/`editor_copilot`: `[]`.
  Each tool: `tool({ description, inputSchema: z.object({...}), execute: async (a) => <repo call> })`. Export `ASSISTANT_TOOL_IDS: Record<string,string[]>` listing tool names per assistant (this is what the test checks — keep it in sync). Run-pass.

- [ ] **Step 5: `system-prompts.ts`** — per-assistant system prompt strings (domain + "you have read-only tools; answer from real data; say so when you don't know"). Disabled assistants: a short "not active until Phase N" prompt.

- [ ] **Step 6: `engine.ts`** — `buildChatStream({ supabase, assistantId, messages })` → `streamText({ model: getGatewayModel(process.env.CHAT_MODEL ?? 'anthropic/claude-sonnet-4-5'), system: getSystemPrompt(assistantId), messages, tools: getToolsForAssistant(supabase, assistantId) })`. (Add `CHAT_MODEL` to the env schema in `src/lib/env.ts` as optional.)

- [ ] **Step 7: Commit** — `feat(plan-5-g): agent chat engine + per-assistant read-only tool registry`.

### Task B4: Chat streaming route + persistence

**Files:**
- Modify: `src/lib/supabase/repositories/assistants.ts` (add chat thread/message CRUD: `createChatThread`, `listChatThreads`, `getThreadMessages`, `appendChatMessage`, `touchThread`)
- Create: `src/app/api/agents/[id]/chat/route.ts` (POST streaming)

- [ ] **Step 1:** Add the chat CRUD to the repo (thin inserts/selects over `assistant_chat_threads` / `assistant_chat_messages`, mirroring Task A1 style).

- [ ] **Step 2:** POST route: body `{ threadId?, message }`. Create thread if absent; `appendChatMessage(role:'user')`; call `buildChatStream`; return its `toUIMessageStreamResponse()` (per AI SDK v6 — confirm the exact streaming response helper in the installed `ai` version). On stream finish, persist the assistant message + `touchThread`. Read the AI SDK streaming + Next route docs first.

- [ ] **Step 3:** tsc + build. (No unit test for the stream; the registry is already tested.)

- [ ] **Step 4: Commit** — `feat(plan-5-g): agent chat streaming route + thread persistence`.

### Task B5: `/agents/[id]` page + 4 tabs (UI)

**Files:**
- Create: `src/app/agents/[id]/page.tsx` + `_components/{activity-tab,memory-tab,settings-tab,chat-tab}.tsx`

UI task — tsc+build; preview operator-gated.

- [ ] **Step 1:** Read `src/components/ui/tabs.tsx` (base-ui usage) + `src/app/lab/page.tsx`.

- [ ] **Step 2:** `page.tsx` (server): resolve `params` (async — per Next docs), `getAssistantById`; `notFound()` if null. Render `AppShell bare` + header (icon, name, role, status dot) + `<Tabs>` with the 4 tab components. Disabled assistant → render a "Coming in Phase N" hero instead of tabs.

- [ ] **Step 3:** `activity-tab.tsx` (client): fetches `/api/agents/status` filtered or a dedicated `listAssistantActivity` route; filter dropdown by `activity_type`; 15s poll; reuse the feed row.

- [ ] **Step 4:** `memory-tab.tsx` (client): GET memory; each row an editable card (key, JSON value via textarea, confidence, last-updated); Save → PATCH, Delete → DELETE; honest empty state ("No learned memory yet").

- [ ] **Step 5:** `settings-tab.tsx` (client): GET settings; render controls per the assistant's schema (model dropdown of vetted gateway strings; sliders 0–1; number inputs); Save → PUT; show validation errors.

- [ ] **Step 6:** `chat-tab.tsx` (client): use AI SDK v6 React `useChat` pointed at `/api/agents/[id]/chat` (confirm import path in installed `@ai-sdk/react`); thread list + new thread; render messages; surface tool-call steps inline; stream tokens. Disabled assistant → "coming soon" state.

- [ ] **Step 7:** tsc + build + commit `feat(plan-5-g): /agents/[id] tabbed page (activity, memory, settings, chat)`.
Preview to screenshot: Niche Scout across all 4 tabs (richest), a disabled agent's placeholder.

---

# Thread C — Video Reviewer (§4.11)

### Task C1: Review verdict mapping (pure, TDD)

**Files:**
- Create: `src/lib/agents/review/verdict.ts`
- Test: `src/tests/lib/agents/review/verdict.test.ts`

The DB stores per-component `pass|needs_work|fail` + score 0–1 and overall `ship|revise|block`; `ReviewScorecard` wants `pass|warn|fail` + 0–100 + `ReviewDimension[]`. This module bridges them and computes the overall roll-up.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { rollUpOverall, mapReviewToScorecard, dbVerdictToDimension } from '@/lib/agents/review/verdict';

describe('review verdict mapping', () => {
  it('maps needs_work → warn', () => {
    expect(dbVerdictToDimension('needs_work')).toBe('warn');
  });
  it('rolls up to block if any component fails', () => {
    expect(rollUpOverall(['pass','pass','fail','pass','pass','pass','pass'])).toBe('block');
  });
  it('rolls up to revise if any needs_work but none fail', () => {
    expect(rollUpOverall(['pass','needs_work','pass','pass','pass','pass','pass'])).toBe('revise');
  });
  it('rolls up to ship if all pass', () => {
    expect(rollUpOverall(['pass','pass','pass','pass','pass','pass','pass'])).toBe('ship');
  });
  it('maps a VideoReview row to ReviewScorecardProps with 7 dimensions and 0–100 scores', () => {
    const props = mapReviewToScorecard({
      title_score: 0.8, title_verdict: 'pass', thumbnail_score: 0.5, thumbnail_verdict: 'needs_work',
      hook_score: 0.9, hook_verdict: 'pass', pacing_score: 0.7, pacing_verdict: 'pass',
      description_seo_score: 0.6, description_seo_verdict: 'needs_work', audio_score: 0.95, audio_verdict: 'pass',
      visual_score: 0.85, visual_verdict: 'pass', overall_verdict: 'revise',
    } as never);
    expect(props.dimensions).toHaveLength(7);
    expect(props.overallVerdict).toBe('warn');
    expect(props.dimensions[0].verdict).toBe('pass');
  });
});
```

- [ ] **Step 2–4:** Run-fail; implement `dbVerdictToDimension` (`needs_work`→`warn`), `overallToScorecardVerdict` (`ship`→`pass`,`revise`→`warn`,`block`→`fail`), `rollUpOverall(verdicts: ReviewVerdict[]): OverallVerdict`, `mapReviewToScorecard(review): ReviewScorecardProps` (7 dimensions with labels + `note` from per-component, `overallScore` = avg×100). Run-pass.

- [ ] **Step 5: Commit** — `feat(plan-5-g): review verdict mapping`.

### Task C2: Pure review components (description-SEO + hook heuristics, TDD)

**Files:**
- Create: `src/lib/agents/review/components.ts` (shared types + the non-ffmpeg scoring helpers; imported by the worker handler)
- Test: `src/tests/lib/agents/review/components.test.ts`

- [ ] **Step 1: Failing test** for `scoreDescriptionSeo({ description, nicheKeywords })` (keyword presence + length → `{ score, verdict, suggestions }`) and `scoreHookFromTranscript({ firstThreeSecondsText })` (curiosity-gap/urgency cue detection → score+verdict). Assert: a description containing 3/4 niche keywords scores higher than one with 0; an empty hook scores `fail`.

- [ ] **Step 2–4:** Run-fail; implement deterministic heuristics (keyword hit ratio, length bands, cue-word lists). Keep the LLM-and-vision components (title, thumbnail, pacing, audio, visual) OUT of this file — they live in the worker as edges. Run-pass.

- [ ] **Step 5: Commit** — `feat(plan-5-g): pure review scoring helpers (SEO, hook)`.

### Task C3: Review worker handler

**Files:**
- Create: `scripts/render-worker/handlers/review.ts`
- Modify: `scripts/render-worker/run.ts` (route `review`)
- Possibly create: `scripts/render-worker/lib/scene-detect.ts`, `lib/loudness.ts` (ffmpeg wrappers) if not already present

Mirror `handlers/render-f1.ts` structure (custom error w/ trace, internal async fn, cast payload, load row, do work, return output object).

- [ ] **Step 1:** Read `handlers/render-f1.ts`, `lib/probe.ts`, `lib/frames.ts`, `lib/claude-vision.ts`, `lib/blob.ts`, `lib/ffmpeg-commands.ts` to reuse helpers and the download pattern (how render artifacts land locally — the MP4 is at `your_videos.render_artifact_url` in Blob).

**Important — the worker cannot import `@/` server-only repos.** `scripts/render-worker` is a separate Node project with its own tsconfig/package.json; `src/lib/.../video-reviews.ts` and `assistants.ts` start with `import 'server-only'` and will not load there. So, exactly like `render-f1` (worker computes + returns output; `/api/render/complete` persists via the typed repo), **`runReview` is compute-only: it does NO DB writes for `video_reviews`. It loads its inputs with the worker's own raw `getSupabase()` client and returns the review as a plain JSON object.** Persistence happens server-side in Task C4. The `src/lib/agents/review/components.ts` pure helpers (Task C2) are likewise duplicated/ported into the worker if they can't be imported across the project boundary — if the worker tsconfig can reference `../../src`, import them; otherwise copy the small pure functions into `scripts/render-worker/lib/review-heuristics.ts` (document which).

- [ ] **Step 2:** Implement `runReview(job, supabase)` (compute-only, returns output; the `supabase` arg is the worker's raw client from `getSupabase()`):
  1. `payload = job.payload as { your_video_id: string }`; load `your_videos` via raw select (`script`, `render_artifact_url`, `topic_queue_id`, `source_niche_cluster_id`, `caption_props`).
  2. Download the MP4 from Blob to a temp file.
  3. **ffprobe** (resolution/fps via `probeDurationSeconds` + an added `probeVideoStream`) → `visual` component.
  4. **scene-detect** (ffmpeg `select='gt(scene,0.4)'` count) + **loudness** (ffmpeg `ebur128`/`volumedetect`) → `pacing` + `audio` components (best-effort; on failure emit a low-confidence `needs_work` verdict, never throw).
  5. **frames** (`extractFramesAndThumbnail`) → **Claude vision** (`lib/claude-vision.ts`) for `thumbnail` + part of `hook`/`visual`.
  6. **title** heuristic + **description-SEO** (`scoreDescriptionSeo`) + **hook** (`scoreHookFromTranscript`, fed the first ~3s of the script). Prefer heuristics + the existing vision lib over adding a new text-LLM dependency to the worker; the title component is a length/keyword/curiosity-gap heuristic.
  7. Assemble 7 `{score (0–1), verdict ('pass'|'needs_work'|'fail')}` pairs + `suggestions: ReviewSuggestion[]` + `strengths: ReviewStrength[]`; `rollUpOverall(verdicts)` → `overall_verdict`.
  8. Return a single output object shaped exactly as `InsertVideoReviewParams` (snake→camel as that type defines), wrapped: `{ review: { yourVideoId, titleScore, titleVerdict, …, overallVerdict, suggestions, strengths, model: 'review-heuristic-v1', promptVersion: 'g1' } }`. **No DB writes.**

- [ ] **Step 3:** In `run.ts`, import `runReview`, `ReviewError`; add `case 'review': output = await runReview(job, supabase); break;` and include `ReviewError` in the trace-extraction catch.

- [ ] **Step 4:** Build the worker (`cd scripts/render-worker && npm run build` or its tsc) → clean.

- [ ] **Step 5: Commit** — `feat(plan-5-g): review worker handler (7-component QA on the MP4)`.

### Task C4: Render-complete — enqueue review on render success, persist review on review success

**Files:**
- Modify: `src/app/api/render/complete/route.ts` (server-only `@/` imports are fine here)

This route already selects the completing job's `your_video_id`; also select its `job_type`. Two new branches in the success path:

- [ ] **Step 1: Enqueue review after a render succeeds.** When `job_type` is `render_f1`/`render_f2` and `out` has `render_artifact_url` (the existing `status='rendered'` block), enqueue a review job idempotently:

```typescript
import { getVideoReviewByVideoId } from '@/lib/supabase/repositories/video-reviews';
import { enqueueRenderJob } from '@/lib/supabase/repositories/render-jobs';
// inside the rendered transition, jobRow.your_video_id in scope:
const existing = await getVideoReviewByVideoId(supabase, jobRow.your_video_id);
if (!existing) {
  await enqueueRenderJob(supabase, { jobType: 'review', payload: { your_video_id: jobRow.your_video_id }, yourVideoId: jobRow.your_video_id });
}
```

- [ ] **Step 2: Persist the review after a review job succeeds.** When the completing `job_type` is `review` and `out` has a `review` object, persist it with the typed repo and link it:

```typescript
import { insertVideoReview } from '@/lib/supabase/repositories/video-reviews';
import { updateAssistantStatus, recordAssistantActivity } from '@/lib/supabase/repositories/assistants';
// out.review is the InsertVideoReviewParams-shaped object returned by the worker
if (jobRow.job_type === 'review' && out && 'review' in out) {
  const review = await insertVideoReview(supabase, out.review as InsertVideoReviewParams);
  await supabase.from('your_videos')
    .update({ review_id: review.id, updated_at: new Date().toISOString() })
    .eq('id', jobRow.your_video_id);
  try {
    await updateAssistantStatus(supabase, 'video_reviewer', 'idle', null);
    await recordAssistantActivity(supabase, { assistantId: 'video_reviewer', activityType: 'review', summary: `Reviewed video → ${review.overall_verdict}`, payload: { videoId: jobRow.your_video_id, verdict: review.overall_verdict } });
  } catch (e) { console.error('video_reviewer report failed (non-fatal):', e); }
}
```

(Import `InsertVideoReviewParams` as a type from the repo. On a `review` job *failure*, the existing failed-job path runs; optionally set `video_reviewer` `errored` there.)

- [ ] **Step 3:** tsc + build + commit `feat(plan-5-g): enqueue review on render-complete + persist review result`.

### Task C5: Feedback route

**Files:**
- Create: `src/app/api/lab/[videoId]/review/feedback/route.ts`

- [ ] **Step 1:** POST body `{ videoReviewId, suggestionIndex, actionTaken }` → `recordReviewFeedback`. (Learning-loop write to memory is Task D2.) Validate with zod. tsc + commit `feat(plan-5-g): review feedback route`.

### Task C6: `/lab/[videoId]/review` split-view (UI)

**Files:**
- Create: `src/app/lab/[videoId]/review/page.tsx` + `_components/review-client.tsx`
- Modify: `src/app/lab/drafts/*` (add a "Review" action on rendered rows linking to the page)

UI task — tsc+build; preview operator-gated.

- [ ] **Step 1:** Read `review-scorecard.tsx` + `review-suggestion-item.tsx` props (Task references above) and `src/app/lab/page.tsx`.

- [ ] **Step 2:** `page.tsx` (server, non-bare AppShell): resolve async `params.videoId`; load `your_videos` + `getVideoReviewByVideoId`. States: no review yet (job queued/running) → "Review in progress" with a poll; review present → render `review-client`.

- [ ] **Step 3:** `review-client.tsx` (client): split-view — left `<video>` player (Blob `render_artifact_url`) + transcript-overlay toggle; right `<ReviewScorecard {...mapReviewToScorecard(review)} />` + suggestions via `ReviewSuggestionItem` (Accept/Ignore → feedback route); bottom **Approve & Schedule** button: disabled if `overall_verdict==='block'`, warning style if `revise`, primary if `ship`; on click → existing `/api/lab/schedule`. Override (ship-anyway / reject) requires a reason → feedback route.

- [ ] **Step 4:** In `/lab/drafts`, add a "Review" link on `rendered` rows → `/lab/${videoId}/review`.

- [ ] **Step 5:** tsc + build + commit `feat(plan-5-g): /lab/[videoId]/review split-view + drafts entry`.
Preview to screenshot: a real rendered video's review screen (player + scorecard + gated Approve button).

---

# Thread D — Admin health + learning loops

### Task D1: `/admin/health` (pure aggregation + page)

**Files:**
- Create: `src/lib/admin/health.ts` (pure) + test `src/tests/lib/admin/health.test.ts`
- Create: `src/app/admin/health/page.tsx`
- Modify: `src/app/admin/_components/admin-sidebar.tsx` (add Health entry)

- [ ] **Step 1:** TDD `aggregateHealth(inputs)` → `{ pill: HealthPill, crons: {...}, agents: {...} }`, reusing `deriveHealthPill`. Test the healthy/attention/critical cases.

- [ ] **Step 2:** `page.tsx`: `AppShell` (non-bare) + `AdminSidebar activeHref="/admin/health"`; load cron freshness (from `ingestion_runs`) + `listAssistantStatuses`; render the pill + a per-cron freshness table + per-agent status. Add `{ href: '/admin/health', label: 'Health', icon: Activity }` to `ADMIN_NAV`.

- [ ] **Step 3:** tsc + build + commit `feat(plan-5-g): /admin/health aggregate page`.

### Task D2: Learning loops → `assistant_memory`

**Files:**
- Modify: `src/app/api/cron/prediction-close/route.ts` (niche_scout)
- Modify: `src/app/api/lab/[videoId]/review/feedback/route.ts` (video_reviewer)
- Modify: the draft-save path for generator edits (find where `your_videos.script` is updated by the operator) + `src/lib/agents/review/feedback-memory.ts` (pure rollup, TDD)

- [ ] **Step 1: TDD the pure rollups** in `feedback-memory.ts`: `rollupReviewFeedback(existing, action)` → updated weights (accepted ↑, ignored ↓); `rollupPredictionAccuracy(existing, outcome)` → running `{ within, above, below, n }`. Test both.

- [ ] **Step 2:** prediction-close: after `attachActualOutcome`, `upsertAssistantMemory(supabase, { assistantId:'niche_scout', memoryKey:'prediction_accuracy', memoryValue: rollupPredictionAccuracy(prev, outcome), confidence })` (load prev via `listAssistantMemory`). Wrap in try/catch (never fail the cron).

- [ ] **Step 3:** review feedback route: after `recordReviewFeedback`, update `assistant_memory['video_reviewer']` suggestion-class weights via `rollupReviewFeedback`.

- [ ] **Step 4:** generator edits: where the operator edits a draft's `script`, diff against the original and write `your_videos.generator_edits` + a `generator` memory summary. (If no such edit path exists yet in `/lab/drafts`, scope this to writing `generator_edits` when a draft transitions out of `draft` with a changed script; document the chosen hook.)

- [ ] **Step 5:** tsc + build + commit `feat(plan-5-g): wire the four agent learning loops into assistant_memory`.

---

# Finalization

### Task E1: Whole-branch verification

- [ ] `npx tsc --noEmit` clean (no new `any`).
- [ ] `env -u ANTHROPIC_BASE_URL npx vitest run` — no new failures beyond the recorded baseline; all new logic tests (health, load, verdict, components, settings schemas, chat tools, feedback-memory, admin health) pass.
- [ ] `env -u ANTHROPIC_BASE_URL npm run build` passes; new routes appear as `ƒ` (Dynamic).
- [ ] `cd scripts/render-worker && <its build>` clean.
- [ ] Confirm both migrations applied to prod + `types.ts` regenerated.

### Task E2: Operator preview verification (gated)

Deploy the branch preview; capture: `/agents` grid (6 cards, real status, Analyst/Editor placeholders), a per-agent page across all 4 tabs (Niche Scout), `/admin/health`, and `/lab/[videoId]/review` on a real rendered video (scorecard + player + gated Approve). Confirm a render-complete actually produced a `video_reviews` row.

### Task E3: Sub-phase G handoff note

Write `docs/superpowers/notes/2026-05-31-plan-5-phase-1-sub-g-handoff.md` (mirror the F handoff): what shipped, autonomous deviations, verification state, what's still deferred (niche→video auto-dispatch + ≥3 posted videos), and a fresh-chat kickoff prompt for the next sub-phase. Commit.

---

## Self-review notes (coverage map)

- §4.8 dashboard → Thread A (cards/feed/health/nav) + Thread B (per-agent tabs incl. tool-using Chat). ✅
- §4.8 learning loops → Task D2. ✅
- §4.11 Video Reviewer (7 components, auto on render-complete, `/lab/[videoId]/review`, gate, feedback) → Thread C. ✅
- §4.12 `/admin/health` → Task D1. ✅
- Migrations (review job type, generator_edits) → Tasks 1–2. ✅
- Premium UI bar + operator-gated preview → every UI task + E2. ✅
- Deferred (auto-dispatch, ≥3 posted) → explicitly out, noted in E3. ✅
