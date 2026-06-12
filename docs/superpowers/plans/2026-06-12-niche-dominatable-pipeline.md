# Dominatable-Niche Pipeline Productization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the cron pipeline produce dominatable longform niches automatically (subscriber-enriched, longform), feeding the real classify→cluster→score path, replacing the manual `seed-niches.mjs`.

**Architecture:** A new daily `youtube_dominatable_sweep` cron searches longform per dominatable seed, enriches via `channels.list` (subscriber count + channel age), and writes observations with `channel_subscriber_count` populated. The existing (unfiltered) classify→cluster→score pipeline then computes a real `firstMoverScore`. Phase 2 folds channel-age recency into the score. Full Mission Control wiring (ledger job, registry, cron).

**Tech Stack:** Next.js (App Router) cron routes, Supabase (Postgres), YouTube Data API v3, Vitest (TDD).

**Spec:** `docs/superpowers/specs/2026-06-12-niche-dominatable-pipeline-productization-design.md`

**Branch:** `feat/niche-dominatable-pipeline` (already created off `main`; the spec is committed there).

**Commands:** test a file = `npx vitest run <path>`; full suite = `npx vitest run`; typecheck = `npx tsc --noEmit` (expect `0` `error TS`).

---

## File Structure

- **Create** `supabase/migrations/<ts>_dominatable_sweep.sql` — 3 clauses (two CHECK redefs + one column).
- **Create** `src/lib/ingestion/youtube-dominatable-sweep.ts` — pure adapter `runDominatableSweep` (gate + enrichment).
- **Create** `src/app/api/cron/youtube-dominatable-sweep/route.ts` — cron route wrapping the adapter in `runWithIngestionLog`.
- **Create** tests: `src/tests/lib/ingestion/youtube-dominatable-sweep.test.ts`, `src/tests/lib/clients/youtube-search-longform.test.ts`, `src/tests/api/youtube-dominatable-sweep.test.ts`.
- **Modify** `src/lib/supabase/repositories/ingestion-runs.ts` — `IngestionJob` union.
- **Modify** `src/lib/supabase/repositories/shorts-observations.ts` — `ShortsObservationSource` union, upsert `channelPublishedAt`, `ClassifiedObservation` + select.
- **Modify** `src/lib/clustering/cluster.ts` — `BROAD_PUBLIC` set, `ClusterInputRow.channel_published_at`.
- **Modify** `src/lib/clients/youtube.ts` — `YouTubeChannel.publishedAt` + `mapChannelItem`, new `searchVideoIds`.
- **Modify** `src/lib/ingestion/config.ts` — `DOMINATABLE_SEEDS` + gate constants.
- **Modify** `src/lib/ingestion/cluster-niches.ts` — `toClusterRow` threads `channel_published_at`.
- **Modify** `src/lib/scoring/components.ts` — channel-age recency fold + explainability.
- **Modify** `vercel.ts` — cron entry.
- **Modify** `src/lib/assistants/registry.ts` — `niche_scout` `ingestionJobs` + `schedules`.

---

## Task 1: Bundled migration

**Files:** Create `supabase/migrations/<timestamp>_dominatable_sweep.sql` (timestamp = next in sequence, format `YYYYMMDDHHMMSS`, after `20260611000001`).

- [ ] **Step 1: Write the migration SQL**

```sql
-- Productize the dominatable-niche sweep:
--  1) let the new cron log to the ingestion_runs ledger (Mission Control reads it)
--  2) allow its observation source
--  3) capture channel age for the first-mover recency signal
alter table public.ingestion_runs drop constraint if exists ingestion_runs_job_check;
alter table public.ingestion_runs add constraint ingestion_runs_job_check
  check (job in (
    'youtube_category_sweep','youtube_shorts_search','watch_list_sync',
    'reddit_topic_discovery','google_trends','tiktok_creative_center',
    'classify_observations','cluster_niches','performance_sync',
    'youtube_dominatable_sweep'
  ));

alter table public.shorts_observations drop constraint if exists shorts_observations_source_check;
alter table public.shorts_observations add constraint shorts_observations_source_check
  check (source in (
    'youtube_most_popular','youtube_search','youtube_watch_list',
    'reddit_topic','tiktok_creative_center','google_trends',
    'youtube_dominatable'
  ));

alter table public.shorts_observations add column if not exists channel_published_at timestamptz;
```

- [ ] **Step 2: Apply to a Supabase branch and verify (NOT prod yet)**

Use the Supabase MCP `create_branch` then `apply_migration` on the branch, or `supabase db push` against a branch. Verify both constraints include the new values and the column exists:
```sql
select pg_get_constraintdef(oid) from pg_constraint where conname='ingestion_runs_job_check';
select pg_get_constraintdef(oid) from pg_constraint where conname='shorts_observations_source_check';
select 1 from information_schema.columns where table_name='shorts_observations' and column_name='channel_published_at';
```
Expected: both defs list the new value; the column query returns 1.

- [ ] **Step 3: STOP — request prod-migration OK from Darius before applying to prod.** (Standing rule: auto-mode blocks `apply_migration` to prod until Darius OKs in chat.) Do not proceed to apply on prod without it. The code tasks below can be built and tested against the branch meanwhile.

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/
git commit -m "feat(niches): migration — dominatable sweep ledger job, source, channel age column"
```

---

## Task 2: Extend the type unions (mirror the DB constraints)

**Files:** Modify `src/lib/supabase/repositories/ingestion-runs.ts:5-14`, `src/lib/supabase/repositories/shorts-observations.ts:4-10`, `src/lib/clustering/cluster.ts:32`.

- [ ] **Step 1: Add the ledger job to `IngestionJob`**

In `ingestion-runs.ts`, append to the union:
```ts
  | 'performance_sync'
  | 'youtube_dominatable_sweep';
```

- [ ] **Step 2: Add the observation source**

In `shorts-observations.ts`, append to `ShortsObservationSource`:
```ts
  | 'google_trends'
  | 'youtube_dominatable';
```

- [ ] **Step 3: Treat the new source as publicly-discovered (matches the seed's `discovery_state='public'`)**

In `cluster.ts:32`, add the source so its clusters are `public` not `pre_public`:
```ts
const BROAD_PUBLIC: ReadonlySet<ShortsObservationSource> = new Set(["youtube_most_popular", "google_trends", "youtube_dominatable"]);
```

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: `0` `error TS` lines (the unions resolve; no exhaustiveness breaks).

- [ ] **Step 5: Commit**
```bash
git add src/lib/supabase/repositories/ingestion-runs.ts src/lib/supabase/repositories/shorts-observations.ts src/lib/clustering/cluster.ts
git commit -m "feat(niches): register youtube_dominatable source + ledger job; treat as public"
```

---

## Task 3: Map channel `publishedAt` in the YouTube client

**Files:** Modify `src/lib/clients/youtube.ts` (`YouTubeChannel` type ~219, `RawChannelItem` ~230, `mapChannelItem` ~237). Test: `src/tests/lib/clients/youtube-channels.test.ts` (existing — add a case).

- [ ] **Step 1: Write the failing test**

Add to `src/tests/lib/clients/youtube-channels.test.ts` (mirror the existing `fetchChannels` test; assert the new field):
```ts
it('maps channel publishedAt (creation date) from snippet', async () => {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
    items: [{ id: 'UC1', snippet: { title: 'T', publishedAt: '2026-03-01T00:00:00Z' }, statistics: { subscriberCount: '100' } }],
  }), { status: 200 })) as never;
  const [c] = await fetchChannels({ apiKey: 'K', channelIds: ['UC1'] });
  expect(c.publishedAt).toBe('2026-03-01T00:00:00Z');
});
```
(Ensure `fetchChannels` is imported in the test file.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/lib/clients/youtube-channels.test.ts`
Expected: FAIL — `c.publishedAt` is `undefined` (property doesn't exist).

- [ ] **Step 3: Implement**

In `youtube.ts`: add `publishedAt: string | null;` to `YouTubeChannel`; add `publishedAt?: string;` to `RawChannelItem.snippet`; in `mapChannelItem` add `publishedAt: s.publishedAt ?? null,`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/lib/clients/youtube-channels.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/clients/youtube.ts src/tests/lib/clients/youtube-channels.test.ts
git commit -m "feat(youtube): expose channel publishedAt (creation date) on fetchChannels"
```

---

## Task 4: `searchVideoIds` longform search client

**Files:** Modify `src/lib/clients/youtube.ts`. Test: Create `src/tests/lib/clients/youtube-search-longform.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchVideoIds } from '@/lib/clients/youtube';
const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

describe('searchVideoIds', () => {
  it('queries search.list with the longform params and returns video ids', async () => {
    let url = '';
    globalThis.fetch = vi.fn(async (u: URL | string) => {
      url = String(u);
      return new Response(JSON.stringify({ items: [
        { id: { videoId: 'A' } }, { id: { videoId: 'B' } }, { id: {} },
      ] }), { status: 200 });
    }) as never;
    const ids = await searchVideoIds({ query: 'backyard birds', apiKey: 'K', videoDuration: 'medium', order: 'viewCount', publishedAfter: '2026-02-01T00:00:00Z', maxResults: 50 });
    const p = new URL(url).searchParams;
    expect(p.get('type')).toBe('video');
    expect(p.get('videoDuration')).toBe('medium');
    expect(p.get('order')).toBe('viewCount');
    expect(p.get('publishedAfter')).toBe('2026-02-01T00:00:00Z');
    expect(p.get('q')).toBe('backyard birds');
    expect(ids).toEqual(['A', 'B']);   // empty id objects dropped
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/lib/clients/youtube-search-longform.test.ts`
Expected: FAIL — `searchVideoIds` is not exported.

- [ ] **Step 3: Implement in `youtube.ts`**

```ts
export async function searchVideoIds(params: {
  query: string; apiKey: string;
  videoDuration?: 'short' | 'medium' | 'long' | 'any';
  order?: 'viewCount' | 'relevance' | 'date';
  publishedAfter?: string; regionCode?: string; relevanceLanguage?: string; maxResults?: number;
}): Promise<string[]> {
  const u = new URL('https://www.googleapis.com/youtube/v3/search');
  u.searchParams.set('part', 'id');
  u.searchParams.set('type', 'video');
  u.searchParams.set('q', params.query);
  u.searchParams.set('videoDuration', params.videoDuration ?? 'medium');
  u.searchParams.set('order', params.order ?? 'viewCount');
  if (params.publishedAfter) u.searchParams.set('publishedAfter', params.publishedAfter);
  u.searchParams.set('regionCode', params.regionCode ?? 'US');
  u.searchParams.set('relevanceLanguage', params.relevanceLanguage ?? 'en');
  u.searchParams.set('maxResults', String(params.maxResults ?? 50));
  u.searchParams.set('key', params.apiKey);
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`searchVideoIds: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { items?: Array<{ id?: { videoId?: string } }> };
  return (json.items ?? []).map((i) => i.id?.videoId).filter((v): v is string => !!v);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/lib/clients/youtube-search-longform.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/clients/youtube.ts src/tests/lib/clients/youtube-search-longform.test.ts
git commit -m "feat(youtube): searchVideoIds longform search helper"
```

---

## Task 5: Upsert `channelPublishedAt`

**Files:** Modify `src/lib/supabase/repositories/shorts-observations.ts` (`UpsertShortsObservationParams` ~30, upsert body ~53). Test: `src/tests/lib/supabase/*` if an observation-repo test exists; otherwise this is covered by Task 7's adapter test + tsc.

- [ ] **Step 1: Add the param + write the column**

In `UpsertShortsObservationParams` add `channelPublishedAt?: Date | null;`. In the upsert object add:
```ts
      channel_published_at: params.channelPublishedAt ? params.channelPublishedAt.toISOString() : null,
```
Also add `channel_published_at: string | null;` to the `ShortsObservation` interface.

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: `0` `error TS`.

- [ ] **Step 3: Commit**
```bash
git add src/lib/supabase/repositories/shorts-observations.ts
git commit -m "feat(niches): upsertShortsObservation writes channel_published_at"
```

---

## Task 6: `DOMINATABLE_SEEDS` + gate constants

**Files:** Modify `src/lib/ingestion/config.ts` (follow the `YOUTUBE_CATEGORIES` export pattern).

- [ ] **Step 1: Add the constants**

```ts
/** Seed queries for the dominatable longform sweep (from the proven seed-niches scan). */
export const DOMINATABLE_SEEDS: readonly string[] = [
  'ranked tier list', 'backyard birds', 'weird animals', 'deep sea creatures',
  'space facts', 'how it works', 'psychology facts', 'money mistakes',
  'the history of', 'what happens to your', 'unsolved mysteries', 'how the body works',
];

/** A video qualifies as a dominatable candidate when ALL hold (mirrors seed-niches). */
export const DOMINATABLE_GATE = {
  minDurationSeconds: 240,
  minViews: 300_000,
  minViewsToSubsRatio: 3,
  maxChannelAgeDays: 365,
  publishedWithinDays: 120,
} as const;
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: `0` `error TS`.

- [ ] **Step 3: Commit**
```bash
git add src/lib/ingestion/config.ts
git commit -m "feat(niches): dominatable seed list + gate constants"
```

---

## Task 7: `runDominatableSweep` adapter (core)

**Files:** Create `src/lib/ingestion/youtube-dominatable-sweep.ts`. Test: Create `src/tests/lib/ingestion/youtube-dominatable-sweep.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { runDominatableSweep } from '@/lib/ingestion/youtube-dominatable-sweep';
import type { YouTubeVideoDetail, YouTubeChannel } from '@/lib/clients/youtube';

function vid(p: Partial<YouTubeVideoDetail>): YouTubeVideoDetail {
  return { videoId: 'v', channelId: 'c', title: 't', description: '', tags: [], thumbnailUrl: null,
    durationSeconds: 500, publishedAt: '2026-05-01T00:00:00Z', views: 1_000_000, likes: 0, comments: 0, ...p };
}
function chan(p: Partial<YouTubeChannel>): YouTubeChannel {
  return { channelId: 'c', title: '', handle: null, thumbnailUrl: null, subscriberCount: 5000,
    videoCount: 0, viewCount: 0, uploadsPlaylistId: null, publishedAt: '2026-04-01T00:00:00Z', ...p };
}

describe('runDominatableSweep', () => {
  const now = new Date('2026-06-12T00:00:00Z');

  it('ingests a qualifying longform video with subscriber count + channel age enriched', async () => {
    const upserts: any[] = [];
    const client = {
      searchVideoIds: vi.fn(async () => ['v1']),
      fetchVideosByIds: vi.fn(async () => [vid({ videoId: 'v1', channelId: 'c1', views: 1_000_000, durationSeconds: 500 })]),
      fetchChannels: vi.fn(async () => [chan({ channelId: 'c1', subscriberCount: 5000, publishedAt: '2026-05-20T00:00:00Z' })]),
    };
    const repo = { upsertObservation: vi.fn(async (p: any) => { upserts.push(p); }) };
    const res = await runDominatableSweep({ client, repo, seeds: ['birds'], apiKey: 'K', now });
    expect(res.ingested).toBe(1);
    expect(upserts[0]).toMatchObject({ source: 'youtube_dominatable', channelSubscriberCount: 5000 });
    expect(upserts[0].channelPublishedAt instanceof Date).toBe(true);
  });

  it('skips a short (<240s), a low-view, an old-channel, and a low-ratio video', async () => {
    const client = {
      searchVideoIds: vi.fn(async () => ['a', 'b', 'd', 'e']),
      fetchVideosByIds: vi.fn(async () => [
        vid({ videoId: 'a', channelId: 'ca', durationSeconds: 60 }),               // too short
        vid({ videoId: 'b', channelId: 'cb', views: 1000 }),                        // too few views
        vid({ videoId: 'd', channelId: 'cd', views: 1_000_000 }),                   // old channel (below)
        vid({ videoId: 'e', channelId: 'ce', views: 1_000_000 }),                   // low ratio (below)
      ]),
      fetchChannels: vi.fn(async () => [
        chan({ channelId: 'ca', subscriberCount: 1000 }),
        chan({ channelId: 'cb', subscriberCount: 1000 }),
        chan({ channelId: 'cd', subscriberCount: 100, publishedAt: '2024-01-01T00:00:00Z' }), // >365d old
        chan({ channelId: 'ce', subscriberCount: 2_000_000 }),                                 // ratio 0.5
      ]),
    };
    const repo = { upsertObservation: vi.fn(async () => {}) };
    const res = await runDominatableSweep({ client, repo, seeds: ['x'], apiKey: 'K', now });
    expect(res.ingested).toBe(0);
    expect(res.skipped).toBe(4);
    expect(repo.upsertObservation).not.toHaveBeenCalled();
  });

  it('records quota and marks partial when a seed search fails', async () => {
    const client = {
      searchVideoIds: vi.fn(async () => { throw new Error('quota'); }),
      fetchVideosByIds: vi.fn(async () => []),
      fetchChannels: vi.fn(async () => []),
    };
    const repo = { upsertObservation: vi.fn(async () => {}) };
    const res = await runDominatableSweep({ client, repo, seeds: ['x'], apiKey: 'K', now });
    expect(res.partial).toBe(true);
    expect(res.quotaUnits).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/lib/ingestion/youtube-dominatable-sweep.test.ts`
Expected: FAIL — module not found / `runDominatableSweep` undefined.

- [ ] **Step 3: Implement `youtube-dominatable-sweep.ts`**

```ts
import 'server-only';
import { YOUTUBE_QUOTA_COST, type YouTubeVideoDetail, type YouTubeChannel } from '@/lib/clients/youtube';
import { DOMINATABLE_GATE } from '@/lib/ingestion/config';
import type { AdapterResult } from '@/lib/ingestion/run';

export interface DominatableSweepClient {
  searchVideoIds(p: { query: string; apiKey: string; videoDuration?: 'medium' | 'long'; order?: 'viewCount'; publishedAfter?: string; maxResults?: number }): Promise<string[]>;
  fetchVideosByIds(p: { videoIds: string[]; apiKey: string }): Promise<YouTubeVideoDetail[]>;
  fetchChannels(p: { channelIds: string[]; apiKey: string }): Promise<YouTubeChannel[]>;
}

export interface DominatableSweepRepo {
  upsertObservation(p: {
    videoId: string; source: 'youtube_dominatable'; channelId: string | null;
    channelSubscriberCount: number | null; channelPublishedAt: Date | null;
    title: string; description: string | null; tags: unknown[]; thumbnailUrl: string | null;
    durationSeconds: number | null; publishedAt: Date | null; viewCount: number; likeCount: number; commentCount: number;
  }): Promise<void>;
}

function channelAgeDays(publishedAt: string | null, now: Date): number | null {
  if (!publishedAt) return null;
  return (now.getTime() - new Date(publishedAt).getTime()) / 86_400_000;
}

export async function runDominatableSweep(args: {
  client: DominatableSweepClient; repo: DominatableSweepRepo;
  seeds: readonly string[]; apiKey: string; now: Date;
}): Promise<AdapterResult> {
  const { client, repo, seeds, apiKey, now } = args;
  const publishedAfter = new Date(now.getTime() - DOMINATABLE_GATE.publishedWithinDays * 86_400_000).toISOString();
  let ingested = 0, skipped = 0, quotaUnits = 0, failedSeeds = 0;

  for (const seed of seeds) {
    try {
      const ids = await client.searchVideoIds({ query: seed, apiKey, videoDuration: 'medium', order: 'viewCount', publishedAfter, maxResults: 50 });
      quotaUnits += YOUTUBE_QUOTA_COST.search;
      if (ids.length === 0) continue;
      const videos = await client.fetchVideosByIds({ videoIds: ids, apiKey });
      quotaUnits += YOUTUBE_QUOTA_COST.videosList;
      const channelIds = [...new Set(videos.map((v) => v.channelId).filter((c): c is string => !!c))];
      const channels = await client.fetchChannels({ channelIds, apiKey });
      quotaUnits += YOUTUBE_QUOTA_COST.channelsList * Math.max(1, Math.ceil(channelIds.length / 50));
      const byChannel = new Map(channels.map((c) => [c.channelId, c]));

      for (const v of videos) {
        const ch = v.channelId ? byChannel.get(v.channelId) : undefined;
        const ageDays = channelAgeDays(ch?.publishedAt ?? null, now);
        const ratio = ch && ch.subscriberCount > 0 ? v.views / ch.subscriberCount : Infinity;
        const ok = ch
          && v.durationSeconds >= DOMINATABLE_GATE.minDurationSeconds
          && v.views >= DOMINATABLE_GATE.minViews
          && ratio >= DOMINATABLE_GATE.minViewsToSubsRatio
          && ageDays !== null && ageDays <= DOMINATABLE_GATE.maxChannelAgeDays;
        if (!ok) { skipped++; continue; }
        await repo.upsertObservation({
          videoId: v.videoId, source: 'youtube_dominatable', channelId: v.channelId || null,
          channelSubscriberCount: ch.subscriberCount, channelPublishedAt: ch.publishedAt ? new Date(ch.publishedAt) : null,
          title: v.title, description: v.description || null, tags: v.tags, thumbnailUrl: v.thumbnailUrl,
          durationSeconds: v.durationSeconds, publishedAt: v.publishedAt ? new Date(v.publishedAt) : null,
          viewCount: v.views, likeCount: v.likes, commentCount: v.comments,
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

> Note: confirm `fetchVideosByIds`'s param name is `videoIds` (check `youtube.ts:174`); if it differs (e.g. `ids`), match it in both the client interface and the route wiring. `YOUTUBE_QUOTA_COST` has `search`, `videosList`, `channelsList` (verify the exact keys at `youtube.ts:111`).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/lib/ingestion/youtube-dominatable-sweep.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add src/lib/ingestion/youtube-dominatable-sweep.ts src/tests/lib/ingestion/youtube-dominatable-sweep.test.ts
git commit -m "feat(niches): runDominatableSweep adapter — longform search + channel enrichment + gate"
```

---

## Task 8: Cron route

**Files:** Create `src/app/api/cron/youtube-dominatable-sweep/route.ts`. Test: Create `src/tests/api/youtube-dominatable-sweep.test.ts` (mirror `src/tests/api/` cron-route tests if present; else assert the adapter + ledger wiring via a thin import test).

- [ ] **Step 1: Write the route** (mirror `youtube-category-sweep/route.ts`)

```ts
import { NextResponse } from 'next/server';
import { assertCronAuth, scraperLog, serializeError } from '@/lib/scrapers/shared';
import { loadEnv } from '@/lib/env';
import { getServiceClient } from '@/lib/supabase/server';
import { searchVideoIds, fetchVideosByIds, fetchChannels } from '@/lib/clients/youtube';
import { upsertShortsObservation } from '@/lib/supabase/repositories/shorts-observations';
import { runWithIngestionLog } from '@/lib/ingestion/run';
import { runDominatableSweep } from '@/lib/ingestion/youtube-dominatable-sweep';
import { DOMINATABLE_SEEDS } from '@/lib/ingestion/config';

export const maxDuration = 300;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }
  const env = loadEnv();
  if (!env.YOUTUBE_API_KEY) return NextResponse.json({ error: 'YOUTUBE_API_KEY not set' }, { status: 500 });
  const supabase = getServiceClient();
  const apiKey = env.YOUTUBE_API_KEY;
  try {
    const run = await runWithIngestionLog(supabase, 'youtube_dominatable_sweep', () =>
      runDominatableSweep({
        client: { searchVideoIds, fetchVideosByIds, fetchChannels },
        repo: { upsertObservation: (p) => upsertShortsObservation(supabase, p).then(() => undefined) },
        seeds: DOMINATABLE_SEEDS, apiKey, now: new Date(),
      }));
    return NextResponse.json({ ok: true, ...scraperLog('youtube-dominatable-sweep', { run }) });
  } catch (e) {
    console.error('youtube-dominatable-sweep failed', e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
```

> Adjust the `fetchVideosByIds`/`fetchChannels` adapter shims if their real param names differ from the `DominatableSweepClient` interface (wrap inline, e.g. `fetchVideosByIds: ({ videoIds, apiKey }) => fetchVideosByIds({ apiKey, ids: videoIds })`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: `0` `error TS`.

- [ ] **Step 3: Commit**
```bash
git add src/app/api/cron/youtube-dominatable-sweep/route.ts src/tests/api/youtube-dominatable-sweep.test.ts
git commit -m "feat(niches): /api/cron/youtube-dominatable-sweep route with ledger logging"
```

---

## Task 9: Cron schedule + Mission Control registry wiring

**Files:** Modify `vercel.ts` (crons array), `src/lib/assistants/registry.ts:62-91` (`niche_scout`).

- [ ] **Step 1: Add the vercel cron entry**

In `vercel.ts` crons array, near the other niche-finder crons:
```ts
    { path: '/api/cron/youtube-dominatable-sweep', schedule: '30 7 * * *' }, // daily 07:30 UTC
```

- [ ] **Step 2: Wire the registry (must match the cron + the ledger)**

In `registry.ts`, `niche_scout.ingestionJobs` add `'youtube_dominatable_sweep',`; in `niche_scout.schedules` add `{ label: 'Dominatable sweep', cron: '30 7 * * *' },`. Leave `maxExpectedGapHours: 13` (densest cadence is still the 6h category sweep).

- [ ] **Step 3: Verify typecheck + full suite**

Run: `npx tsc --noEmit` (expect `0` errors) then `npx vitest run` (expect all pass).

- [ ] **Step 4: Commit**
```bash
git add vercel.ts src/lib/assistants/registry.ts
git commit -m "feat(niches): schedule dominatable sweep + wire into Niche Scout (Mission Control)"
```

---

## Task 10: Phase 2 — thread `channel_published_at` to the cluster row

**Files:** Modify `src/lib/clustering/cluster.ts` (`ClusterInputRow`), `src/lib/ingestion/cluster-niches.ts:25-33` (`toClusterRow`), `src/lib/supabase/repositories/shorts-observations.ts` (`ClassifiedObservation` ~131 + `listClassifiedObservationsSince` select ~157 + mapping ~173).

- [ ] **Step 1: Add the field to the data path**

- `cluster.ts`: add `channel_published_at: string | null;` to `ClusterInputRow`.
- `shorts-observations.ts`: add `channel_published_at: string | null;` to `ClassifiedObservation`; add `channel_published_at` to the `shorts_observations!inner(...)` select string; map it in the returned object (`channel_published_at: r.shorts_observations.channel_published_at`).
- `cluster-niches.ts` `toClusterRow`: add `channel_published_at: o.channel_published_at,`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: `0` `error TS`.

- [ ] **Step 3: Commit**
```bash
git add src/lib/clustering/cluster.ts src/lib/ingestion/cluster-niches.ts src/lib/supabase/repositories/shorts-observations.ts
git commit -m "feat(niches): thread channel_published_at into the cluster input row"
```

---

## Task 11: Phase 2 — fold channel-age recency into `firstMoverScore`

**Files:** Modify `src/lib/scoring/components.ts`. Test: `src/tests/lib/scoring/components.test.ts` (existing — add cases).

- [ ] **Step 1: Write the failing tests**

Add to `components.test.ts` (import `computeComponents` + a `BuiltCluster` factory if one exists; else build a minimal cluster inline matching `BuiltCluster`):
```ts
it('firstMoverScore applies a recency multiplier: a brand-new channel scores higher than an old one with the same views/subs', () => {
  const base = makeCluster({ avgViews: 1_000_000, rows: [
    { view_count: 1_000_000, channel_subscriber_count: 10_000, channel_published_at: NEW },  // ~30d old
  ]});
  const old = makeCluster({ avgViews: 1_000_000, rows: [
    { view_count: 1_000_000, channel_subscriber_count: 10_000, channel_published_at: OLD },   // ~300d old
  ]});
  const fmNew = computeComponents(base, NOW).components.firstMoverScore!;
  const fmOld = computeComponents(old, NOW).components.firstMoverScore!;
  expect(fmNew).toBeGreaterThan(fmOld);
});

it('null channel age applies no recency penalty (back-compat)', () => {
  const noAge = makeCluster({ avgViews: 1_000_000, rows: [
    { view_count: 1_000_000, channel_subscriber_count: 10_000, channel_published_at: null },
  ]});
  const c = computeComponents(noAge, NOW);
  expect(c.components.firstMoverScore).not.toBeNull();
  // equals the pre-recency value (multiplier == 1)
});
```
(Define `NEW`/`OLD`/`NOW` and the `makeCluster` helper to satisfy `BuiltCluster`; reuse any existing test factory.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/tests/lib/scoring/components.test.ts`
Expected: FAIL — current `firstMover` ignores channel age, so new == old.

- [ ] **Step 3: Implement in `components.ts`**

Add a helper and fold it into `firstMover` (keep null-safe):
```ts
/** Median channel age in days across rows that have a channel_published_at; null if none. */
export function medianChannelAgeDays(cluster: BuiltCluster, now: Date): number | null {
  const ages: number[] = [];
  for (const r of cluster.rows) {
    if (r.channel_published_at) ages.push((now.getTime() - new Date(r.channel_published_at).getTime()) / 86_400_000);
  }
  if (ages.length === 0) return null;
  ages.sort((a, b) => a - b);
  const mid = Math.floor(ages.length / 2);
  return ages.length % 2 ? ages[mid] : (ages[mid - 1] + ages[mid]) / 2;
}

// recency: 1.0 for a brand-new channel decaying to a 0.2 floor by ~1yr; 1.0 (no penalty) when age unknown.
function recencyMultiplier(ageDays: number | null): number {
  if (ageDays === null) return 1;
  return Math.max(0.2, 1 - ageDays / 365);
}
```
Then in `computeComponents`, change the `firstMover` line to multiply by recency, and add `channelAgeDays` to the returned `explain`:
```ts
  const ageDays = medianChannelAgeDays(cluster, now);
  const firstMover: number | null =
    vts === null ? null : Math.sqrt(squashRatio(vts) * squashViews(cluster.avgViews)) * recencyMultiplier(ageDays);
```
Add `channelAgeDays: number | null;` to `ScoreExplain` and set `channelAgeDays: ageDays` in the returned `explain` object.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/tests/lib/scoring/components.test.ts`
Expected: PASS (new > old; null age unchanged).

- [ ] **Step 5: Full suite + typecheck**

Run: `npx vitest run` (all pass) and `npx tsc --noEmit` (`0` errors).

- [ ] **Step 6: Commit**
```bash
git add src/lib/scoring/components.ts src/tests/lib/scoring/components.test.ts
git commit -m "feat(niches): fold channel-age recency into firstMoverScore (playbook criterion #1)"
```

---

## Task 12: End-to-end verification (live, after prod migration is applied)

- [ ] **Step 1:** Confirm the migration is applied to prod (Darius OK obtained, Task 1 Step 3).
- [ ] **Step 2:** Trigger the sweep on prod (Vercel → Cron Jobs → `/api/cron/youtube-dominatable-sweep` → Run, or wait for 07:30 UTC). Confirm an `ingestion_runs` row with `job='youtube_dominatable_sweep'` and `items_ingested > 0`.
- [ ] **Step 3:** Query `shorts_observations` for `source='youtube_dominatable'` rows with non-null `channel_subscriber_count` and `channel_published_at`.
- [ ] **Step 4:** After `classify_observations` + a `cluster_niches` run (or trigger them), confirm `niche_clusters` has rows with a non-null `first_mover_score` derived from the live sweep (compare against the seed's ratios as a sanity check).
- [ ] **Step 5:** Confirm Mission Control's Niche Scout card shows the new "Dominatable sweep" schedule with a recent run (not overdue).
- [ ] **Step 6:** Once verified, note `seed-niches.mjs` as superseded (manual fallback) in its header comment.

---

## Self-Review notes

- **Spec coverage:** migration (Task 1) ✓, longform sweep + enrichment (Tasks 4,6,7) ✓, ledger/registry/cron wiring (Tasks 2,8,9) ✓, channel-age recency (Tasks 3,5,10,11) ✓, testing (per-task TDD) ✓, e2e verification (Task 12) ✓.
- **Verify-before-coding hooks (flagged inline):** exact `fetchVideosByIds` param name + `YOUTUBE_QUOTA_COST` keys (`youtube.ts:111,174`); whether `components.test.ts` has a `makeCluster` factory to reuse.
- **Type consistency:** new identifiers used consistently — `youtube_dominatable_sweep` (job), `youtube_dominatable` (source), `searchVideoIds`, `runDominatableSweep`, `channel_published_at` / `channelPublishedAt`, `DOMINATABLE_SEEDS`, `DOMINATABLE_GATE`, `medianChannelAgeDays`, `recencyMultiplier`.
