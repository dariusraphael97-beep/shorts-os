# Shorts OS Plan #5 — Phase 1 Sub-phase A: Foundation Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the entire Plan #5 Phase 1 database foundation, agent registry seeds, generated TypeScript types, and the data-migration that unsticks the existing prod `'uploading'` row — in one cohesive sub-phase, before any UI or ingestion code is written.

**Architecture:** Supabase Postgres migrations applied via the Supabase MCP server. Schema is additive (no destructive changes to Plan #4 tables). TypeScript types regenerated after migrations land via `supabase gen types`. Repository helper modules created for the most-frequently-used tables so subsequent sub-phases (B–J) can import them without scaffolding work.

**Tech Stack:** Supabase Postgres, `@supabase/supabase-js`, TypeScript strict mode, Vitest, Supabase MCP for migrations + queries.

**Spec reference:** `docs/superpowers/specs/2026-05-28-plan-5-creator-copilot-design.md` §4.1 (data model), §4.8 (agents architecture), §4.11 (pre-pub QA), §4.13 (sealed predictions + moat), §9 (migration strategy).

**Hard rules** (carried from memory):
- Plain English when chatting with Darius; technical content stays in docs (this plan).
- TS strict, no `any`. Zod at HTTP boundaries (no HTTP routes in Sub-phase A — applies to later sub-phases).
- `server-only` on any module that touches the Supabase service-role client.
- Operator-gated work (apply migrations, deploy) is done by the implementer using the Supabase MCP and Vercel MCP — don't ask Darius for atomic inputs we can drive ourselves.
- For local dev: `unset ANTHROPIC_BASE_URL` before `npm run dev` if running tests that hit AI Gateway (Sub-phase A has none).

**Useful IDs:**
- Supabase project: `jfmjppzjicvbpnlkmxbg`
- Vercel project: `prj_FooiiEYKOWNMZh3YtjoqwkbsWE0M` (team `team_La4nTrN2OOSH8ETfMRUMDhOq`)
- Active channel: `c8edc30f-375d-4b38-b6b0-77fa4b5e59a7` (slug `dyfrx_9754`, tz America/New_York)
- Stuck uploading row to fix: `11c221e0-693a-4e4c-a096-24725c4e327b`

---

## File Structure

**Migrations** (Supabase SQL, one logical group per file):

- `supabase/migrations/20260528000001_niche_finder_observations.sql` — `shorts_observations`, `shorts_classifications`, `classification_samples`.
- `supabase/migrations/20260528000002_niche_finder_clusters.sql` — `niche_clusters`, `niche_actions`, `niche_predictions`, `vidiq_appearances`.
- `supabase/migrations/20260528000003_watch_list.sql` — `watched_channels`, `video_velocity_snapshots`, `competitor_channels`.
- `supabase/migrations/20260528000004_agents.sql` — `agents`, `agent_status`, `agent_activity_log`, `agent_memory`, `agent_settings`, `agent_chat_threads`, `agent_chat_messages`.
- `supabase/migrations/20260528000005_video_reviews.sql` — `video_reviews`, `video_review_feedback`.
- `supabase/migrations/20260528000006_channel_personas.sql` — `channel_personas` (table reserved; Phase 2 populates it).
- `supabase/migrations/20260528000007_kill_criteria.sql` — `kill_criteria_log` + seed one row for the Plan #5 start date.
- `supabase/migrations/20260528000008_your_videos_additions.sql` — additive columns on `your_videos`: `source_niche_cluster_id`, `script_brief`, `review_id`, `editor_session_id`.
- `supabase/migrations/20260528000009_fix_stuck_uploading_row.sql` — flip the prod row `11c221e0-693a-4e4c-a096-24725c4e327b` from `'uploading'` → `'rendered'`, null its `scheduled_for`, bump `updated_at`. Idempotent (`WHERE status = 'uploading'`).
- `supabase/migrations/20260528000010_seed_assistants.sql` — INSERT the 6 agent identities + their default `agent_settings`.

**TypeScript types** (regenerated from Supabase schema):

- `src/lib/supabase/types.ts` — full regeneration via `supabase gen types typescript`.

**Repository helpers** (created in Sub-phase A; consumed by B–J):

- `src/lib/supabase/repositories/shorts-observations.ts`
- `src/lib/supabase/repositories/shorts-classifications.ts`
- `src/lib/supabase/repositories/niche-clusters.ts`
- `src/lib/supabase/repositories/watched-channels.ts`
- `src/lib/supabase/repositories/agents.ts` (registry + status + memory; activity + chat helpers come in Sub-phase F)
- `src/lib/supabase/repositories/video-reviews.ts`
- `src/lib/supabase/repositories/niche-predictions.ts`
- `src/lib/supabase/repositories/vidiq-appearances.ts`
- `src/lib/supabase/repositories/competitor-channels.ts`
- `src/lib/supabase/repositories/kill-criteria.ts`

**Tests** — one Vitest file per repository, plus one for the data-migration sanity check:

- `src/tests/lib/supabase/shorts-observations.test.ts`
- `src/tests/lib/supabase/shorts-classifications.test.ts`
- `src/tests/lib/supabase/niche-clusters.test.ts`
- `src/tests/lib/supabase/watched-channels.test.ts`
- `src/tests/lib/supabase/agents.test.ts`
- `src/tests/lib/supabase/video-reviews.test.ts`
- `src/tests/lib/supabase/niche-predictions.test.ts`
- `src/tests/lib/supabase/vidiq-appearances.test.ts`
- `src/tests/lib/supabase/competitor-channels.test.ts`
- `src/tests/lib/supabase/kill-criteria.test.ts`
- `src/tests/migrations/fix-stuck-uploading-row.test.ts` (queries prod via mock to verify the row state post-migration)

---

## Task Decomposition Rationale

Each `Task N` below is one migration file + (if applicable) its repository helper + its repository tests + commit. Migrations land via the Supabase MCP `apply_migration` tool against the prod project (`jfmjppzjicvbpnlkmxbg`) — no branch-database staging. Repository tests use the standard codebase pattern of mocking `getServiceClient` with vi.mock and asserting against the chained builder pattern.

This sub-phase produces zero user-facing UI. Its deliverable is: a fully-migrated schema, generated types, ready-to-use repository helpers, and confirmation that the stuck production row is unstuck.

---

### Task 1: Migration — niche-finder observations

**Files:**
- Create: `supabase/migrations/20260528000001_niche_finder_observations.sql`
- Create: `src/lib/supabase/repositories/shorts-observations.ts`
- Create: `src/lib/supabase/repositories/shorts-classifications.ts`
- Create: `src/tests/lib/supabase/shorts-observations.test.ts`
- Create: `src/tests/lib/supabase/shorts-classifications.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/tests/lib/supabase/shorts-observations.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  upsertShortsObservation,
  getShortsObservationByVideoId,
  listShortsObservationsBySource,
} from '@/lib/supabase/repositories/shorts-observations';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      upsert: () => ({
        select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }),
      }),
      select: () => ({
        eq: () => ({
          single: async () => ({ data: rows?.[0] ?? null, error }),
          maybeSingle: async () => ({ data: rows?.[0] ?? null, error }),
          order: () => ({ limit: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }) }),
        }),
      }),
    }),
  } as never;
}

describe('shorts-observations repository', () => {
  it('upsertShortsObservation returns inserted row', async () => {
    const row = { video_id: 'abc', source: 'youtube_most_popular', title: 't', view_count: 100 };
    const client = makeClient([row]);
    const result = await upsertShortsObservation(client, {
      videoId: 'abc',
      source: 'youtube_most_popular',
      title: 't',
      viewCount: 100,
      durationSeconds: 30,
      publishedAt: new Date('2026-05-28'),
      observedAt: new Date('2026-05-28'),
    });
    expect(result.video_id).toBe('abc');
  });

  it('getShortsObservationByVideoId returns null on PGRST116', async () => {
    const client = makeClient(null, { code: 'PGRST116' });
    const result = await getShortsObservationByVideoId(client, 'missing');
    expect(result).toBeNull();
  });

  it('listShortsObservationsBySource returns array', async () => {
    const client = makeClient([{ video_id: 'a' }, { video_id: 'b' }]);
    const result = await listShortsObservationsBySource(client, 'youtube_most_popular', 50);
    expect(result).toHaveLength(2);
  });
});
```

`src/tests/lib/supabase/shorts-classifications.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  upsertClassification,
  getClassificationByVideoId,
  listStaleClassifications,
} from '@/lib/supabase/repositories/shorts-classifications';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      upsert: () => ({
        select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }),
      }),
      select: () => ({
        eq: () => ({
          single: async () => ({ data: rows?.[0] ?? null, error }),
          maybeSingle: async () => ({ data: rows?.[0] ?? null, error }),
        }),
        neq: () => ({
          limit: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }),
        }),
      }),
    }),
  } as never;
}

describe('shorts-classifications repository', () => {
  it('upsertClassification stores label set', async () => {
    const row = { video_id: 'abc', topic_label: 'AI for seniors', format_label: 'narrated_storytelling', confidence: 0.84 };
    const client = makeClient([row]);
    const result = await upsertClassification(client, {
      videoId: 'abc',
      topicLabel: 'AI for seniors',
      formatLabel: 'narrated_storytelling',
      audienceSignal: 'seniors',
      confidence: 0.84,
      model: 'anthropic/claude-haiku-4-5',
      promptVersion: 'v1',
      visionUsed: true,
      transcriptUsed: true,
    });
    expect(result.topic_label).toBe('AI for seniors');
  });

  it('listStaleClassifications filters by promptVersion', async () => {
    const client = makeClient([{ video_id: 'a', prompt_version: 'v1' }]);
    const result = await listStaleClassifications(client, 'v2', 500);
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests — confirm FAIL**

```bash
npx vitest run src/tests/lib/supabase/shorts-observations.test.ts src/tests/lib/supabase/shorts-classifications.test.ts
```

Expected: FAIL — repository modules do not exist yet.

- [ ] **Step 3: Write the migration SQL**

Create `supabase/migrations/20260528000001_niche_finder_observations.sql`:

```sql
-- Niche-finder source observations (every video we ingest from any source)
create table if not exists public.shorts_observations (
  video_id text primary key,
  source text not null check (source in (
    'youtube_most_popular',
    'youtube_search',
    'youtube_watch_list',
    'reddit_topic',
    'tiktok_creative_center',
    'google_trends'
  )),
  channel_id text,
  channel_subscriber_count bigint,
  title text not null,
  description text,
  tags jsonb default '[]'::jsonb,
  thumbnail_url text,
  duration_seconds integer,
  published_at timestamptz,
  view_count bigint default 0,
  like_count bigint default 0,
  comment_count bigint default 0,
  observed_at timestamptz not null default now(),
  last_refreshed_at timestamptz not null default now()
);

create index if not exists shorts_observations_source_observed_at_idx
  on public.shorts_observations (source, observed_at desc);

create index if not exists shorts_observations_channel_id_published_at_idx
  on public.shorts_observations (channel_id, published_at desc);

-- LLM classifier output
create table if not exists public.shorts_classifications (
  video_id text primary key references public.shorts_observations (video_id) on delete cascade,
  topic_label text not null,
  format_label text not null check (format_label in (
    'narrated_storytelling','talking_head_facts','talking_head_advice',
    'compilation_montage','transformation_reveal','ranking_list','before_after',
    'tutorial_quick','pov_skit','screen_record_walkthrough','ai_voiceover_facts',
    'reaction','interview_clip','news_recap','product_review','meme_format',
    'live_capture','other'
  )),
  audience_signal text check (audience_signal in (
    'seniors','gen_z','millennials','kids','professionals','hobbyists','general'
  )),
  confidence numeric(4,3) not null,
  model text not null,
  prompt_version text not null,
  vision_used boolean not null default false,
  transcript_used boolean not null default false,
  classified_at timestamptz not null default now()
);

create index if not exists shorts_classifications_topic_format_idx
  on public.shorts_classifications (topic_label, format_label);

create index if not exists shorts_classifications_prompt_version_idx
  on public.shorts_classifications (prompt_version);

-- Sample retention for QC review (5% of classifications)
create table if not exists public.classification_samples (
  id uuid primary key default gen_random_uuid(),
  video_id text not null references public.shorts_observations (video_id) on delete cascade,
  prompt_full text not null,
  response_full text not null,
  chosen_labels jsonb not null,
  reviewed boolean not null default false,
  review_verdict text check (review_verdict in ('correct','wrong','partial')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists classification_samples_reviewed_idx
  on public.classification_samples (reviewed, created_at desc);
```

- [ ] **Step 4: Apply the migration via Supabase MCP**

Use the Supabase MCP `apply_migration` tool:

```
mcp__eb0e215d-09d2-42bf-b558-7c883674fdc6__apply_migration({
  project_id: 'jfmjppzjicvbpnlkmxbg',
  name: '20260528000001_niche_finder_observations',
  query: '<contents of the .sql file above>'
})
```

Then verify with `execute_sql`:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('shorts_observations','shorts_classifications','classification_samples')
order by table_name;
```

Expected: 3 rows.

- [ ] **Step 5: Write the repository helpers**

`src/lib/supabase/repositories/shorts-observations.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ShortsObservationSource =
  | 'youtube_most_popular'
  | 'youtube_search'
  | 'youtube_watch_list'
  | 'reddit_topic'
  | 'tiktok_creative_center'
  | 'google_trends';

export interface ShortsObservation {
  video_id: string;
  source: ShortsObservationSource;
  channel_id: string | null;
  channel_subscriber_count: number | null;
  title: string;
  description: string | null;
  tags: unknown[];
  thumbnail_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  observed_at: string;
  last_refreshed_at: string;
}

export interface UpsertShortsObservationParams {
  videoId: string;
  source: ShortsObservationSource;
  channelId?: string | null;
  channelSubscriberCount?: number | null;
  title: string;
  description?: string | null;
  tags?: unknown[];
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  publishedAt?: Date | null;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  observedAt?: Date;
}

export async function upsertShortsObservation(
  supabase: SupabaseClient,
  params: UpsertShortsObservationParams,
): Promise<ShortsObservation> {
  const { data, error } = await supabase
    .from('shorts_observations')
    .upsert({
      video_id: params.videoId,
      source: params.source,
      channel_id: params.channelId ?? null,
      channel_subscriber_count: params.channelSubscriberCount ?? null,
      title: params.title,
      description: params.description ?? null,
      tags: params.tags ?? [],
      thumbnail_url: params.thumbnailUrl ?? null,
      duration_seconds: params.durationSeconds ?? null,
      published_at: params.publishedAt ? params.publishedAt.toISOString() : null,
      view_count: params.viewCount ?? 0,
      like_count: params.likeCount ?? 0,
      comment_count: params.commentCount ?? 0,
      observed_at: (params.observedAt ?? new Date()).toISOString(),
      last_refreshed_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(`upsertShortsObservation: ${error.message}`);
  return data as ShortsObservation;
}

export async function getShortsObservationByVideoId(
  supabase: SupabaseClient,
  videoId: string,
): Promise<ShortsObservation | null> {
  const { data, error } = await supabase
    .from('shorts_observations')
    .select()
    .eq('video_id', videoId)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    throw new Error(`getShortsObservationByVideoId: ${error.message}`);
  }
  return (data as ShortsObservation | null) ?? null;
}

export async function listShortsObservationsBySource(
  supabase: SupabaseClient,
  source: ShortsObservationSource,
  limit: number,
): Promise<ShortsObservation[]> {
  const { data, error } = await supabase
    .from('shorts_observations')
    .select()
    .eq('source', source)
    .order('observed_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listShortsObservationsBySource: ${error.message}`);
  return (data ?? []) as ShortsObservation[];
}
```

`src/lib/supabase/repositories/shorts-classifications.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type FormatLabel =
  | 'narrated_storytelling' | 'talking_head_facts' | 'talking_head_advice'
  | 'compilation_montage' | 'transformation_reveal' | 'ranking_list' | 'before_after'
  | 'tutorial_quick' | 'pov_skit' | 'screen_record_walkthrough' | 'ai_voiceover_facts'
  | 'reaction' | 'interview_clip' | 'news_recap' | 'product_review' | 'meme_format'
  | 'live_capture' | 'other';

export type AudienceSignal =
  | 'seniors' | 'gen_z' | 'millennials' | 'kids' | 'professionals' | 'hobbyists' | 'general';

export interface ShortsClassification {
  video_id: string;
  topic_label: string;
  format_label: FormatLabel;
  audience_signal: AudienceSignal | null;
  confidence: number;
  model: string;
  prompt_version: string;
  vision_used: boolean;
  transcript_used: boolean;
  classified_at: string;
}

export interface UpsertClassificationParams {
  videoId: string;
  topicLabel: string;
  formatLabel: FormatLabel;
  audienceSignal?: AudienceSignal | null;
  confidence: number;
  model: string;
  promptVersion: string;
  visionUsed: boolean;
  transcriptUsed: boolean;
}

export async function upsertClassification(
  supabase: SupabaseClient,
  params: UpsertClassificationParams,
): Promise<ShortsClassification> {
  const { data, error } = await supabase
    .from('shorts_classifications')
    .upsert({
      video_id: params.videoId,
      topic_label: params.topicLabel,
      format_label: params.formatLabel,
      audience_signal: params.audienceSignal ?? null,
      confidence: params.confidence,
      model: params.model,
      prompt_version: params.promptVersion,
      vision_used: params.visionUsed,
      transcript_used: params.transcriptUsed,
      classified_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(`upsertClassification: ${error.message}`);
  return data as ShortsClassification;
}

export async function getClassificationByVideoId(
  supabase: SupabaseClient,
  videoId: string,
): Promise<ShortsClassification | null> {
  const { data, error } = await supabase
    .from('shorts_classifications')
    .select()
    .eq('video_id', videoId)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    throw new Error(`getClassificationByVideoId: ${error.message}`);
  }
  return (data as ShortsClassification | null) ?? null;
}

export async function listStaleClassifications(
  supabase: SupabaseClient,
  currentPromptVersion: string,
  limit: number,
): Promise<ShortsClassification[]> {
  const { data, error } = await supabase
    .from('shorts_classifications')
    .select()
    .neq('prompt_version', currentPromptVersion)
    .limit(limit);
  if (error) throw new Error(`listStaleClassifications: ${error.message}`);
  return (data ?? []) as ShortsClassification[];
}
```

- [ ] **Step 6: Run tests — confirm pass**

```bash
npx vitest run src/tests/lib/supabase/shorts-observations.test.ts src/tests/lib/supabase/shorts-classifications.test.ts
```

Expected: all green.

- [ ] **Step 7: Run tsc — confirm no new errors**

```bash
npx tsc --noEmit 2>&1 | grep -v 'src/tests/lib/auth/session.test.ts'
```

Expected: only the pre-existing `Property 'reason' does not exist on type 'SessionVerifyResult'` from Plan #4 (file path filtered).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260528000001_niche_finder_observations.sql \
        src/lib/supabase/repositories/shorts-observations.ts \
        src/lib/supabase/repositories/shorts-classifications.ts \
        src/tests/lib/supabase/shorts-observations.test.ts \
        src/tests/lib/supabase/shorts-classifications.test.ts
git commit -m "feat(plan-5): observation + classification tables + repos"
```

---

### Task 2: Migration — niche-finder clusters + predictions + moat tracking

**Files:**
- Create: `supabase/migrations/20260528000002_niche_finder_clusters.sql`
- Create: `src/lib/supabase/repositories/niche-clusters.ts`
- Create: `src/lib/supabase/repositories/niche-predictions.ts`
- Create: `src/lib/supabase/repositories/vidiq-appearances.ts`
- Create: `src/tests/lib/supabase/niche-clusters.test.ts`
- Create: `src/tests/lib/supabase/niche-predictions.test.ts`
- Create: `src/tests/lib/supabase/vidiq-appearances.test.ts`

- [ ] **Step 1: Write failing tests**

`src/tests/lib/supabase/niche-clusters.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  insertNicheCluster,
  listDigestRankedClusters,
  getClusterById,
} from '@/lib/supabase/repositories/niche-clusters';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      select: () => ({
        eq: () => ({
          single: async () => ({ data: rows?.[0] ?? null, error }),
          maybeSingle: async () => ({ data: rows?.[0] ?? null, error }),
          order: () => ({ limit: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }) }),
          not: () => ({ order: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }) }),
        }),
      }),
    }),
  } as never;
}

describe('niche-clusters repository', () => {
  it('insertNicheCluster returns inserted row', async () => {
    const row = { id: 'c1', week_start: '2026-05-25', canonical_topic: 'AI for seniors', format_label: 'narrated_storytelling' };
    const client = makeClient([row]);
    const result = await insertNicheCluster(client, {
      weekStart: '2026-05-25',
      canonicalTopic: 'AI for seniors',
      formatLabel: 'narrated_storytelling',
      exampleVideoIds: ['v1','v2','v3'],
      channelCount: 12,
      avgViews: 500000,
      avgVelocity24h: 6.2,
      outlierDensity: 0.75,
      firstSeenAt: new Date('2026-05-20'),
      firstMoverScore: 0.85,
      provenScore: 0.72,
      nicheScore: 0.78,
      discoveryState: 'pre_public',
      productionFit: 'native',
      audienceSignal: 'seniors',
      explainabilityTopSignals: { first_mover: 0.85, low_saturation: 0.7 },
    });
    expect(result.id).toBe('c1');
  });

  it('listDigestRankedClusters filters by week + non-null rank', async () => {
    const client = makeClient([{ id: 'c1', digest_rank: 1 }, { id: 'c2', digest_rank: 2 }]);
    const result = await listDigestRankedClusters(client, '2026-05-25');
    expect(result).toHaveLength(2);
  });
});
```

`src/tests/lib/supabase/niche-predictions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  insertNichePrediction,
  attachActualOutcome,
  listPredictionsByCluster,
} from '@/lib/supabase/repositories/niche-predictions';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      update: () => ({
        eq: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      }),
      select: () => ({
        eq: () => ({
          order: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }),
        }),
      }),
    }),
  } as never;
}

describe('niche-predictions repository', () => {
  it('insertNichePrediction stores sealed range', async () => {
    const row = { id: 'p1', niche_cluster_id: 'c1', predicted_views_7d_lower: 5000, predicted_views_7d_upper: 25000 };
    const client = makeClient([row]);
    const result = await insertNichePrediction(client, {
      nicheClusterId: 'c1',
      predictedViews7dLower: 5000,
      predictedViews7dUpper: 25000,
    });
    expect(result.id).toBe('p1');
  });

  it('attachActualOutcome computes accuracy_verdict=within', async () => {
    const row = { id: 'p1', actual_views_7d: 12000, accuracy_verdict: 'within' };
    const client = makeClient([row]);
    const result = await attachActualOutcome(client, 'p1', 12000);
    expect(result.accuracy_verdict).toBe('within');
  });
});
```

`src/tests/lib/supabase/vidiq-appearances.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  insertVidiqAppearance,
  computeLagDays,
} from '@/lib/supabase/repositories/vidiq-appearances';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
    }),
  } as never;
}

describe('vidiq-appearances repository', () => {
  it('insertVidiqAppearance stores tracking row', async () => {
    const row = { id: 'v1', canonical_topic: 'AI for seniors', format_label: 'narrated_storytelling' };
    const client = makeClient([row]);
    const result = await insertVidiqAppearance(client, {
      canonicalTopic: 'AI for seniors',
      formatLabel: 'narrated_storytelling',
      firstSurfacedByShortsOsAt: new Date('2026-05-28'),
    });
    expect(result.id).toBe('v1');
  });

  it('computeLagDays returns positive lag when external surfaced later', () => {
    const days = computeLagDays(new Date('2026-05-28'), new Date('2026-06-04'));
    expect(days).toBe(7);
  });
});
```

- [ ] **Step 2: Run tests — confirm FAIL**

```bash
npx vitest run src/tests/lib/supabase/niche-clusters.test.ts src/tests/lib/supabase/niche-predictions.test.ts src/tests/lib/supabase/vidiq-appearances.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write the migration SQL**

Create `supabase/migrations/20260528000002_niche_finder_clusters.sql`:

```sql
-- Weekly niche cluster snapshots (computed by the Sunday-night clustering cron in Sub-phase D)
create table if not exists public.niche_clusters (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  canonical_topic text not null,
  format_label text not null,
  example_video_ids jsonb not null default '[]'::jsonb,
  channel_count integer not null default 0,
  avg_views bigint,
  avg_velocity_24h numeric(8,3),
  outlier_density numeric(4,3),
  first_seen_at timestamptz,
  first_mover_score numeric(5,4),
  proven_score numeric(5,4),
  niche_score numeric(5,4),
  discovery_state text check (discovery_state in ('pre_public','public')),
  production_fit text check (production_fit in ('native','needs_manual_recording','needs_manual_editing','manual_only')),
  audience_signal text,
  digest_rank integer,
  explainability_top_signals jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists niche_clusters_week_rank_idx
  on public.niche_clusters (week_start, digest_rank);

create index if not exists niche_clusters_topic_format_idx
  on public.niche_clusters (canonical_topic, format_label);

-- Per-action interaction log (for niche-score weight tuning)
create table if not exists public.niche_actions (
  id uuid primary key default gen_random_uuid(),
  niche_cluster_id uuid not null references public.niche_clusters (id) on delete cascade,
  action text not null check (action in ('viewed','investigated','generated_from','dismissed','hidden')),
  actor text,
  created_at timestamptz not null default now()
);

create index if not exists niche_actions_cluster_idx
  on public.niche_actions (niche_cluster_id, created_at desc);

-- Sealed predictions (written at digest-time; closed when video posted)
create table if not exists public.niche_predictions (
  id uuid primary key default gen_random_uuid(),
  niche_cluster_id uuid not null references public.niche_clusters (id) on delete cascade,
  predicted_at timestamptz not null default now(),
  predicted_views_7d_lower bigint not null,
  predicted_views_7d_upper bigint not null,
  actual_video_id uuid references public.your_videos (id) on delete set null,
  actual_views_7d bigint,
  accuracy_verdict text check (accuracy_verdict in ('within','below','above')),
  closed_at timestamptz
);

create index if not exists niche_predictions_cluster_idx
  on public.niche_predictions (niche_cluster_id, predicted_at desc);

-- Moat-validation tracking (manual log + computed lag)
create table if not exists public.vidiq_appearances (
  id uuid primary key default gen_random_uuid(),
  canonical_topic text not null,
  format_label text not null,
  first_surfaced_by_shorts_os_at timestamptz not null,
  first_surfaced_by_vidiq_at timestamptz,
  first_surfaced_by_1of10_at timestamptz,
  first_surfaced_by_exploding_topics_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 4: Apply the migration via Supabase MCP**

```
mcp__eb0e215d-09d2-42bf-b558-7c883674fdc6__apply_migration({
  project_id: 'jfmjppzjicvbpnlkmxbg',
  name: '20260528000002_niche_finder_clusters',
  query: '<contents of the .sql>'
})
```

Verify:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('niche_clusters','niche_actions','niche_predictions','vidiq_appearances')
order by table_name;
```

Expected: 4 rows.

- [ ] **Step 5: Write the repository helpers**

`src/lib/supabase/repositories/niche-clusters.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FormatLabel, AudienceSignal } from './shorts-classifications';

export type DiscoveryState = 'pre_public' | 'public';
export type ProductionFit = 'native' | 'needs_manual_recording' | 'needs_manual_editing' | 'manual_only';

export interface NicheCluster {
  id: string;
  week_start: string;
  canonical_topic: string;
  format_label: FormatLabel;
  example_video_ids: string[];
  channel_count: number;
  avg_views: number | null;
  avg_velocity_24h: number | null;
  outlier_density: number | null;
  first_seen_at: string | null;
  first_mover_score: number | null;
  proven_score: number | null;
  niche_score: number | null;
  discovery_state: DiscoveryState | null;
  production_fit: ProductionFit | null;
  audience_signal: AudienceSignal | null;
  digest_rank: number | null;
  explainability_top_signals: Record<string, number>;
  created_at: string;
}

export interface InsertNicheClusterParams {
  weekStart: string;
  canonicalTopic: string;
  formatLabel: FormatLabel;
  exampleVideoIds: string[];
  channelCount: number;
  avgViews: number | null;
  avgVelocity24h: number | null;
  outlierDensity: number | null;
  firstSeenAt: Date | null;
  firstMoverScore: number | null;
  provenScore: number | null;
  nicheScore: number | null;
  discoveryState: DiscoveryState | null;
  productionFit: ProductionFit | null;
  audienceSignal: AudienceSignal | null;
  digestRank?: number | null;
  explainabilityTopSignals?: Record<string, number>;
}

export async function insertNicheCluster(
  supabase: SupabaseClient,
  params: InsertNicheClusterParams,
): Promise<NicheCluster> {
  const { data, error } = await supabase
    .from('niche_clusters')
    .insert({
      week_start: params.weekStart,
      canonical_topic: params.canonicalTopic,
      format_label: params.formatLabel,
      example_video_ids: params.exampleVideoIds,
      channel_count: params.channelCount,
      avg_views: params.avgViews,
      avg_velocity_24h: params.avgVelocity24h,
      outlier_density: params.outlierDensity,
      first_seen_at: params.firstSeenAt ? params.firstSeenAt.toISOString() : null,
      first_mover_score: params.firstMoverScore,
      proven_score: params.provenScore,
      niche_score: params.nicheScore,
      discovery_state: params.discoveryState,
      production_fit: params.productionFit,
      audience_signal: params.audienceSignal,
      digest_rank: params.digestRank ?? null,
      explainability_top_signals: params.explainabilityTopSignals ?? {},
    })
    .select()
    .single();
  if (error) throw new Error(`insertNicheCluster: ${error.message}`);
  return data as NicheCluster;
}

export async function listDigestRankedClusters(
  supabase: SupabaseClient,
  weekStart: string,
): Promise<NicheCluster[]> {
  const { data, error } = await supabase
    .from('niche_clusters')
    .select()
    .eq('week_start', weekStart)
    .not('digest_rank', 'is', null)
    .order('digest_rank', { ascending: true });
  if (error) throw new Error(`listDigestRankedClusters: ${error.message}`);
  return (data ?? []) as NicheCluster[];
}

export async function getClusterById(
  supabase: SupabaseClient,
  id: string,
): Promise<NicheCluster | null> {
  const { data, error } = await supabase
    .from('niche_clusters')
    .select()
    .eq('id', id)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    throw new Error(`getClusterById: ${error.message}`);
  }
  return (data as NicheCluster | null) ?? null;
}
```

`src/lib/supabase/repositories/niche-predictions.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AccuracyVerdict = 'within' | 'below' | 'above';

export interface NichePrediction {
  id: string;
  niche_cluster_id: string;
  predicted_at: string;
  predicted_views_7d_lower: number;
  predicted_views_7d_upper: number;
  actual_video_id: string | null;
  actual_views_7d: number | null;
  accuracy_verdict: AccuracyVerdict | null;
  closed_at: string | null;
}

export interface InsertNichePredictionParams {
  nicheClusterId: string;
  predictedViews7dLower: number;
  predictedViews7dUpper: number;
}

export async function insertNichePrediction(
  supabase: SupabaseClient,
  params: InsertNichePredictionParams,
): Promise<NichePrediction> {
  const { data, error } = await supabase
    .from('niche_predictions')
    .insert({
      niche_cluster_id: params.nicheClusterId,
      predicted_views_7d_lower: params.predictedViews7dLower,
      predicted_views_7d_upper: params.predictedViews7dUpper,
    })
    .select()
    .single();
  if (error) throw new Error(`insertNichePrediction: ${error.message}`);
  return data as NichePrediction;
}

export async function attachActualOutcome(
  supabase: SupabaseClient,
  predictionId: string,
  actualViews7d: number,
): Promise<NichePrediction> {
  // Fetch first to compute verdict
  const { data: existing, error: fetchErr } = await supabase
    .from('niche_predictions')
    .select('predicted_views_7d_lower, predicted_views_7d_upper')
    .eq('id', predictionId)
    .single();
  if (fetchErr) throw new Error(`attachActualOutcome (fetch): ${fetchErr.message}`);
  const lower = (existing as { predicted_views_7d_lower: number }).predicted_views_7d_lower;
  const upper = (existing as { predicted_views_7d_upper: number }).predicted_views_7d_upper;
  let verdict: AccuracyVerdict;
  if (actualViews7d < lower) verdict = 'below';
  else if (actualViews7d > upper) verdict = 'above';
  else verdict = 'within';

  const { data, error } = await supabase
    .from('niche_predictions')
    .update({
      actual_views_7d: actualViews7d,
      accuracy_verdict: verdict,
      closed_at: new Date().toISOString(),
    })
    .eq('id', predictionId)
    .select()
    .single();
  if (error) throw new Error(`attachActualOutcome (update): ${error.message}`);
  return data as NichePrediction;
}

export async function listPredictionsByCluster(
  supabase: SupabaseClient,
  nicheClusterId: string,
): Promise<NichePrediction[]> {
  const { data, error } = await supabase
    .from('niche_predictions')
    .select()
    .eq('niche_cluster_id', nicheClusterId)
    .order('predicted_at', { ascending: false });
  if (error) throw new Error(`listPredictionsByCluster: ${error.message}`);
  return (data ?? []) as NichePrediction[];
}
```

`src/lib/supabase/repositories/vidiq-appearances.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FormatLabel } from './shorts-classifications';

export interface VidiqAppearance {
  id: string;
  canonical_topic: string;
  format_label: FormatLabel;
  first_surfaced_by_shorts_os_at: string;
  first_surfaced_by_vidiq_at: string | null;
  first_surfaced_by_1of10_at: string | null;
  first_surfaced_by_exploding_topics_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface InsertVidiqAppearanceParams {
  canonicalTopic: string;
  formatLabel: FormatLabel;
  firstSurfacedByShortsOsAt: Date;
  firstSurfacedByVidiqAt?: Date | null;
  firstSurfacedBy1of10At?: Date | null;
  firstSurfacedByExplodingTopicsAt?: Date | null;
  notes?: string | null;
}

export async function insertVidiqAppearance(
  supabase: SupabaseClient,
  params: InsertVidiqAppearanceParams,
): Promise<VidiqAppearance> {
  const { data, error } = await supabase
    .from('vidiq_appearances')
    .insert({
      canonical_topic: params.canonicalTopic,
      format_label: params.formatLabel,
      first_surfaced_by_shorts_os_at: params.firstSurfacedByShortsOsAt.toISOString(),
      first_surfaced_by_vidiq_at: params.firstSurfacedByVidiqAt?.toISOString() ?? null,
      first_surfaced_by_1of10_at: params.firstSurfacedBy1of10At?.toISOString() ?? null,
      first_surfaced_by_exploding_topics_at: params.firstSurfacedByExplodingTopicsAt?.toISOString() ?? null,
      notes: params.notes ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`insertVidiqAppearance: ${error.message}`);
  return data as VidiqAppearance;
}

export function computeLagDays(shortsOsAt: Date, externalAt: Date): number {
  const ms = externalAt.getTime() - shortsOsAt.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
```

- [ ] **Step 6: Run tests — confirm pass + tsc clean**

```bash
npx vitest run src/tests/lib/supabase/niche-clusters.test.ts src/tests/lib/supabase/niche-predictions.test.ts src/tests/lib/supabase/vidiq-appearances.test.ts
npx tsc --noEmit 2>&1 | grep -v 'src/tests/lib/auth/session.test.ts'
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260528000002_niche_finder_clusters.sql \
        src/lib/supabase/repositories/niche-clusters.ts \
        src/lib/supabase/repositories/niche-predictions.ts \
        src/lib/supabase/repositories/vidiq-appearances.ts \
        src/tests/lib/supabase/niche-clusters.test.ts \
        src/tests/lib/supabase/niche-predictions.test.ts \
        src/tests/lib/supabase/vidiq-appearances.test.ts
git commit -m "feat(plan-5): niche cluster + prediction + vidiq tables + repos"
```

---

### Task 3: Migration — watch-list + velocity + competitor channels

**Files:**
- Create: `supabase/migrations/20260528000003_watch_list.sql`
- Create: `src/lib/supabase/repositories/watched-channels.ts`
- Create: `src/lib/supabase/repositories/competitor-channels.ts`
- Create: `src/tests/lib/supabase/watched-channels.test.ts`
- Create: `src/tests/lib/supabase/competitor-channels.test.ts`

(Velocity snapshots are written by the Sub-phase C ingestion cron; a thin repo helper exists here but no Sub-phase A test for it beyond shape check.)

- [ ] **Step 1: Write failing tests**

`src/tests/lib/supabase/watched-channels.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  upsertWatchedChannel,
  listActiveWatchedChannels,
  evictInactiveWatchedChannels,
} from '@/lib/supabase/repositories/watched-channels';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      upsert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      update: () => ({ eq: () => ({ select: () => ({ then: (r: (v: { data: unknown[]; error: unknown; count: number }) => unknown) => r({ data: rows ?? [], error, count: rows?.length ?? 0 }) }) }) }),
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }) }),
        }),
      }),
    }),
  } as never;
}

describe('watched-channels repository', () => {
  it('upsertWatchedChannel adds channel', async () => {
    const row = { channel_id: 'UC123', channel_title: 'Cool Channel', is_active: true };
    const client = makeClient([row]);
    const result = await upsertWatchedChannel(client, {
      channelId: 'UC123',
      channelHandle: '@cool',
      channelTitle: 'Cool Channel',
      channelThumbnailUrl: 'https://...',
      subscriberCountAtAdd: 12000,
      currentSubscriberCount: 12000,
      uploadCadencePerWeek: 3,
      outlierRate60d: 0.15,
      discoverySource: 'manual',
    });
    expect(result.channel_id).toBe('UC123');
  });

  it('listActiveWatchedChannels returns array', async () => {
    const client = makeClient([{ channel_id: 'a' }, { channel_id: 'b' }]);
    const result = await listActiveWatchedChannels(client, 100);
    expect(result).toHaveLength(2);
  });
});
```

`src/tests/lib/supabase/competitor-channels.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  addCompetitorChannel,
  listCompetitorChannels,
} from '@/lib/supabase/repositories/competitor-channels';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      upsert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      select: () => ({
        eq: () => ({
          order: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }),
        }),
      }),
    }),
  } as never;
}

describe('competitor-channels repository', () => {
  it('addCompetitorChannel returns inserted row', async () => {
    const row = { channel_id: 'UC456', channel_handle: '@comp' };
    const client = makeClient([row]);
    const result = await addCompetitorChannel(client, {
      channelId: 'UC456',
      channelHandle: '@comp',
    });
    expect(result.channel_id).toBe('UC456');
  });

  it('listCompetitorChannels returns active list', async () => {
    const client = makeClient([{ channel_id: 'a' }]);
    const result = await listCompetitorChannels(client);
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests — confirm FAIL**

```bash
npx vitest run src/tests/lib/supabase/watched-channels.test.ts src/tests/lib/supabase/competitor-channels.test.ts
```

- [ ] **Step 3: Write the migration SQL**

Create `supabase/migrations/20260528000003_watch_list.sql`:

```sql
-- Watch-list of small/medium channels we track for outlier velocity (Sub-phase C cron)
create table if not exists public.watched_channels (
  channel_id text primary key,
  channel_handle text,
  channel_title text,
  channel_thumbnail_url text,
  subscriber_count_at_add bigint not null,
  current_subscriber_count bigint not null,
  subscriber_growth_30d numeric(6,3),
  subscriber_growth_90d numeric(6,3),
  outlier_rate_60d numeric(4,3),
  upload_cadence_per_week numeric(5,2),
  added_at timestamptz not null default now(),
  discovery_source text not null check (discovery_source in ('manual','auto_breakout','auto_outlier')),
  is_active boolean not null default true,
  last_snapshotted_at timestamptz
);

create index if not exists watched_channels_active_last_snap_idx
  on public.watched_channels (is_active, last_snapshotted_at nulls first);

-- Per-video daily view-count history
create table if not exists public.video_velocity_snapshots (
  video_id text not null,
  snapshot_at timestamptz not null default now(),
  view_count bigint not null,
  like_count bigint not null default 0,
  comment_count bigint not null default 0,
  primary key (video_id, snapshot_at)
);

create index if not exists video_velocity_snapshots_video_idx
  on public.video_velocity_snapshots (video_id, snapshot_at desc);

-- Competitor channels (operator-curated, for /competitors page)
create table if not exists public.competitor_channels (
  channel_id text primary key,
  channel_handle text,
  channel_title text,
  added_at timestamptz not null default now(),
  is_active boolean not null default true
);
```

- [ ] **Step 4: Apply migration via Supabase MCP**

```
mcp__eb0e215d-09d2-42bf-b558-7c883674fdc6__apply_migration({
  project_id: 'jfmjppzjicvbpnlkmxbg',
  name: '20260528000003_watch_list',
  query: '<contents>'
})
```

Verify:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('watched_channels','video_velocity_snapshots','competitor_channels')
order by table_name;
```

Expected: 3 rows.

- [ ] **Step 5: Write the repository helpers**

`src/lib/supabase/repositories/watched-channels.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type DiscoverySource = 'manual' | 'auto_breakout' | 'auto_outlier';

export interface WatchedChannel {
  channel_id: string;
  channel_handle: string | null;
  channel_title: string | null;
  channel_thumbnail_url: string | null;
  subscriber_count_at_add: number;
  current_subscriber_count: number;
  subscriber_growth_30d: number | null;
  subscriber_growth_90d: number | null;
  outlier_rate_60d: number | null;
  upload_cadence_per_week: number | null;
  added_at: string;
  discovery_source: DiscoverySource;
  is_active: boolean;
  last_snapshotted_at: string | null;
}

export interface UpsertWatchedChannelParams {
  channelId: string;
  channelHandle?: string | null;
  channelTitle?: string | null;
  channelThumbnailUrl?: string | null;
  subscriberCountAtAdd: number;
  currentSubscriberCount: number;
  subscriberGrowth30d?: number | null;
  subscriberGrowth90d?: number | null;
  outlierRate60d?: number | null;
  uploadCadencePerWeek?: number | null;
  discoverySource: DiscoverySource;
}

export async function upsertWatchedChannel(
  supabase: SupabaseClient,
  params: UpsertWatchedChannelParams,
): Promise<WatchedChannel> {
  const { data, error } = await supabase
    .from('watched_channels')
    .upsert({
      channel_id: params.channelId,
      channel_handle: params.channelHandle ?? null,
      channel_title: params.channelTitle ?? null,
      channel_thumbnail_url: params.channelThumbnailUrl ?? null,
      subscriber_count_at_add: params.subscriberCountAtAdd,
      current_subscriber_count: params.currentSubscriberCount,
      subscriber_growth_30d: params.subscriberGrowth30d ?? null,
      subscriber_growth_90d: params.subscriberGrowth90d ?? null,
      outlier_rate_60d: params.outlierRate60d ?? null,
      upload_cadence_per_week: params.uploadCadencePerWeek ?? null,
      discovery_source: params.discoverySource,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw new Error(`upsertWatchedChannel: ${error.message}`);
  return data as WatchedChannel;
}

export async function listActiveWatchedChannels(
  supabase: SupabaseClient,
  limit: number,
): Promise<WatchedChannel[]> {
  const { data, error } = await supabase
    .from('watched_channels')
    .select()
    .eq('is_active', true)
    .order('last_snapshotted_at', { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(`listActiveWatchedChannels: ${error.message}`);
  return (data ?? []) as WatchedChannel[];
}

export async function evictInactiveWatchedChannels(
  supabase: SupabaseClient,
  cutoffDate: Date,
): Promise<number> {
  const { count, error } = await supabase
    .from('watched_channels')
    .update({ is_active: false }, { count: 'exact' })
    .eq('is_active', true)
    .lt('last_snapshotted_at', cutoffDate.toISOString());
  if (error) throw new Error(`evictInactiveWatchedChannels: ${error.message}`);
  return count ?? 0;
}
```

`src/lib/supabase/repositories/competitor-channels.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CompetitorChannel {
  channel_id: string;
  channel_handle: string | null;
  channel_title: string | null;
  added_at: string;
  is_active: boolean;
}

export interface AddCompetitorChannelParams {
  channelId: string;
  channelHandle?: string | null;
  channelTitle?: string | null;
}

export async function addCompetitorChannel(
  supabase: SupabaseClient,
  params: AddCompetitorChannelParams,
): Promise<CompetitorChannel> {
  const { data, error } = await supabase
    .from('competitor_channels')
    .upsert({
      channel_id: params.channelId,
      channel_handle: params.channelHandle ?? null,
      channel_title: params.channelTitle ?? null,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw new Error(`addCompetitorChannel: ${error.message}`);
  return data as CompetitorChannel;
}

export async function listCompetitorChannels(
  supabase: SupabaseClient,
): Promise<CompetitorChannel[]> {
  const { data, error } = await supabase
    .from('competitor_channels')
    .select()
    .eq('is_active', true)
    .order('added_at', { ascending: false });
  if (error) throw new Error(`listCompetitorChannels: ${error.message}`);
  return (data ?? []) as CompetitorChannel[];
}
```

- [ ] **Step 6: Run tests + tsc**

```bash
npx vitest run src/tests/lib/supabase/watched-channels.test.ts src/tests/lib/supabase/competitor-channels.test.ts
npx tsc --noEmit 2>&1 | grep -v 'src/tests/lib/auth/session.test.ts'
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260528000003_watch_list.sql \
        src/lib/supabase/repositories/watched-channels.ts \
        src/lib/supabase/repositories/competitor-channels.ts \
        src/tests/lib/supabase/watched-channels.test.ts \
        src/tests/lib/supabase/competitor-channels.test.ts
git commit -m "feat(plan-5): watched_channels + velocity snapshots + competitor_channels"
```

---

### Task 4: Migration — agents infrastructure (7 tables in one migration)

**Files:**
- Create: `supabase/migrations/20260528000004_agents.sql`
- Create: `src/lib/supabase/repositories/agents.ts`
- Create: `src/tests/lib/supabase/agents.test.ts`

This is the foundation of the agents UI shell (Sub-phase F). Sub-phase A creates the schema and the registry helpers; activity-log and chat helpers come in Sub-phase F to avoid sprawl here.

- [ ] **Step 1: Write failing tests**

`src/tests/lib/supabase/agents.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  registerAgent,
  listAgents,
  getAgentById,
  updateAgentStatus,
  upsertAgentMemory,
  listAgentMemory,
} from '@/lib/supabase/repositories/agents';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      upsert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      insert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }) }),
      select: () => ({
        order: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }),
        eq: () => ({
          single: async () => ({ data: rows?.[0] ?? null, error }),
          maybeSingle: async () => ({ data: rows?.[0] ?? null, error }),
          order: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }),
        }),
      }),
    }),
  } as never;
}

describe('agents repository', () => {
  it('registerAgent inserts with display fields', async () => {
    const row = { id: 'niche_scout', display_name: 'Niche Scout', is_enabled: true };
    const client = makeClient([row]);
    const result = await registerAgent(client, {
      id: 'niche_scout',
      displayName: 'Niche Scout',
      roleDescription: 'Finds and ranks niches',
      iconName: 'compass',
      accentColorVar: '--accent',
      isEnabled: true,
    });
    expect(result.id).toBe('niche_scout');
  });

  it('listAgents returns all', async () => {
    const client = makeClient([{ id: 'a' }, { id: 'b' }]);
    const result = await listAgents(client);
    expect(result).toHaveLength(2);
  });

  it('updateAgentStatus persists state + activity', async () => {
    const row = { agent_id: 'niche_scout', state: 'working', current_activity: 'Clustering' };
    const client = makeClient([row]);
    const result = await updateAgentStatus(client, 'niche_scout', 'working', 'Clustering');
    expect(result.state).toBe('working');
  });

  it('upsertAgentMemory writes a key-value row', async () => {
    const row = { agent_id: 'niche_scout', memory_key: 'preferred_band', memory_value: { value: 'proven' } };
    const client = makeClient([row]);
    const result = await upsertAgentMemory(client, {
      agentId: 'niche_scout',
      memoryKey: 'preferred_band',
      memoryValue: { value: 'proven' },
      confidence: 0.8,
      editableByUser: true,
    });
    expect(result.memory_key).toBe('preferred_band');
  });
});
```

- [ ] **Step 2: Run tests — confirm FAIL**

```bash
npx vitest run src/tests/lib/supabase/agents.test.ts
```

- [ ] **Step 3: Write the migration SQL**

Create `supabase/migrations/20260528000004_agents.sql`:

```sql
-- Registry of agent identities (seeded in 20260528000010_seed_assistants.sql)
create table if not exists public.agents (
  id text primary key,
  display_name text not null,
  role_description text not null,
  icon_name text not null,
  accent_color_var text not null default '--accent',
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- Current status per agent
create table if not exists public.agent_status (
  agent_id text primary key references public.agents (id) on delete cascade,
  state text not null check (state in ('idle','working','waiting','errored')),
  current_activity text,
  updated_at timestamptz not null default now()
);

-- Full activity log
create table if not exists public.agent_activity_log (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.agents (id) on delete cascade,
  activity_type text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_activity_log_agent_created_idx
  on public.agent_activity_log (agent_id, created_at desc);

-- Per-agent learned preferences (operator-editable)
create table if not exists public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.agents (id) on delete cascade,
  memory_key text not null,
  memory_value jsonb not null,
  confidence numeric(4,3) not null default 0.5,
  last_updated_at timestamptz not null default now(),
  editable_by_user boolean not null default true,
  unique (agent_id, memory_key)
);

create index if not exists agent_memory_agent_idx
  on public.agent_memory (agent_id);

-- Per-agent configurable behavior
create table if not exists public.agent_settings (
  agent_id text primary key references public.agents (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Per-agent chat thread
create table if not exists public.agent_chat_threads (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.agents (id) on delete cascade,
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  title text
);

create index if not exists agent_chat_threads_agent_idx
  on public.agent_chat_threads (agent_id, last_message_at desc);

create table if not exists public.agent_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.agent_chat_threads (id) on delete cascade,
  role text not null check (role in ('user','agent','system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists agent_chat_messages_thread_created_idx
  on public.agent_chat_messages (thread_id, created_at asc);
```

- [ ] **Step 4: Apply migration via Supabase MCP**

```
mcp__eb0e215d-09d2-42bf-b558-7c883674fdc6__apply_migration({
  project_id: 'jfmjppzjicvbpnlkmxbg',
  name: '20260528000004_agents',
  query: '<contents>'
})
```

Verify all 7 tables exist:

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name like 'agent%'
order by table_name;
```

Expected: 7 rows (`agent_activity_log`, `agent_chat_messages`, `agent_chat_threads`, `agent_memory`, `agent_settings`, `agent_status`, `agents`).

- [ ] **Step 5: Write the repository helpers**

`src/lib/supabase/repositories/agents.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AgentState = 'idle' | 'working' | 'waiting' | 'errored';

export interface Agent {
  id: string;
  display_name: string;
  role_description: string;
  icon_name: string;
  accent_color_var: string;
  is_enabled: boolean;
  created_at: string;
}

export interface AgentStatus {
  agent_id: string;
  state: AgentState;
  current_activity: string | null;
  updated_at: string;
}

export interface AgentMemory {
  id: string;
  agent_id: string;
  memory_key: string;
  memory_value: unknown;
  confidence: number;
  last_updated_at: string;
  editable_by_user: boolean;
}

export interface RegisterAgentParams {
  id: string;
  displayName: string;
  roleDescription: string;
  iconName: string;
  accentColorVar?: string;
  isEnabled?: boolean;
}

export async function registerAgent(
  supabase: SupabaseClient,
  params: RegisterAgentParams,
): Promise<Agent> {
  const { data, error } = await supabase
    .from('agents')
    .upsert({
      id: params.id,
      display_name: params.displayName,
      role_description: params.roleDescription,
      icon_name: params.iconName,
      accent_color_var: params.accentColorVar ?? '--accent',
      is_enabled: params.isEnabled ?? true,
    })
    .select()
    .single();
  if (error) throw new Error(`registerAgent: ${error.message}`);
  return data as Agent;
}

export async function listAgents(supabase: SupabaseClient): Promise<Agent[]> {
  const { data, error } = await supabase
    .from('agents')
    .select()
    .order('id', { ascending: true });
  if (error) throw new Error(`listAgents: ${error.message}`);
  return (data ?? []) as Agent[];
}

export async function getAgentById(
  supabase: SupabaseClient,
  id: string,
): Promise<Agent | null> {
  const { data, error } = await supabase
    .from('agents')
    .select()
    .eq('id', id)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    throw new Error(`getAgentById: ${error.message}`);
  }
  return (data as Agent | null) ?? null;
}

export async function updateAgentStatus(
  supabase: SupabaseClient,
  agentId: string,
  state: AgentState,
  currentActivity: string | null,
): Promise<AgentStatus> {
  const { data, error } = await supabase
    .from('agent_status')
    .upsert({
      agent_id: agentId,
      state,
      current_activity: currentActivity,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(`updateAgentStatus: ${error.message}`);
  return data as AgentStatus;
}

export interface UpsertAgentMemoryParams {
  agentId: string;
  memoryKey: string;
  memoryValue: unknown;
  confidence?: number;
  editableByUser?: boolean;
}

export async function upsertAgentMemory(
  supabase: SupabaseClient,
  params: UpsertAgentMemoryParams,
): Promise<AgentMemory> {
  const { data, error } = await supabase
    .from('agent_memory')
    .upsert(
      {
        agent_id: params.agentId,
        memory_key: params.memoryKey,
        memory_value: params.memoryValue,
        confidence: params.confidence ?? 0.5,
        editable_by_user: params.editableByUser ?? true,
        last_updated_at: new Date().toISOString(),
      },
      { onConflict: 'agent_id,memory_key' },
    )
    .select()
    .single();
  if (error) throw new Error(`upsertAgentMemory: ${error.message}`);
  return data as AgentMemory;
}

export async function listAgentMemory(
  supabase: SupabaseClient,
  agentId: string,
): Promise<AgentMemory[]> {
  const { data, error } = await supabase
    .from('agent_memory')
    .select()
    .eq('agent_id', agentId)
    .order('last_updated_at', { ascending: false });
  if (error) throw new Error(`listAgentMemory: ${error.message}`);
  return (data ?? []) as AgentMemory[];
}
```

- [ ] **Step 6: Run tests + tsc**

```bash
npx vitest run src/tests/lib/supabase/agents.test.ts
npx tsc --noEmit 2>&1 | grep -v 'src/tests/lib/auth/session.test.ts'
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260528000004_agents.sql \
        src/lib/supabase/repositories/agents.ts \
        src/tests/lib/supabase/agents.test.ts
git commit -m "feat(plan-5): agents infrastructure tables + registry repo"
```

---

### Task 5: Migration — pre-publication QA tables (video_reviews + feedback)

**Files:**
- Create: `supabase/migrations/20260528000005_video_reviews.sql`
- Create: `src/lib/supabase/repositories/video-reviews.ts`
- Create: `src/tests/lib/supabase/video-reviews.test.ts`

- [ ] **Step 1: Write failing tests**

`src/tests/lib/supabase/video-reviews.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  insertVideoReview,
  getVideoReviewByVideoId,
  recordReviewFeedback,
} from '@/lib/supabase/repositories/video-reviews';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: rows?.[0] ?? null, error }),
          order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: rows?.[0] ?? null, error }) }) }),
        }),
      }),
    }),
  } as never;
}

describe('video-reviews repository', () => {
  it('insertVideoReview returns full row', async () => {
    const row = {
      id: 'r1',
      your_video_id: 'v1',
      overall_verdict: 'ship',
      title_score: 0.82,
    };
    const client = makeClient([row]);
    const result = await insertVideoReview(client, {
      yourVideoId: 'v1',
      titleScore: 0.82, titleVerdict: 'pass',
      thumbnailScore: 0.78, thumbnailVerdict: 'pass',
      hookScore: 0.6, hookVerdict: 'needs_work',
      pacingScore: 0.7, pacingVerdict: 'pass',
      descriptionSeoScore: 0.5, descriptionSeoVerdict: 'needs_work',
      audioScore: 0.9, audioVerdict: 'pass',
      visualScore: 0.85, visualVerdict: 'pass',
      overallVerdict: 'ship',
      suggestions: [{ component: 'hook', severity: 'needs_work', suggestion_text: 'tighten the open' }],
      strengths: [{ component: 'audio', what_works_text: 'levels are clean' }],
      model: 'anthropic/claude-sonnet-4-5',
      promptVersion: 'review-v1',
    });
    expect(result.id).toBe('r1');
  });

  it('recordReviewFeedback writes accepted action', async () => {
    const row = { id: 'f1', video_review_id: 'r1', suggestion_index: 0, action_taken: 'accepted' };
    const client = makeClient([row]);
    const result = await recordReviewFeedback(client, {
      videoReviewId: 'r1',
      suggestionIndex: 0,
      actionTaken: 'accepted',
    });
    expect(result.action_taken).toBe('accepted');
  });
});
```

- [ ] **Step 2: Run tests — confirm FAIL**

```bash
npx vitest run src/tests/lib/supabase/video-reviews.test.ts
```

- [ ] **Step 3: Write the migration SQL**

Create `supabase/migrations/20260528000005_video_reviews.sql`:

```sql
-- Pre-publication QA output per draft
create table if not exists public.video_reviews (
  id uuid primary key default gen_random_uuid(),
  your_video_id uuid not null references public.your_videos (id) on delete cascade,
  reviewed_at timestamptz not null default now(),

  title_score numeric(4,3),
  title_verdict text check (title_verdict in ('pass','needs_work','fail')),
  thumbnail_score numeric(4,3),
  thumbnail_verdict text check (thumbnail_verdict in ('pass','needs_work','fail')),
  hook_score numeric(4,3),
  hook_verdict text check (hook_verdict in ('pass','needs_work','fail')),
  pacing_score numeric(4,3),
  pacing_verdict text check (pacing_verdict in ('pass','needs_work','fail')),
  description_seo_score numeric(4,3),
  description_seo_verdict text check (description_seo_verdict in ('pass','needs_work','fail')),
  audio_score numeric(4,3),
  audio_verdict text check (audio_verdict in ('pass','needs_work','fail')),
  visual_score numeric(4,3),
  visual_verdict text check (visual_verdict in ('pass','needs_work','fail')),

  overall_verdict text not null check (overall_verdict in ('ship','revise','block')),
  suggestions jsonb not null default '[]'::jsonb,
  strengths jsonb not null default '[]'::jsonb,
  model text not null,
  prompt_version text not null
);

create index if not exists video_reviews_video_idx
  on public.video_reviews (your_video_id, reviewed_at desc);

-- Operator feedback on each suggestion (learning signal)
create table if not exists public.video_review_feedback (
  id uuid primary key default gen_random_uuid(),
  video_review_id uuid not null references public.video_reviews (id) on delete cascade,
  suggestion_index integer not null,
  action_taken text not null check (action_taken in ('accepted','ignored','partial')),
  recorded_at timestamptz not null default now()
);

create index if not exists video_review_feedback_review_idx
  on public.video_review_feedback (video_review_id, recorded_at desc);
```

- [ ] **Step 4: Apply via Supabase MCP**

```
mcp__eb0e215d-09d2-42bf-b558-7c883674fdc6__apply_migration({
  project_id: 'jfmjppzjicvbpnlkmxbg',
  name: '20260528000005_video_reviews',
  query: '<contents>'
})
```

Verify:

```sql
select table_name from information_schema.tables
where table_schema='public' and table_name in ('video_reviews','video_review_feedback')
order by table_name;
```

Expected: 2 rows.

- [ ] **Step 5: Write the repository helper**

`src/lib/supabase/repositories/video-reviews.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ReviewVerdict = 'pass' | 'needs_work' | 'fail';
export type OverallVerdict = 'ship' | 'revise' | 'block';
export type FeedbackAction = 'accepted' | 'ignored' | 'partial';

export interface ReviewSuggestion {
  component: string;
  severity: ReviewVerdict;
  suggestion_text: string;
  ref_video_ids?: string[];
}

export interface ReviewStrength {
  component: string;
  what_works_text: string;
}

export interface VideoReview {
  id: string;
  your_video_id: string;
  reviewed_at: string;
  title_score: number | null;
  title_verdict: ReviewVerdict | null;
  thumbnail_score: number | null;
  thumbnail_verdict: ReviewVerdict | null;
  hook_score: number | null;
  hook_verdict: ReviewVerdict | null;
  pacing_score: number | null;
  pacing_verdict: ReviewVerdict | null;
  description_seo_score: number | null;
  description_seo_verdict: ReviewVerdict | null;
  audio_score: number | null;
  audio_verdict: ReviewVerdict | null;
  visual_score: number | null;
  visual_verdict: ReviewVerdict | null;
  overall_verdict: OverallVerdict;
  suggestions: ReviewSuggestion[];
  strengths: ReviewStrength[];
  model: string;
  prompt_version: string;
}

export interface InsertVideoReviewParams {
  yourVideoId: string;
  titleScore: number; titleVerdict: ReviewVerdict;
  thumbnailScore: number; thumbnailVerdict: ReviewVerdict;
  hookScore: number; hookVerdict: ReviewVerdict;
  pacingScore: number; pacingVerdict: ReviewVerdict;
  descriptionSeoScore: number; descriptionSeoVerdict: ReviewVerdict;
  audioScore: number; audioVerdict: ReviewVerdict;
  visualScore: number; visualVerdict: ReviewVerdict;
  overallVerdict: OverallVerdict;
  suggestions: ReviewSuggestion[];
  strengths: ReviewStrength[];
  model: string;
  promptVersion: string;
}

export async function insertVideoReview(
  supabase: SupabaseClient,
  params: InsertVideoReviewParams,
): Promise<VideoReview> {
  const { data, error } = await supabase
    .from('video_reviews')
    .insert({
      your_video_id: params.yourVideoId,
      title_score: params.titleScore, title_verdict: params.titleVerdict,
      thumbnail_score: params.thumbnailScore, thumbnail_verdict: params.thumbnailVerdict,
      hook_score: params.hookScore, hook_verdict: params.hookVerdict,
      pacing_score: params.pacingScore, pacing_verdict: params.pacingVerdict,
      description_seo_score: params.descriptionSeoScore, description_seo_verdict: params.descriptionSeoVerdict,
      audio_score: params.audioScore, audio_verdict: params.audioVerdict,
      visual_score: params.visualScore, visual_verdict: params.visualVerdict,
      overall_verdict: params.overallVerdict,
      suggestions: params.suggestions,
      strengths: params.strengths,
      model: params.model,
      prompt_version: params.promptVersion,
    })
    .select()
    .single();
  if (error) throw new Error(`insertVideoReview: ${error.message}`);
  return data as VideoReview;
}

export async function getVideoReviewByVideoId(
  supabase: SupabaseClient,
  yourVideoId: string,
): Promise<VideoReview | null> {
  const { data, error } = await supabase
    .from('video_reviews')
    .select()
    .eq('your_video_id', yourVideoId)
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    throw new Error(`getVideoReviewByVideoId: ${error.message}`);
  }
  return (data as VideoReview | null) ?? null;
}

export interface RecordReviewFeedbackParams {
  videoReviewId: string;
  suggestionIndex: number;
  actionTaken: FeedbackAction;
}

export async function recordReviewFeedback(
  supabase: SupabaseClient,
  params: RecordReviewFeedbackParams,
): Promise<{ id: string; video_review_id: string; suggestion_index: number; action_taken: FeedbackAction; recorded_at: string }> {
  const { data, error } = await supabase
    .from('video_review_feedback')
    .insert({
      video_review_id: params.videoReviewId,
      suggestion_index: params.suggestionIndex,
      action_taken: params.actionTaken,
    })
    .select()
    .single();
  if (error) throw new Error(`recordReviewFeedback: ${error.message}`);
  return data as { id: string; video_review_id: string; suggestion_index: number; action_taken: FeedbackAction; recorded_at: string };
}
```

- [ ] **Step 6: Run tests + tsc**

```bash
npx vitest run src/tests/lib/supabase/video-reviews.test.ts
npx tsc --noEmit 2>&1 | grep -v 'src/tests/lib/auth/session.test.ts'
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260528000005_video_reviews.sql \
        src/lib/supabase/repositories/video-reviews.ts \
        src/tests/lib/supabase/video-reviews.test.ts
git commit -m "feat(plan-5): video_reviews + feedback tables + repo"
```

---

### Task 6: Migration — channel_personas (slot reserved for Phase 2)

**Files:**
- Create: `supabase/migrations/20260528000006_channel_personas.sql`

(No repository helpers in Sub-phase A — Phase 2 populates the table and adds helpers when it lands. The migration creates the table now so the schema is stable.)

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260528000006_channel_personas.sql`:

```sql
-- Channel persona (intro/outro/voice/captions). Phase 2 populates rows + adds repo helpers.
create table if not exists public.channel_personas (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  intro_template jsonb not null default '{}'::jsonb,
  outro_template jsonb not null default '{}'::jsonb,
  voice_profile jsonb not null default '{}'::jsonb,
  brand_watermark_url text,
  caption_style jsonb not null default '{}'::jsonb,
  signature_phrases text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id)
);
```

- [ ] **Step 2: Apply via Supabase MCP**

```
mcp__eb0e215d-09d2-42bf-b558-7c883674fdc6__apply_migration({
  project_id: 'jfmjppzjicvbpnlkmxbg',
  name: '20260528000006_channel_personas',
  query: '<contents>'
})
```

Verify:

```sql
select table_name from information_schema.tables
where table_schema='public' and table_name='channel_personas';
```

Expected: 1 row.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260528000006_channel_personas.sql
git commit -m "feat(plan-5): channel_personas table (phase 2 fills)"
```

---

### Task 7: Migration — kill_criteria_log + seed first row

**Files:**
- Create: `supabase/migrations/20260528000007_kill_criteria.sql`
- Create: `src/lib/supabase/repositories/kill-criteria.ts`
- Create: `src/tests/lib/supabase/kill-criteria.test.ts`

- [ ] **Step 1: Write failing tests**

`src/tests/lib/supabase/kill-criteria.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  recordKillCriteriaEvaluation,
  listKillCriteriaEvaluations,
} from '@/lib/supabase/repositories/kill-criteria';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      select: () => ({
        order: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }),
      }),
    }),
  } as never;
}

describe('kill-criteria repository', () => {
  it('recordKillCriteriaEvaluation stores verdict + evidence', async () => {
    const row = { id: 'k1', criterion: '90d_videos_over_1000', verdict: 'pass' };
    const client = makeClient([row]);
    const result = await recordKillCriteriaEvaluation(client, {
      criterion: '90d_videos_over_1000',
      verdict: 'pass',
      evidence: { count: 4 },
      decisionText: 'on track',
    });
    expect(result.verdict).toBe('pass');
  });

  it('listKillCriteriaEvaluations returns history', async () => {
    const client = makeClient([{ id: 'k1' }, { id: 'k2' }]);
    const result = await listKillCriteriaEvaluations(client);
    expect(result).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests — confirm FAIL**

```bash
npx vitest run src/tests/lib/supabase/kill-criteria.test.ts
```

- [ ] **Step 3: Write the migration SQL**

Create `supabase/migrations/20260528000007_kill_criteria.sql`:

```sql
-- Multi-row evaluation log for Plan #5 viability checks
create table if not exists public.kill_criteria_log (
  id uuid primary key default gen_random_uuid(),
  evaluated_at timestamptz not null default now(),
  criterion text not null,
  verdict text not null check (verdict in ('pass','fail','inconclusive')),
  evidence jsonb not null default '{}'::jsonb,
  decision_text text not null
);

create index if not exists kill_criteria_log_evaluated_at_idx
  on public.kill_criteria_log (evaluated_at desc);

-- Seed the first row marking the Plan #5 start
insert into public.kill_criteria_log (criterion, verdict, evidence, decision_text)
values (
  'plan_5_start',
  'inconclusive',
  '{"start_date":"2026-05-28","first_phase":"phase_1_sub_a"}'::jsonb,
  'Plan #5 brainstorm + spec complete. Implementation begins with Phase 1 Sub-phase A. First viability evaluation: 90 days post-Phase-1 launch.'
);
```

- [ ] **Step 4: Apply via Supabase MCP**

```
mcp__eb0e215d-09d2-42bf-b558-7c883674fdc6__apply_migration({
  project_id: 'jfmjppzjicvbpnlkmxbg',
  name: '20260528000007_kill_criteria',
  query: '<contents>'
})
```

Verify table + seed row:

```sql
select count(*) from public.kill_criteria_log where criterion = 'plan_5_start';
```

Expected: 1.

- [ ] **Step 5: Write the repository helper**

`src/lib/supabase/repositories/kill-criteria.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type KillVerdict = 'pass' | 'fail' | 'inconclusive';

export interface KillCriteriaEvaluation {
  id: string;
  evaluated_at: string;
  criterion: string;
  verdict: KillVerdict;
  evidence: Record<string, unknown>;
  decision_text: string;
}

export interface RecordKillCriteriaParams {
  criterion: string;
  verdict: KillVerdict;
  evidence: Record<string, unknown>;
  decisionText: string;
}

export async function recordKillCriteriaEvaluation(
  supabase: SupabaseClient,
  params: RecordKillCriteriaParams,
): Promise<KillCriteriaEvaluation> {
  const { data, error } = await supabase
    .from('kill_criteria_log')
    .insert({
      criterion: params.criterion,
      verdict: params.verdict,
      evidence: params.evidence,
      decision_text: params.decisionText,
    })
    .select()
    .single();
  if (error) throw new Error(`recordKillCriteriaEvaluation: ${error.message}`);
  return data as KillCriteriaEvaluation;
}

export async function listKillCriteriaEvaluations(
  supabase: SupabaseClient,
): Promise<KillCriteriaEvaluation[]> {
  const { data, error } = await supabase
    .from('kill_criteria_log')
    .select()
    .order('evaluated_at', { ascending: false });
  if (error) throw new Error(`listKillCriteriaEvaluations: ${error.message}`);
  return (data ?? []) as KillCriteriaEvaluation[];
}
```

- [ ] **Step 6: Run tests + tsc**

```bash
npx vitest run src/tests/lib/supabase/kill-criteria.test.ts
npx tsc --noEmit 2>&1 | grep -v 'src/tests/lib/auth/session.test.ts'
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260528000007_kill_criteria.sql \
        src/lib/supabase/repositories/kill-criteria.ts \
        src/tests/lib/supabase/kill-criteria.test.ts
git commit -m "feat(plan-5): kill_criteria_log + seed start row"
```

---

### Task 8: Migration — additive columns on your_videos

**Files:**
- Create: `supabase/migrations/20260528000008_your_videos_additions.sql`
- Modify: `src/lib/supabase/repositories/your-videos.ts` — extend `YourVideo` type with new columns.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260528000008_your_videos_additions.sql`:

```sql
alter table public.your_videos
  add column if not exists source_niche_cluster_id uuid references public.niche_clusters (id) on delete set null,
  add column if not exists script_brief jsonb,
  add column if not exists review_id uuid references public.video_reviews (id) on delete set null,
  add column if not exists editor_session_id uuid;

-- Note: editor_session_id has no FK constraint in Sub-phase A.
-- Phase 3 creates the editor_sessions table and the FK will be added then.

create index if not exists your_videos_source_niche_cluster_idx
  on public.your_videos (source_niche_cluster_id)
  where source_niche_cluster_id is not null;
```

- [ ] **Step 2: Apply via Supabase MCP**

```
mcp__eb0e215d-09d2-42bf-b558-7c883674fdc6__apply_migration({
  project_id: 'jfmjppzjicvbpnlkmxbg',
  name: '20260528000008_your_videos_additions',
  query: '<contents>'
})
```

Verify columns exist:

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='your_videos'
  and column_name in ('source_niche_cluster_id','script_brief','review_id','editor_session_id')
order by column_name;
```

Expected: 4 rows.

- [ ] **Step 3: Extend the YourVideo TypeScript type**

Read `src/lib/supabase/repositories/your-videos.ts` and locate the `YourVideo` type definition. Add these four fields preserving all existing fields:

```ts
source_niche_cluster_id: string | null;
script_brief: Record<string, unknown> | null;
review_id: string | null;
editor_session_id: string | null;
```

(Insert alphabetically among the existing fields or grouped near related fields — match the existing style. Do not modify any other field.)

- [ ] **Step 4: Run the full test suite — confirm no regressions**

```bash
npx vitest run
```

Expected: baseline preserved (301 passing from Plan #4 Sub-phase D; new tasks add tests that will land in their own commits — re-running here just confirms no regression).

- [ ] **Step 5: Run tsc — confirm no new errors**

```bash
npx tsc --noEmit 2>&1 | grep -v 'src/tests/lib/auth/session.test.ts'
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260528000008_your_videos_additions.sql \
        src/lib/supabase/repositories/your-videos.ts
git commit -m "feat(plan-5): your_videos additions for niche linkage + review + editor session"
```

---

### Task 9: Data migration — unstick the existing `'uploading'` row

**Files:**
- Create: `supabase/migrations/20260528000009_fix_stuck_uploading_row.sql`
- Create: `src/tests/migrations/fix-stuck-uploading-row.test.ts`

This idempotent UPDATE flips the prod row `11c221e0-693a-4e4c-a096-24725c4e327b` from `'uploading'` → `'rendered'`, nulls `scheduled_for`, bumps `updated_at`. Also marks the related `render_jobs` row as `failed` with an explanatory `last_error` so it's queryable historically without showing as still-running.

- [ ] **Step 1: Write the smoke test**

`src/tests/migrations/fix-stuck-uploading-row.test.ts`:

```ts
// Sanity test for the data migration shape. Does NOT hit prod;
// just verifies the SQL semantics for the controller's pre-apply review.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('20260528000009_fix_stuck_uploading_row.sql', () => {
  const sql = readFileSync(
    resolve('supabase/migrations/20260528000009_fix_stuck_uploading_row.sql'),
    'utf-8',
  );

  it('targets the known stuck row id', () => {
    expect(sql).toContain('11c221e0-693a-4e4c-a096-24725c4e327b');
  });

  it('is idempotent (guards on status = uploading)', () => {
    expect(sql.toLowerCase()).toMatch(/where[\s\S]+status\s*=\s*'uploading'/);
  });

  it('flips status to rendered + nulls scheduled_for', () => {
    expect(sql.toLowerCase()).toMatch(/set[\s\S]+status\s*=\s*'rendered'/);
    expect(sql.toLowerCase()).toMatch(/scheduled_for\s*=\s*null/);
  });

  it('updates updated_at to now()', () => {
    expect(sql.toLowerCase()).toMatch(/updated_at\s*=\s*now\(\)/);
  });

  it('also marks the related render_jobs row as failed', () => {
    expect(sql.toLowerCase()).toContain('render_jobs');
    expect(sql.toLowerCase()).toMatch(/status\s*=\s*'failed'/);
  });
});
```

- [ ] **Step 2: Run test — confirm FAIL**

```bash
npx vitest run src/tests/migrations/fix-stuck-uploading-row.test.ts
```

Expected: FAIL — migration file does not exist.

- [ ] **Step 3: Write the migration SQL**

Create `supabase/migrations/20260528000009_fix_stuck_uploading_row.sql`:

```sql
-- Plan #5 pivot: auto-upload removed; flip the prod row stuck at status='uploading' back to 'rendered'
-- so Darius can post it manually once the Phase 4 mark-posted flow ships.
-- Idempotent: only fires if the row is still in 'uploading' state.

update public.your_videos
set
  status = 'rendered',
  scheduled_for = null,
  updated_at = now()
where id = '11c221e0-693a-4e4c-a096-24725c4e327b'::uuid
  and status = 'uploading';

-- Also mark the corresponding running upload render_job as failed so /admin queries
-- don't show it as still-running. Idempotent on status = 'running'.
update public.render_jobs
set
  status = 'failed',
  finished_at = now(),
  last_error = coalesce(last_error || E'\n', '') ||
    '[plan-5] Auto-upload removed from product. Stuck row reverted to rendered for manual posting.'
where your_video_id = '11c221e0-693a-4e4c-a096-24725c4e327b'::uuid
  and job_type = 'upload'
  and status = 'running';
```

- [ ] **Step 4: Apply via Supabase MCP**

```
mcp__eb0e215d-09d2-42bf-b558-7c883674fdc6__apply_migration({
  project_id: 'jfmjppzjicvbpnlkmxbg',
  name: '20260528000009_fix_stuck_uploading_row',
  query: '<contents>'
})
```

Verify the row state:

```sql
select id, status, scheduled_for from public.your_videos
where id = '11c221e0-693a-4e4c-a096-24725c4e327b';
```

Expected: 1 row with `status='rendered'`, `scheduled_for=null`.

```sql
select id, status, last_error from public.render_jobs
where your_video_id = '11c221e0-693a-4e4c-a096-24725c4e327b'
  and job_type = 'upload'
order by created_at desc limit 1;
```

Expected: 1 row with `status='failed'`, `last_error` containing the `[plan-5]` marker.

- [ ] **Step 5: Run tests — confirm pass**

```bash
npx vitest run src/tests/migrations/fix-stuck-uploading-row.test.ts
```

Expected: all 5 assertions green.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260528000009_fix_stuck_uploading_row.sql \
        src/tests/migrations/fix-stuck-uploading-row.test.ts
git commit -m "fix(plan-5): unstick the prod row stuck at status='uploading'"
```

---

### Task 10: Seed assistants registry + default settings

**Files:**
- Create: `supabase/migrations/20260528000010_seed_assistants.sql`

**Naming note (added after A4 landed):** Plan #4 already has a `public.agents` table for script-pipeline workers (strategist, scout, writer, director, voice_coach, etc.) wired through `src/lib/agents/orchestrator.ts`. To avoid collision, Plan #5's user-facing product personas became `assistants` end-to-end at the DB + repo layer (commit `fec0c8d`). The UI still labels them "Agents" per Darius's preference, but tables/repo/types use `assistant*` naming. This task seeds the 6 Plan #5 product personas into `public.assistants`.

Seeds the six Phase-1-set assistant identities with their display fields and disabled-state for Phase-3/4 placeholder assistants.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260528000010_seed_assistants.sql`:

```sql
-- Seed the six Plan #5 Phase-1 product assistants (user-facing personas, distinct from Plan #4 pipeline `agents`).
insert into public.assistants (id, display_name, role_description, icon_name, accent_color_var, is_enabled)
values
  ('niche_scout',         'Niche Scout',         'Finds and ranks proven + first-mover niches across all sources.', 'compass',    '--accent', true),
  ('watch_list_curator',  'Watch-list Curator',  'Manages the channel watch-list; auto-discovers and evicts.',      'eye',        '--accent', true),
  ('generator',           'Generator',           'Drafts videos from niche briefs. Native short-form in Phase 1; longform in Phase 2.', 'sparkles', '--accent', true),
  ('video_reviewer',      'Reviewer',            'Pre-publication QA scorecard and suggestions.',                    'shield-check','--accent', true),
  ('analyst',             'Analyst',             'Post-publication narrative analytics. Placeholder until Phase 4.', 'line-chart', '--text-tertiary', false),
  ('editor_copilot',      'Editor',              'CapCut / Premiere editing co-pilot. Placeholder until Phase 3.',   'scissors',   '--text-tertiary', false)
on conflict (id) do update set
  display_name = excluded.display_name,
  role_description = excluded.role_description,
  icon_name = excluded.icon_name,
  accent_color_var = excluded.accent_color_var,
  is_enabled = excluded.is_enabled;

-- Default assistant_status: all idle
insert into public.assistant_status (assistant_id, state, current_activity)
select id, 'idle', null from public.assistants
on conflict (assistant_id) do nothing;

-- Default assistant_settings: empty jsonb (each assistant reads/writes its own keys later)
insert into public.assistant_settings (assistant_id, settings)
select id, '{}'::jsonb from public.assistants
on conflict (assistant_id) do nothing;
```

- [ ] **Step 2: Apply via Supabase MCP**

```
mcp__eb0e215d-09d2-42bf-b558-7c883674fdc6__apply_migration({
  project_id: 'jfmjppzjicvbpnlkmxbg',
  name: '20260528000010_seed_agents',
  query: '<contents>'
})
```

Verify:

```sql
select id, display_name, is_enabled from public.assistants order by id;
```

Expected: 6 rows with the IDs above; `analyst` and `editor_copilot` have `is_enabled=false`; others `true`.

```sql
select count(*) from public.assistant_status;
select count(*) from public.assistant_settings;
```

Expected: 6 / 6.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260528000010_seed_assistants.sql
git commit -m "feat(plan-5): seed six agent identities + default status/settings"
```

---

### Task 11: Regenerate Supabase TypeScript types

**Files:**
- Modify: `src/lib/supabase/types.ts`

- [ ] **Step 1: Regenerate types**

If the Supabase CLI is available locally, run:

```bash
npx supabase gen types typescript --project-id jfmjppzjicvbpnlkmxbg --schema public > src/lib/supabase/types.ts
```

If not available locally, use the MCP equivalent:

```
mcp__eb0e215d-09d2-42bf-b558-7c883674fdc6__generate_typescript_types({
  project_id: 'jfmjppzjicvbpnlkmxbg'
})
```

…and overwrite `src/lib/supabase/types.ts` with the returned content.

- [ ] **Step 2: Verify all new tables appear**

Open `src/lib/supabase/types.ts` and confirm the following table names appear in the `Database['public']['Tables']` interface:

- `shorts_observations`, `shorts_classifications`, `classification_samples`
- `niche_clusters`, `niche_actions`, `niche_predictions`, `vidiq_appearances`
- `watched_channels`, `video_velocity_snapshots`, `competitor_channels`
- `assistants`, `assistant_status`, `assistant_activity_log`, `assistant_memory`, `assistant_settings`, `assistant_chat_threads`, `assistant_chat_messages`
- `video_reviews`, `video_review_feedback`
- `channel_personas`
- `kill_criteria_log`
- `your_videos` (existing — verify the 4 new columns `source_niche_cluster_id`, `script_brief`, `review_id`, `editor_session_id` are present)

- [ ] **Step 3: Run tsc — confirm no errors caused by type regeneration**

```bash
npx tsc --noEmit 2>&1 | grep -v 'src/tests/lib/auth/session.test.ts'
```

Expected: clean (only the known pre-existing session.test.ts error).

- [ ] **Step 4: Run full vitest suite — confirm baseline preserved**

```bash
npx vitest run 2>&1 | tail -6
```

Expected: baseline ≥301 + the new Sub-phase A repository tests (~25 new). 11 pre-existing env-dependent failures unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/types.ts
git commit -m "chore(plan-5): regenerate Supabase types for Phase-1 schema"
```

---

### Task 12: Open PR + handoff

**Files:**
- Create: `docs/superpowers/notes/2026-05-28-plan-5-phase-1-sub-a-handoff.md`

- [ ] **Step 1: Push branch**

```bash
git push -u origin plan-5-phase-1-sub-a 2>&1 | tail -5
```

- [ ] **Step 2: Write handoff note**

Create `docs/superpowers/notes/2026-05-28-plan-5-phase-1-sub-a-handoff.md` with sections:

- What Sub-phase A shipped (concise list of tables, repos, migrations).
- Verified prod state (the stuck row is now rendered, agent registry seeded, all 21 new tables exist).
- Tests added (count + path patterns).
- What does NOT ship yet (zero UI; no ingestion crons; no API routes). The deliverable is schema + types + helpers.
- Next sub-phase: B (design system foundation). Includes a fresh-chat kickoff prompt for that sub-phase.

- [ ] **Step 3: Open PR**

```bash
gh pr create --repo dariusraphael97-beep/shorts-os --base main --head plan-5-phase-1-sub-a \
  --title "Plan #5 Phase 1 Sub-phase A — schema foundation + agent registry" \
  --body "$(cat <<'EOF'
## Summary

Plan #5 Phase 1 Sub-phase A: the database foundation for the creator co-pilot pivot.

- 10 new migrations (21 new tables + 4 additive columns on your_videos + 1 data fix).
- 10 repository helper modules with full TypeScript types.
- Agent registry seeded with 6 identities (4 enabled in Phase 1; 2 placeholder for Phases 3 + 4).
- Stuck prod `'uploading'` row flipped back to `'rendered'`; its render_job marked failed with an explanatory marker.
- Supabase types regenerated.
- ~25 new repository tests; baseline of 301 preserved.

## Spec reference

`docs/superpowers/specs/2026-05-28-plan-5-creator-copilot-design.md` — sections 4.1, 4.8, 4.11, 4.13, 9.

## Test plan

- [ ] Vercel preview builds clean (this PR contains no UI or runtime code — should be a no-op deploy).
- [ ] Confirm all 10 migrations are visible in Supabase MCP `list_migrations`.
- [ ] Confirm 6 rows in `public.agents`; 4 enabled, 2 disabled.
- [ ] Confirm the stuck row (id `11c221e0-693a-4e4c-a096-24725c4e327b`) is now `status='rendered'`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Commit the handoff note + push**

```bash
git add docs/superpowers/notes/2026-05-28-plan-5-phase-1-sub-a-handoff.md
git commit -m "docs(plan-5): Sub-phase A handoff"
git push
```

---

## Sub-phase A complete. Next sub-phases (to be planned independently):

- **Sub-phase B — Design System foundation** (~5–7 days). Token globals, Framer Motion install, layout primitives (translucent sidebar, command palette, empty states), product compositions (NicheCard, AgentCard, ReviewScorecard, etc.). Builds before any new pages.
- **Sub-phase C — Multi-source ingestion** (~7–10 days). YouTube category sweep, targeted Shorts search, watch-list velocity, channel-stat enrichment, Reddit topic-discovery, Google Trends, TikTok Creative Center.
- **Sub-phase D — Classifier + clustering + scoring** (~5–7 days). LLM topic+format passes (vision + transcript), prompt_version + reclassification, topic fuzzy-merge embeddings, first-mover + proven scoring, MMR diversity selection.
- **Sub-phase E — Niche Finder UI** (~7–10 days). /niches dashboard + detail, watch-list, digest-preview, competitors page.
- **Sub-phase F — Agents + Mission Control** (~5–7 days). Mission Control default landing, per-agent pages (Activity / Chat / Memory / Settings tabs), activity log + chat helpers, status feed.
- **Sub-phase G — Weekly digest email** (~3–4 days). React Email components, Resend integration, digest_runs, cron, test-mode admin route.
- **Sub-phase H — Video Reviewer agent + pre-pub QA UI** (~5–7 days). 7-component analysis pipelines, /lab/[videoId]/review page, scorecard component, feedback learning loop.
- **Sub-phase I — Existing pages rebuild** (~5–7 days). /lab, /lab/drafts, /clips, /settings, /admin/* all rebuilt against new design system.
- **Sub-phase J — Sealed predictions, moat validation, onboarding, QC admin** (~5–7 days). Prediction-write at digest-time, /admin/moat-validation, first-run onboarding, admin surfaces, daily alerts cron.

After Sub-phase J ships, **Phase 1 success criteria** evaluation per spec §4.16 — gates the move to Phase 2.
