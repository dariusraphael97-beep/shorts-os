# Plan #5 Phase 1 Sub-phase C — Multi-source Ingestion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the six ingestion crons + supporting tables/repos/API routes that write raw multi-source signal into the Sub-phase A schema (`shorts_observations`, `video_velocity_snapshots`, `watched_channels`, plus two new health/history tables). No classifier, no clustering, no UI.

**Architecture:** Pure, dependency-injected adapter logic in `src/lib/ingestion/<source>.ts` (client + repo passed in, fully unit-testable), wired by thin `src/app/api/cron/<name>/route.ts` routes (`assertCronAuth` → `loadEnv` → `getServiceClient` → build client + repo → run adapter inside `runWithIngestionLog` → return `scraperLog`). One cron per source/concern for failure isolation and per-source health.

**Tech Stack:** Next.js (App Router) API routes, TypeScript strict, `@supabase/supabase-js` (untyped `SupabaseClient`), Vitest (mock injected client/repo + `vi.spyOn(global,'fetch')`), YouTube Data API v3 (plain `fetch`), Reddit public JSON, `google-trends-api`, Vercel cron (`vercel.ts`).

**Conventions to follow (read these real files first):**
- Repo style: `src/lib/supabase/repositories/shorts-observations.ts` — `import 'server-only'`, `import type { SupabaseClient }`, throw `new Error(\`fnName: ${error.message}\`)`.
- Cron route: `src/app/api/cron/youtube-trending/route.ts` — `maxDuration = 300`, `GET`, `assertCronAuth(req)` (try/catch returning the thrown `Response`), missing-key 500 guard, `NextResponse.json({ ok: true, ...scraperLog(name, result) })`.
- Shared helpers (reuse, do not re-create): `src/lib/scrapers/shared.ts` — `assertCronAuth`, `scraperLog`, `serializeError`, `withRetry`.
- Backend mutation API route: `src/app/api/lab/schedule/route.ts` — `import 'server-only'`, Zod body parse → 400 on failure, `export const dynamic = 'force-dynamic'`, `getServiceClient()`. **No inline session check** (that matches the existing `/api/lab/*` convention — do not invent one).
- Repo test pattern: `src/tests/lib/supabase/watched-channels.test.ts` — `vi.mock('@/lib/supabase/server', ...)` + `makeClient(rows, error)` chained-builder mock.
- Client test pattern: `src/tests/lib/clients/youtube.test.ts` — `vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(...), { status: 200 }))`.

**Migration / prod note:** Migration **files** are created by implementer tasks (plain file writes; mocked tests need no live DB — repos use the untyped `SupabaseClient`, so they compile without `types.ts` being regenerated). **Applying** the additive migrations to the prod Supabase project `jfmjppzjicvbpnlkmxbg` and regenerating `src/lib/supabase/types.ts` is an **orchestrator-driven** step (Task 18) done via Supabase MCP after branch review — subagents must NOT touch prod.

**Spec:** `docs/superpowers/specs/2026-05-28-plan-5-phase-1-sub-c-design.md`

---

## Task 1: `ingestion_runs` table + repo + run wrapper

**Files:**
- Create: `supabase/migrations/20260528000011_ingestion_runs.sql`
- Create: `src/lib/supabase/repositories/ingestion-runs.ts`
- Create: `src/lib/ingestion/run.ts`
- Test: `src/tests/lib/supabase/repositories/ingestion-runs.test.ts`
- Test: `src/tests/lib/ingestion/run.test.ts`

- [ ] **Step 1: Write the migration file**

```sql
-- Per-source ingestion run health (Sub-phase C). Powers /admin/ingestion-health (Sub-phase D).
create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null check (job in (
    'youtube_category_sweep','youtube_shorts_search','watch_list_sync',
    'reddit_topic_discovery','google_trends','tiktok_creative_center'
  )),
  status text not null check (status in ('success','partial','failed','skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_ingested integer not null default 0,
  items_skipped integer not null default 0,
  quota_units integer not null default 0,
  error text,
  context jsonb not null default '{}'::jsonb
);

create index if not exists ingestion_runs_job_started_idx
  on public.ingestion_runs (job, started_at desc);
```

- [ ] **Step 2: Write the failing repo test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  startIngestionRun,
  finishIngestionRun,
  listRecentRunsByJob,
} from '@/lib/supabase/repositories/ingestion-runs';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }) }),
      select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }) }) }) }),
    }),
  } as never;
}

describe('ingestion-runs repository', () => {
  it('startIngestionRun inserts a partial placeholder', async () => {
    const row = { id: 'run-1', job: 'google_trends', status: 'partial' };
    const result = await startIngestionRun(makeClient([row]), { job: 'google_trends' });
    expect(result.id).toBe('run-1');
  });

  it('finishIngestionRun updates the row', async () => {
    const row = { id: 'run-1', job: 'google_trends', status: 'success', items_ingested: 5 };
    const result = await finishIngestionRun(makeClient([row]), {
      id: 'run-1', status: 'success', itemsIngested: 5, itemsSkipped: 0, quotaUnits: 0,
    });
    expect(result.status).toBe('success');
    expect(result.items_ingested).toBe(5);
  });

  it('listRecentRunsByJob returns rows', async () => {
    const result = await listRecentRunsByJob(makeClient([{ id: 'a' }, { id: 'b' }]), { job: 'reddit_topic_discovery', limit: 10 });
    expect(result).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/tests/lib/supabase/repositories/ingestion-runs.test.ts`
Expected: FAIL — cannot find module `ingestion-runs`.

- [ ] **Step 4: Implement the repo**

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type IngestionJob =
  | 'youtube_category_sweep'
  | 'youtube_shorts_search'
  | 'watch_list_sync'
  | 'reddit_topic_discovery'
  | 'google_trends'
  | 'tiktok_creative_center';

export type IngestionStatus = 'success' | 'partial' | 'failed' | 'skipped';

export interface IngestionRunRow {
  id: string;
  job: IngestionJob;
  status: IngestionStatus;
  started_at: string;
  finished_at: string | null;
  items_ingested: number;
  items_skipped: number;
  quota_units: number;
  error: string | null;
  context: Record<string, unknown>;
}

export async function startIngestionRun(
  supabase: SupabaseClient,
  params: { job: IngestionJob },
): Promise<IngestionRunRow> {
  const { data, error } = await supabase
    .from('ingestion_runs')
    .insert({ job: params.job, status: 'partial' })
    .select()
    .single();
  if (error) throw new Error(`startIngestionRun: ${error.message}`);
  return data as IngestionRunRow;
}

export async function finishIngestionRun(
  supabase: SupabaseClient,
  params: {
    id: string;
    status: IngestionStatus;
    itemsIngested: number;
    itemsSkipped: number;
    quotaUnits: number;
    error?: string | null;
    context?: Record<string, unknown>;
  },
): Promise<IngestionRunRow> {
  const { data, error } = await supabase
    .from('ingestion_runs')
    .update({
      status: params.status,
      finished_at: new Date().toISOString(),
      items_ingested: params.itemsIngested,
      items_skipped: params.itemsSkipped,
      quota_units: params.quotaUnits,
      error: params.error ?? null,
      context: params.context ?? {},
    })
    .eq('id', params.id)
    .select()
    .single();
  if (error) throw new Error(`finishIngestionRun: ${error.message}`);
  return data as IngestionRunRow;
}

export async function listRecentRunsByJob(
  supabase: SupabaseClient,
  params: { job: IngestionJob; limit: number },
): Promise<IngestionRunRow[]> {
  const { data, error } = await supabase
    .from('ingestion_runs')
    .select()
    .eq('job', params.job)
    .order('started_at', { ascending: false })
    .limit(params.limit);
  if (error) throw new Error(`listRecentRunsByJob: ${error.message}`);
  return (data ?? []) as IngestionRunRow[];
}
```

- [ ] **Step 5: Run repo test to confirm it passes**

Run: `npx vitest run src/tests/lib/supabase/repositories/ingestion-runs.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the failing run-wrapper test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const startIngestionRun = vi.fn();
const finishIngestionRun = vi.fn();
vi.mock('@/lib/supabase/repositories/ingestion-runs', () => ({ startIngestionRun, finishIngestionRun }));

import { runWithIngestionLog } from '@/lib/ingestion/run';

const fakeSupabase = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  startIngestionRun.mockResolvedValue({ id: 'run-1' });
  finishIngestionRun.mockImplementation(async (_c, p) => p);
});

describe('runWithIngestionLog', () => {
  it('records success when the adapter returns cleanly', async () => {
    await runWithIngestionLog(fakeSupabase, 'google_trends', async () => ({ ingested: 3, skipped: 0, quotaUnits: 0 }));
    expect(finishIngestionRun).toHaveBeenCalledWith(fakeSupabase, expect.objectContaining({ id: 'run-1', status: 'success', itemsIngested: 3 }));
  });

  it('records partial when the adapter flags partial', async () => {
    await runWithIngestionLog(fakeSupabase, 'google_trends', async () => ({ ingested: 1, skipped: 2, quotaUnits: 0, partial: true }));
    expect(finishIngestionRun).toHaveBeenCalledWith(fakeSupabase, expect.objectContaining({ status: 'partial' }));
  });

  it('honors an explicit status override (skipped)', async () => {
    await runWithIngestionLog(fakeSupabase, 'tiktok_creative_center', async () => ({ ingested: 0, skipped: 0, quotaUnits: 0, status: 'skipped' }));
    expect(finishIngestionRun).toHaveBeenCalledWith(fakeSupabase, expect.objectContaining({ status: 'skipped' }));
  });

  it('records failed and rethrows when the adapter throws', async () => {
    await expect(
      runWithIngestionLog(fakeSupabase, 'reddit_topic_discovery', async () => { throw new Error('boom'); }),
    ).rejects.toThrow('boom');
    expect(finishIngestionRun).toHaveBeenCalledWith(fakeSupabase, expect.objectContaining({ status: 'failed', error: 'boom' }));
  });
});
```

- [ ] **Step 7: Run it to confirm it fails**

Run: `npx vitest run src/tests/lib/ingestion/run.test.ts`
Expected: FAIL — cannot find module `run`.

- [ ] **Step 8: Implement the run wrapper**

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serializeError } from '@/lib/scrapers/shared';
import {
  startIngestionRun,
  finishIngestionRun,
  type IngestionJob,
  type IngestionStatus,
  type IngestionRunRow,
} from '@/lib/supabase/repositories/ingestion-runs';

export interface AdapterResult {
  ingested: number;
  skipped: number;
  quotaUnits: number;
  /** Optional explicit status (e.g. the disabled TikTok stub uses 'skipped'). */
  status?: IngestionStatus;
  /** When true and no explicit status, the run is recorded as 'partial'. */
  partial?: boolean;
  context?: Record<string, unknown>;
}

export async function runWithIngestionLog(
  supabase: SupabaseClient,
  job: IngestionJob,
  fn: () => Promise<AdapterResult>,
): Promise<IngestionRunRow> {
  const run = await startIngestionRun(supabase, { job });
  try {
    const result = await fn();
    const status: IngestionStatus = result.status ?? (result.partial ? 'partial' : 'success');
    return await finishIngestionRun(supabase, {
      id: run.id,
      status,
      itemsIngested: result.ingested,
      itemsSkipped: result.skipped,
      quotaUnits: result.quotaUnits,
      context: result.context,
    });
  } catch (e) {
    await finishIngestionRun(supabase, {
      id: run.id,
      status: 'failed',
      itemsIngested: 0,
      itemsSkipped: 0,
      quotaUnits: 0,
      error: serializeError(e),
    });
    throw e;
  }
}
```

- [ ] **Step 9: Run both tests to confirm they pass**

Run: `npx vitest run src/tests/lib/supabase/repositories/ingestion-runs.test.ts src/tests/lib/ingestion/run.test.ts`
Expected: PASS (7 tests total).

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/20260528000011_ingestion_runs.sql src/lib/supabase/repositories/ingestion-runs.ts src/lib/ingestion/run.ts src/tests/lib/supabase/repositories/ingestion-runs.test.ts src/tests/lib/ingestion/run.test.ts
git commit -m "feat(ingest): ingestion_runs table, repo, and run-logging wrapper"
```

---

## Task 2: `channel_stat_snapshots` table + repo

**Files:**
- Create: `supabase/migrations/20260528000012_channel_stat_snapshots.sql`
- Create: `src/lib/supabase/repositories/channel-stat-snapshots.ts`
- Test: `src/tests/lib/supabase/repositories/channel-stat-snapshots.test.ts`

- [ ] **Step 1: Write the migration file**

```sql
-- Per-channel subscriber/stat time series (Sub-phase C). Supports §4.5 growth + breakout math.
create table if not exists public.channel_stat_snapshots (
  channel_id text not null,
  snapshot_at timestamptz not null default now(),
  subscriber_count bigint not null,
  video_count bigint,
  view_count bigint,
  primary key (channel_id, snapshot_at)
);

create index if not exists channel_stat_snapshots_channel_idx
  on public.channel_stat_snapshots (channel_id, snapshot_at desc);
```

- [ ] **Step 2: Write the failing repo test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  insertChannelStatSnapshot,
  getSnapshotNearestTo,
  listSnapshotsForChannel,
} from '@/lib/supabase/repositories/channel-stat-snapshots';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      select: () => ({
        eq: () => ({
          lte: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: rows?.[0] ?? null, error }) }) }) }),
          order: () => ({ limit: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }) }),
        }),
      }),
    }),
  } as never;
}

describe('channel-stat-snapshots repository', () => {
  it('insertChannelStatSnapshot returns the row', async () => {
    const row = { channel_id: 'UC1', subscriber_count: 12000 };
    const result = await insertChannelStatSnapshot(makeClient([row]), { channelId: 'UC1', subscriberCount: 12000 });
    expect(result.channel_id).toBe('UC1');
  });

  it('getSnapshotNearestTo returns the closest prior snapshot or null', async () => {
    const result = await getSnapshotNearestTo(makeClient([{ channel_id: 'UC1', subscriber_count: 9000 }]), { channelId: 'UC1', targetDate: new Date('2026-04-28') });
    expect(result?.subscriber_count).toBe(9000);
    const none = await getSnapshotNearestTo(makeClient([]), { channelId: 'UC1', targetDate: new Date('2026-04-28') });
    expect(none).toBeNull();
  });

  it('listSnapshotsForChannel returns rows', async () => {
    const result = await listSnapshotsForChannel(makeClient([{ channel_id: 'UC1' }, { channel_id: 'UC1' }]), { channelId: 'UC1', limit: 10 });
    expect(result).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run src/tests/lib/supabase/repositories/channel-stat-snapshots.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the repo**

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ChannelStatSnapshotRow {
  channel_id: string;
  snapshot_at: string;
  subscriber_count: number;
  video_count: number | null;
  view_count: number | null;
}

export async function insertChannelStatSnapshot(
  supabase: SupabaseClient,
  params: { channelId: string; subscriberCount: number; videoCount?: number | null; viewCount?: number | null; snapshotAt?: Date },
): Promise<ChannelStatSnapshotRow> {
  const { data, error } = await supabase
    .from('channel_stat_snapshots')
    .insert({
      channel_id: params.channelId,
      subscriber_count: params.subscriberCount,
      video_count: params.videoCount ?? null,
      view_count: params.viewCount ?? null,
      snapshot_at: (params.snapshotAt ?? new Date()).toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(`insertChannelStatSnapshot: ${error.message}`);
  return data as ChannelStatSnapshotRow;
}

export async function getSnapshotNearestTo(
  supabase: SupabaseClient,
  params: { channelId: string; targetDate: Date },
): Promise<ChannelStatSnapshotRow | null> {
  const { data, error } = await supabase
    .from('channel_stat_snapshots')
    .select()
    .eq('channel_id', params.channelId)
    .lte('snapshot_at', params.targetDate.toISOString())
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    throw new Error(`getSnapshotNearestTo: ${error.message}`);
  }
  return (data as ChannelStatSnapshotRow | null) ?? null;
}

export async function listSnapshotsForChannel(
  supabase: SupabaseClient,
  params: { channelId: string; limit: number },
): Promise<ChannelStatSnapshotRow[]> {
  const { data, error } = await supabase
    .from('channel_stat_snapshots')
    .select()
    .eq('channel_id', params.channelId)
    .order('snapshot_at', { ascending: false })
    .limit(params.limit);
  if (error) throw new Error(`listSnapshotsForChannel: ${error.message}`);
  return (data ?? []) as ChannelStatSnapshotRow[];
}
```

- [ ] **Step 5: Run test to confirm it passes**

Run: `npx vitest run src/tests/lib/supabase/repositories/channel-stat-snapshots.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260528000012_channel_stat_snapshots.sql src/lib/supabase/repositories/channel-stat-snapshots.ts src/tests/lib/supabase/repositories/channel-stat-snapshots.test.ts
git commit -m "feat(ingest): channel_stat_snapshots table + repo"
```

---

## Task 3: `video_velocity_snapshots` repo

**Files:**
- Create: `src/lib/supabase/repositories/video-velocity-snapshots.ts`
- Test: `src/tests/lib/supabase/repositories/video-velocity-snapshots.test.ts`

(The `video_velocity_snapshots` table already exists from Sub-phase A migration `20260528000003_watch_list.sql` — PK `(video_id, snapshot_at)`. This task only adds the missing writer.)

- [ ] **Step 1: Write the failing repo test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  insertVelocitySnapshot,
  listSnapshotsForVideo,
} from '@/lib/supabase/repositories/video-velocity-snapshots';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }) }) }) }),
    }),
  } as never;
}

describe('video-velocity-snapshots repository', () => {
  it('insertVelocitySnapshot returns the row', async () => {
    const row = { video_id: 'v1', view_count: 5000 };
    const result = await insertVelocitySnapshot(makeClient([row]), { videoId: 'v1', viewCount: 5000, likeCount: 10, commentCount: 2 });
    expect(result.video_id).toBe('v1');
  });

  it('listSnapshotsForVideo returns rows', async () => {
    const result = await listSnapshotsForVideo(makeClient([{ video_id: 'v1' }, { video_id: 'v1' }]), { videoId: 'v1', limit: 5 });
    expect(result).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/tests/lib/supabase/repositories/video-velocity-snapshots.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the repo**

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface VelocitySnapshotRow {
  video_id: string;
  snapshot_at: string;
  view_count: number;
  like_count: number;
  comment_count: number;
}

export async function insertVelocitySnapshot(
  supabase: SupabaseClient,
  params: { videoId: string; viewCount: number; likeCount?: number; commentCount?: number; snapshotAt?: Date },
): Promise<VelocitySnapshotRow> {
  const { data, error } = await supabase
    .from('video_velocity_snapshots')
    .insert({
      video_id: params.videoId,
      view_count: params.viewCount,
      like_count: params.likeCount ?? 0,
      comment_count: params.commentCount ?? 0,
      snapshot_at: (params.snapshotAt ?? new Date()).toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(`insertVelocitySnapshot: ${error.message}`);
  return data as VelocitySnapshotRow;
}

export async function listSnapshotsForVideo(
  supabase: SupabaseClient,
  params: { videoId: string; limit: number },
): Promise<VelocitySnapshotRow[]> {
  const { data, error } = await supabase
    .from('video_velocity_snapshots')
    .select()
    .eq('video_id', params.videoId)
    .order('snapshot_at', { ascending: false })
    .limit(params.limit);
  if (error) throw new Error(`listSnapshotsForVideo: ${error.message}`);
  return (data ?? []) as VelocitySnapshotRow[];
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx vitest run src/tests/lib/supabase/repositories/video-velocity-snapshots.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/repositories/video-velocity-snapshots.ts src/tests/lib/supabase/repositories/video-velocity-snapshots.test.ts
git commit -m "feat(ingest): video_velocity_snapshots writer"
```

---

## Task 4: `updateWatchedChannelSnapshot` on watched-channels repo

**Files:**
- Modify: `src/lib/supabase/repositories/watched-channels.ts` (append a new exported function; keep existing `upsertWatchedChannel`, `listActiveWatchedChannels`, `evictInactiveWatchedChannels` untouched)
- Test: `src/tests/lib/supabase/watched-channels-update.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import { updateWatchedChannelSnapshot } from '@/lib/supabase/repositories/watched-channels';

beforeEach(() => vi.clearAllMocks());

function makeClient(row: Record<string, unknown> | null, error: unknown = null) {
  return {
    from: () => ({
      update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: row, error }) }) }) }),
    }),
  } as never;
}

describe('updateWatchedChannelSnapshot', () => {
  it('updates snapshot fields and returns the row', async () => {
    const row = { channel_id: 'UC1', current_subscriber_count: 13000, outlier_rate_60d: 0.2 };
    const result = await updateWatchedChannelSnapshot(makeClient(row), {
      channelId: 'UC1',
      currentSubscriberCount: 13000,
      subscriberGrowth30d: 0.08,
      subscriberGrowth90d: 0.25,
      outlierRate60d: 0.2,
      uploadCadencePerWeek: 4,
      lastSnapshottedAt: new Date('2026-05-28T00:00:00Z'),
    });
    expect(result.channel_id).toBe('UC1');
    expect(result.current_subscriber_count).toBe(13000);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/tests/lib/supabase/watched-channels-update.test.ts`
Expected: FAIL — `updateWatchedChannelSnapshot` is not exported.

- [ ] **Step 3: Append the function to `watched-channels.ts`**

```ts
export interface UpdateWatchedChannelSnapshotParams {
  channelId: string;
  currentSubscriberCount: number;
  subscriberGrowth30d?: number | null;
  subscriberGrowth90d?: number | null;
  outlierRate60d?: number | null;
  uploadCadencePerWeek?: number | null;
  lastSnapshottedAt: Date;
}

export async function updateWatchedChannelSnapshot(
  supabase: SupabaseClient,
  params: UpdateWatchedChannelSnapshotParams,
): Promise<WatchedChannel> {
  const { data, error } = await supabase
    .from('watched_channels')
    .update({
      current_subscriber_count: params.currentSubscriberCount,
      subscriber_growth_30d: params.subscriberGrowth30d ?? null,
      subscriber_growth_90d: params.subscriberGrowth90d ?? null,
      outlier_rate_60d: params.outlierRate60d ?? null,
      upload_cadence_per_week: params.uploadCadencePerWeek ?? null,
      last_snapshotted_at: params.lastSnapshottedAt.toISOString(),
    })
    .eq('channel_id', params.channelId)
    .select()
    .single();
  if (error) throw new Error(`updateWatchedChannelSnapshot: ${error.message}`);
  return data as WatchedChannel;
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx vitest run src/tests/lib/supabase/watched-channels-update.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/repositories/watched-channels.ts src/tests/lib/supabase/watched-channels-update.test.ts
git commit -m "feat(ingest): watched-channels snapshot-update helper"
```

---

## Task 5: YouTube client — `fetchVideosByIds`, `fetchMostPopularByCategory`, quota map

**Files:**
- Modify: `src/lib/clients/youtube.ts` (add types + functions + quota map; keep `searchShortsByQuery`, `parseISODurationToSeconds`)
- Test: `src/tests/lib/clients/youtube-videos.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchVideosByIds,
  fetchMostPopularByCategory,
  YOUTUBE_QUOTA_COST,
} from '@/lib/clients/youtube';

afterEach(() => vi.restoreAllMocks());

const videoItem = {
  id: 'vid1',
  snippet: {
    title: 'Wild fact',
    description: 'a description',
    channelId: 'UCabc',
    channelTitle: 'FactBlast',
    publishedAt: '2026-05-20T00:00:00Z',
    tags: ['facts', 'history'],
    thumbnails: { medium: { url: 'https://i.ytimg.com/vi/vid1/mq.jpg' } },
  },
  statistics: { viewCount: '1000', likeCount: '50', commentCount: '4' },
  contentDetails: { duration: 'PT45S' },
};

describe('fetchVideosByIds', () => {
  it('maps videos.list items and batches ≤50 ids per call', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [videoItem] }), { status: 200 }) as Response,
    );
    const ids = Array.from({ length: 75 }, (_, i) => `v${i}`);
    const result = await fetchVideosByIds({ apiKey: 'k', videoIds: ids });
    expect(fetchMock).toHaveBeenCalledTimes(2); // 75 → 50 + 25
    expect(result[0]).toMatchObject({
      videoId: 'vid1', title: 'Wild fact', description: 'a description',
      channelId: 'UCabc', views: 1000, likes: 50, comments: 4, durationSeconds: 45,
      tags: ['facts', 'history'], thumbnailUrl: 'https://i.ytimg.com/vi/vid1/mq.jpg',
    });
  });

  it('returns [] for empty input without calling fetch', async () => {
    const fetchMock = vi.spyOn(global, 'fetch');
    expect(await fetchVideosByIds({ apiKey: 'k', videoIds: [] })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fetchMostPopularByCategory', () => {
  it('requests chart=mostPopular for the category and maps items', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [videoItem] }), { status: 200 }) as Response,
    );
    const result = await fetchMostPopularByCategory({ apiKey: 'k', categoryId: '24' });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('chart=mostPopular');
    expect(url).toContain('videoCategoryId=24');
    expect(result).toHaveLength(1);
  });
});

describe('YOUTUBE_QUOTA_COST', () => {
  it('encodes documented unit costs', () => {
    expect(YOUTUBE_QUOTA_COST.search).toBe(100);
    expect(YOUTUBE_QUOTA_COST.videosList).toBe(1);
    expect(YOUTUBE_QUOTA_COST.channelsList).toBe(1);
    expect(YOUTUBE_QUOTA_COST.playlistItems).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/tests/lib/clients/youtube-videos.test.ts`
Expected: FAIL — exports not found.

- [ ] **Step 3: Add types, quota map, and functions to `youtube.ts`**

Append to `src/lib/clients/youtube.ts`:

```ts
export const YOUTUBE_QUOTA_COST = {
  search: 100,
  videosList: 1,
  channelsList: 1,
  playlistItems: 1,
} as const;

export type YouTubeVideoDetail = {
  videoId: string;
  title: string;
  description: string;
  tags: string[];
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  durationSeconds: number;
  thumbnailUrl: string | null;
};

type RawVideoItem = {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    tags?: string[];
    thumbnails?: { medium?: { url?: string }; high?: { url?: string }; default?: { url?: string } };
  };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
};

function mapVideoItem(item: RawVideoItem): YouTubeVideoDetail {
  const s = item.snippet ?? {};
  const stats = item.statistics ?? {};
  const thumb = s.thumbnails?.medium?.url ?? s.thumbnails?.high?.url ?? s.thumbnails?.default?.url ?? null;
  return {
    videoId: item.id,
    title: s.title ?? '',
    description: s.description ?? '',
    tags: s.tags ?? [],
    channelId: s.channelId ?? '',
    channelTitle: s.channelTitle ?? '',
    publishedAt: s.publishedAt ?? '',
    views: parseInt(stats.viewCount ?? '0', 10),
    likes: parseInt(stats.likeCount ?? '0', 10),
    comments: parseInt(stats.commentCount ?? '0', 10),
    durationSeconds: parseISODurationToSeconds(item.contentDetails?.duration ?? 'PT0S'),
    thumbnailUrl: thumb,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function fetchVideosByIds(params: {
  apiKey: string;
  videoIds: string[];
}): Promise<YouTubeVideoDetail[]> {
  const { apiKey, videoIds } = params;
  if (videoIds.length === 0) return [];
  const results: YouTubeVideoDetail[] = [];
  for (const batch of chunk(videoIds, 50)) {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet,statistics,contentDetails');
    url.searchParams.set('id', batch.join(','));
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('key', apiKey);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`YouTube videos.list failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { items?: RawVideoItem[] };
    for (const item of json.items ?? []) results.push(mapVideoItem(item));
  }
  return results;
}

export async function fetchMostPopularByCategory(params: {
  apiKey: string;
  categoryId: string;
  regionCode?: string;
  maxResults?: number;
}): Promise<YouTubeVideoDetail[]> {
  const { apiKey, categoryId, regionCode = 'US', maxResults = 50 } = params;
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet,statistics,contentDetails');
  url.searchParams.set('chart', 'mostPopular');
  url.searchParams.set('videoCategoryId', categoryId);
  url.searchParams.set('regionCode', regionCode);
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('key', apiKey);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`YouTube mostPopular failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { items?: RawVideoItem[] };
  return (json.items ?? []).map(mapVideoItem);
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx vitest run src/tests/lib/clients/youtube-videos.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/clients/youtube.ts src/tests/lib/clients/youtube-videos.test.ts
git commit -m "feat(youtube): videos.list batching + mostPopular + quota map"
```

---

## Task 6: YouTube client — `fetchChannels`, `fetchPlaylistItems`, `resolveChannel`

**Files:**
- Modify: `src/lib/clients/youtube.ts`
- Test: `src/tests/lib/clients/youtube-channels.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchChannels, fetchPlaylistItems, resolveChannel } from '@/lib/clients/youtube';

afterEach(() => vi.restoreAllMocks());

const channelItem = {
  id: 'UCabc',
  snippet: { title: 'FactBlast', thumbnails: { default: { url: 'https://t/c.jpg' } }, customUrl: '@factblast' },
  statistics: { subscriberCount: '120000', videoCount: '340', viewCount: '9000000' },
  contentDetails: { relatedPlaylists: { uploads: 'UUabc' } },
};

describe('fetchChannels', () => {
  it('maps channels.list items and batches ≤50', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [channelItem] }), { status: 200 }) as Response,
    );
    const ids = Array.from({ length: 60 }, (_, i) => `UC${i}`);
    const result = await fetchChannels({ apiKey: 'k', channelIds: ids });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result[0]).toMatchObject({
      channelId: 'UCabc', title: 'FactBlast', subscriberCount: 120000,
      videoCount: 340, viewCount: 9000000, uploadsPlaylistId: 'UUabc',
    });
  });

  it('returns [] for empty input', async () => {
    expect(await fetchChannels({ apiKey: 'k', channelIds: [] })).toEqual([]);
  });
});

describe('fetchPlaylistItems', () => {
  it('maps playlistItems.list contentDetails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [{ contentDetails: { videoId: 'v1', videoPublishedAt: '2026-05-25T00:00:00Z' } }] }), { status: 200 }) as Response,
    );
    const result = await fetchPlaylistItems({ apiKey: 'k', playlistId: 'UUabc' });
    expect(result).toEqual([{ videoId: 'v1', publishedAt: '2026-05-25T00:00:00Z' }]);
  });
});

describe('resolveChannel', () => {
  it('resolves a /channel/<id> URL via fetchChannels', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [channelItem] }), { status: 200 }) as Response,
    );
    const result = await resolveChannel({ apiKey: 'k', urlOrHandle: 'https://www.youtube.com/channel/UCabc' });
    expect(result?.channelId).toBe('UCabc');
  });

  it('resolves an @handle via forHandle', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [channelItem] }), { status: 200 }) as Response,
    );
    const result = await resolveChannel({ apiKey: 'k', urlOrHandle: '@factblast' });
    expect(String(fetchMock.mock.calls[0][0])).toContain('forHandle=%40factblast');
    expect(result?.channelId).toBe('UCabc');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/tests/lib/clients/youtube-channels.test.ts`
Expected: FAIL — exports not found.

- [ ] **Step 3: Add the functions to `youtube.ts`**

Append to `src/lib/clients/youtube.ts`:

```ts
export type YouTubeChannel = {
  channelId: string;
  title: string;
  handle: string | null;
  thumbnailUrl: string | null;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  uploadsPlaylistId: string | null;
};

type RawChannelItem = {
  id: string;
  snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string }; medium?: { url?: string } } };
  statistics?: { subscriberCount?: string; videoCount?: string; viewCount?: string };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

function mapChannelItem(item: RawChannelItem): YouTubeChannel {
  const s = item.snippet ?? {};
  const stats = item.statistics ?? {};
  return {
    channelId: item.id,
    title: s.title ?? '',
    handle: s.customUrl ?? null,
    thumbnailUrl: s.thumbnails?.default?.url ?? s.thumbnails?.medium?.url ?? null,
    subscriberCount: parseInt(stats.subscriberCount ?? '0', 10),
    videoCount: parseInt(stats.videoCount ?? '0', 10),
    viewCount: parseInt(stats.viewCount ?? '0', 10),
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? null,
  };
}

export async function fetchChannels(params: {
  apiKey: string;
  channelIds: string[];
}): Promise<YouTubeChannel[]> {
  const { apiKey, channelIds } = params;
  if (channelIds.length === 0) return [];
  const results: YouTubeChannel[] = [];
  for (const batch of chunk(channelIds, 50)) {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'snippet,statistics,contentDetails');
    url.searchParams.set('id', batch.join(','));
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('key', apiKey);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`YouTube channels.list failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { items?: RawChannelItem[] };
    for (const item of json.items ?? []) results.push(mapChannelItem(item));
  }
  return results;
}

export async function fetchPlaylistItems(params: {
  apiKey: string;
  playlistId: string;
  maxResults?: number;
}): Promise<Array<{ videoId: string; publishedAt: string }>> {
  const { apiKey, playlistId, maxResults = 50 } = params;
  const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  url.searchParams.set('part', 'contentDetails');
  url.searchParams.set('playlistId', playlistId);
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('key', apiKey);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`YouTube playlistItems.list failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { items?: Array<{ contentDetails?: { videoId?: string; videoPublishedAt?: string } }> };
  return (json.items ?? [])
    .map((i) => ({ videoId: i.contentDetails?.videoId ?? '', publishedAt: i.contentDetails?.videoPublishedAt ?? '' }))
    .filter((i) => i.videoId);
}

function parseChannelIdFromUrl(input: string): string | null {
  const m = input.match(/\/channel\/(UC[\w-]+)/);
  if (m) return m[1];
  if (/^UC[\w-]{20,}$/.test(input.trim())) return input.trim();
  return null;
}

function parseHandle(input: string): string | null {
  const m = input.match(/(?:youtube\.com\/)?@([\w.-]+)/);
  if (m) return `@${m[1]}`;
  if (input.trim().startsWith('@')) return input.trim();
  return null;
}

export async function resolveChannel(params: {
  apiKey: string;
  urlOrHandle: string;
}): Promise<YouTubeChannel | null> {
  const { apiKey, urlOrHandle } = params;
  const id = parseChannelIdFromUrl(urlOrHandle);
  if (id) {
    const channels = await fetchChannels({ apiKey, channelIds: [id] });
    return channels[0] ?? null;
  }
  const handle = parseHandle(urlOrHandle);
  if (handle) {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'snippet,statistics,contentDetails');
    url.searchParams.set('forHandle', handle);
    url.searchParams.set('key', apiKey);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`YouTube channels.forHandle failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { items?: RawChannelItem[] };
    const item = json.items?.[0];
    return item ? mapChannelItem(item) : null;
  }
  return null;
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx vitest run src/tests/lib/clients/youtube-channels.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/clients/youtube.ts src/tests/lib/clients/youtube-channels.test.ts
git commit -m "feat(youtube): channels.list, playlistItems.list, resolveChannel"
```

---

## Task 7: Ingestion seed config

**Files:**
- Create: `src/lib/ingestion/config.ts`
- Test: `src/tests/lib/ingestion/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  YOUTUBE_CATEGORIES,
  SHORTS_SEARCH_SEEDS,
  REDDIT_SEED_SUBREDDITS,
  GOOGLE_TRENDS_GEO,
  rotatingSeedSlice,
} from '@/lib/ingestion/config';

describe('ingestion config', () => {
  it('has the 12 YouTube categories with id + label', () => {
    expect(YOUTUBE_CATEGORIES).toHaveLength(12);
    expect(YOUTUBE_CATEGORIES.every((c) => c.id && c.label)).toBe(true);
  });
  it('has 8-10 search seeds and ~30 subreddits', () => {
    expect(SHORTS_SEARCH_SEEDS.length).toBeGreaterThanOrEqual(8);
    expect(SHORTS_SEARCH_SEEDS.length).toBeLessThanOrEqual(10);
    expect(REDDIT_SEED_SUBREDDITS.length).toBeGreaterThanOrEqual(25);
  });
  it('GOOGLE_TRENDS_GEO is US', () => {
    expect(GOOGLE_TRENDS_GEO).toBe('US');
  });
  it('rotatingSeedSlice returns a deterministic subset by day', () => {
    const seeds = ['a', 'b', 'c', 'd', 'e', 'f'];
    const day0 = rotatingSeedSlice(seeds, 3, new Date('2026-01-01T00:00:00Z'));
    const day0again = rotatingSeedSlice(seeds, 3, new Date('2026-01-01T12:00:00Z'));
    expect(day0).toEqual(day0again);
    expect(day0).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/tests/lib/ingestion/config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the config**

```ts
// Static ingestion defaults. Onboarding (§4.14) overrides these per-operator later.

export interface YouTubeCategory {
  id: string;
  label: string;
}

// YouTube Data API videoCategoryId values (regionCode=US).
export const YOUTUBE_CATEGORIES: YouTubeCategory[] = [
  { id: '23', label: 'Comedy' },
  { id: '24', label: 'Entertainment' },
  { id: '27', label: 'Education' },
  { id: '28', label: 'Science & Technology' },
  { id: '26', label: 'Howto & Style' },
  { id: '25', label: 'News & Politics' },
  { id: '20', label: 'Gaming' },
  { id: '17', label: 'Sports' },
  { id: '1', label: 'Film & Animation' },
  { id: '10', label: 'Music' },
  { id: '15', label: 'Pets & Animals' },
  { id: '22', label: 'People & Blogs' },
];

export const SHORTS_SEARCH_SEEDS: string[] = [
  'weird history facts',
  'satisfying restoration',
  'life hacks',
  'science explained',
  'true crime short',
  'money tips',
  'fitness transformation',
  'cooking hack',
  'tech review short',
  'psychology facts',
];

export const REDDIT_SEED_SUBREDDITS: string[] = [
  'NewTubers', 'PartneredYoutube', 'youtubers', 'NextLevel', 'youtube',
  'Damnthatsinteresting', 'todayilearned', 'interestingasfuck', 'nextfuckinglevel',
  'BeAmazed', 'oddlysatisfying', 'educationalgifs', 'coolguides', 'lifehacks',
  'explainlikeimfive', 'YouShouldKnow', 'GetMotivated', 'productivity', 'Fitness',
  'personalfinance', 'cooking', 'gadgets', 'science', 'space', 'history',
  'Documentaries', 'TrueCrime', 'psychology', 'AskReddit', 'Showerthoughts',
];

export const GOOGLE_TRENDS_GEO = 'US';

/**
 * Deterministic daily slice of a seed list, so we cover all seeds across a
 * rotation without spending quota on every seed every day. The slice start
 * advances by `count` each UTC day and wraps around.
 */
export function rotatingSeedSlice<T>(seeds: T[], count: number, now: Date = new Date()): T[] {
  if (seeds.length === 0) return [];
  const dayIndex = Math.floor(now.getTime() / 86_400_000);
  const start = (dayIndex * count) % seeds.length;
  const out: T[] = [];
  for (let i = 0; i < Math.min(count, seeds.length); i++) {
    out.push(seeds[(start + i) % seeds.length]);
  }
  return out;
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx vitest run src/tests/lib/ingestion/config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingestion/config.ts src/tests/lib/ingestion/config.test.ts
git commit -m "feat(ingest): seed config (categories, search seeds, subreddits)"
```

---

## Task 8: YouTube category-sweep adapter + cron

**Files:**
- Create: `src/lib/ingestion/youtube-category-sweep.ts`
- Create: `src/app/api/cron/youtube-category-sweep/route.ts`
- Test: `src/tests/lib/ingestion/youtube-category-sweep.test.ts`

**Adapter contract (used by all source adapters):** a pure async function taking an injected `client` + `repo` + `config`, returning `AdapterResult` (`{ ingested, skipped, quotaUnits, partial?, status?, context? }` from `src/lib/ingestion/run.ts`).

- [ ] **Step 1: Write the failing adapter test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { runCategorySweep } from '@/lib/ingestion/youtube-category-sweep';
import type { YouTubeVideoDetail } from '@/lib/clients/youtube';

function vid(id: string, duration: number): YouTubeVideoDetail {
  return {
    videoId: id, title: `t${id}`, description: 'd', tags: [], channelId: `UC${id}`,
    channelTitle: 'c', publishedAt: '2026-05-20T00:00:00Z', views: 100, likes: 1,
    comments: 0, durationSeconds: duration, thumbnailUrl: null,
  };
}

describe('runCategorySweep', () => {
  it('ingests ≤60s videos and skips longer ones', async () => {
    const upserts: string[] = [];
    const client = { fetchMostPopularByCategory: vi.fn(async () => [vid('a', 45), vid('b', 120)]) };
    const repo = { upsertObservation: vi.fn(async (p: { videoId: string }) => { upserts.push(p.videoId); }) };
    const result = await runCategorySweep({ client, repo, categories: [{ id: '24', label: 'Entertainment' }], apiKey: 'k' });
    expect(upserts).toEqual(['a']);
    expect(result.ingested).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.quotaUnits).toBe(1); // 1 category × videosList cost
  });

  it('marks partial when a category fetch throws but others succeed', async () => {
    const client = {
      fetchMostPopularByCategory: vi.fn()
        .mockResolvedValueOnce([vid('a', 30)])
        .mockRejectedValueOnce(new Error('quota')),
    };
    const repo = { upsertObservation: vi.fn(async () => {}) };
    const result = await runCategorySweep({
      client, repo,
      categories: [{ id: '24', label: 'E' }, { id: '23', label: 'C' }], apiKey: 'k',
    });
    expect(result.ingested).toBe(1);
    expect(result.partial).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/tests/lib/ingestion/youtube-category-sweep.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the adapter**

```ts
import 'server-only';
import { YOUTUBE_QUOTA_COST, type YouTubeVideoDetail } from '@/lib/clients/youtube';
import type { YouTubeCategory } from '@/lib/ingestion/config';
import type { AdapterResult } from '@/lib/ingestion/run';

export interface CategorySweepClient {
  fetchMostPopularByCategory(params: { apiKey: string; categoryId: string; regionCode?: string; maxResults?: number }): Promise<YouTubeVideoDetail[]>;
}

export interface CategorySweepRepo {
  upsertObservation(params: {
    videoId: string; source: 'youtube_most_popular'; channelId: string | null;
    title: string; description: string | null; tags: unknown[]; thumbnailUrl: string | null;
    durationSeconds: number | null; publishedAt: Date | null; viewCount: number; likeCount: number; commentCount: number;
  }): Promise<void>;
}

export async function runCategorySweep(args: {
  client: CategorySweepClient;
  repo: CategorySweepRepo;
  categories: YouTubeCategory[];
  apiKey: string;
}): Promise<AdapterResult> {
  const { client, repo, categories, apiKey } = args;
  let ingested = 0;
  let skipped = 0;
  let quotaUnits = 0;
  let failedCategories = 0;

  for (const category of categories) {
    try {
      const videos = await client.fetchMostPopularByCategory({ apiKey, categoryId: category.id, regionCode: 'US', maxResults: 50 });
      quotaUnits += YOUTUBE_QUOTA_COST.videosList;
      for (const v of videos) {
        if (v.durationSeconds > 60 || v.durationSeconds <= 0) { skipped++; continue; }
        await repo.upsertObservation({
          videoId: v.videoId, source: 'youtube_most_popular', channelId: v.channelId || null,
          title: v.title, description: v.description || null, tags: v.tags, thumbnailUrl: v.thumbnailUrl,
          durationSeconds: v.durationSeconds, publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
          viewCount: v.views, likeCount: v.likes, commentCount: v.comments,
        });
        ingested++;
      }
    } catch {
      failedCategories++;
    }
  }
  return { ingested, skipped, quotaUnits, partial: failedCategories > 0, context: { failedCategories } };
}
```

- [ ] **Step 4: Run adapter test to confirm it passes**

Run: `npx vitest run src/tests/lib/ingestion/youtube-category-sweep.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement the cron route**

```ts
import { NextResponse } from 'next/server';
import { assertCronAuth, scraperLog, serializeError } from '@/lib/scrapers/shared';
import { loadEnv } from '@/lib/env';
import { getServiceClient } from '@/lib/supabase/server';
import { fetchMostPopularByCategory } from '@/lib/clients/youtube';
import { upsertShortsObservation } from '@/lib/supabase/repositories/shorts-observations';
import { runWithIngestionLog } from '@/lib/ingestion/run';
import { runCategorySweep } from '@/lib/ingestion/youtube-category-sweep';
import { YOUTUBE_CATEGORIES } from '@/lib/ingestion/config';

export const maxDuration = 300;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }

  const env = loadEnv();
  if (!env.YOUTUBE_API_KEY) return NextResponse.json({ error: 'YOUTUBE_API_KEY not set' }, { status: 500 });
  const supabase = getServiceClient();
  const apiKey = env.YOUTUBE_API_KEY;

  try {
    const run = await runWithIngestionLog(supabase, 'youtube_category_sweep', () =>
      runCategorySweep({
        client: { fetchMostPopularByCategory },
        repo: { upsertObservation: (p) => upsertShortsObservation(supabase, p).then(() => undefined) },
        categories: YOUTUBE_CATEGORIES,
        apiKey,
      }),
    );
    return NextResponse.json({ ok: true, ...scraperLog('youtube-category-sweep', { run }) });
  } catch (e) {
    console.error('youtube-category-sweep failed', e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
```

- [ ] **Step 6: Typecheck the route wiring**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirms `upsertShortsObservation` params match the adapter's `upsertObservation` shape.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/ingestion/youtube-category-sweep.ts src/app/api/cron/youtube-category-sweep/route.ts src/tests/lib/ingestion/youtube-category-sweep.test.ts
git commit -m "feat(ingest): youtube category-sweep adapter + cron"
```

---

## Task 9: YouTube Shorts-search adapter + cron

**Files:**
- Create: `src/lib/ingestion/youtube-shorts-search.ts`
- Create: `src/app/api/cron/youtube-shorts-search/route.ts`
- Test: `src/tests/lib/ingestion/youtube-shorts-search.test.ts`

- [ ] **Step 1: Write the failing adapter test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { runShortsSearch } from '@/lib/ingestion/youtube-shorts-search';
import type { YouTubeShortResult } from '@/lib/clients/youtube';

function shortResult(id: string): YouTubeShortResult {
  return {
    externalId: id, title: `t${id}`, channelId: `UC${id}`, channelName: 'c',
    publishedAt: '2026-05-20T00:00:00Z', views: 500, likes: 10, comments: 2,
    durationSeconds: 30, url: `https://youtube.com/shorts/${id}`, rawPayload: {},
  };
}

describe('runShortsSearch', () => {
  it('searches each seed and upserts observations', async () => {
    const upserts: string[] = [];
    const client = { searchShortsByQuery: vi.fn(async () => [shortResult('a'), shortResult('b')]) };
    const repo = { upsertObservation: vi.fn(async (p: { videoId: string }) => { upserts.push(p.videoId); }) };
    const result = await runShortsSearch({ client, repo, seeds: ['weird history'], apiKey: 'k' });
    expect(upserts).toEqual(['a', 'b']);
    expect(result.ingested).toBe(2);
    expect(result.quotaUnits).toBe(100); // 1 seed × search cost
  });

  it('marks partial when one seed fails', async () => {
    const client = {
      searchShortsByQuery: vi.fn().mockResolvedValueOnce([shortResult('a')]).mockRejectedValueOnce(new Error('quota')),
    };
    const repo = { upsertObservation: vi.fn(async () => {}) };
    const result = await runShortsSearch({ client, repo, seeds: ['s1', 's2'], apiKey: 'k' });
    expect(result.ingested).toBe(1);
    expect(result.partial).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/tests/lib/ingestion/youtube-shorts-search.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the adapter**

```ts
import 'server-only';
import { YOUTUBE_QUOTA_COST, type YouTubeShortResult } from '@/lib/clients/youtube';
import type { AdapterResult } from '@/lib/ingestion/run';

export interface ShortsSearchClient {
  searchShortsByQuery(params: { query: string; apiKey: string; maxResults?: number }): Promise<YouTubeShortResult[]>;
}

export interface ShortsSearchRepo {
  upsertObservation(params: {
    videoId: string; source: 'youtube_search'; channelId: string | null;
    title: string; durationSeconds: number | null; publishedAt: Date | null;
    viewCount: number; likeCount: number; commentCount: number;
  }): Promise<void>;
}

export async function runShortsSearch(args: {
  client: ShortsSearchClient;
  repo: ShortsSearchRepo;
  seeds: string[];
  apiKey: string;
}): Promise<AdapterResult> {
  const { client, repo, seeds, apiKey } = args;
  let ingested = 0;
  let skipped = 0;
  let quotaUnits = 0;
  let failedSeeds = 0;

  for (const seed of seeds) {
    try {
      const results = await client.searchShortsByQuery({ query: seed, apiKey, maxResults: 25 });
      quotaUnits += YOUTUBE_QUOTA_COST.search;
      for (const r of results) {
        if (r.durationSeconds > 60 || r.durationSeconds <= 0) { skipped++; continue; }
        await repo.upsertObservation({
          videoId: r.externalId, source: 'youtube_search', channelId: r.channelId || null,
          title: r.title, durationSeconds: r.durationSeconds,
          publishedAt: r.publishedAt ? new Date(r.publishedAt) : null,
          viewCount: r.views, likeCount: r.likes, commentCount: r.comments,
        });
        ingested++;
      }
    } catch {
      failedSeeds++;
    }
  }
  return { ingested, skipped, quotaUnits, partial: failedSeeds > 0, context: { failedSeeds } };
}
```

- [ ] **Step 4: Run adapter test to confirm it passes**

Run: `npx vitest run src/tests/lib/ingestion/youtube-shorts-search.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement the cron route**

```ts
import { NextResponse } from 'next/server';
import { assertCronAuth, scraperLog, serializeError } from '@/lib/scrapers/shared';
import { loadEnv } from '@/lib/env';
import { getServiceClient } from '@/lib/supabase/server';
import { searchShortsByQuery } from '@/lib/clients/youtube';
import { upsertShortsObservation } from '@/lib/supabase/repositories/shorts-observations';
import { runWithIngestionLog } from '@/lib/ingestion/run';
import { runShortsSearch } from '@/lib/ingestion/youtube-shorts-search';
import { SHORTS_SEARCH_SEEDS, rotatingSeedSlice } from '@/lib/ingestion/config';

export const maxDuration = 300;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }

  const env = loadEnv();
  if (!env.YOUTUBE_API_KEY) return NextResponse.json({ error: 'YOUTUBE_API_KEY not set' }, { status: 500 });
  const supabase = getServiceClient();
  const apiKey = env.YOUTUBE_API_KEY;
  const seeds = rotatingSeedSlice(SHORTS_SEARCH_SEEDS, 8);

  try {
    const run = await runWithIngestionLog(supabase, 'youtube_shorts_search', () =>
      runShortsSearch({
        client: { searchShortsByQuery },
        repo: { upsertObservation: (p) => upsertShortsObservation(supabase, p).then(() => undefined) },
        seeds,
        apiKey,
      }),
    );
    return NextResponse.json({ ok: true, ...scraperLog('youtube-shorts-search', { run, seeds }) });
  } catch (e) {
    console.error('youtube-shorts-search failed', e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ingestion/youtube-shorts-search.ts src/app/api/cron/youtube-shorts-search/route.ts src/tests/lib/ingestion/youtube-shorts-search.test.ts
git commit -m "feat(ingest): youtube shorts-search adapter + cron"
```

---

## Task 10: Watch-list math (pure functions)

**Files:**
- Create: `src/lib/ingestion/watch-list-math.ts`
- Test: `src/tests/lib/ingestion/watch-list-math.test.ts`

These are pure functions — no IO. Test the boundaries thoroughly; the auto-discovery decisions depend on them.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  computeUploadCadencePerWeek,
  computeAvgViews,
  computeOutlierRate,
  computeGrowthFraction,
  evaluateAutoAdd,
} from '@/lib/ingestion/watch-list-math';

describe('computeUploadCadencePerWeek', () => {
  it('counts uploads in the window and divides by weeks', () => {
    const now = new Date('2026-05-28T00:00:00Z');
    const dates = [new Date('2026-05-27'), new Date('2026-05-20'), new Date('2026-05-10'), new Date('2026-04-01')];
    // 3 uploads within 30d / (30/7) weeks ≈ 0.7
    expect(computeUploadCadencePerWeek(dates, 30, now)).toBeCloseTo(0.7, 1);
  });
  it('returns 0 for no uploads', () => {
    expect(computeUploadCadencePerWeek([], 30, new Date())).toBe(0);
  });
});

describe('computeAvgViews', () => {
  it('averages, returns 0 for empty', () => {
    expect(computeAvgViews([100, 200, 300])).toBe(200);
    expect(computeAvgViews([])).toBe(0);
  });
});

describe('computeOutlierRate', () => {
  it('fraction of videos with views ≥ multiplier × avg', () => {
    // avg = 100; outliers (≥300): 400, 900 → 2/4
    expect(computeOutlierRate([400, 50, 900, 60], 100, 3)).toBe(0.5);
  });
  it('returns 0 when avg is 0', () => {
    expect(computeOutlierRate([0, 0], 0, 3)).toBe(0);
  });
});

describe('computeGrowthFraction', () => {
  it('returns (current-past)/past', () => {
    expect(computeGrowthFraction(13000, 10000)).toBeCloseTo(0.3, 5);
  });
  it('returns null when past is missing or 0', () => {
    expect(computeGrowthFraction(13000, null)).toBeNull();
    expect(computeGrowthFraction(13000, 0)).toBeNull();
  });
});

describe('evaluateAutoAdd', () => {
  const base = { subscriberCount: 50000, uploadCadencePerWeek: 2, outlierRate: 0.2, subs30dAgo: 40000, atCap: false };
  it('adds as auto_outlier when subs in range + cadence + outliers', () => {
    expect(evaluateAutoAdd(base)).toEqual({ add: true, source: 'auto_outlier' });
  });
  it('adds as auto_breakout when subs doubled vs 30d ago (and outlier path not met)', () => {
    expect(evaluateAutoAdd({ ...base, outlierRate: 0, uploadCadencePerWeek: 0, subs30dAgo: 20000 }))
      .toEqual({ add: true, source: 'auto_breakout' });
  });
  it('does not add when subs out of 5k-500k range', () => {
    expect(evaluateAutoAdd({ ...base, subscriberCount: 800000 }).add).toBe(false);
    expect(evaluateAutoAdd({ ...base, subscriberCount: 1000 }).add).toBe(false);
  });
  it('does not add when at cap', () => {
    expect(evaluateAutoAdd({ ...base, atCap: true }).add).toBe(false);
  });
  it('does not add when neither path qualifies', () => {
    expect(evaluateAutoAdd({ ...base, outlierRate: 0.05, uploadCadencePerWeek: 0.5, subs30dAgo: 49000 }).add).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/tests/lib/ingestion/watch-list-math.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the math module**

```ts
// Pure watch-list math (§4.5). No IO.

const MS_PER_DAY = 86_400_000;

export function computeUploadCadencePerWeek(uploadDates: Date[], windowDays: number, now: Date = new Date()): number {
  if (uploadDates.length === 0) return 0;
  const cutoff = now.getTime() - windowDays * MS_PER_DAY;
  const inWindow = uploadDates.filter((d) => d.getTime() >= cutoff).length;
  const weeks = windowDays / 7;
  return weeks > 0 ? inWindow / weeks : 0;
}

export function computeAvgViews(views: number[]): number {
  if (views.length === 0) return 0;
  return views.reduce((a, b) => a + b, 0) / views.length;
}

export function computeOutlierRate(videoViews: number[], avgViews: number, multiplier: number): number {
  if (videoViews.length === 0 || avgViews <= 0) return 0;
  const threshold = avgViews * multiplier;
  const outliers = videoViews.filter((v) => v >= threshold).length;
  return outliers / videoViews.length;
}

export function computeGrowthFraction(current: number, past: number | null | undefined): number | null {
  if (past === null || past === undefined || past <= 0) return null;
  return (current - past) / past;
}

export interface AutoAddInput {
  subscriberCount: number;
  uploadCadencePerWeek: number;
  outlierRate: number;
  subs30dAgo: number | null;
  atCap: boolean;
}

export interface AutoAddDecision {
  add: boolean;
  source: 'auto_outlier' | 'auto_breakout' | null;
}

const SUB_MIN = 5_000;
const SUB_MAX = 500_000;
const MIN_CADENCE = 1;
const MIN_OUTLIER_RATE = 0.1;
const BREAKOUT_MULTIPLE = 2;

export function evaluateAutoAdd(input: AutoAddInput): AutoAddDecision {
  if (input.atCap) return { add: false, source: null };
  const inRange = input.subscriberCount >= SUB_MIN && input.subscriberCount <= SUB_MAX;
  if (!inRange) return { add: false, source: null };

  if (input.uploadCadencePerWeek >= MIN_CADENCE && input.outlierRate >= MIN_OUTLIER_RATE) {
    return { add: true, source: 'auto_outlier' };
  }
  if (input.subs30dAgo !== null && input.subs30dAgo > 0 && input.subscriberCount >= input.subs30dAgo * BREAKOUT_MULTIPLE) {
    return { add: true, source: 'auto_breakout' };
  }
  return { add: false, source: null };
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx vitest run src/tests/lib/ingestion/watch-list-math.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingestion/watch-list-math.ts src/tests/lib/ingestion/watch-list-math.test.ts
git commit -m "feat(ingest): watch-list math (cadence, outliers, growth, auto-add)"
```

---

## Task 11: Watch-list-sync adapter + cron

**Files:**
- Create: `src/lib/ingestion/watch-list-sync.ts`
- Create: `src/app/api/cron/watch-list-sync/route.ts`
- Test: `src/tests/lib/ingestion/watch-list-sync.test.ts`

The adapter runs four guarded phases over the active watch-list. Each external/repo dependency is injected so the test drives it with fakes.

- [ ] **Step 1: Write the failing adapter test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { runWatchListSync } from '@/lib/ingestion/watch-list-sync';

const now = new Date('2026-05-28T00:00:00Z');

function baseDeps() {
  return {
    apiKey: 'k',
    now,
    activeChannels: [{ channel_id: 'UC1', uploads_playlist_id: 'UU1' }],
    client: {
      fetchChannels: vi.fn(async () => [{ channelId: 'UC1', title: 'C1', handle: '@c1', thumbnailUrl: null, subscriberCount: 50000, videoCount: 100, viewCount: 1_000_000, uploadsPlaylistId: 'UU1' }]),
      fetchPlaylistItems: vi.fn(async () => [{ videoId: 'v1', publishedAt: '2026-05-27T00:00:00Z' }]),
      fetchVideosByIds: vi.fn(async () => [{ videoId: 'v1', title: 'V1', description: 'd', tags: [], channelId: 'UC1', channelTitle: 'C1', publishedAt: '2026-05-27T00:00:00Z', views: 9000, likes: 10, comments: 1, durationSeconds: 40, thumbnailUrl: null }]),
    },
    repo: {
      insertVelocitySnapshot: vi.fn(async () => {}),
      upsertObservation: vi.fn(async () => {}),
      insertChannelStatSnapshot: vi.fn(async () => {}),
      getSnapshotNearestTo: vi.fn(async () => null),
      updateWatchedChannelSnapshot: vi.fn(async () => {}),
      listRecentObservationChannelIds: vi.fn(async () => ['UC2']),
      isWatched: vi.fn(async () => false),
      countActive: vi.fn(async () => 5),
      upsertWatchedChannel: vi.fn(async () => {}),
      evictInactive: vi.fn(async () => 0),
    },
  };
}

describe('runWatchListSync', () => {
  it('snapshots velocity, enriches stats, and reports counts', async () => {
    const deps = baseDeps();
    const result = await runWatchListSync(deps);
    expect(deps.repo.insertVelocitySnapshot).toHaveBeenCalledWith(expect.objectContaining({ videoId: 'v1', viewCount: 9000 }));
    expect(deps.repo.insertChannelStatSnapshot).toHaveBeenCalledWith(expect.objectContaining({ channelId: 'UC1', subscriberCount: 50000 }));
    expect(deps.repo.updateWatchedChannelSnapshot).toHaveBeenCalled();
    expect(result.ingested).toBeGreaterThanOrEqual(1);
  });

  it('auto-adds a qualifying newly-observed channel', async () => {
    const deps = baseDeps();
    // UC2 newly observed; resolve it as an outlier candidate
    deps.client.fetchChannels = vi.fn(async (p: { channelIds: string[] }) => p.channelIds.map((id) => ({
      channelId: id, title: id, handle: null, thumbnailUrl: null, subscriberCount: 50000, videoCount: 30, viewCount: 500000, uploadsPlaylistId: `UU_${id}`,
    })));
    deps.client.fetchPlaylistItems = vi.fn(async () => Array.from({ length: 8 }, (_, i) => ({ videoId: `nv${i}`, publishedAt: '2026-05-25T00:00:00Z' })));
    deps.client.fetchVideosByIds = vi.fn(async (p: { videoIds: string[] }) => p.videoIds.map((id, i) => ({
      videoId: id, title: id, description: '', tags: [], channelId: 'UC2', channelTitle: 'UC2', publishedAt: '2026-05-25T00:00:00Z',
      views: i === 0 ? 100000 : 1000, likes: 0, comments: 0, durationSeconds: 30, thumbnailUrl: null,
    })));
    await runWatchListSync(deps);
    expect(deps.repo.upsertWatchedChannel).toHaveBeenCalledWith(expect.objectContaining({ channelId: 'UC2', discoverySource: 'auto_outlier' }));
  });

  it('still enriches when velocity for one channel throws (partial)', async () => {
    const deps = baseDeps();
    deps.client.fetchPlaylistItems = vi.fn(async () => { throw new Error('quota'); });
    const result = await runWatchListSync(deps);
    expect(result.partial).toBe(true);
    expect(deps.repo.insertChannelStatSnapshot).toHaveBeenCalled(); // enrichment still ran
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/tests/lib/ingestion/watch-list-sync.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the adapter**

```ts
import 'server-only';
import { YOUTUBE_QUOTA_COST, type YouTubeChannel, type YouTubeVideoDetail } from '@/lib/clients/youtube';
import type { AdapterResult } from '@/lib/ingestion/run';
import {
  computeUploadCadencePerWeek, computeAvgViews, computeOutlierRate,
  computeGrowthFraction, evaluateAutoAdd,
} from '@/lib/ingestion/watch-list-math';

const ACTIVE_CHANNEL_CAP = 1000;
const MS_PER_DAY = 86_400_000;

export interface WatchListSyncClient {
  fetchChannels(params: { apiKey: string; channelIds: string[] }): Promise<YouTubeChannel[]>;
  fetchPlaylistItems(params: { apiKey: string; playlistId: string; maxResults?: number }): Promise<Array<{ videoId: string; publishedAt: string }>>;
  fetchVideosByIds(params: { apiKey: string; videoIds: string[] }): Promise<YouTubeVideoDetail[]>;
}

export interface WatchListSyncRepo {
  insertVelocitySnapshot(params: { videoId: string; viewCount: number; likeCount: number; commentCount: number }): Promise<void>;
  upsertObservation(params: {
    videoId: string; source: 'youtube_watch_list'; channelId: string | null; channelSubscriberCount: number | null;
    title: string; description: string | null; tags: unknown[]; thumbnailUrl: string | null;
    durationSeconds: number | null; publishedAt: Date | null; viewCount: number; likeCount: number; commentCount: number;
  }): Promise<void>;
  insertChannelStatSnapshot(params: { channelId: string; subscriberCount: number; videoCount: number | null; viewCount: number | null }): Promise<void>;
  getSnapshotNearestTo(params: { channelId: string; targetDate: Date }): Promise<{ subscriber_count: number } | null>;
  updateWatchedChannelSnapshot(params: {
    channelId: string; currentSubscriberCount: number; subscriberGrowth30d: number | null;
    subscriberGrowth90d: number | null; outlierRate60d: number | null; uploadCadencePerWeek: number | null; lastSnapshottedAt: Date;
  }): Promise<void>;
  listRecentObservationChannelIds(params: { sinceHours: number }): Promise<string[]>;
  isWatched(channelId: string): Promise<boolean>;
  countActive(): Promise<number>;
  upsertWatchedChannel(params: {
    channelId: string; channelHandle: string | null; channelTitle: string | null; channelThumbnailUrl: string | null;
    subscriberCountAtAdd: number; currentSubscriberCount: number; uploadCadencePerWeek: number; outlierRate60d: number;
    discoverySource: 'auto_outlier' | 'auto_breakout';
  }): Promise<void>;
  evictInactive(cutoff: Date): Promise<number>;
}

export interface ActiveChannelRow {
  channel_id: string;
  uploads_playlist_id: string | null;
}

/** Pull recent uploads' stats for a channel; returns the video details + upload dates. */
async function channelRecentVideos(
  client: WatchListSyncClient, apiKey: string, uploadsPlaylistId: string,
): Promise<{ videos: YouTubeVideoDetail[]; quota: number }> {
  const items = await client.fetchPlaylistItems({ apiKey, playlistId: uploadsPlaylistId, maxResults: 30 });
  let quota = YOUTUBE_QUOTA_COST.playlistItems;
  if (items.length === 0) return { videos: [], quota };
  const videos = await client.fetchVideosByIds({ apiKey, videoIds: items.map((i) => i.videoId) });
  quota += Math.ceil(items.length / 50) * YOUTUBE_QUOTA_COST.videosList;
  return { videos, quota };
}

export async function runWatchListSync(args: {
  client: WatchListSyncClient;
  repo: WatchListSyncRepo;
  activeChannels: ActiveChannelRow[];
  apiKey: string;
  now?: Date;
}): Promise<AdapterResult> {
  const { client, repo, activeChannels, apiKey } = args;
  const now = args.now ?? new Date();
  let ingested = 0;
  let skipped = 0;
  let quotaUnits = 0;
  let failures = 0;

  // Phase 1: velocity snapshots (recent uploads, last 7d) for active channels.
  const sevenDaysAgo = now.getTime() - 7 * MS_PER_DAY;
  for (const ch of activeChannels) {
    if (!ch.uploads_playlist_id) { skipped++; continue; }
    try {
      const { videos, quota } = await channelRecentVideos(client, apiKey, ch.uploads_playlist_id);
      quotaUnits += quota;
      for (const v of videos) {
        const published = v.publishedAt ? new Date(v.publishedAt).getTime() : 0;
        if (published < sevenDaysAgo) continue;
        await repo.insertVelocitySnapshot({ videoId: v.videoId, viewCount: v.views, likeCount: v.likes, commentCount: v.comments });
        await repo.upsertObservation({
          videoId: v.videoId, source: 'youtube_watch_list', channelId: v.channelId || null, channelSubscriberCount: null,
          title: v.title, description: v.description || null, tags: v.tags, thumbnailUrl: v.thumbnailUrl,
          durationSeconds: v.durationSeconds, publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
          viewCount: v.views, likeCount: v.likes, commentCount: v.comments,
        });
        ingested++;
      }
    } catch { failures++; }
  }

  // Phase 2: channel-stat enrichment for active channels.
  try {
    const channels = await client.fetchChannels({ apiKey, channelIds: activeChannels.map((c) => c.channel_id) });
    quotaUnits += Math.ceil(activeChannels.length / 50) * YOUTUBE_QUOTA_COST.channelsList;
    for (const c of channels) {
      try {
        await repo.insertChannelStatSnapshot({ channelId: c.channelId, subscriberCount: c.subscriberCount, videoCount: c.videoCount, viewCount: c.viewCount });
        const snap30 = await repo.getSnapshotNearestTo({ channelId: c.channelId, targetDate: new Date(now.getTime() - 30 * MS_PER_DAY) });
        const snap90 = await repo.getSnapshotNearestTo({ channelId: c.channelId, targetDate: new Date(now.getTime() - 90 * MS_PER_DAY) });
        let outlierRate60d: number | null = null;
        let cadence: number | null = null;
        if (c.uploadsPlaylistId) {
          try {
            const { videos, quota } = await channelRecentVideos(client, apiKey, c.uploadsPlaylistId);
            quotaUnits += quota;
            const avg = computeAvgViews(videos.map((v) => v.views));
            outlierRate60d = computeOutlierRate(videos.map((v) => v.views), avg, 3);
            cadence = computeUploadCadencePerWeek(videos.map((v) => new Date(v.publishedAt)), 30, now);
          } catch { failures++; }
        }
        await repo.updateWatchedChannelSnapshot({
          channelId: c.channelId, currentSubscriberCount: c.subscriberCount,
          subscriberGrowth30d: computeGrowthFraction(c.subscriberCount, snap30?.subscriber_count ?? null),
          subscriberGrowth90d: computeGrowthFraction(c.subscriberCount, snap90?.subscriber_count ?? null),
          outlierRate60d, uploadCadencePerWeek: cadence, lastSnapshottedAt: now,
        });
      } catch { failures++; }
    }
  } catch { failures++; }

  // Phase 3: auto-discovery of newly-observed channels.
  try {
    const candidateIds = await repo.listRecentObservationChannelIds({ sinceHours: 48 });
    for (const channelId of candidateIds) {
      try {
        if (await repo.isWatched(channelId)) continue;
        const [channel] = await client.fetchChannels({ apiKey, channelIds: [channelId] });
        quotaUnits += YOUTUBE_QUOTA_COST.channelsList;
        if (!channel) { skipped++; continue; }
        let outlierRate = 0;
        let cadence = 0;
        if (channel.uploadsPlaylistId) {
          const { videos, quota } = await channelRecentVideos(client, apiKey, channel.uploadsPlaylistId);
          quotaUnits += quota;
          const avg = computeAvgViews(videos.map((v) => v.views));
          outlierRate = computeOutlierRate(videos.map((v) => v.views), avg, 3);
          cadence = computeUploadCadencePerWeek(videos.map((v) => new Date(v.publishedAt)), 30, now);
        }
        const snap30 = await repo.getSnapshotNearestTo({ channelId, targetDate: new Date(now.getTime() - 30 * MS_PER_DAY) });
        const atCap = (await repo.countActive()) >= ACTIVE_CHANNEL_CAP;
        const decision = evaluateAutoAdd({
          subscriberCount: channel.subscriberCount, uploadCadencePerWeek: cadence, outlierRate,
          subs30dAgo: snap30?.subscriber_count ?? null, atCap,
        });
        if (decision.add && decision.source) {
          await repo.upsertWatchedChannel({
            channelId, channelHandle: channel.handle, channelTitle: channel.title, channelThumbnailUrl: channel.thumbnailUrl,
            subscriberCountAtAdd: channel.subscriberCount, currentSubscriberCount: channel.subscriberCount,
            uploadCadencePerWeek: cadence, outlierRate60d: outlierRate, discoverySource: decision.source,
          });
        }
      } catch { failures++; }
    }
  } catch { failures++; }

  // Phase 4: evict channels stale >90d.
  try {
    await repo.evictInactive(new Date(now.getTime() - 90 * MS_PER_DAY));
  } catch { failures++; }

  return { ingested, skipped, quotaUnits, partial: failures > 0, context: { failures } };
}
```

- [ ] **Step 4: Run adapter test to confirm it passes**

Run: `npx vitest run src/tests/lib/ingestion/watch-list-sync.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the cron route**

The route assembles the `repo` object from existing helpers. Note `listRecentObservationChannelIds`, `isWatched`, and `countActive` are small inline queries against the untyped client (no new repo file needed — they're route-local helpers over `shorts_observations` / `watched_channels`).

```ts
import { NextResponse } from 'next/server';
import { assertCronAuth, scraperLog, serializeError } from '@/lib/scrapers/shared';
import { loadEnv } from '@/lib/env';
import { getServiceClient } from '@/lib/supabase/server';
import { fetchChannels, fetchPlaylistItems, fetchVideosByIds } from '@/lib/clients/youtube';
import { upsertShortsObservation } from '@/lib/supabase/repositories/shorts-observations';
import { insertVelocitySnapshot } from '@/lib/supabase/repositories/video-velocity-snapshots';
import { insertChannelStatSnapshot, getSnapshotNearestTo } from '@/lib/supabase/repositories/channel-stat-snapshots';
import { listActiveWatchedChannels, updateWatchedChannelSnapshot, upsertWatchedChannel, evictInactiveWatchedChannels } from '@/lib/supabase/repositories/watched-channels';
import { runWithIngestionLog } from '@/lib/ingestion/run';
import { runWatchListSync, type ActiveChannelRow } from '@/lib/ingestion/watch-list-sync';

export const maxDuration = 300;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }

  const env = loadEnv();
  if (!env.YOUTUBE_API_KEY) return NextResponse.json({ error: 'YOUTUBE_API_KEY not set' }, { status: 500 });
  const supabase = getServiceClient();
  const apiKey = env.YOUTUBE_API_KEY;

  // Active channels need their uploads playlist id. We fetch it lazily inside the
  // adapter's enrichment via fetchChannels, but velocity needs it up front — so we
  // resolve uploads playlist ids for the active set first.
  const active = await listActiveWatchedChannels(supabase, 1000);
  const channels = await fetchChannels({ apiKey, channelIds: active.map((c) => c.channel_id) });
  const uploadsById = new Map(channels.map((c) => [c.channelId, c.uploadsPlaylistId]));
  const activeChannels: ActiveChannelRow[] = active.map((c) => ({ channel_id: c.channel_id, uploads_playlist_id: uploadsById.get(c.channel_id) ?? null }));

  try {
    const run = await runWithIngestionLog(supabase, 'watch_list_sync', () =>
      runWatchListSync({
        client: { fetchChannels, fetchPlaylistItems, fetchVideosByIds },
        apiKey,
        activeChannels,
        repo: {
          insertVelocitySnapshot: (p) => insertVelocitySnapshot(supabase, p).then(() => undefined),
          upsertObservation: (p) => upsertShortsObservation(supabase, p).then(() => undefined),
          insertChannelStatSnapshot: (p) => insertChannelStatSnapshot(supabase, p).then(() => undefined),
          getSnapshotNearestTo: (p) => getSnapshotNearestTo(supabase, p),
          updateWatchedChannelSnapshot: (p) => updateWatchedChannelSnapshot(supabase, p).then(() => undefined),
          listRecentObservationChannelIds: async ({ sinceHours }) => {
            const since = new Date(Date.now() - sinceHours * 3_600_000).toISOString();
            const { data, error } = await supabase.from('shorts_observations').select('channel_id').gte('observed_at', since).not('channel_id', 'is', null);
            if (error) throw new Error(`listRecentObservationChannelIds: ${error.message}`);
            return Array.from(new Set((data ?? []).map((r: { channel_id: string }) => r.channel_id)));
          },
          isWatched: async (channelId) => {
            const { data } = await supabase.from('watched_channels').select('channel_id').eq('channel_id', channelId).maybeSingle();
            return Boolean(data);
          },
          countActive: async () => {
            const { count } = await supabase.from('watched_channels').select('channel_id', { count: 'exact', head: true }).eq('is_active', true);
            return count ?? 0;
          },
          upsertWatchedChannel: (p) => upsertWatchedChannel(supabase, p).then(() => undefined),
          evictInactive: (cutoff) => evictInactiveWatchedChannels(supabase, cutoff),
        },
      }),
    );
    return NextResponse.json({ ok: true, ...scraperLog('watch-list-sync', { run }) });
  } catch (e) {
    console.error('watch-list-sync failed', e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirms `upsertWatchedChannel` / `updateWatchedChannelSnapshot` / `upsertShortsObservation` params line up with the adapter's repo interface.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/ingestion/watch-list-sync.ts src/app/api/cron/watch-list-sync/route.ts src/tests/lib/ingestion/watch-list-sync.test.ts
git commit -m "feat(ingest): watch-list-sync (velocity, enrichment, auto-discovery, eviction)"
```

---

## Task 12: Reddit topic-discovery adapter + cron

**Files:**
- Create: `src/lib/ingestion/reddit-topic-discovery.ts`
- Create: `src/app/api/cron/reddit-topic-discovery/route.ts`
- Test: `src/tests/lib/ingestion/reddit-topic-discovery.test.ts`

- [ ] **Step 1: Write the failing adapter test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { runRedditTopicDiscovery } from '@/lib/ingestion/reddit-topic-discovery';
import type { RedditPost } from '@/lib/clients/reddit';

function post(id: string): RedditPost {
  return {
    id, subreddit: 'todayilearned', title: `TIL ${id}`, selftext: 'body', permalink: `/r/x/${id}`,
    url: 'https://x', author: 'u', score: 1234, numComments: 56, createdUtc: 1700000000, upvoteRatio: 0.95,
    flair: null, isSelf: true, isVideo: false,
  };
}

describe('runRedditTopicDiscovery', () => {
  it('upserts a synthetic reddit observation per post', async () => {
    const upserts: Array<{ videoId: string; source: string; viewCount: number; commentCount: number }> = [];
    const client = { getTopPosts: vi.fn(async () => [post('abc')]) };
    const repo = { upsertObservation: vi.fn(async (p: { videoId: string; source: string; viewCount: number; commentCount: number }) => { upserts.push(p); }) };
    const result = await runRedditTopicDiscovery({ client, repo, subreddits: ['todayilearned'] });
    expect(upserts[0]).toMatchObject({ videoId: 'reddit:abc', source: 'reddit_topic', viewCount: 1234, commentCount: 56 });
    expect(result.ingested).toBe(1);
    expect(result.quotaUnits).toBe(0);
  });

  it('marks partial when a subreddit fetch throws', async () => {
    const client = { getTopPosts: vi.fn().mockResolvedValueOnce([post('a')]).mockRejectedValueOnce(new Error('429')) };
    const repo = { upsertObservation: vi.fn(async () => {}) };
    const result = await runRedditTopicDiscovery({ client, repo, subreddits: ['s1', 's2'] });
    expect(result.ingested).toBe(1);
    expect(result.partial).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/tests/lib/ingestion/reddit-topic-discovery.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the adapter**

```ts
import 'server-only';
import type { RedditPost } from '@/lib/clients/reddit';
import type { AdapterResult } from '@/lib/ingestion/run';

export interface RedditTopicClient {
  getTopPosts(subreddit: string, options?: { period?: 'week'; limit?: number }): Promise<RedditPost[]>;
}

export interface RedditTopicRepo {
  upsertObservation(params: {
    videoId: string; source: 'reddit_topic'; channelId: null; title: string;
    description: string | null; publishedAt: Date | null; viewCount: number; likeCount: number; commentCount: number;
  }): Promise<void>;
}

export async function runRedditTopicDiscovery(args: {
  client: RedditTopicClient;
  repo: RedditTopicRepo;
  subreddits: string[];
}): Promise<AdapterResult> {
  const { client, repo, subreddits } = args;
  let ingested = 0;
  let skipped = 0;
  let failedSubs = 0;

  for (const sub of subreddits) {
    try {
      const posts = await client.getTopPosts(sub, { period: 'week', limit: 25 });
      for (const p of posts) {
        if (!p.title) { skipped++; continue; }
        await repo.upsertObservation({
          videoId: `reddit:${p.id}`, source: 'reddit_topic', channelId: null, title: p.title,
          description: p.selftext ? p.selftext.slice(0, 2000) : null,
          publishedAt: p.createdUtc ? new Date(p.createdUtc * 1000) : null,
          viewCount: p.score, likeCount: 0, commentCount: p.numComments,
        });
        ingested++;
      }
    } catch {
      failedSubs++;
    }
  }
  return { ingested, skipped, quotaUnits: 0, partial: failedSubs > 0, context: { failedSubs } };
}
```

- [ ] **Step 4: Run adapter test to confirm it passes**

Run: `npx vitest run src/tests/lib/ingestion/reddit-topic-discovery.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement the cron route**

```ts
import { NextResponse } from 'next/server';
import { assertCronAuth, scraperLog, serializeError } from '@/lib/scrapers/shared';
import { getServiceClient } from '@/lib/supabase/server';
import { getTopPosts } from '@/lib/clients/reddit';
import { upsertShortsObservation } from '@/lib/supabase/repositories/shorts-observations';
import { runWithIngestionLog } from '@/lib/ingestion/run';
import { runRedditTopicDiscovery } from '@/lib/ingestion/reddit-topic-discovery';
import { REDDIT_SEED_SUBREDDITS } from '@/lib/ingestion/config';

export const maxDuration = 300;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }

  const supabase = getServiceClient();
  try {
    const run = await runWithIngestionLog(supabase, 'reddit_topic_discovery', () =>
      runRedditTopicDiscovery({
        client: { getTopPosts },
        repo: { upsertObservation: (p) => upsertShortsObservation(supabase, p).then(() => undefined) },
        subreddits: REDDIT_SEED_SUBREDDITS,
      }),
    );
    return NextResponse.json({ ok: true, ...scraperLog('reddit-topic-discovery', { run }) });
  } catch (e) {
    console.error('reddit-topic-discovery failed', e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` (expect no errors), then:

```bash
git add src/lib/ingestion/reddit-topic-discovery.ts src/app/api/cron/reddit-topic-discovery/route.ts src/tests/lib/ingestion/reddit-topic-discovery.test.ts
git commit -m "feat(ingest): reddit topic-discovery adapter + cron"
```

---

## Task 13: Google Trends adapter + cron (+ `google-trends-api`)

**Files:**
- Modify: `package.json` (add `google-trends-api`)
- Create: `src/types/google-trends-api.d.ts` (ambient types — the package ships none)
- Create: `src/lib/clients/google-trends.ts` (`TrendsClient` interface + real impl)
- Create: `src/lib/ingestion/google-trends.ts` (adapter)
- Create: `src/app/api/cron/google-trends/route.ts`
- Test: `src/tests/lib/ingestion/google-trends.test.ts`

- [ ] **Step 1: Add the dependency**

Run: `npm install google-trends-api`
Expected: `package.json` gains `"google-trends-api": "^4.x"`.

- [ ] **Step 2: Add ambient types**

Create `src/types/google-trends-api.d.ts`:

```ts
declare module 'google-trends-api' {
  export function dailyTrends(options: { geo: string; trendDate?: Date }): Promise<string>;
  const _default: { dailyTrends: typeof dailyTrends };
  export default _default;
}
```

- [ ] **Step 3: Write the failing adapter test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { runGoogleTrends, parseFormattedTraffic } from '@/lib/ingestion/google-trends';

describe('parseFormattedTraffic', () => {
  it('parses K/M suffixes', () => {
    expect(parseFormattedTraffic('200K+')).toBe(200000);
    expect(parseFormattedTraffic('1M+')).toBe(1000000);
    expect(parseFormattedTraffic('500+')).toBe(500);
    expect(parseFormattedTraffic('')).toBe(0);
  });
});

describe('runGoogleTrends', () => {
  it('upserts a synthetic trends observation per trending search', async () => {
    const upserts: Array<{ videoId: string; source: string; title: string; viewCount: number }> = [];
    const client = {
      dailyTrends: vi.fn(async () => [
        { title: 'Volcano eruption', traffic: '200K+', relatedQueries: ['lava', 'iceland'] },
      ]),
    };
    const repo = { upsertObservation: vi.fn(async (p: { videoId: string; source: string; title: string; viewCount: number }) => { upserts.push(p); }) };
    const result = await runGoogleTrends({ client, repo, geo: 'US' });
    expect(upserts[0]).toMatchObject({ videoId: 'gtrends:US:volcano-eruption', source: 'google_trends', title: 'Volcano eruption', viewCount: 200000 });
    expect(result.ingested).toBe(1);
  });

  it('marks failed (caught) status when the client throws', async () => {
    const client = { dailyTrends: vi.fn(async () => { throw new Error('scraper broke'); }) };
    const repo = { upsertObservation: vi.fn(async () => {}) };
    const result = await runGoogleTrends({ client, repo, geo: 'US' });
    expect(result.status).toBe('failed');
    expect(result.ingested).toBe(0);
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `npx vitest run src/tests/lib/ingestion/google-trends.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement the client wrapper**

Create `src/lib/clients/google-trends.ts`:

```ts
import googleTrends from 'google-trends-api';

export interface TrendingSearch {
  title: string;
  traffic: string;
  relatedQueries: string[];
}

export interface TrendsClient {
  dailyTrends(params: { geo: string }): Promise<TrendingSearch[]>;
}

interface RawDailyTrends {
  default?: {
    trendingSearchesDays?: Array<{
      trendingSearches?: Array<{
        title?: { query?: string };
        formattedTraffic?: string;
        relatedQueries?: Array<{ query?: string }>;
      }>;
    }>;
  };
}

export const realTrendsClient: TrendsClient = {
  async dailyTrends({ geo }) {
    const raw = await googleTrends.dailyTrends({ geo });
    const parsed = JSON.parse(raw) as RawDailyTrends;
    const days = parsed.default?.trendingSearchesDays ?? [];
    const out: TrendingSearch[] = [];
    for (const day of days) {
      for (const s of day.trendingSearches ?? []) {
        const title = s.title?.query;
        if (!title) continue;
        out.push({
          title,
          traffic: s.formattedTraffic ?? '',
          relatedQueries: (s.relatedQueries ?? []).map((q) => q.query ?? '').filter(Boolean),
        });
      }
    }
    return out;
  },
};
```

- [ ] **Step 6: Implement the adapter**

Create `src/lib/ingestion/google-trends.ts`:

```ts
import 'server-only';
import type { TrendsClient } from '@/lib/clients/google-trends';
import type { AdapterResult } from '@/lib/ingestion/run';

export function parseFormattedTraffic(formatted: string): number {
  const m = formatted.trim().match(/^([\d.]+)\s*([KM]?)\+?$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const mult = m[2].toUpperCase() === 'M' ? 1_000_000 : m[2].toUpperCase() === 'K' ? 1_000 : 1;
  return Math.round(n * mult);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export interface GoogleTrendsRepo {
  upsertObservation(params: {
    videoId: string; source: 'google_trends'; channelId: null; title: string;
    description: string | null; viewCount: number; likeCount: number; commentCount: number;
  }): Promise<void>;
}

export async function runGoogleTrends(args: {
  client: TrendsClient;
  repo: GoogleTrendsRepo;
  geo: string;
}): Promise<AdapterResult> {
  const { client, repo, geo } = args;
  let searches;
  try {
    searches = await client.dailyTrends({ geo });
  } catch {
    // Unofficial scraper — a break degrades to a failed run, never a thrown cron.
    return { ingested: 0, skipped: 0, quotaUnits: 0, status: 'failed', context: { reason: 'dailyTrends_failed' } };
  }
  let ingested = 0;
  for (const s of searches) {
    await repo.upsertObservation({
      videoId: `gtrends:${geo}:${slugify(s.title)}`, source: 'google_trends', channelId: null, title: s.title,
      description: s.relatedQueries.length ? s.relatedQueries.join(', ') : null,
      viewCount: parseFormattedTraffic(s.traffic), likeCount: 0, commentCount: 0,
    });
    ingested++;
  }
  return { ingested, skipped: 0, quotaUnits: 0, context: { count: ingested } };
}
```

- [ ] **Step 7: Run adapter test to confirm it passes**

Run: `npx vitest run src/tests/lib/ingestion/google-trends.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Implement the cron route**

```ts
import { NextResponse } from 'next/server';
import { assertCronAuth, scraperLog, serializeError } from '@/lib/scrapers/shared';
import { getServiceClient } from '@/lib/supabase/server';
import { realTrendsClient } from '@/lib/clients/google-trends';
import { upsertShortsObservation } from '@/lib/supabase/repositories/shorts-observations';
import { runWithIngestionLog } from '@/lib/ingestion/run';
import { runGoogleTrends } from '@/lib/ingestion/google-trends';
import { GOOGLE_TRENDS_GEO } from '@/lib/ingestion/config';

export const maxDuration = 300;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }

  const supabase = getServiceClient();
  try {
    const run = await runWithIngestionLog(supabase, 'google_trends', () =>
      runGoogleTrends({
        client: realTrendsClient,
        repo: { upsertObservation: (p) => upsertShortsObservation(supabase, p).then(() => undefined) },
        geo: GOOGLE_TRENDS_GEO,
      }),
    );
    return NextResponse.json({ ok: true, ...scraperLog('google-trends', { run }) });
  } catch (e) {
    console.error('google-trends failed', e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
```

- [ ] **Step 9: Typecheck + commit**

Run: `npx tsc --noEmit` (expect no errors), then:

```bash
git add package.json package-lock.json src/types/google-trends-api.d.ts src/lib/clients/google-trends.ts src/lib/ingestion/google-trends.ts src/app/api/cron/google-trends/route.ts src/tests/lib/ingestion/google-trends.test.ts
git commit -m "feat(ingest): google-trends adapter + cron"
```

---

## Task 14: TikTok Creative Center stub adapter + cron

**Files:**
- Create: `src/lib/ingestion/tiktok-creative-center.ts`
- Create: `src/app/api/cron/tiktok-creative-center/route.ts`
- Test: `src/tests/lib/ingestion/tiktok-creative-center.test.ts`

Disabled by design — a Vercel cron can't drive Chrome MCP. Ships the adapter contract returning a clean `skipped` run so freshness tracking shows the source as intentionally idle, not broken. Real ingest slots in later without reshaping the pipeline.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { runTikTokCreativeCenter } from '@/lib/ingestion/tiktok-creative-center';

describe('runTikTokCreativeCenter', () => {
  it('returns a disabled skipped result', async () => {
    const result = await runTikTokCreativeCenter();
    expect(result).toEqual({
      ingested: 0, skipped: 0, quotaUnits: 0, status: 'skipped',
      context: { reason: 'tiktok_disabled_pending_chrome_mcp' },
    });
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/tests/lib/ingestion/tiktok-creative-center.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the stub**

```ts
import 'server-only';
import type { AdapterResult } from '@/lib/ingestion/run';

/**
 * TikTok Creative Center is spec'd as a Chrome-MCP web scrape, which a Vercel
 * cron cannot drive. This adapter is intentionally DISABLED: it records a clean
 * `skipped` run so /admin/ingestion-health shows the source as idle-by-design,
 * not failing. Real ingest (operator-driven Chrome MCP, or a TOS-compliant data
 * path) slots in here later without changing the cron wiring.
 */
export async function runTikTokCreativeCenter(): Promise<AdapterResult> {
  return {
    ingested: 0,
    skipped: 0,
    quotaUnits: 0,
    status: 'skipped',
    context: { reason: 'tiktok_disabled_pending_chrome_mcp' },
  };
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx vitest run src/tests/lib/ingestion/tiktok-creative-center.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Implement the cron route**

```ts
import { NextResponse } from 'next/server';
import { assertCronAuth, scraperLog, serializeError } from '@/lib/scrapers/shared';
import { getServiceClient } from '@/lib/supabase/server';
import { runWithIngestionLog } from '@/lib/ingestion/run';
import { runTikTokCreativeCenter } from '@/lib/ingestion/tiktok-creative-center';

export const maxDuration = 300;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }

  const supabase = getServiceClient();
  try {
    const run = await runWithIngestionLog(supabase, 'tiktok_creative_center', () => runTikTokCreativeCenter());
    return NextResponse.json({ ok: true, ...scraperLog('tiktok-creative-center', { run }) });
  } catch (e) {
    console.error('tiktok-creative-center failed', e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` (expect no errors), then:

```bash
git add src/lib/ingestion/tiktok-creative-center.ts src/app/api/cron/tiktok-creative-center/route.ts src/tests/lib/ingestion/tiktok-creative-center.test.ts
git commit -m "feat(ingest): tiktok creative-center disabled stub + cron"
```

---

## Task 15: `POST /api/watch-list/channels`

**Files:**
- Create: `src/app/api/watch-list/channels/route.ts`
- Test: `src/tests/api/watch-list-channels.test.ts`

Mirrors the `/api/lab/schedule` convention: Zod body → 400, `force-dynamic`, no inline session check.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/env', () => ({ loadEnv: () => ({ YOUTUBE_API_KEY: 'k' }) }));
vi.mock('@/lib/clients/youtube', () => ({ resolveChannel: vi.fn() }));
vi.mock('@/lib/supabase/repositories/watched-channels', () => ({ upsertWatchedChannel: vi.fn() }));

import { POST } from '@/app/api/watch-list/channels/route';
import { getServiceClient } from '@/lib/supabase/server';
import { resolveChannel } from '@/lib/clients/youtube';
import { upsertWatchedChannel } from '@/lib/supabase/repositories/watched-channels';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServiceClient).mockReturnValue({} as never);
});

function reqWith(body: unknown) {
  return new Request('http://x/api/watch-list/channels', { method: 'POST', body: JSON.stringify(body) });
}

describe('POST /api/watch-list/channels', () => {
  it('400 on bad body', async () => {
    expect((await POST(reqWith({}))).status).toBe(400);
  });
  it('400 when channel cannot be resolved', async () => {
    vi.mocked(resolveChannel).mockResolvedValue(null);
    expect((await POST(reqWith({ urlOrHandle: 'nope' }))).status).toBe(400);
  });
  it('201 + upserts as manual on success', async () => {
    vi.mocked(resolveChannel).mockResolvedValue({ channelId: 'UC1', title: 'C1', handle: '@c1', thumbnailUrl: null, subscriberCount: 12000, videoCount: 10, viewCount: 1000, uploadsPlaylistId: 'UU1' });
    vi.mocked(upsertWatchedChannel).mockResolvedValue({ channel_id: 'UC1' } as never);
    const res = await POST(reqWith({ urlOrHandle: 'https://youtube.com/channel/UC1' }));
    expect(res.status).toBe(201);
    expect(vi.mocked(upsertWatchedChannel)).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ channelId: 'UC1', discoverySource: 'manual' }));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/tests/api/watch-list-channels.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the route**

```ts
import 'server-only';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server';
import { loadEnv } from '@/lib/env';
import { resolveChannel } from '@/lib/clients/youtube';
import { upsertWatchedChannel } from '@/lib/supabase/repositories/watched-channels';

const BodySchema = z.object({ urlOrHandle: z.string().min(1) });

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body;
  try { body = BodySchema.parse(await req.json()); }
  catch (err) { return Response.json({ error: err instanceof Error ? err.message : 'bad body' }, { status: 400 }); }

  const env = loadEnv();
  if (!env.YOUTUBE_API_KEY) return Response.json({ error: 'YOUTUBE_API_KEY not set' }, { status: 500 });

  const channel = await resolveChannel({ apiKey: env.YOUTUBE_API_KEY, urlOrHandle: body.urlOrHandle });
  if (!channel) return Response.json({ error: 'channel_not_found' }, { status: 400 });

  const supabase = getServiceClient();
  const row = await upsertWatchedChannel(supabase, {
    channelId: channel.channelId,
    channelHandle: channel.handle,
    channelTitle: channel.title,
    channelThumbnailUrl: channel.thumbnailUrl,
    subscriberCountAtAdd: channel.subscriberCount,
    currentSubscriberCount: channel.subscriberCount,
    discoverySource: 'manual',
  });
  return Response.json({ ok: true, channel: row }, { status: 201 });
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx vitest run src/tests/api/watch-list-channels.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/watch-list/channels/route.ts src/tests/api/watch-list-channels.test.ts
git commit -m "feat(ingest): POST /api/watch-list/channels (manual seed)"
```

---

## Task 16: `POST /api/watch-list/competitors`

**Files:**
- Create: `src/app/api/watch-list/competitors/route.ts`
- Test: `src/tests/api/watch-list-competitors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/env', () => ({ loadEnv: () => ({ YOUTUBE_API_KEY: 'k' }) }));
vi.mock('@/lib/clients/youtube', () => ({ resolveChannel: vi.fn() }));
vi.mock('@/lib/supabase/repositories/competitor-channels', () => ({ addCompetitorChannel: vi.fn() }));

import { POST } from '@/app/api/watch-list/competitors/route';
import { getServiceClient } from '@/lib/supabase/server';
import { resolveChannel } from '@/lib/clients/youtube';
import { addCompetitorChannel } from '@/lib/supabase/repositories/competitor-channels';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServiceClient).mockReturnValue({} as never);
});

function reqWith(body: unknown) {
  return new Request('http://x/api/watch-list/competitors', { method: 'POST', body: JSON.stringify(body) });
}

describe('POST /api/watch-list/competitors', () => {
  it('400 on bad body', async () => {
    expect((await POST(reqWith({}))).status).toBe(400);
  });
  it('400 when channel cannot be resolved', async () => {
    vi.mocked(resolveChannel).mockResolvedValue(null);
    expect((await POST(reqWith({ urlOrHandle: 'nope' }))).status).toBe(400);
  });
  it('201 + adds competitor on success', async () => {
    vi.mocked(resolveChannel).mockResolvedValue({ channelId: 'UC9', title: 'Rival', handle: '@rival', thumbnailUrl: null, subscriberCount: 80000, videoCount: 50, viewCount: 5000, uploadsPlaylistId: 'UU9' });
    vi.mocked(addCompetitorChannel).mockResolvedValue({ channel_id: 'UC9' } as never);
    const res = await POST(reqWith({ urlOrHandle: '@rival' }));
    expect(res.status).toBe(201);
    expect(vi.mocked(addCompetitorChannel)).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ channelId: 'UC9', channelHandle: '@rival', channelTitle: 'Rival' }));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/tests/api/watch-list-competitors.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the route**

```ts
import 'server-only';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server';
import { loadEnv } from '@/lib/env';
import { resolveChannel } from '@/lib/clients/youtube';
import { addCompetitorChannel } from '@/lib/supabase/repositories/competitor-channels';

const BodySchema = z.object({ urlOrHandle: z.string().min(1) });

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body;
  try { body = BodySchema.parse(await req.json()); }
  catch (err) { return Response.json({ error: err instanceof Error ? err.message : 'bad body' }, { status: 400 }); }

  const env = loadEnv();
  if (!env.YOUTUBE_API_KEY) return Response.json({ error: 'YOUTUBE_API_KEY not set' }, { status: 500 });

  const channel = await resolveChannel({ apiKey: env.YOUTUBE_API_KEY, urlOrHandle: body.urlOrHandle });
  if (!channel) return Response.json({ error: 'channel_not_found' }, { status: 400 });

  const supabase = getServiceClient();
  const row = await addCompetitorChannel(supabase, {
    channelId: channel.channelId,
    channelHandle: channel.handle,
    channelTitle: channel.title,
  });
  return Response.json({ ok: true, competitor: row }, { status: 201 });
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx vitest run src/tests/api/watch-list-competitors.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/watch-list/competitors/route.ts src/tests/api/watch-list-competitors.test.ts
git commit -m "feat(ingest): POST /api/watch-list/competitors (manual seed)"
```

---

## Task 17: Register the six crons in `vercel.ts`

**Files:**
- Modify: `vercel.ts` (add to the `crons` array; leave the Plan #4 crons untouched)

- [ ] **Step 1: Add the Sub-phase C cron entries**

Insert these entries into the `crons: [ ... ]` array in `vercel.ts`, after the existing Plan #4 entries (before the closing `]`):

```ts
    // --- Plan #5 Phase 1 Sub-phase C (multi-source ingestion) ---
    { path: '/api/cron/youtube-category-sweep',  schedule: '0 */6 * * *'  }, // every 6h
    { path: '/api/cron/watch-list-sync',         schedule: '30 */6 * * *' }, // every 6h (offset)
    { path: '/api/cron/youtube-shorts-search',   schedule: '0 8 * * *'    }, // daily 08:00 UTC
    { path: '/api/cron/reddit-topic-discovery',  schedule: '0 9 * * *'    }, // daily 09:00 UTC
    { path: '/api/cron/google-trends',           schedule: '30 9 * * *'   }, // daily 09:30 UTC
    { path: '/api/cron/tiktok-creative-center',  schedule: '0 22 * * 0'   }, // weekly Sun 22:00 UTC (disabled stub)
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add vercel.ts
git commit -m "feat(ingest): register Sub-phase C ingestion crons in vercel.ts"
```

---

## Task 18: Apply migrations, regenerate types, full verification (ORCHESTRATOR-DRIVEN)

> **This task is run by the orchestrator (not a subagent), after branch review** — it touches the prod Supabase project. Subagents must stop after Task 17.

**Files:**
- Modify: `src/lib/supabase/types.ts` (regenerated)

- [ ] **Step 1: Apply both additive migrations to prod**

Via Supabase MCP `apply_migration` against project `jfmjppzjicvbpnlkmxbg`, in order:
1. `20260528000011_ingestion_runs` (contents of `supabase/migrations/20260528000011_ingestion_runs.sql`)
2. `20260528000012_channel_stat_snapshots` (contents of `supabase/migrations/20260528000012_channel_stat_snapshots.sql`)

Expected: both succeed; `list_tables` shows `ingestion_runs` and `channel_stat_snapshots`.

- [ ] **Step 2: Regenerate Supabase types**

Via Supabase MCP `generate_typescript_types`; write the output to `src/lib/supabase/types.ts`.
Expected: the new tables appear in the generated `Database` type.

- [ ] **Step 3: Full typecheck**

Run: `npx tsc --noEmit`
Expected: clean, no `any`.

- [ ] **Step 4: Full test suite**

Run: `npm test`
Expected: previous baseline (359) + the new Sub-phase C tests all pass; the only failures are the known 11 pre-existing env-gated integration tests (Supabase / AI gateway / env loader) — no new failures.

- [ ] **Step 5: Commit types regen**

```bash
git add src/lib/supabase/types.ts
git commit -m "chore(ingest): regenerate supabase types for ingestion_runs + channel_stat_snapshots"
```

- [ ] **Step 6: Push + open PR against `main`**

```bash
git push -u origin plan-5-phase-1-sub-c
```
Then open a PR against `main` summarizing the six ingestion crons, two new tables, repo additions, and the deferred classifier/clustering boundary.

- [ ] **Step 7: Live smoke (operator-gated, after Darius populates real secrets)**

With real `YOUTUBE_API_KEY` / `SUPABASE_*` / `REDDIT_USER_AGENT` in the deploy env, trigger each enabled cron once (via the Vercel dashboard or an authorized `curl` with the `CRON_SECRET` bearer) and confirm an `ingestion_runs` row per job plus rows landing in `shorts_observations` (and `video_velocity_snapshots` for watch-list). TikTok records `skipped`.

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task(s) |
|---|---|
| §2 cron topology / 6 crons | 8, 9, 11, 12, 13, 14, 17 |
| §3 synthetic-ID convention (Reddit/Trends) | 12, 13 |
| §4.1 `ingestion_runs` + repo + `runWithIngestionLog` | 1 |
| §4.2 `channel_stat_snapshots` + repo + bootstrap | 2, 11 |
| §5 YouTube client extensions (mostPopular, videos, channels, playlistItems, resolve) | 5, 6 |
| §6.1 category sweep (≤60s filter) | 8 |
| §6.2 shorts search (seed rotation) | 7, 9 |
| §6.3 watch-list sync (velocity, enrichment, auto-discovery, eviction) | 10, 11 |
| §6.4 reddit topic-discovery | 12 |
| §6.5 google trends (TrendsClient, swallowed break) | 13 |
| §6.6 tiktok disabled stub | 14 |
| §7 repo gaps (velocity, channel-stat, ingestion-runs, watched-channel update) | 1, 2, 3, 4 |
| §8 add-channel / add-competitor API | 15, 16 |
| §9 seed config | 7 |
| §10 resilience + quota (withRetry usage, per-source isolation, quota tally) | 5, 8, 9, 11 |
| §11 env (no schema change) | n/a (uses existing `loadEnv`) |
| §12 testing | every task |
| §13 file manifest | all |
| §14 success criteria | 18 |

**2. Placeholder scan:** No `TBD`/`TODO`/"handle edge cases"/"similar to Task N" — every code step contains complete code. ✓

**3. Type consistency check:**
- `AdapterResult` (Task 1) is the return type of every adapter (Tasks 8, 9, 11, 12, 13, 14). ✓
- `IngestionJob` union (Task 1) matches the `ingestion_runs.job` CHECK (Task 1 migration) and every `runWithIngestionLog(supabase, '<job>', ...)` call. ✓
- `YouTubeVideoDetail` (Task 5) is consumed by Tasks 8, 11; `YouTubeChannel` (Task 6) by Tasks 11, 15, 16; `YouTubeShortResult` (pre-existing) by Task 9. ✓
- `resolveChannel` (Task 6) returns `YouTubeChannel | null`; consumed by Tasks 15, 16 which read `.channelId/.handle/.title/.thumbnailUrl/.subscriberCount`. ✓
- Repo function names are stable across tasks: `upsertShortsObservation` (existing), `insertVelocitySnapshot` (Task 3), `insertChannelStatSnapshot`/`getSnapshotNearestTo` (Task 2), `updateWatchedChannelSnapshot` (Task 4), `upsertWatchedChannel`/`evictInactiveWatchedChannels`/`listActiveWatchedChannels` (existing), `addCompetitorChannel` (existing), `startIngestionRun`/`finishIngestionRun`/`listRecentRunsByJob` (Task 1). ✓
- `evaluateAutoAdd` returns `{ add, source }` (Task 10), consumed by Task 11. ✓

No gaps found.

---

**End of plan.**

