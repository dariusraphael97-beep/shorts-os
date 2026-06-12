# Mission Control Agents Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy `/mission-control` cockpit with the 6-agent command-center (grid + health pill + activity feed + per-agent Activity/Chat/Memory/Settings pages), with every status derived from real job/cron ledgers.

**Architecture:** A client-safe registry (`src/lib/assistants/registry.ts`) maps each assistant to its ledger sources and schedules. A pure derivation module (`live-status.ts`) turns ledger rows into statuses + an activity feed; a server-only fetcher (`ledger.ts`) gathers the rows. Pages are server components (`force-dynamic`) with a 15s client `router.refresh()`. Chat is an AI SDK v6 `streamText` route with read-only tools per agent, persisted to the existing `assistant_chat_*` tables.

**Tech Stack:** Next.js 16 App Router (params/searchParams are Promises — read `node_modules/next/dist/docs/` before writing page code), Supabase service client + repository pattern, AI SDK v6 (`ai@^6`, `tool()` with `inputSchema`, zod v4), framer-motion, vitest.

**Spec:** `docs/superpowers/specs/2026-06-11-mission-control-agents-dashboard-design.md`

**Worktree:** `/Users/darius/Downloads/shorts-os/.claude/worktrees/mission-control-agents` (branch `worktree-mission-control-agents` off `main@4d0678f`). All commands run from the worktree root.

---

## Task 0 (orchestrator, read-only — NOT a subagent task): verify remote migration state

Before dispatching Task 6/7, the orchestrator runs Supabase MCP `list_migrations` against the prod project and confirms:
- `20260528000004` (assistants tables) and `20260528000010` (seed) are applied. If NOT, the two new migrations below still ship in-repo, and the UI's registry fallback (Task 10) covers the missing rows.
- Record which migrations are pending. **Per the standing rule: do NOT apply anything to prod without Darius's in-chat OK.** Local/test DBs are fine.

---

### Task 1: Assistant registry (client-safe constants)

**Files:**
- Create: `src/lib/assistants/registry.ts`
- Modify: `src/lib/supabase/repositories/ingestion-runs.ts` (extend `IngestionJob` union only)
- Test: `src/tests/lib/assistants/registry.test.ts`

The registry is plain data importable from BOTH server and client code. It must NOT runtime-import any `server-only` module (`import type` is fine — it's erased at compile).

- [ ] **Step 1: Extend the `IngestionJob` union**

In `src/lib/supabase/repositories/ingestion-runs.ts` change:

```ts
export type IngestionJob =
  | 'youtube_category_sweep'
  | 'youtube_shorts_search'
  | 'watch_list_sync'
  | 'reddit_topic_discovery'
  | 'google_trends'
  | 'tiktok_creative_center'
  | 'classify_observations'
  | 'cluster_niches'
  | 'performance_sync';
```

(Type-only change; the DB CHECK constraint is extended in Task 6.)

- [ ] **Step 2: Write the failing test**

Create `src/tests/lib/assistants/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ASSISTANT_ORDER,
  ASSISTANT_DEFS,
  isAssistantId,
  assistantIcon,
} from '@/lib/assistants/registry';

describe('assistant registry', () => {
  it('defines exactly the 6 product assistants in display order', () => {
    expect(ASSISTANT_ORDER).toEqual([
      'niche_scout',
      'watch_list_curator',
      'generator',
      'video_reviewer',
      'analyst',
      'editor_copilot',
    ]);
    expect(Object.keys(ASSISTANT_DEFS).sort()).toEqual([...ASSISTANT_ORDER].sort());
  });

  it('routes every ingestion job to exactly one assistant', () => {
    const all = Object.values(ASSISTANT_DEFS).flatMap((d) => d.ingestionJobs);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain('performance_sync');
    expect(all).toContain('watch_list_sync');
  });

  it('isAssistantId narrows correctly', () => {
    expect(isAssistantId('niche_scout')).toBe(true);
    expect(isAssistantId('strategist')).toBe(false);
  });

  it('assistantIcon falls back to Bot for unknown names', () => {
    expect(assistantIcon('compass')).toBeDefined();
    expect(assistantIcon('definitely-not-an-icon')).toBe(assistantIcon('definitely-not-an-icon-2'));
  });

  it('overdue thresholds exist only for cron-driven assistants', () => {
    expect(ASSISTANT_DEFS.niche_scout.maxExpectedGapHours).toBe(13);
    expect(ASSISTANT_DEFS.watch_list_curator.maxExpectedGapHours).toBe(13);
    expect(ASSISTANT_DEFS.analyst.maxExpectedGapHours).toBe(26);
    expect(ASSISTANT_DEFS.generator.maxExpectedGapHours).toBeNull();
    expect(ASSISTANT_DEFS.video_reviewer.maxExpectedGapHours).toBeNull();
    expect(ASSISTANT_DEFS.editor_copilot.maxExpectedGapHours).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/assistants/registry.test.ts`
Expected: FAIL — cannot resolve `@/lib/assistants/registry`.

- [ ] **Step 4: Implement the registry**

Create `src/lib/assistants/registry.ts`:

```ts
// src/lib/assistants/registry.ts
//
// Client-safe constants mapping each product assistant (Plan #5 §4.8, adapted
// post-pivot) to its ledger sources, cron schedules, and icon. The DB
// `assistants` table holds display copy; this file holds derivation wiring.
// MUST stay importable from client components: no runtime server-only imports.
import type { LucideIcon } from 'lucide-react';
import {
  Bot,
  Clapperboard,
  Compass,
  Eye,
  LineChart,
  Scissors,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { IngestionJob } from '@/lib/supabase/repositories/ingestion-runs';

export type AssistantId =
  | 'niche_scout'
  | 'watch_list_curator'
  | 'generator'
  | 'video_reviewer'
  | 'analyst'
  | 'editor_copilot';

export const ASSISTANT_ORDER: AssistantId[] = [
  'niche_scout',
  'watch_list_curator',
  'generator',
  'video_reviewer',
  'analyst',
  'editor_copilot',
];

export interface AssistantDef {
  id: AssistantId;
  /** Fallback display copy when the DB `assistants` row is missing (un-migrated env). */
  fallbackName: string;
  fallbackRole: string;
  fallbackIcon: string;
  /** ingestion_runs jobs owned by this assistant (each job belongs to exactly one). */
  ingestionJobs: IngestionJob[];
  /** niche_scout also surfaces digest_runs. */
  includesDigestRuns: boolean;
  /** generator surfaces jobs + render_jobs. */
  includesPipelineJobs: boolean;
  /** video_reviewer surfaces video_reviews. */
  includesReviews: boolean;
  /** Human-readable schedule list (mirrors vercel.ts crons), for the Settings tab. */
  schedules: { label: string; cron: string }[];
  /**
   * Overdue threshold: if the newest success/partial completion is older than
   * this, annotate "overdue". 2× the densest schedule interval, +1h slack.
   * null = not cron-driven (event-driven assistants are never overdue).
   */
  maxExpectedGapHours: number | null;
  comingInPhase?: number;
}

export const ASSISTANT_DEFS: Record<AssistantId, AssistantDef> = {
  niche_scout: {
    id: 'niche_scout',
    fallbackName: 'Niche Scout',
    fallbackRole: 'Finds and ranks dominatable niches across sources.',
    fallbackIcon: 'compass',
    ingestionJobs: [
      'youtube_category_sweep',
      'youtube_shorts_search',
      'reddit_topic_discovery',
      'google_trends',
      'tiktok_creative_center',
      'classify_observations',
      'cluster_niches',
    ],
    includesDigestRuns: true,
    includesPipelineJobs: false,
    includesReviews: false,
    schedules: [
      { label: 'Category sweep', cron: '0 */6 * * *' },
      { label: 'Shorts search', cron: '0 8 * * *' },
      { label: 'Reddit discovery', cron: '0 9 * * *' },
      { label: 'Google Trends', cron: '30 9 * * *' },
      { label: 'Classify observations', cron: '15 */6 * * *' },
      { label: 'Cluster niches', cron: '0 23 * * 0' },
      { label: 'Weekly digest', cron: '0 12 * * 1' },
    ],
    maxExpectedGapHours: 13, // densest cadence is 6h → 2×6 + 1
  },
  watch_list_curator: {
    id: 'watch_list_curator',
    fallbackName: 'Watch-list Curator',
    fallbackRole: 'Tracks watched channels and flags outlier videos.',
    fallbackIcon: 'eye',
    ingestionJobs: ['watch_list_sync'],
    includesDigestRuns: false,
    includesPipelineJobs: false,
    includesReviews: false,
    schedules: [{ label: 'Watch-list sync', cron: '30 */6 * * *' }],
    maxExpectedGapHours: 13,
  },
  generator: {
    id: 'generator',
    fallbackName: 'Generator',
    fallbackRole: 'Drafts longform videos from niche briefs on the Higgsfield engine.',
    fallbackIcon: 'clapperboard',
    ingestionJobs: [],
    includesDigestRuns: false,
    includesPipelineJobs: true,
    includesReviews: false,
    schedules: [
      { label: 'Render dispatcher', cron: '* * * * *' },
      { label: 'Render watchdog', cron: '*/5 * * * *' },
    ],
    maxExpectedGapHours: null, // event-driven: runs when Darius dispatches
  },
  video_reviewer: {
    id: 'video_reviewer',
    fallbackName: 'Video Reviewer',
    fallbackRole: 'Reviews drafts against the quality gate before posting.',
    fallbackIcon: 'shield-check',
    ingestionJobs: [],
    includesDigestRuns: false,
    includesPipelineJobs: false,
    includesReviews: true,
    schedules: [],
    maxExpectedGapHours: null,
  },
  analyst: {
    id: 'analyst',
    fallbackName: 'Analyst',
    fallbackRole: 'Tracks post-publication performance: views, CTR, retention curves.',
    fallbackIcon: 'line-chart',
    ingestionJobs: ['performance_sync'],
    includesDigestRuns: false,
    includesPipelineJobs: false,
    includesReviews: false,
    schedules: [{ label: 'Performance sync', cron: '0 12 * * *' }],
    maxExpectedGapHours: 26, // daily → 2×24, but 26 keeps the amber off normal jitter
  },
  editor_copilot: {
    id: 'editor_copilot',
    fallbackName: 'Editor Co-pilot',
    fallbackRole: 'Premiere Pro / CapCut editing co-pilot.',
    fallbackIcon: 'scissors',
    ingestionJobs: [],
    includesDigestRuns: false,
    includesPipelineJobs: false,
    includesReviews: false,
    schedules: [],
    maxExpectedGapHours: null,
    comingInPhase: 3,
  },
};

export function isAssistantId(value: string): value is AssistantId {
  return (ASSISTANT_ORDER as string[]).includes(value);
}

/** icon_name (DB) → Lucide component. Keep in sync with seed migration names. */
const ASSISTANT_ICONS: Record<string, LucideIcon> = {
  compass: Compass,
  eye: Eye,
  sparkles: Sparkles,
  clapperboard: Clapperboard,
  'shield-check': ShieldCheck,
  'line-chart': LineChart,
  scissors: Scissors,
};

export function assistantIcon(name: string): LucideIcon {
  return ASSISTANT_ICONS[name] ?? Bot;
}
```

NOTE: if `LineChart` is not exported by the installed `lucide-react`, use `ChartLine` (the icon was renamed between majors) — check with `grep -o "ChartLine\|LineChart" node_modules/lucide-react/dist/lucide-react.d.ts | head -1` and import whichever exists.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/tests/lib/assistants/registry.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/assistants/registry.ts src/tests/lib/assistants/registry.test.ts src/lib/supabase/repositories/ingestion-runs.ts
git commit -m "feat(mc): assistant registry mapping agents to ledger sources"
```

---

### Task 2: Relative-time util

**Files:**
- Create: `src/lib/format/relative-time.ts`
- Test: `src/tests/lib/format/relative-time.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/lib/format/relative-time.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { relativeTime } from '@/lib/format/relative-time';

const NOW = new Date('2026-06-11T12:00:00Z');

describe('relativeTime', () => {
  it('renders sub-minute as "just now"', () => {
    expect(relativeTime('2026-06-11T11:59:40Z', NOW)).toBe('just now');
  });
  it('renders minutes', () => {
    expect(relativeTime('2026-06-11T11:56:00Z', NOW)).toBe('4m ago');
  });
  it('renders hours', () => {
    expect(relativeTime('2026-06-11T09:00:00Z', NOW)).toBe('3h ago');
  });
  it('renders days under a week', () => {
    expect(relativeTime('2026-06-09T12:00:00Z', NOW)).toBe('2d ago');
  });
  it('falls back to a short date beyond a week', () => {
    expect(relativeTime('2026-05-20T12:00:00Z', NOW)).toMatch(/May/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/format/relative-time.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/format/relative-time.ts`:

```ts
// Tiny relative-time formatter for ledger timestamps. Client-safe.
export function relativeTime(iso: string, now: Date = new Date()): string {
  const thenMs = new Date(iso).getTime();
  if (Number.isNaN(thenMs)) return '';
  const sec = Math.max(0, Math.round((now.getTime() - thenMs) / 1000));
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/lib/format/relative-time.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format/relative-time.ts src/tests/lib/format/relative-time.test.ts
git commit -m "feat(format): relativeTime helper"
```

---

### Task 3: Live-status derivation (pure module)

**Files:**
- Create: `src/lib/assistants/live-status.ts`
- Test: `src/tests/lib/assistants/live-status.test.ts`

Pure functions only — no supabase, no `server-only` runtime import (all repo imports are `import type`, which is erased). This is the heart of the feature: **statuses derive from real ledger rows, never faked.**

State rules (per spec §3.2, precedence `errored` > `working` > `waiting` > `idle`):
- `working`: any in-flight event (ingestion run with `finished_at IS NULL`; generator: job `queued`/`running` or render `pending`/`claimed`/`running`).
- `errored`: the **latest completed** run of any owned ingestion job is `failed` (per-job latest, so an old failure followed by a success clears); niche_scout also errors on latest digest run `failed`; generator on latest completed pipeline job or render `failed`.
- `waiting`: generator — a longform draft sits in `rendered` (awaitingReviewDrafts non-empty); video_reviewer — latest review verdict `revise`/`block` on a video not yet `posted`.
- `overdue` (orthogonal annotation, not a state): `maxExpectedGapHours` set AND at least one completed `success`/`partial` event exists AND the newest one is older than the threshold.
- Cold start (no events at all): `idle`, not overdue, `currentActivity = null` (UI shows "No runs recorded yet").

- [ ] **Step 1: Write the failing tests**

Create `src/tests/lib/assistants/live-status.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveLiveStatuses, eventsFromInputs, type LedgerInputs } from '@/lib/assistants/live-status';
import type { IngestionRunRow } from '@/lib/supabase/repositories/ingestion-runs';
import type { Job } from '@/lib/supabase/repositories/jobs';
import type { RenderJobRow } from '@/lib/supabase/repositories/render-jobs';
import type { RecentReview } from '@/lib/supabase/repositories/video-reviews';

const NOW = new Date('2026-06-11T12:00:00Z');

function emptyInputs(): LedgerInputs {
  return {
    ingestionRuns: [],
    jobs: [],
    renderJobs: [],
    digestRuns: [],
    reviews: [],
    awaitingReviewDrafts: [],
    now: NOW,
  };
}

function run(partial: Partial<IngestionRunRow>): IngestionRunRow {
  return {
    id: partial.id ?? 'r1',
    job: partial.job ?? 'youtube_category_sweep',
    status: partial.status ?? 'success',
    started_at: partial.started_at ?? '2026-06-11T11:00:00Z',
    finished_at: 'finished_at' in partial ? (partial.finished_at as string | null) : '2026-06-11T11:05:00Z',
    items_ingested: partial.items_ingested ?? 100,
    items_skipped: partial.items_skipped ?? 5,
    quota_units: partial.quota_units ?? 0,
    error: partial.error ?? null,
    context: partial.context ?? {},
  };
}

function job(partial: Partial<Job>): Job {
  return {
    id: partial.id ?? 'j1',
    kind: partial.kind ?? 'produce_longform_video',
    channel_id: null,
    topic_queue_id: null,
    status: partial.status ?? 'running',
    current_step: partial.current_step ?? 'writer',
    current_agent: partial.current_agent ?? 'writer',
    progress_pct: partial.progress_pct ?? 40,
    error: partial.error ?? null,
    metadata: {},
    created_at: partial.created_at ?? '2026-06-11T10:00:00Z',
    started_at: partial.started_at ?? '2026-06-11T10:00:00Z',
    finished_at: partial.finished_at ?? null,
  };
}

function render(partial: Partial<RenderJobRow>): RenderJobRow {
  return {
    id: partial.id ?? 'rj1',
    job_type: partial.job_type ?? 'render_longform',
    payload: {},
    status: partial.status ?? 'succeeded',
    attempts: 1,
    last_error: partial.last_error ?? null,
    claimed_at: null,
    started_at: partial.started_at ?? '2026-06-11T09:00:00Z',
    finished_at: partial.finished_at ?? '2026-06-11T09:30:00Z',
    sandbox_invocation_id: null,
    your_video_id: partial.your_video_id ?? null,
    compilation_draft_id: null,
    clip_library_id: null,
    created_at: partial.created_at ?? '2026-06-11T08:55:00Z',
  };
}

function review(partial: Partial<RecentReview>): RecentReview {
  return {
    id: partial.id ?? 'rev1',
    your_video_id: partial.your_video_id ?? 'v1',
    reviewed_at: partial.reviewed_at ?? '2026-06-11T08:00:00Z',
    overall_verdict: partial.overall_verdict ?? 'ship',
    video_title: partial.video_title ?? 'The Truth About the B58',
    video_status: partial.video_status ?? 'rendered',
  };
}

describe('deriveLiveStatuses', () => {
  it('cold start: all idle, not overdue, no currentActivity', () => {
    const { statuses } = deriveLiveStatuses(emptyInputs());
    for (const id of ['niche_scout', 'watch_list_curator', 'generator', 'video_reviewer', 'analyst', 'editor_copilot'] as const) {
      expect(statuses[id].state).toBe('idle');
      expect(statuses[id].overdue).toBe(false);
      expect(statuses[id].currentActivity).toBeNull();
    }
  });

  it('in-flight ingestion run → niche_scout working', () => {
    const inputs = emptyInputs();
    inputs.ingestionRuns = [run({ id: 'a', status: 'partial', finished_at: null, started_at: '2026-06-11T11:58:00Z' })];
    const { statuses } = deriveLiveStatuses(inputs);
    expect(statuses.niche_scout.state).toBe('working');
    expect(statuses.niche_scout.currentActivity).toContain('Category sweep');
  });

  it('latest run failed → errored; older failure superseded by success → idle', () => {
    const failedLatest = emptyInputs();
    failedLatest.ingestionRuns = [
      run({ id: 'new', status: 'failed', error: 'quota exceeded', finished_at: '2026-06-11T11:00:00Z' }),
      run({ id: 'old', status: 'success', finished_at: '2026-06-11T05:00:00Z' }),
    ];
    expect(deriveLiveStatuses(failedLatest).statuses.niche_scout.state).toBe('errored');

    const recovered = emptyInputs();
    recovered.ingestionRuns = [
      run({ id: 'new', status: 'success', finished_at: '2026-06-11T11:00:00Z' }),
      run({ id: 'old', status: 'failed', error: 'quota exceeded', finished_at: '2026-06-11T05:00:00Z' }),
    ];
    expect(deriveLiveStatuses(recovered).statuses.niche_scout.state).toBe('idle');
  });

  it('a failure in one job does not clear via success in another job', () => {
    const inputs = emptyInputs();
    inputs.ingestionRuns = [
      run({ id: 'a', job: 'google_trends', status: 'failed', finished_at: '2026-06-11T06:00:00Z' }),
      run({ id: 'b', job: 'youtube_category_sweep', status: 'success', finished_at: '2026-06-11T11:00:00Z' }),
    ];
    expect(deriveLiveStatuses(inputs).statuses.niche_scout.state).toBe('errored');
  });

  it('watch_list_sync routes to the curator, performance_sync to the analyst', () => {
    const inputs = emptyInputs();
    inputs.ingestionRuns = [
      run({ id: 'w', job: 'watch_list_sync', status: 'failed', finished_at: '2026-06-11T11:00:00Z' }),
      run({ id: 'p', job: 'performance_sync', status: 'success', finished_at: '2026-06-11T11:00:00Z' }),
    ];
    const { statuses } = deriveLiveStatuses(inputs);
    expect(statuses.watch_list_curator.state).toBe('errored');
    expect(statuses.analyst.state).toBe('idle');
    expect(statuses.niche_scout.state).toBe('idle');
  });

  it('generator: running pipeline job → working; waiting on rendered draft; errored beats waiting', () => {
    const working = emptyInputs();
    working.jobs = [job({ status: 'running' })];
    expect(deriveLiveStatuses(working).statuses.generator.state).toBe('working');

    const waiting = emptyInputs();
    waiting.awaitingReviewDrafts = [{ id: 'v1', title: 'B58 video' }];
    const w = deriveLiveStatuses(waiting).statuses.generator;
    expect(w.state).toBe('waiting');
    expect(w.currentActivity).toContain('B58 video');

    const errored = emptyInputs();
    errored.awaitingReviewDrafts = [{ id: 'v1', title: 'B58 video' }];
    errored.renderJobs = [render({ status: 'failed', last_error: 'ffmpeg crashed', finished_at: '2026-06-11T11:00:00Z' })];
    expect(deriveLiveStatuses(errored).statuses.generator.state).toBe('errored');
  });

  it('reviewer: revise verdict on unposted video → waiting; posted clears it', () => {
    const waiting = emptyInputs();
    waiting.reviews = [review({ overall_verdict: 'revise', video_status: 'rendered' })];
    expect(deriveLiveStatuses(waiting).statuses.video_reviewer.state).toBe('waiting');

    const cleared = emptyInputs();
    cleared.reviews = [review({ overall_verdict: 'revise', video_status: 'posted' })];
    expect(deriveLiveStatuses(cleared).statuses.video_reviewer.state).toBe('idle');
  });

  it('working beats waiting, errored beats working (precedence)', () => {
    const inputs = emptyInputs();
    inputs.jobs = [job({ status: 'running' })];
    inputs.awaitingReviewDrafts = [{ id: 'v1', title: 'X' }];
    expect(deriveLiveStatuses(inputs).statuses.generator.state).toBe('working');

    inputs.renderJobs = [render({ status: 'failed', finished_at: '2026-06-11T11:30:00Z' })];
    expect(deriveLiveStatuses(inputs).statuses.generator.state).toBe('errored');
  });

  it('overdue: newest success older than the threshold → annotated; fresh success → not', () => {
    const stale = emptyInputs();
    stale.ingestionRuns = [run({ id: 'old', finished_at: '2026-06-10T08:00:00Z' })]; // 28h ago > 13h
    const s = deriveLiveStatuses(stale).statuses.niche_scout;
    expect(s.state).toBe('idle');
    expect(s.overdue).toBe(true);

    const fresh = emptyInputs();
    fresh.ingestionRuns = [run({ id: 'new', finished_at: '2026-06-11T08:00:00Z' })]; // 4h ago
    expect(deriveLiveStatuses(fresh).statuses.niche_scout.overdue).toBe(false);
  });

  it('digest failure errors the scout; digest sent appears in the feed', () => {
    const inputs = emptyInputs();
    inputs.digestRuns = [
      { id: 'd1', week_start: '2026-06-08', sent_at: '2026-06-08T12:00:00Z', recipient: 'darius', status: 'failed', cluster_ids: [], html: null, error: 'smtp' },
    ];
    const { statuses, feed } = deriveLiveStatuses(inputs);
    expect(statuses.niche_scout.state).toBe('errored');
    expect(feed.some((e) => e.type === 'digest_send')).toBe(true);
  });

  it('feed merges all sources sorted newest-first', () => {
    const inputs = emptyInputs();
    inputs.ingestionRuns = [run({ id: 'a', finished_at: '2026-06-11T11:00:00Z' })];
    inputs.jobs = [job({ status: 'succeeded', finished_at: '2026-06-11T11:30:00Z' })];
    inputs.reviews = [review({ reviewed_at: '2026-06-11T10:00:00Z' })];
    const { feed } = deriveLiveStatuses(inputs);
    expect(feed.map((e) => e.assistantId)).toEqual(['generator', 'niche_scout', 'video_reviewer']);
  });
});

describe('eventsFromInputs', () => {
  it('maps ingestion failures with the error message', () => {
    const inputs = emptyInputs();
    inputs.ingestionRuns = [run({ status: 'failed', error: 'quota exceeded' })];
    const events = eventsFromInputs(inputs);
    expect(events[0].status).toBe('failed');
    expect(events[0].summary).toContain('quota exceeded');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/lib/assistants/live-status.test.ts`
Expected: FAIL — cannot resolve `@/lib/assistants/live-status` (and `RecentReview` not exported yet; that lands in Task 4 — for THIS task, add the `RecentReview` interface to `video-reviews.ts` now, function comes later):

In `src/lib/supabase/repositories/video-reviews.ts`, add after the `VideoReview` interface:

```ts
/** Compact review row joined with its video's title/status (for Mission Control). */
export interface RecentReview {
  id: string;
  your_video_id: string;
  reviewed_at: string;
  overall_verdict: OverallVerdict;
  video_title: string | null;
  video_status: string | null;
}
```

- [ ] **Step 3: Implement the derivation**

Create `src/lib/assistants/live-status.ts`:

```ts
// src/lib/assistants/live-status.ts
//
// Pure derivation: ledger rows in, live agent statuses + activity feed out.
// No supabase / server-only runtime imports — fully unit-testable.
// Spec: docs/superpowers/specs/2026-06-11-mission-control-agents-dashboard-design.md §3.
import type { IngestionJob, IngestionRunRow } from '@/lib/supabase/repositories/ingestion-runs';
import type { Job } from '@/lib/supabase/repositories/jobs';
import type { RenderJobRow } from '@/lib/supabase/repositories/render-jobs';
import type { DigestRun } from '@/lib/supabase/repositories/digest-runs';
import type { RecentReview } from '@/lib/supabase/repositories/video-reviews';
import type { AssistantState } from '@/lib/supabase/repositories/assistants';
import { ASSISTANT_DEFS, ASSISTANT_ORDER, type AssistantId } from '@/lib/assistants/registry';

export type ActivityEventStatus =
  | 'success'
  | 'partial'
  | 'failed'
  | 'running'
  | 'queued'
  | 'skipped'
  | 'info';

export interface ActivityEvent {
  id: string;
  assistantId: AssistantId;
  type: string; // e.g. 'youtube_category_sweep' | 'digest_send' | 'pipeline_job' | 'render_job' | 'video_review'
  summary: string;
  status: ActivityEventStatus;
  at: string; // ISO
}

export interface LedgerInputs {
  ingestionRuns: IngestionRunRow[];
  jobs: Job[];
  renderJobs: RenderJobRow[];
  digestRuns: DigestRun[];
  reviews: RecentReview[];
  /** Longform your_videos rows sitting in `rendered`, awaiting review/post. */
  awaitingReviewDrafts: { id: string; title: string }[];
  now: Date;
}

export interface LiveAssistantStatus {
  assistantId: AssistantId;
  state: AssistantState;
  currentActivity: string | null;
  lastEventAt: string | null;
  overdue: boolean;
  recentActivity: ActivityEvent[]; // newest-first, max 3
}

export interface LiveDashboard {
  statuses: Record<AssistantId, LiveAssistantStatus>;
  feed: ActivityEvent[]; // all assistants merged, newest-first
}

const JOB_LABELS: Record<IngestionJob, string> = {
  youtube_category_sweep: 'Category sweep',
  youtube_shorts_search: 'Shorts search',
  watch_list_sync: 'Watch-list sync',
  reddit_topic_discovery: 'Reddit discovery',
  google_trends: 'Google Trends',
  tiktok_creative_center: 'TikTok Creative Center',
  classify_observations: 'Classify observations',
  cluster_niches: 'Cluster niches',
  performance_sync: 'Performance sync',
};

const JOB_OWNER: Record<IngestionJob, AssistantId> = (() => {
  const map = {} as Record<IngestionJob, AssistantId>;
  for (const def of Object.values(ASSISTANT_DEFS)) {
    for (const j of def.ingestionJobs) map[j] = def.id;
  }
  return map;
})();

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function pipelineLabel(kind: Job['kind']): string {
  if (kind === 'produce_longform_video') return 'Longform pipeline';
  if (kind === 'produce_video') return 'Shorts pipeline';
  return kind.replace(/_/g, ' ');
}

function ingestionEvent(run: IngestionRunRow): ActivityEvent {
  const label = JOB_LABELS[run.job] ?? run.job;
  const assistantId = JOB_OWNER[run.job] ?? 'niche_scout';
  if (!run.finished_at) {
    return {
      id: `ing-${run.id}`, assistantId, type: run.job,
      summary: `${label} running…`, status: 'running', at: run.started_at,
    };
  }
  let summary: string;
  if (run.status === 'failed') summary = `${label} failed${run.error ? `: ${truncate(run.error)}` : ''}`;
  else if (run.status === 'skipped') summary = `${label} skipped`;
  else summary = `${label}: ${run.items_ingested} ingested, ${run.items_skipped} skipped`;
  return { id: `ing-${run.id}`, assistantId, type: run.job, summary, status: run.status, at: run.finished_at };
}

function digestEvent(d: DigestRun): ActivityEvent {
  const statusMap: Record<DigestRun['status'], ActivityEventStatus> = {
    sent: 'success', preview: 'info', skipped: 'skipped', failed: 'failed',
  };
  const summary =
    d.status === 'sent'
      ? `Weekly digest sent (${d.cluster_ids.length} niches)`
      : d.status === 'failed'
        ? `Weekly digest failed${d.error ? `: ${truncate(d.error)}` : ''}`
        : `Weekly digest ${d.status}`;
  return { id: `dig-${d.id}`, assistantId: 'niche_scout', type: 'digest_send', summary, status: statusMap[d.status], at: d.sent_at };
}

function pipelineEvent(j: Job): ActivityEvent {
  const label = pipelineLabel(j.kind);
  const statusMap: Record<Job['status'], ActivityEventStatus> = {
    queued: 'queued', running: 'running', succeeded: 'success', failed: 'failed', cancelled: 'info',
  };
  let summary: string;
  if (j.status === 'running') summary = `${label} running — ${j.current_step ?? '…'} (${j.progress_pct ?? 0}%)`;
  else if (j.status === 'failed') summary = `${label} failed${j.error ? `: ${truncate(j.error)}` : ''}`;
  else summary = `${label} ${j.status}`;
  return {
    id: `job-${j.id}`, assistantId: 'generator', type: 'pipeline_job', summary,
    status: statusMap[j.status], at: j.finished_at ?? j.started_at ?? j.created_at,
  };
}

function renderEvent(r: RenderJobRow): ActivityEvent {
  const statusMap: Record<RenderJobRow['status'], ActivityEventStatus> = {
    pending: 'queued', claimed: 'running', running: 'running', succeeded: 'success', failed: 'failed',
  };
  const label = r.job_type.replace(/_/g, ' ');
  let summary: string;
  if (r.status === 'failed') summary = `Render (${label}) failed${r.last_error ? `: ${truncate(r.last_error)}` : ''}`;
  else if (r.status === 'succeeded') summary = `Render (${label}) succeeded`;
  else if (r.status === 'pending') summary = `Render (${label}) queued`;
  else summary = `Render (${label}) running…`;
  return {
    id: `ren-${r.id}`, assistantId: 'generator', type: 'render_job', summary,
    status: statusMap[r.status], at: r.finished_at ?? r.started_at ?? r.created_at,
  };
}

function reviewEvent(rev: RecentReview): ActivityEvent {
  const title = rev.video_title ?? rev.your_video_id;
  return {
    id: `rev-${rev.id}`, assistantId: 'video_reviewer', type: 'video_review',
    summary: `Reviewed “${title}” — verdict: ${rev.overall_verdict}`,
    status: rev.overall_verdict === 'ship' ? 'success' : 'info',
    at: rev.reviewed_at,
  };
}

/** Map every ledger row to an ActivityEvent, sorted newest-first. */
export function eventsFromInputs(inputs: LedgerInputs): ActivityEvent[] {
  const events: ActivityEvent[] = [
    ...inputs.ingestionRuns.map(ingestionEvent),
    ...inputs.digestRuns.map(digestEvent),
    ...inputs.jobs.map(pipelineEvent),
    ...inputs.renderJobs.map(renderEvent),
    ...inputs.reviews.map(reviewEvent),
  ];
  return events.sort((a, b) => b.at.localeCompare(a.at));
}

/** Latest completed ingestion run per owned job. */
function latestCompletedPerJob(runs: IngestionRunRow[], jobs: IngestionJob[]): IngestionRunRow[] {
  const latest = new Map<IngestionJob, IngestionRunRow>();
  for (const run of runs) {
    if (!jobs.includes(run.job) || !run.finished_at) continue;
    const prev = latest.get(run.job);
    if (!prev || run.finished_at > (prev.finished_at ?? '')) latest.set(run.job, run);
  }
  return [...latest.values()];
}

export function deriveLiveStatuses(inputs: LedgerInputs): LiveDashboard {
  const feed = eventsFromInputs(inputs);
  const statuses = {} as Record<AssistantId, LiveAssistantStatus>;

  for (const id of ASSISTANT_ORDER) {
    const def = ASSISTANT_DEFS[id];
    const events = feed.filter((e) => e.assistantId === id);

    // --- working: any in-flight event ---
    const inFlight = events.find((e) => e.status === 'running' || e.status === 'queued');

    // --- errored: latest completed run per source failed ---
    let failure: string | null = null;
    const latestRuns = latestCompletedPerJob(inputs.ingestionRuns, def.ingestionJobs);
    const failedRun = latestRuns.find((r) => r.status === 'failed');
    if (failedRun) failure = ingestionEvent(failedRun).summary;
    if (!failure && def.includesDigestRuns && inputs.digestRuns.length > 0) {
      const latestDigest = [...inputs.digestRuns].sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0];
      if (latestDigest.status === 'failed') failure = digestEvent(latestDigest).summary;
    }
    if (!failure && def.includesPipelineJobs) {
      const doneJobs = inputs.jobs.filter((j) => j.finished_at);
      const latestJob = doneJobs.sort((a, b) => (b.finished_at ?? '').localeCompare(a.finished_at ?? ''))[0];
      if (latestJob?.status === 'failed') failure = pipelineEvent(latestJob).summary;
      if (!failure) {
        const doneRenders = inputs.renderJobs.filter((r) => r.finished_at);
        const latestRender = doneRenders.sort((a, b) => (b.finished_at ?? '').localeCompare(a.finished_at ?? ''))[0];
        if (latestRender?.status === 'failed') failure = renderEvent(latestRender).summary;
      }
    }

    // --- waiting ---
    let waitingActivity: string | null = null;
    if (id === 'generator' && inputs.awaitingReviewDrafts.length > 0) {
      const d = inputs.awaitingReviewDrafts[0];
      waitingActivity = `“${d.title}” rendered — awaiting review`;
    }
    if (id === 'video_reviewer' && inputs.reviews.length > 0) {
      const latest = [...inputs.reviews].sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at))[0];
      if ((latest.overall_verdict === 'revise' || latest.overall_verdict === 'block') && latest.video_status !== 'posted') {
        const title = latest.video_title ?? latest.your_video_id;
        waitingActivity = `“${title}” needs ${latest.overall_verdict === 'block' ? 'rework' : 'revisions'}`;
      }
    }

    // --- precedence ---
    let state: AssistantState = 'idle';
    let currentActivity: string | null = null;
    if (failure) {
      state = 'errored';
      currentActivity = failure;
    } else if (inFlight) {
      state = 'working';
      currentActivity = inFlight.summary;
    } else if (waitingActivity) {
      state = 'waiting';
      currentActivity = waitingActivity;
    } else {
      currentActivity = events[0]?.summary ?? null;
    }

    // --- overdue (orthogonal) ---
    let overdue = false;
    if (def.maxExpectedGapHours !== null) {
      const completedOk = events.filter((e) => e.status === 'success' || e.status === 'partial');
      if (completedOk.length > 0) {
        const newest = completedOk[0].at;
        const ageHours = (inputs.now.getTime() - new Date(newest).getTime()) / 3_600_000;
        overdue = ageHours > def.maxExpectedGapHours;
      }
    }

    statuses[id] = {
      assistantId: id,
      state,
      currentActivity,
      lastEventAt: events[0]?.at ?? null,
      overdue,
      recentActivity: events.slice(0, 3),
    };
  }

  return { statuses, feed };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/lib/assistants/live-status.test.ts`
Expected: PASS (12 tests). If the precedence test fails on `working` vs `queued`, note in-flight detection treats both as working — that is intended.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assistants/live-status.ts src/tests/lib/assistants/live-status.test.ts src/lib/supabase/repositories/video-reviews.ts
git commit -m "feat(mc): derive live agent statuses from ledger rows"
```

---

### Task 4: Repo additions — recent jobs, renders, reviews

**Files:**
- Modify: `src/lib/supabase/repositories/jobs.ts`
- Modify: `src/lib/supabase/repositories/render-jobs.ts`
- Modify: `src/lib/supabase/repositories/video-reviews.ts`
- Test: `src/tests/lib/supabase/mission-control-lists.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/lib/supabase/mission-control-lists.test.ts` (follows the chainable mock pattern from `src/tests/lib/supabase/assistants.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import { listRecentJobs } from '@/lib/supabase/repositories/jobs';
import { listRecentRenderJobs } from '@/lib/supabase/repositories/render-jobs';
import { listRecentReviews } from '@/lib/supabase/repositories/video-reviews';

beforeEach(() => vi.clearAllMocks());

function makeListClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        order: () => ({
          limit: async () => ({ data: rows ?? [], error }),
        }),
      }),
    }),
  } as never;
}

describe('listRecentJobs', () => {
  it('returns recent jobs newest-first', async () => {
    const client = makeListClient([{ id: 'j1', kind: 'produce_longform_video', status: 'running' }]);
    const result = await listRecentJobs(client, 20);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('j1');
  });
  it('throws a labelled error', async () => {
    const client = makeListClient(null, { message: 'boom' });
    await expect(listRecentJobs(client, 20)).rejects.toThrow('listRecentJobs: boom');
  });
});

describe('listRecentRenderJobs', () => {
  it('returns recent render jobs', async () => {
    const client = makeListClient([{ id: 'r1', job_type: 'render_longform', status: 'failed' }]);
    const result = await listRecentRenderJobs(client, 20);
    expect(result[0].job_type).toBe('render_longform');
  });
});

describe('listRecentReviews', () => {
  it('flattens the joined your_videos title/status', async () => {
    const client = makeListClient([
      {
        id: 'rev1',
        your_video_id: 'v1',
        reviewed_at: '2026-06-11T08:00:00Z',
        overall_verdict: 'revise',
        your_videos: { title: 'B58', status: 'rendered' },
      },
    ]);
    const result = await listRecentReviews(client, 10);
    expect(result[0].video_title).toBe('B58');
    expect(result[0].video_status).toBe('rendered');
    expect(result[0].overall_verdict).toBe('revise');
  });
  it('tolerates a missing join row', async () => {
    const client = makeListClient([
      { id: 'rev1', your_video_id: 'v1', reviewed_at: '2026-06-11T08:00:00Z', overall_verdict: 'ship', your_videos: null },
    ]);
    const result = await listRecentReviews(client, 10);
    expect(result[0].video_title).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/lib/supabase/mission-control-lists.test.ts`
Expected: FAIL — the three functions are not exported.

- [ ] **Step 3: Implement the three list functions**

Append to `src/lib/supabase/repositories/jobs.ts`:

```ts
/** Recent pipeline jobs across all kinds, newest-first (Mission Control ledger). */
export async function listRecentJobs(supabase: SupabaseClient, limit: number): Promise<Job[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentJobs: ${error.message}`);
  return (data ?? []) as Job[];
}
```

Append to `src/lib/supabase/repositories/render-jobs.ts`:

```ts
/** Recent render jobs across all types, newest-first (Mission Control ledger). */
export async function listRecentRenderJobs(
  supabase: SupabaseClient,
  limit: number,
): Promise<RenderJobRow[]> {
  const { data, error } = await supabase
    .from('render_jobs')
    .select()
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentRenderJobs: ${error.message}`);
  return (data ?? []) as RenderJobRow[];
}
```

Append to `src/lib/supabase/repositories/video-reviews.ts` (the `RecentReview` interface was added in Task 3):

```ts
/** Recent reviews joined with video title/status, newest-first (Mission Control ledger). */
export async function listRecentReviews(
  supabase: SupabaseClient,
  limit: number,
): Promise<RecentReview[]> {
  const { data, error } = await supabase
    .from('video_reviews')
    .select('id, your_video_id, reviewed_at, overall_verdict, your_videos(title, status)')
    .order('reviewed_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentReviews: ${error.message}`);
  type Row = {
    id: string;
    your_video_id: string;
    reviewed_at: string;
    overall_verdict: OverallVerdict;
    your_videos: { title: string | null; status: string | null } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    your_video_id: row.your_video_id,
    reviewed_at: row.reviewed_at,
    overall_verdict: row.overall_verdict,
    video_title: row.your_videos?.title ?? null,
    video_status: row.your_videos?.status ?? null,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/lib/supabase/mission-control-lists.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/repositories/jobs.ts src/lib/supabase/repositories/render-jobs.ts src/lib/supabase/repositories/video-reviews.ts src/tests/lib/supabase/mission-control-lists.test.ts
git commit -m "feat(repos): recent-list queries for jobs, render_jobs, video_reviews"
```

---

### Task 5: Ledger fetcher (server-only)

**Files:**
- Create: `src/lib/assistants/ledger.ts`

This is thin orchestration over already-tested repos + the already-tested pure derivation — no unit test; it is exercised by the page in browser verification (Task 16).

- [ ] **Step 1: Implement**

Create `src/lib/assistants/ledger.ts`:

```ts
// src/lib/assistants/ledger.ts
//
// Server-only fetch layer: gathers ledger rows and feeds the pure derivation.
// Each source is fetched with allSettled + [] fallback so one missing table in
// a lagging environment (e.g. digest_runs before its prod migration) degrades
// to "no events from that source" instead of a 500 across Mission Control.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listRecentRuns } from '@/lib/supabase/repositories/ingestion-runs';
import { listRecentJobs } from '@/lib/supabase/repositories/jobs';
import { listRecentRenderJobs } from '@/lib/supabase/repositories/render-jobs';
import { listDigestRuns } from '@/lib/supabase/repositories/digest-runs';
import { listRecentReviews } from '@/lib/supabase/repositories/video-reviews';
import {
  deriveLiveStatuses,
  eventsFromInputs,
  type ActivityEvent,
  type LedgerInputs,
  type LiveDashboard,
} from '@/lib/assistants/live-status';
import { isAssistantId } from '@/lib/assistants/registry';

async function settle<T>(label: string, promise: Promise<T[]>): Promise<T[]> {
  try {
    return await promise;
  } catch (err) {
    console.warn(`[mission-control] ${label} fetch failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}

async function fetchAwaitingReviewDrafts(supabase: SupabaseClient): Promise<{ id: string; title: string }[]> {
  const { data, error } = await supabase
    .from('your_videos')
    .select('id, title')
    .eq('status', 'rendered')
    .eq('format', 'longform')
    .order('updated_at', { ascending: false })
    .limit(5);
  if (error) throw new Error(`fetchAwaitingReviewDrafts: ${error.message}`);
  return (data ?? []) as { id: string; title: string }[];
}

export async function fetchLedgerInputs(supabase: SupabaseClient): Promise<LedgerInputs> {
  const [ingestionRuns, jobs, renderJobs, digestRuns, reviews, awaitingReviewDrafts] = await Promise.all([
    settle('ingestion_runs', listRecentRuns(supabase, 100)),
    settle('jobs', listRecentJobs(supabase, 20)),
    settle('render_jobs', listRecentRenderJobs(supabase, 20)),
    settle('digest_runs', listDigestRuns(supabase, 10)),
    settle('video_reviews', listRecentReviews(supabase, 20)),
    settle('your_videos(rendered)', fetchAwaitingReviewDrafts(supabase)),
  ]);
  return { ingestionRuns, jobs, renderJobs, digestRuns, reviews, awaitingReviewDrafts, now: new Date() };
}

/** One fetch powers both the card statuses and the cross-agent feed. */
export async function getLiveDashboard(supabase: SupabaseClient): Promise<LiveDashboard> {
  return deriveLiveStatuses(await fetchLedgerInputs(supabase));
}

/**
 * Paginated activity (Mission Control feed + per-agent Activity tab).
 * v1 paginates within the fetched windows (in-memory cursor on `at`); history
 * beyond those windows is intentionally out of scope.
 */
export async function listAssistantActivity(
  supabase: SupabaseClient,
  params: { assistantId?: string; before?: string; limit?: number },
): Promise<{ events: ActivityEvent[]; nextBefore: string | null }> {
  const limit = params.limit ?? 30;
  const inputs = await fetchLedgerInputs(supabase);
  let events = eventsFromInputs(inputs);
  if (params.assistantId && isAssistantId(params.assistantId)) {
    events = events.filter((e) => e.assistantId === params.assistantId);
  }
  if (params.before) {
    events = events.filter((e) => e.at < params.before!);
  }
  const page = events.slice(0, limit);
  const nextBefore = events.length > limit ? page[page.length - 1]?.at ?? null : null;
  return { events: page, nextBefore };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (or only pre-existing errors — there should be none on this branch).

- [ ] **Step 3: Commit**

```bash
git add src/lib/assistants/ledger.ts
git commit -m "feat(mc): server ledger fetcher feeding live-status derivation"
```

---

### Task 6: `performance_sync` migration + instrument the cron route

**Files:**
- Create: `supabase/migrations/20260611000001_ingestion_runs_performance_sync.sql`
- Modify: `src/app/api/cron/performance-sync/route.ts`

**GATE:** the migration lands in-repo; applying to PROD requires Darius's in-chat OK (orchestrator handles at the end). The route tolerates the un-migrated constraint via try/catch.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260611000001_ingestion_runs_performance_sync.sql`:

```sql
-- Mission Control derives the Analyst's status from ingestion_runs; let
-- performance-sync log there (it previously wrote only video_analytics).
alter table public.ingestion_runs drop constraint if exists ingestion_runs_job_check;
alter table public.ingestion_runs add constraint ingestion_runs_job_check
  check (job in (
    'youtube_category_sweep','youtube_shorts_search','watch_list_sync',
    'reddit_topic_discovery','google_trends','tiktok_creative_center',
    'classify_observations','cluster_niches','performance_sync'
  ));
```

- [ ] **Step 2: Instrument the route**

In `src/app/api/cron/performance-sync/route.ts`:

Add to the imports:

```ts
import {
  startIngestionRun,
  finishIngestionRun,
  type IngestionRunRow,
} from '@/lib/supabase/repositories/ingestion-runs';
```

In `GET`, right after `const supabase = getServiceClient();` add:

```ts
  // Ledger entry for Mission Control's Analyst card. Tolerate the un-migrated
  // CHECK constraint (performance_sync added in 20260611000001) — never let
  // ledger bookkeeping break the actual sync.
  let ledgerRun: IngestionRunRow | null = null;
  try {
    ledgerRun = await startIngestionRun(supabase, { job: 'performance_sync' });
  } catch (err) {
    console.warn('[performance-sync] ledger start failed:', err instanceof Error ? err.message : err);
  }
```

Replace the early-return on `chanErr`:

```ts
  if (chanErr) {
    if (ledgerRun) {
      try {
        await finishIngestionRun(supabase, {
          id: ledgerRun.id, status: 'failed', itemsIngested: 0, itemsSkipped: 0, quotaUnits: 0,
          error: chanErr.message,
        });
      } catch { /* ledger is best-effort */ }
    }
    return NextResponse.json({ ok: false, error: chanErr.message }, { status: 500 });
  }
```

Before the final `return NextResponse.json(...)` add:

```ts
  const totalVideos = summary.reduce((acc, s) => acc + s.videos, 0);
  const totalErrors = summary.reduce((acc, s) => acc + s.errors, 0);
  if (ledgerRun) {
    try {
      await finishIngestionRun(supabase, {
        id: ledgerRun.id,
        status: totalErrors === 0 ? 'success' : totalVideos > 0 ? 'partial' : 'failed',
        itemsIngested: totalVideos,
        itemsSkipped: 0,
        quotaUnits: 0,
        error: totalErrors > 0 ? `${totalErrors} video/channel error(s)` : null,
        context: { summary },
      });
    } catch (err) {
      console.warn('[performance-sync] ledger finish failed:', err instanceof Error ? err.message : err);
    }
  }
```

- [ ] **Step 3: Run the full test suite + typecheck**

Run: `npm test` and `npx tsc --noEmit`
Expected: all green (753 baseline + new tests).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260611000001_ingestion_runs_performance_sync.sql src/app/api/cron/performance-sync/route.ts
git commit -m "feat(analytics): performance-sync writes the ingestion_runs ledger"
```

---

### Task 7: Assistants post-pivot seed migration

**Files:**
- Create: `supabase/migrations/20260611000002_assistants_post_pivot.sql`

**GATE:** same prod-application rule as Task 6. The UI renders correctly against the OLD seed too (this only changes copy/flags).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260611000002_assistants_post_pivot.sql`:

```sql
-- Post-pivot (2026-06-04) copy updates for the Mission Control assistants.
-- Analyst: performance-sync is live (deploy fixed 2026-06-11) — enable it.
update public.assistants set
  is_enabled = true,
  role_description = 'Tracks post-publication performance: views, CTR, retention curves.'
  where id = 'analyst';

-- Generator: longform-first on the Higgsfield engine (was short-form Phase 1 copy).
update public.assistants set
  role_description = 'Drafts longform videos from niche briefs on the Higgsfield engine.',
  icon_name = 'clapperboard'
  where id = 'generator';

-- editor_copilot stays disabled (Phase 3).
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260611000002_assistants_post_pivot.sql
git commit -m "chore(db): post-pivot assistant copy + enable analyst"
```

---

### Task 8: Assistants repo additions + chat repo

**Files:**
- Modify: `src/lib/supabase/repositories/assistants.ts`
- Create: `src/lib/supabase/repositories/assistant-chat.ts`
- Test: `src/tests/lib/supabase/assistant-settings-chat.test.ts`

DB tables already exist (`20260528000004_assistants.sql`): `assistant_settings(assistant_id pk, settings jsonb, updated_at)`, `assistant_chat_threads(id, assistant_id, started_at, last_message_at, title)`, `assistant_chat_messages(id, thread_id, role, content, created_at)`.

- [ ] **Step 1: Write the failing tests**

Create `src/tests/lib/supabase/assistant-settings-chat.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  deleteAssistantMemory,
  getAssistantSettings,
  updateAssistantSettings,
  setAssistantEnabled,
} from '@/lib/supabase/repositories/assistants';
import {
  createChatThread,
  listChatThreads,
  appendChatMessage,
  listChatMessages,
} from '@/lib/supabase/repositories/assistant-chat';

beforeEach(() => vi.clearAllMocks());

// Records calls so tests can assert what was written; resolves with `rows`.
function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const result = { data: rows?.[0] ?? null, error };
  const listResult = { data: rows ?? [], error };
  const builder: Record<string, unknown> = {};
  const chain = (method: string) => (...args: unknown[]) => {
    calls.push({ table: calls.at(-1)?.table ?? '', method, args });
    return builder;
  };
  for (const m of ['upsert', 'insert', 'update', 'delete', 'select', 'eq', 'order']) {
    builder[m] = chain(m);
  }
  builder.single = async () => result;
  builder.maybeSingle = async () => result;
  builder.limit = async () => listResult;
  // delete().eq().eq() and update().eq() resolve as thenables:
  builder.then = (resolve: (v: typeof listResult) => unknown) => resolve(listResult);
  const client = {
    from: (table: string) => {
      calls.push({ table, method: 'from', args: [] });
      return builder;
    },
  } as never;
  return { client, calls };
}

describe('assistant settings + memory', () => {
  it('getAssistantSettings returns {} when no row', async () => {
    const { client } = makeClient(null, { code: 'PGRST116' });
    expect(await getAssistantSettings(client, 'analyst')).toEqual({});
  });

  it('getAssistantSettings returns the settings jsonb', async () => {
    const { client } = makeClient([{ settings: { chat_model: 'claude-opus-4-7' } }]);
    expect(await getAssistantSettings(client, 'analyst')).toEqual({ chat_model: 'claude-opus-4-7' });
  });

  it('updateAssistantSettings merges the patch over existing settings', async () => {
    const { client, calls } = makeClient([{ settings: { chat_model: 'claude-haiku-4-5' } }]);
    await updateAssistantSettings(client, 'analyst', { chat_model: 'claude-sonnet-4-6' });
    const upsert = calls.find((c) => c.method === 'upsert');
    expect(upsert).toBeDefined();
    const payload = upsert!.args[0] as { assistant_id: string; settings: Record<string, unknown> };
    expect(payload.assistant_id).toBe('analyst');
    expect(payload.settings.chat_model).toBe('claude-sonnet-4-6');
  });

  it('setAssistantEnabled updates the flag', async () => {
    const { client, calls } = makeClient([{ id: 'analyst', is_enabled: true }]);
    await setAssistantEnabled(client, 'analyst', true);
    const update = calls.find((c) => c.method === 'update');
    expect((update!.args[0] as { is_enabled: boolean }).is_enabled).toBe(true);
  });

  it('deleteAssistantMemory deletes by assistant + key', async () => {
    const { client, calls } = makeClient([]);
    await deleteAssistantMemory(client, 'analyst', 'stale_key');
    expect(calls.some((c) => c.method === 'delete')).toBe(true);
    expect(calls.filter((c) => c.method === 'eq')).toHaveLength(2);
  });
});

describe('assistant chat repo', () => {
  it('createChatThread inserts with a title', async () => {
    const { client } = makeClient([{ id: 't1', assistant_id: 'analyst', title: 'How is the B58 doing?' }]);
    const thread = await createChatThread(client, { assistantId: 'analyst', title: 'How is the B58 doing?' });
    expect(thread.id).toBe('t1');
  });

  it('listChatThreads returns rows', async () => {
    const { client } = makeClient([{ id: 't1' }, { id: 't2' }]);
    expect(await listChatThreads(client, 'analyst', 20)).toHaveLength(2);
  });

  it('appendChatMessage inserts the message and bumps last_message_at', async () => {
    const { client, calls } = makeClient([{ id: 'm1', thread_id: 't1', role: 'user', content: 'hi' }]);
    const msg = await appendChatMessage(client, { threadId: 't1', role: 'user', content: 'hi' });
    expect(msg.id).toBe('m1');
    expect(calls.some((c) => c.method === 'update')).toBe(true); // thread bump
  });

  it('listChatMessages returns rows oldest-first', async () => {
    const { client } = makeClient([{ id: 'm1' }, { id: 'm2' }]);
    expect(await listChatMessages(client, 't1')).toHaveLength(2);
  });
});
```

NOTE: the recording mock is intentionally loose — if a chain shape mismatches the implementation, fix the MOCK (not the repo) so it mirrors how supabase-js chains resolve. Repos are the source of truth.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/lib/supabase/assistant-settings-chat.test.ts`
Expected: FAIL — functions not exported / module missing.

- [ ] **Step 3: Implement the assistants.ts additions**

Append to `src/lib/supabase/repositories/assistants.ts`:

```ts
export async function deleteAssistantMemory(
  supabase: SupabaseClient,
  assistantId: string,
  memoryKey: string,
): Promise<void> {
  const { error } = await supabase
    .from('assistant_memory')
    .delete()
    .eq('assistant_id', assistantId)
    .eq('memory_key', memoryKey);
  if (error) throw new Error(`deleteAssistantMemory: ${error.message}`);
}

export type AssistantSettings = Record<string, unknown>;

export async function getAssistantSettings(
  supabase: SupabaseClient,
  assistantId: string,
): Promise<AssistantSettings> {
  const { data, error } = await supabase
    .from('assistant_settings')
    .select('settings')
    .eq('assistant_id', assistantId)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    throw new Error(`getAssistantSettings: ${error.message}`);
  }
  return ((data as { settings: AssistantSettings } | null)?.settings ?? {}) as AssistantSettings;
}

/** Merge-patch: shallow-spreads `patch` over the existing settings jsonb. */
export async function updateAssistantSettings(
  supabase: SupabaseClient,
  assistantId: string,
  patch: AssistantSettings,
): Promise<AssistantSettings> {
  const existing = await getAssistantSettings(supabase, assistantId);
  const merged = { ...existing, ...patch };
  const { error } = await supabase
    .from('assistant_settings')
    .upsert({ assistant_id: assistantId, settings: merged, updated_at: new Date().toISOString() });
  if (error) throw new Error(`updateAssistantSettings: ${error.message}`);
  return merged;
}

export async function setAssistantEnabled(
  supabase: SupabaseClient,
  assistantId: string,
  isEnabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('assistants')
    .update({ is_enabled: isEnabled })
    .eq('id', assistantId);
  if (error) throw new Error(`setAssistantEnabled: ${error.message}`);
}
```

- [ ] **Step 4: Implement the chat repo**

Create `src/lib/supabase/repositories/assistant-chat.ts`:

```ts
// src/lib/supabase/repositories/assistant-chat.ts
//
// Threads + messages for the per-agent chat (tables from 20260528000004).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatThread {
  id: string;
  assistant_id: string;
  started_at: string;
  last_message_at: string;
  title: string | null;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
}

export async function createChatThread(
  supabase: SupabaseClient,
  params: { assistantId: string; title: string | null },
): Promise<ChatThread> {
  const { data, error } = await supabase
    .from('assistant_chat_threads')
    .insert({ assistant_id: params.assistantId, title: params.title })
    .select()
    .single();
  if (error) throw new Error(`createChatThread: ${error.message}`);
  return data as ChatThread;
}

export async function listChatThreads(
  supabase: SupabaseClient,
  assistantId: string,
  limit: number,
): Promise<ChatThread[]> {
  const { data, error } = await supabase
    .from('assistant_chat_threads')
    .select()
    .eq('assistant_id', assistantId)
    .order('last_message_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listChatThreads: ${error.message}`);
  return (data ?? []) as ChatThread[];
}

export async function appendChatMessage(
  supabase: SupabaseClient,
  params: { threadId: string; role: ChatRole; content: string },
): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from('assistant_chat_messages')
    .insert({ thread_id: params.threadId, role: params.role, content: params.content })
    .select()
    .single();
  if (error) throw new Error(`appendChatMessage: ${error.message}`);
  const { error: bumpError } = await supabase
    .from('assistant_chat_threads')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', params.threadId);
  if (bumpError) throw new Error(`appendChatMessage (thread bump): ${bumpError.message}`);
  return data as ChatMessage;
}

export async function listChatMessages(
  supabase: SupabaseClient,
  threadId: string,
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('assistant_chat_messages')
    .select()
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw new Error(`listChatMessages: ${error.message}`);
  return (data ?? []) as ChatMessage[];
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/tests/lib/supabase/assistant-settings-chat.test.ts`
Expected: PASS (9 tests). If a mock-chain shape fails, adjust the mock per the note in Step 1.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/repositories/assistants.ts src/lib/supabase/repositories/assistant-chat.ts src/tests/lib/supabase/assistant-settings-chat.test.ts
git commit -m "feat(repos): assistant settings/memory CRUD + chat threads"
```

---

### Task 9: Sidebar cleanup

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`

- [ ] **Step 1: Update the NAV**

Replace the `NAV` constant and imports in `src/components/layout/app-sidebar.tsx`:

```tsx
"use client";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Sparkles, Eye, Swords, Settings, Clapperboard } from "lucide-react";
import { Sidebar, type SidebarItem } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";

// Post-pivot nav: /niches is home; Lab + Clips demoted (routes stay reachable
// by URL — deleting their code is a separate cleanup task).
const NAV: SidebarItem[] = [
  { href: "/niches", label: "Niches", icon: Sparkles },
  { href: "/mission-control", label: "Mission Control", icon: LayoutDashboard },
  { href: "/lab/longform", label: "Longform", icon: Clapperboard },
  { href: "/niches/watch-list", label: "Watch-list", icon: Eye },
  { href: "/competitors", label: "Competitors", icon: Swords },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ activeHref }: { activeHref?: string }) {
  const pathname = usePathname();
  return <Sidebar items={NAV} activeHref={activeHref ?? pathname} footer={<ThemeToggle />} />;
}
```

- [ ] **Step 2: Typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: green. (`FlaskConical`/`Film` imports removed with their entries.)

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/app-sidebar.tsx
git commit -m "feat(nav): post-pivot sidebar — niches first, lab/clips demoted"
```

---

### Task 10: Mission Control client components

**Files:**
- Create: `src/components/mission-control/auto-refresh.tsx`
- Create: `src/components/mission-control/health-pill.tsx`
- Create: `src/components/mission-control/agent-grid.tsx`
- Create: `src/components/mission-control/activity-feed.tsx`
- Modify: `src/components/compositions/assistant-card.tsx` (add `overdue` prop)

UI quality bar applies (premium 9/10): design tokens only, framer-motion stagger, designed empty states, Lucide 1.5px stroke. Consult the `frontend-design` skill if available.

- [ ] **Step 1: Add the `overdue` prop to AssistantCard**

In `src/components/compositions/assistant-card.tsx`:

Add to `AssistantCardProps`:

```ts
  /** Amber annotation: cron hasn't completed within its expected window. */
  overdue?: boolean;
```

In `CardInner`, destructure `overdue` and render an amber badge in the header, before the Phase badge:

```tsx
function CardInner({ icon: Icon, name, role, status, activitySummary, recentActivity, disabled, comingInPhase, overdue }: Omit<AssistantCardProps, "onOpen">) {
```

and inside `<CardHeader>` after the name/role block:

```tsx
        {overdue && !disabled && (
          <Badge variant="secondary" className="shrink-0 text-[var(--warning)]">
            Overdue
          </Badge>
        )}
```

(If `--warning` is not a defined token in `globals.css`, use the existing warning-tone token the Badge/`Tone` system uses — check `globals.css` for the warning color custom property and use that variable name.)

- [ ] **Step 2: AutoRefresh**

Create `src/components/mission-control/auto-refresh.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches the server component tree on an interval; paused while hidden. */
export function AutoRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, router]);
  return null;
}
```

- [ ] **Step 3: HealthPill**

Create `src/components/mission-control/health-pill.tsx`:

```tsx
"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HealthAttention {
  id: string;
  name: string;
  reason: "errored" | "overdue";
}

/**
 * The ONE primary signal on Mission Control: is anything broken / overdue?
 * Clicking scrolls to the first affected agent card (`#agent-card-<id>`).
 */
export function HealthPill({ attention }: { attention: HealthAttention[] }) {
  const healthy = attention.length === 0;

  const scrollToFirst = () => {
    if (healthy) return;
    document
      .getElementById(`agent-card-${attention[0].id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <button
      type="button"
      onClick={scrollToFirst}
      disabled={healthy}
      title={healthy ? undefined : attention.map((a) => `${a.name}: ${a.reason}`).join(" · ")}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        healthy
          ? "cursor-default border-[var(--border-subtle)] text-[var(--text-secondary)]"
          : "border-transparent bg-[var(--danger-muted,rgba(239,68,68,0.12))] text-[var(--danger)] hover:opacity-90",
      )}
    >
      {healthy ? (
        <CheckCircle2 className="h-4 w-4 text-[var(--success)]" strokeWidth={1.5} />
      ) : (
        <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />
      )}
      {healthy
        ? "All systems healthy"
        : `${attention.length} agent${attention.length > 1 ? "s" : ""} need${attention.length === 1 ? "s" : ""} attention`}
    </button>
  );
}
```

NOTE: replace the `--danger-muted` fallback with the project's real muted-danger token from `globals.css` (search for `danger`); the design rule is tokens only, no raw rgba — the rgba above is a placeholder ONLY if no muted token exists, in which case add `--danger-muted` to `globals.css` next to the other muted tones.

- [ ] **Step 4: AgentGrid**

Create `src/components/mission-control/agent-grid.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AssistantCard } from "@/components/compositions/assistant-card";
import { MissionControlGrid } from "@/components/compositions/mission-control-grid";
import { assistantIcon } from "@/lib/assistants/registry";
import type { AssistantStatus } from "@/lib/design/badges";
import { relativeTime } from "@/lib/format/relative-time";

/** Fully serializable card payload (server page → client grid). */
export interface AgentCardData {
  id: string;
  name: string;
  role: string;
  iconName: string;
  status: AssistantStatus;
  activitySummary?: string;
  overdue: boolean;
  recentActivity: { id: string; summary: string; at: string }[]; // at = ISO
  disabled: boolean;
  comingInPhase?: number;
}

export function AgentGrid({ cards }: { cards: AgentCardData[] }) {
  const router = useRouter();
  return (
    <MissionControlGrid>
      {cards.map((card, i) => (
        <motion.div
          key={card.id}
          id={`agent-card-${card.id}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: i * 0.05, ease: "easeOut" }}
        >
          <AssistantCard
            icon={assistantIcon(card.iconName)}
            name={card.name}
            role={card.role}
            status={card.status}
            activitySummary={card.activitySummary}
            overdue={card.overdue}
            recentActivity={card.recentActivity.map((e) => ({ ...e, at: relativeTime(e.at) }))}
            disabled={card.disabled}
            comingInPhase={card.comingInPhase}
            onOpen={card.disabled ? undefined : () => router.push(`/agents/${card.id}`)}
          />
        </motion.div>
      ))}
    </MissionControlGrid>
  );
}
```

NOTE: check `src/components/compositions/mission-control-grid.tsx` — if it renders a fixed child structure rather than `children`, pass children as it expects (it is `grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3`; wrapping each card in the `motion.div` above is fine).

- [ ] **Step 5: ActivityFeed**

Create `src/components/mission-control/activity-feed.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Clock,
  Info,
  Loader2,
  MinusCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActivityEvent, ActivityEventStatus } from "@/lib/assistants/live-status";
import { relativeTime } from "@/lib/format/relative-time";

const STATUS_ICONS: Record<ActivityEventStatus, { icon: LucideIcon; className: string }> = {
  success: { icon: CheckCircle2, className: "text-[var(--success)]" },
  partial: { icon: CheckCircle2, className: "text-[var(--warning)]" },
  failed: { icon: AlertCircle, className: "text-[var(--danger)]" },
  running: { icon: Loader2, className: "animate-spin text-[var(--accent)]" },
  queued: { icon: Clock, className: "text-[var(--text-tertiary)]" },
  skipped: { icon: MinusCircle, className: "text-[var(--text-tertiary)]" },
  info: { icon: Info, className: "text-[var(--text-tertiary)]" },
};

export interface ActivityFeedProps {
  initialEvents: ActivityEvent[];
  initialNextBefore: string | null;
  /** Names for the agent chips (assistantId → display name). */
  nameById: Record<string, string>;
  /** When set: per-agent mode — no agent chips, adds client-side type filter chips. */
  assistantId?: string;
}

export function ActivityFeed({ initialEvents, initialNextBefore, nameById, assistantId }: ActivityFeedProps) {
  const [events, setEvents] = useState(initialEvents);
  const [nextBefore, setNextBefore] = useState(initialNextBefore);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const loadMore = async () => {
    if (!nextBefore || loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ before: nextBefore, limit: "30" });
      if (assistantId) params.set("assistantId", assistantId);
      const res = await fetch(`/api/mission-control/activity?${params}`);
      if (!res.ok) return;
      const body = (await res.json()) as { events: ActivityEvent[]; nextBefore: string | null };
      setEvents((prev) => [...prev, ...body.events]);
      setNextBefore(body.nextBefore);
    } finally {
      setLoading(false);
    }
  };

  const types = assistantId ? [...new Set(events.map((e) => e.type))] : [];
  const visible = typeFilter ? events.filter((e) => e.type === typeFilter) : events;

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--border-subtle)] py-12 text-center">
        <CircleDashed className="h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} />
        <p className="text-sm font-medium text-[var(--text-secondary)]">No runs recorded yet</p>
        <p className="text-xs text-[var(--text-tertiary)]">
          Activity appears here as crons and pipelines run.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {types.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <FilterChip active={typeFilter === null} onClick={() => setTypeFilter(null)} label="All" />
          {types.map((t) => (
            <FilterChip
              key={t}
              active={typeFilter === t}
              onClick={() => setTypeFilter(t)}
              label={t.replace(/_/g, " ")}
            />
          ))}
        </div>
      )}
      <ul className="flex flex-col">
        {visible.map((event) => {
          const { icon: Icon, className } = STATUS_ICONS[event.status];
          return (
            <li
              key={event.id}
              className="flex items-center gap-3 border-b border-[var(--border-subtle)] py-2.5 last:border-b-0"
            >
              <Icon className={cn("h-4 w-4 shrink-0", className)} strokeWidth={1.5} />
              {!assistantId && (
                <Badge variant="secondary" className="shrink-0">
                  {nameById[event.assistantId] ?? event.assistantId}
                </Badge>
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">
                {event.summary}
              </span>
              <span
                className="shrink-0 font-mono text-xs text-[var(--text-tertiary)]"
                title={new Date(event.at).toLocaleString()}
              >
                {relativeTime(event.at)}
              </span>
            </li>
          );
        })}
      </ul>
      {nextBefore && (
        <Button variant="ghost" size="sm" className="mt-2 self-center" onClick={loadMore} disabled={loading}>
          {loading ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors",
        active
          ? "border-[var(--accent)] text-[var(--accent)]"
          : "border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
      )}
    >
      {label}
    </button>
  );
}
```

NOTE: check `src/components/ui/button.tsx` for its actual variant names (`ghost`/`outline`/sizes) and use ones that exist.

- [ ] **Step 6: Typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: green (components compile; no new tests — these are exercised in browser verification).

- [ ] **Step 7: Commit**

```bash
git add src/components/mission-control/ src/components/compositions/assistant-card.tsx
git commit -m "feat(mc): mission-control client components (grid, pill, feed, refresh)"
```

---

### Task 11: `/mission-control` page rewrite + activity API

**Files:**
- Modify: `src/app/mission-control/page.tsx` (full rewrite)
- Create: `src/app/mission-control/loading.tsx`
- Create: `src/app/api/mission-control/activity/route.ts`

- [ ] **Step 1: Activity API route**

Create `src/app/api/mission-control/activity/route.ts` (auth = the cockpit-cookie gate in `src/proxy.ts`, same as every UI route):

```ts
// GET /api/mission-control/activity?assistantId=&before=&limit=
// Powers "Load more" on the Mission Control feed and per-agent Activity tabs.
import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { listAssistantActivity } from '@/lib/assistants/ledger';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const supabase = getServiceClient();
    const result = await listAssistantActivity(supabase, {
      assistantId: url.searchParams.get('assistantId') ?? undefined,
      before: url.searchParams.get('before') ?? undefined,
      limit: Math.min(parseInt(url.searchParams.get('limit') ?? '30', 10) || 30, 100),
    });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'failed to list activity' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Rewrite the page**

Replace `src/app/mission-control/page.tsx` entirely:

```tsx
export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageHeader } from "@/components/layout/page-header";
import { getServiceClient } from "@/lib/supabase/server";
import { listAssistants, type Assistant } from "@/lib/supabase/repositories/assistants";
import { getLiveDashboard } from "@/lib/assistants/ledger";
import { ASSISTANT_DEFS, ASSISTANT_ORDER } from "@/lib/assistants/registry";
import { AgentGrid, type AgentCardData } from "@/components/mission-control/agent-grid";
import { ActivityFeed } from "@/components/mission-control/activity-feed";
import { AutoRefresh } from "@/components/mission-control/auto-refresh";
import { HealthPill, type HealthAttention } from "@/components/mission-control/health-pill";

const FEED_PAGE_SIZE = 30;

export default async function MissionControlPage() {
  const supabase = getServiceClient();

  let assistants: Assistant[] = [];
  try {
    assistants = await listAssistants(supabase);
  } catch {
    // un-migrated env: registry fallbacks below cover display copy
  }
  const { statuses, feed } = await getLiveDashboard(supabase);
  const byId = new Map(assistants.map((a) => [a.id, a]));

  const cards: AgentCardData[] = ASSISTANT_ORDER.map((id) => {
    const def = ASSISTANT_DEFS[id];
    const row = byId.get(id);
    const live = statuses[id];
    // Phase-3 placeholder OR operator-disabled via Settings → non-clickable card.
    const disabled = def.comingInPhase !== undefined || row?.is_enabled === false;
    return {
      id,
      name: row?.display_name ?? def.fallbackName,
      role: row?.role_description ?? def.fallbackRole,
      iconName: row?.icon_name ?? def.fallbackIcon,
      status: live.state,
      activitySummary: live.currentActivity ?? "No runs recorded yet",
      overdue: live.overdue,
      recentActivity: live.recentActivity.map((e) => ({ id: e.id, summary: e.summary, at: e.at })),
      disabled,
      comingInPhase: def.comingInPhase,
    };
  });

  const attention: HealthAttention[] = cards
    .filter((c) => !c.disabled && (c.status === "errored" || c.overdue))
    .map((c) => ({ id: c.id, name: c.name, reason: c.status === "errored" ? "errored" : "overdue" }));

  const nameById = Object.fromEntries(cards.map((c) => [c.id, c.name]));
  const firstPage = feed.slice(0, FEED_PAGE_SIZE);
  const nextBefore = feed.length > FEED_PAGE_SIZE ? firstPage[firstPage.length - 1].at : null;

  return (
    <AppShell sidebar={<AppSidebar activeHref="/mission-control" />}>
      <AutoRefresh intervalMs={15000} />
      <PageHeader
        title="Mission Control"
        description="Live status across every agent, derived from real run ledgers."
        actions={<HealthPill attention={attention} />}
      />
      <AgentGrid cards={cards} />
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          Recent activity
        </h2>
        <ActivityFeed initialEvents={firstPage} initialNextBefore={nextBefore} nameById={nameById} />
      </section>
    </AppShell>
  );
}
```

`TopicQueuePanel`/`TrendingPanel` imports are GONE from this page (components stay on disk for the legacy `/lab` surface / later cleanup).

- [ ] **Step 3: Loading skeleton**

Create `src/app/mission-control/loading.tsx`:

```tsx
import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Skeleton } from "@/components/ui/skeleton";

export default function MissionControlLoading() {
  return (
    <AppShell sidebar={<AppSidebar activeHref="/mission-control" />}>
      <div className="mb-8 flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-40 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
      <div className="mt-10 space-y-3">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 4: Typecheck + full suite + build**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: all green; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/mission-control/ src/app/api/mission-control/
git commit -m "feat(mc): rewrite /mission-control as the live agents dashboard"
```

---

### Task 12: `/agents/[id]` page shell + Activity tab

**Files:**
- Create: `src/app/agents/[id]/page.tsx`
- Create: `src/app/agents/[id]/loading.tsx`
- Create: `src/components/agents/agent-tabs.tsx`

Next.js 16: `params` and `searchParams` are **Promises** — always `await` them. Unknown ids → `notFound()`. Tabs are LINKS synced to `?tab=` (linkable, server-rendered) — not the client-state base-ui Tabs.

- [ ] **Step 1: Tab bar component**

Create `src/components/agents/agent-tabs.tsx`:

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

export type AgentTab = "activity" | "chat" | "memory" | "settings";

const TABS: { key: AgentTab; label: string }[] = [
  { key: "activity", label: "Activity" },
  { key: "chat", label: "Chat" },
  { key: "memory", label: "Memory" },
  { key: "settings", label: "Settings" },
];

export function AgentTabs({ agentId, active }: { agentId: string; active: AgentTab }) {
  return (
    <nav className="mb-6 flex gap-1 border-b border-[var(--border-subtle)]">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={`/agents/${agentId}?tab=${tab.key}`}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === tab.key
              ? "border-[var(--accent)] text-[var(--text-primary)]"
              : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Page**

Create `src/app/agents/[id]/page.tsx`:

```tsx
export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { Construction } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getServiceClient } from "@/lib/supabase/server";
import { getAssistantById, listAssistantMemory, getAssistantSettings } from "@/lib/supabase/repositories/assistants";
import { listChatThreads, listChatMessages, type ChatMessage, type ChatThread } from "@/lib/supabase/repositories/assistant-chat";
import { getLiveDashboard, listAssistantActivity } from "@/lib/assistants/ledger";
import { ASSISTANT_DEFS, assistantIcon, isAssistantId } from "@/lib/assistants/registry";
import { AssistantStatusDot } from "@/components/compositions/assistant-status-dot";
import { Badge } from "@/components/ui/badge";
import { ActivityFeed } from "@/components/mission-control/activity-feed";
import { AutoRefresh } from "@/components/mission-control/auto-refresh";
import { AgentTabs, type AgentTab } from "@/components/agents/agent-tabs";
import { MemoryTab } from "@/components/agents/memory-tab";
import { SettingsTab } from "@/components/agents/settings-tab";
import { ChatTab } from "@/components/agents/chat-tab";
import { relativeTime } from "@/lib/format/relative-time";

const VALID_TABS: AgentTab[] = ["activity", "chat", "memory", "settings"];

export default async function AgentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; thread?: string }>;
}) {
  const { id } = await params;
  if (!isAssistantId(id)) notFound();
  const sp = await searchParams;
  const tab: AgentTab = VALID_TABS.includes(sp.tab as AgentTab) ? (sp.tab as AgentTab) : "activity";

  const supabase = getServiceClient();
  const def = ASSISTANT_DEFS[id];
  const [assistant, dashboard] = await Promise.all([
    getAssistantById(supabase, id).catch(() => null),
    getLiveDashboard(supabase),
  ]);
  const live = dashboard.statuses[id];
  const name = assistant?.display_name ?? def.fallbackName;
  const role = assistant?.role_description ?? def.fallbackRole;
  const Icon = assistantIcon(assistant?.icon_name ?? def.fallbackIcon);
  const isPlaceholder = def.comingInPhase !== undefined;

  return (
    <AppShell sidebar={<AppSidebar activeHref="/mission-control" />}>
      {tab === "activity" && <AutoRefresh intervalMs={15000} />}

      <header className="mb-6 flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-muted)] text-[var(--accent)]">
          <Icon className="h-6 w-6" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold text-[var(--text-primary)]">{name}</h1>
            {isPlaceholder && <Badge variant="secondary">Phase {def.comingInPhase}</Badge>}
          </div>
          <p className="truncate text-sm text-[var(--text-secondary)]">{role}</p>
        </div>
        {!isPlaceholder && (
          <div className="flex shrink-0 items-center gap-2 text-sm text-[var(--text-secondary)]">
            <AssistantStatusDot status={live.state} />
            <span className="max-w-md truncate" title={live.currentActivity ?? undefined}>
              {live.currentActivity ?? "No runs recorded yet"}
            </span>
            {live.lastEventAt && (
              <span className="font-mono text-xs text-[var(--text-tertiary)]">
                {relativeTime(live.lastEventAt)}
              </span>
            )}
          </div>
        )}
      </header>

      {isPlaceholder ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] py-16 text-center">
          <Construction className="h-8 w-8 text-[var(--text-tertiary)]" strokeWidth={1.5} />
          <p className="text-base font-medium text-[var(--text-secondary)]">
            The Editor Co-pilot arrives in Phase 3
          </p>
          <p className="max-w-sm text-sm text-[var(--text-tertiary)]">
            Premiere Pro / CapCut co-editing — cut suggestions, captions, and pacing fixes on your timeline.
          </p>
        </div>
      ) : (
        <>
          <AgentTabs agentId={id} active={tab} />
          {tab === "activity" && <ActivityTab agentId={id} />}
          {tab === "chat" && <ChatSection agentId={id} threadId={sp.thread} />}
          {tab === "memory" && <MemorySection agentId={id} />}
          {tab === "settings" && <SettingsSection agentId={id} isEnabled={assistant?.is_enabled ?? true} />}
        </>
      )}
    </AppShell>
  );
}

async function ActivityTab({ agentId }: { agentId: string }) {
  const supabase = getServiceClient();
  const { events, nextBefore } = await listAssistantActivity(supabase, { assistantId: agentId, limit: 30 });
  return (
    <ActivityFeed
      initialEvents={events}
      initialNextBefore={nextBefore}
      nameById={{}}
      assistantId={agentId}
    />
  );
}

async function MemorySection({ agentId }: { agentId: string }) {
  const supabase = getServiceClient();
  const memories = await listAssistantMemory(supabase, agentId).catch(() => []);
  return <MemoryTab agentId={agentId} memories={memories} />;
}

async function SettingsSection({ agentId, isEnabled }: { agentId: string; isEnabled: boolean }) {
  const supabase = getServiceClient();
  const settings = await getAssistantSettings(supabase, agentId).catch(() => ({}) as Record<string, unknown>);
  const def = ASSISTANT_DEFS[agentId as keyof typeof ASSISTANT_DEFS];
  return (
    <SettingsTab
      agentId={agentId}
      isEnabled={isEnabled}
      chatModel={typeof settings.chat_model === "string" ? settings.chat_model : "claude-sonnet-4-6"}
      schedules={def.schedules}
    />
  );
}

async function ChatSection({ agentId, threadId }: { agentId: string; threadId?: string }) {
  const supabase = getServiceClient();
  const threads: ChatThread[] = await listChatThreads(supabase, agentId, 20).catch(() => []);
  const activeThread = threadId ? threads.find((t) => t.id === threadId) ?? null : null;
  const messages: ChatMessage[] = activeThread
    ? await listChatMessages(supabase, activeThread.id).catch(() => [])
    : [];
  return <ChatTab agentId={agentId} threads={threads} activeThreadId={activeThread?.id ?? null} initialMessages={messages} />;
}
```

NOTE: `MemoryTab`, `SettingsTab`, `ChatTab` are created in Tasks 13–15. To keep THIS task green, create three minimal placeholder components now and replace in their tasks:

Create `src/components/agents/memory-tab.tsx`, `settings-tab.tsx`, `chat-tab.tsx` each as (adjusting names/props per the imports above):

```tsx
// TEMPORARY shell — replaced in Task 13/14/15.
import type { AssistantMemory } from "@/lib/supabase/repositories/assistants";

export function MemoryTab(_props: { agentId: string; memories: AssistantMemory[] }) {
  return <p className="text-sm text-[var(--text-tertiary)]">Memory — coming in the next commit.</p>;
}
```

```tsx
// TEMPORARY shell — replaced in Task 14.
export function SettingsTab(_props: {
  agentId: string;
  isEnabled: boolean;
  chatModel: string;
  schedules: { label: string; cron: string }[];
}) {
  return <p className="text-sm text-[var(--text-tertiary)]">Settings — coming in the next commit.</p>;
}
```

```tsx
// TEMPORARY shell — replaced in Task 15.
import type { ChatMessage, ChatThread } from "@/lib/supabase/repositories/assistant-chat";

export function ChatTab(_props: {
  agentId: string;
  threads: ChatThread[];
  activeThreadId: string | null;
  initialMessages: ChatMessage[];
}) {
  return <p className="text-sm text-[var(--text-tertiary)]">Chat — coming in the next commit.</p>;
}
```

(`ChatThread`/`ChatMessage` are server-only-module types — these tab components are SERVER-rendered children except where later tasks mark them `"use client"`; in Task 15 the client `ChatTab` defines its own serializable prop types instead of importing from the repo. The temporary shells above are server components, so the imports are fine for now.)

- [ ] **Step 3: Loading skeleton**

Create `src/app/agents/[id]/loading.tsx`:

```tsx
import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Skeleton } from "@/components/ui/skeleton";

export default function AgentLoading() {
  return (
    <AppShell sidebar={<AppSidebar activeHref="/mission-control" />}>
      <div className="mb-6 flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <Skeleton className="mb-6 h-9 w-80" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 4: Verify routing**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: green; the build lists `/agents/[id]` as a dynamic route.

- [ ] **Step 5: Commit**

```bash
git add src/app/agents/ src/components/agents/
git commit -m "feat(agents): per-agent page shell with linkable tabs + activity"
```

---

### Task 13: Memory tab + API

**Files:**
- Replace: `src/components/agents/memory-tab.tsx` (the Task-12 shell)
- Create: `src/app/api/agents/[id]/memory/route.ts`

- [ ] **Step 1: Memory API route**

Create `src/app/api/agents/[id]/memory/route.ts`:

```ts
// POST   /api/agents/[id]/memory  { memoryKey, memoryValue, confidence? } → upsert
// DELETE /api/agents/[id]/memory  { memoryKey } → delete
import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import {
  upsertAssistantMemory,
  deleteAssistantMemory,
} from '@/lib/supabase/repositories/assistants';
import { isAssistantId } from '@/lib/assistants/registry';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!isAssistantId(id)) return Response.json({ error: 'unknown assistant' }, { status: 404 });
  try {
    const body = (await req.json()) as { memoryKey?: string; memoryValue?: unknown; confidence?: number };
    if (!body.memoryKey || body.memoryValue === undefined) {
      return Response.json({ error: 'memoryKey and memoryValue are required' }, { status: 400 });
    }
    const supabase = getServiceClient();
    const memory = await upsertAssistantMemory(supabase, {
      assistantId: id,
      memoryKey: body.memoryKey,
      memoryValue: body.memoryValue,
      confidence: body.confidence,
      editableByUser: true,
    });
    return Response.json({ memory });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'failed to save memory' }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!isAssistantId(id)) return Response.json({ error: 'unknown assistant' }, { status: 404 });
  try {
    const body = (await req.json()) as { memoryKey?: string };
    if (!body.memoryKey) return Response.json({ error: 'memoryKey is required' }, { status: 400 });
    const supabase = getServiceClient();
    await deleteAssistantMemory(supabase, id, body.memoryKey);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'failed to delete memory' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Replace the MemoryTab shell**

Replace `src/components/agents/memory-tab.tsx` entirely:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BrainCircuit, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { relativeTime } from "@/lib/format/relative-time";

/** Serializable mirror of AssistantMemory (repo module is server-only). */
export interface MemoryRow {
  id: string;
  assistant_id: string;
  memory_key: string;
  memory_value: unknown;
  confidence: number;
  last_updated_at: string;
  editable_by_user: boolean;
}

export function MemoryTab({ agentId, memories }: { agentId: string; memories: MemoryRow[] }) {
  const router = useRouter();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (memoryKey: string, rawValue: string, confidence?: number) => {
    setBusy(true);
    setError(null);
    try {
      let memoryValue: unknown;
      try {
        memoryValue = JSON.parse(rawValue);
      } catch {
        memoryValue = rawValue; // plain strings are fine
      }
      const res = await fetch(`/api/agents/${agentId}/memory`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memoryKey, memoryValue, confidence }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "save failed");
      setEditingKey(null);
      setAdding(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (memoryKey: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/memory`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memoryKey }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "delete failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      {memories.length === 0 && !adding && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--border-subtle)] py-12 text-center">
          <BrainCircuit className="h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} />
          <p className="text-sm font-medium text-[var(--text-secondary)]">No learned preferences yet</p>
          <p className="text-xs text-[var(--text-tertiary)]">
            Memories appear as agents learn from outcomes — or add one yourself.
          </p>
        </div>
      )}

      {memories.map((m) =>
        editingKey === m.memory_key ? (
          <MemoryEditor
            key={m.id}
            initialKey={m.memory_key}
            initialValue={JSON.stringify(m.memory_value, null, 2)}
            keyLocked
            busy={busy}
            onSave={(k, v) => save(k, v, m.confidence)}
            onCancel={() => setEditingKey(null)}
          />
        ) : (
          <div key={m.id} className="flex items-start gap-3 rounded-lg border border-[var(--border-subtle)] p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <code className="text-sm font-medium text-[var(--text-primary)]">{m.memory_key}</code>
                <span className="text-xs text-[var(--text-tertiary)]">
                  confidence {Math.round(m.confidence * 100)}%
                </span>
                <span className="text-xs text-[var(--text-tertiary)]" title={new Date(m.last_updated_at).toLocaleString()}>
                  · {relativeTime(m.last_updated_at)}
                </span>
              </div>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-[var(--text-secondary)]">
                {JSON.stringify(m.memory_value, null, 2)}
              </pre>
            </div>
            {m.editable_by_user && (
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditingKey(m.memory_key)} aria-label="Edit">
                  <Pencil className="h-4 w-4" strokeWidth={1.5} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(m.memory_key)} disabled={busy} aria-label="Delete">
                  <Trash2 className="h-4 w-4 text-[var(--danger)]" strokeWidth={1.5} />
                </Button>
              </div>
            )}
          </div>
        ),
      )}

      {adding ? (
        <MemoryEditor
          initialKey=""
          initialValue=""
          keyLocked={false}
          busy={busy}
          onSave={(k, v) => save(k, v)}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-4 w-4" strokeWidth={1.5} /> Add memory
        </Button>
      )}
    </div>
  );
}

function MemoryEditor({
  initialKey,
  initialValue,
  keyLocked,
  busy,
  onSave,
  onCancel,
}: {
  initialKey: string;
  initialValue: string;
  keyLocked: boolean;
  busy: boolean;
  onSave: (key: string, value: string) => void;
  onCancel: () => void;
}) {
  const [key, setKey] = useState(initialKey);
  const [value, setValue] = useState(initialValue);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--accent)] p-3">
      <Input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        placeholder="memory_key (snake_case)"
        disabled={keyLocked}
        className="font-mono text-sm"
      />
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder='Value — JSON ({"band": "proven"}) or plain text'
        rows={4}
        className="font-mono text-xs"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => onSave(key.trim(), value)} disabled={busy || !key.trim() || !value.trim()}>
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          <X className="mr-1 h-4 w-4" strokeWidth={1.5} /> Cancel
        </Button>
      </div>
    </div>
  );
}
```

In `src/app/agents/[id]/page.tsx`, the `MemorySection` import/usage stays as written in Task 12 — `AssistantMemory[]` is structurally identical to `MemoryRow[]` (if tsc complains about `memory_value: unknown` variance, map the rows: `memories.map((m) => ({ ...m }))`).

- [ ] **Step 3: Typecheck + suite**

Run: `npx tsc --noEmit && npm test`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/components/agents/memory-tab.tsx src/app/api/agents/
git commit -m "feat(agents): editable memory tab backed by assistant_memory"
```

---

### Task 14: Settings tab + API

**Files:**
- Modify: `src/lib/assistants/registry.ts` (add `CHAT_MODELS` / `DEFAULT_CHAT_MODEL`)
- Replace: `src/components/agents/settings-tab.tsx` (the Task-12 shell)
- Create: `src/app/api/agents/[id]/settings/route.ts`

- [ ] **Step 1: Chat-model constants in the registry**

Append to `src/lib/assistants/registry.ts`:

```ts
/** Models selectable per-agent for chat (stored in assistant_settings.settings.chat_model). */
export const CHAT_MODELS = ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-7'] as const;
export type ChatModel = (typeof CHAT_MODELS)[number];
export const DEFAULT_CHAT_MODEL: ChatModel = 'claude-sonnet-4-6';
```

- [ ] **Step 2: Settings API route**

Create `src/app/api/agents/[id]/settings/route.ts`:

```ts
// PATCH /api/agents/[id]/settings  { isEnabled?, chatModel? }
import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { setAssistantEnabled, updateAssistantSettings } from '@/lib/supabase/repositories/assistants';
import { CHAT_MODELS, isAssistantId, type ChatModel } from '@/lib/assistants/registry';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  if (!isAssistantId(id)) return Response.json({ error: 'unknown assistant' }, { status: 404 });
  try {
    const body = (await req.json()) as { isEnabled?: boolean; chatModel?: string };
    const supabase = getServiceClient();
    if (typeof body.isEnabled === 'boolean') {
      await setAssistantEnabled(supabase, id, body.isEnabled);
    }
    if (body.chatModel !== undefined) {
      if (!(CHAT_MODELS as readonly string[]).includes(body.chatModel)) {
        return Response.json({ error: `chatModel must be one of ${CHAT_MODELS.join(', ')}` }, { status: 400 });
      }
      await updateAssistantSettings(supabase, id, { chat_model: body.chatModel as ChatModel });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'failed to update settings' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Replace the SettingsTab shell**

Replace `src/components/agents/settings-tab.tsx` entirely:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CHAT_MODELS } from "@/lib/assistants/registry";

const MODEL_LABELS: Record<string, string> = {
  "claude-haiku-4-5": "Haiku 4.5 — fast & cheap",
  "claude-sonnet-4-6": "Sonnet 4.6 — balanced (default)",
  "claude-opus-4-7": "Opus 4.7 — deepest reasoning",
};

export function SettingsTab({
  agentId,
  isEnabled,
  chatModel,
  schedules,
}: {
  agentId: string;
  isEnabled: boolean;
  chatModel: string;
  schedules: { label: string; cron: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = async (body: { isEnabled?: boolean; chatModel?: string }) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "update failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex max-w-xl flex-col gap-6">
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

      <section className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] p-4">
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Enabled</p>
          <p className="text-xs text-[var(--text-tertiary)]">
            Disabled agents render dimmed and non-clickable on Mission Control.
          </p>
        </div>
        <Switch checked={isEnabled} onCheckedChange={(v: boolean) => patch({ isEnabled: v })} disabled={busy} />
      </section>

      <section className="rounded-lg border border-[var(--border-subtle)] p-4">
        <p className="text-sm font-medium text-[var(--text-primary)]">Chat model</p>
        <p className="mb-3 text-xs text-[var(--text-tertiary)]">Used by this agent's Chat tab.</p>
        <Select value={chatModel} onValueChange={(v: string) => patch({ chatModel: v })} disabled={busy}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHAT_MODELS.map((m) => (
              <SelectItem key={m} value={m}>
                {MODEL_LABELS[m] ?? m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="rounded-lg border border-[var(--border-subtle)] p-4">
        <div className="mb-2 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={1.5} />
          <p className="text-sm font-medium text-[var(--text-primary)]">Schedules</p>
        </div>
        {schedules.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">Event-driven — no cron schedule.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {schedules.map((s) => (
              <li key={s.label} className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-secondary)]">{s.label}</span>
                <code className="font-mono text-xs text-[var(--text-tertiary)]">{s.cron} UTC</code>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">
          Read-only — schedules live in vercel.ts.
        </p>
      </section>
    </div>
  );
}
```

NOTE: check `src/components/ui/switch.tsx` and `select.tsx` for their actual prop names (`checked`/`onCheckedChange` vs base-ui equivalents) and adapt.

- [ ] **Step 4: Typecheck + suite**

Run: `npx tsc --noEmit && npm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/assistants/registry.ts src/components/agents/settings-tab.tsx src/app/api/agents/
git commit -m "feat(agents): settings tab — enable toggle, chat model, schedules"
```

---

### Task 15: Agent chat — tools, prompt, route, UI

**Files:**
- Modify: `src/lib/ai/gateway.ts` (export `ClaudeModelId`, add `claude-sonnet-4-6`)
- Create: `src/lib/assistants/chat-tools.ts`
- Create: `src/lib/assistants/chat-prompt.ts`
- Create: `src/app/api/agents/[id]/chat/route.ts`
- Replace: `src/components/agents/chat-tab.tsx` (the Task-12 shell)
- Test: `src/tests/lib/assistants/chat-tools.test.ts`

**Local-dev caveat (standing rule):** AI SDK calls 404 if `ANTHROPIC_BASE_URL` is set in the shell that runs `npm run dev` — run dev with `env -u ANTHROPIC_BASE_URL` (the preview tool environment may need the same).

- [ ] **Step 1: Gateway**

In `src/lib/ai/gateway.ts` change the type to:

```ts
export type ClaudeModelId =
  | "claude-haiku-4-5"
  | "claude-sonnet-4-5"
  | "claude-sonnet-4-6"
  | "claude-opus-4-7";
```

(Now exported; one new member.)

- [ ] **Step 2: Write the failing tools test**

Create `src/tests/lib/assistants/chat-tools.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import { buildChatTools } from '@/lib/assistants/chat-tools';

beforeEach(() => vi.clearAllMocks());

const fakeClient = {} as never;

describe('buildChatTools', () => {
  it('gives each enabled agent 2+ read-only tools', () => {
    expect(Object.keys(buildChatTools(fakeClient, 'niche_scout'))).toEqual(['list_top_niches', 'get_niche']);
    expect(Object.keys(buildChatTools(fakeClient, 'watch_list_curator'))).toEqual(['list_watched_channels']);
    expect(Object.keys(buildChatTools(fakeClient, 'generator'))).toEqual(['list_recent_videos', 'list_recent_jobs']);
    expect(Object.keys(buildChatTools(fakeClient, 'video_reviewer'))).toEqual(['list_recent_reviews', 'get_review']);
    expect(Object.keys(buildChatTools(fakeClient, 'analyst'))).toEqual(['list_posted_videos', 'get_video_analytics']);
  });

  it('editor_copilot has no tools', () => {
    expect(Object.keys(buildChatTools(fakeClient, 'editor_copilot'))).toHaveLength(0);
  });
});
```

Run: `npx vitest run src/tests/lib/assistants/chat-tools.test.ts` — expected FAIL (module missing).

- [ ] **Step 3: Implement the tools**

Create `src/lib/assistants/chat-tools.ts`:

```ts
// src/lib/assistants/chat-tools.ts
//
// Read-only AI SDK tools per agent, wrapping existing repositories.
// Chat must GROUND its answers in these — no invented numbers (accuracy gate).
import 'server-only';
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssistantId } from '@/lib/assistants/registry';
import {
  listDigestRankedClusters,
  getLatestWeekStart,
  getClusterById,
} from '@/lib/supabase/repositories/niche-clusters';
import { listActiveWatchedChannels } from '@/lib/supabase/repositories/watched-channels';
import { listVideosByStatus } from '@/lib/supabase/repositories/your-videos';
import { listRecentJobs } from '@/lib/supabase/repositories/jobs';
import { listRecentReviews, getVideoReviewByVideoId } from '@/lib/supabase/repositories/video-reviews';
import { getLatestSnapshot } from '@/lib/supabase/repositories/video-analytics';

export function buildChatTools(supabase: SupabaseClient, assistantId: AssistantId): Record<string, Tool> {
  switch (assistantId) {
    case 'niche_scout':
      return {
        list_top_niches: tool({
          description: "This week's digest-ranked niche clusters (falls back to the latest week with data).",
          inputSchema: z.object({}),
          execute: async () => {
            const week = await getLatestWeekStart(supabase);
            if (!week) return { week: null, niches: [] };
            const clusters = await listDigestRankedClusters(supabase, week);
            return {
              week,
              niches: clusters.slice(0, 15).map((c) => ({
                id: c.id,
                topic: c.canonical_topic,
                nicheScore: c.niche_score,
                provenScore: c.proven_score,
                firstMoverScore: c.first_mover_score,
                channelCount: c.channel_count,
                productionFit: c.production_fit,
                discoveryState: c.discovery_state,
              })),
            };
          },
        }),
        get_niche: tool({
          description: 'Full detail for one niche cluster by id.',
          inputSchema: z.object({ id: z.string() }),
          execute: async ({ id }) => (await getClusterById(supabase, id)) ?? { error: 'not found' },
        }),
      };
    case 'watch_list_curator':
      return {
        list_watched_channels: tool({
          description: 'Active channels on the watch-list.',
          inputSchema: z.object({}),
          execute: async () => (await listActiveWatchedChannels(supabase)).slice(0, 25),
        }),
      };
    case 'generator':
      return {
        list_recent_videos: tool({
          description: 'Recent video drafts and renders (status draft/rendering/rendered).',
          inputSchema: z.object({}),
          execute: async () => {
            const videos = await listVideosByStatus(supabase, ['draft', 'rendering', 'rendered'], 10);
            return videos.map((v) => ({
              id: v.id, title: v.title, status: v.status,
              durationSeconds: v.duration_seconds, updatedAt: v.updated_at,
            }));
          },
        }),
        list_recent_jobs: tool({
          description: 'Recent pipeline jobs (longform + shorts) with status and progress.',
          inputSchema: z.object({}),
          execute: async () => {
            const jobs = await listRecentJobs(supabase, 10);
            return jobs.map((j) => ({
              id: j.id, kind: j.kind, status: j.status,
              currentStep: j.current_step, progressPct: j.progress_pct,
              error: j.error, createdAt: j.created_at,
            }));
          },
        }),
      };
    case 'video_reviewer':
      return {
        list_recent_reviews: tool({
          description: 'Recent video reviews with verdicts.',
          inputSchema: z.object({}),
          execute: async () => listRecentReviews(supabase, 10),
        }),
        get_review: tool({
          description: 'Latest full review (scores, suggestions, strengths) for a video id.',
          inputSchema: z.object({ videoId: z.string() }),
          execute: async ({ videoId }) =>
            (await getVideoReviewByVideoId(supabase, videoId)) ?? { error: 'no review for that video' },
        }),
      };
    case 'analyst':
      return {
        list_posted_videos: tool({
          description: 'Posted videos (id, title, posted_at).',
          inputSchema: z.object({}),
          execute: async () => {
            const videos = await listVideosByStatus(supabase, 'posted', 15);
            return videos.map((v) => ({ id: v.id, title: v.title, postedAt: v.posted_at, url: v.url }));
          },
        }),
        get_video_analytics: tool({
          description: 'Latest analytics snapshot (views, CTR, retention) for a video id.',
          inputSchema: z.object({ videoId: z.string() }),
          execute: async ({ videoId }) =>
            (await getLatestSnapshot(supabase, videoId)) ?? { error: 'no analytics snapshot yet' },
        }),
      };
    case 'editor_copilot':
      return {};
  }
}
```

NOTE: verify the exact exported names/signatures in `niche-clusters.ts`, `watched-channels.ts`, and `video-analytics.ts` before writing (e.g. `getLatestSnapshot(supabase, yourVideoId)`, `listDigestRankedClusters(supabase, weekStart)`); adjust the property names in the mappers to the actual row fields.

Run: `npx vitest run src/tests/lib/assistants/chat-tools.test.ts` — expected PASS (2 tests).

- [ ] **Step 4: System prompt builder**

Create `src/lib/assistants/chat-prompt.ts`:

```ts
// src/lib/assistants/chat-prompt.ts
import 'server-only';
import type { ActivityEvent, LiveAssistantStatus } from '@/lib/assistants/live-status';

export function buildAssistantSystemPrompt(args: {
  name: string;
  roleDescription: string;
  status: LiveAssistantStatus;
  recentEvents: ActivityEvent[];
}): string {
  const { name, roleDescription, status, recentEvents } = args;
  const eventLines = recentEvents
    .slice(0, 10)
    .map((e) => `- [${e.at}] (${e.status}) ${e.summary}`)
    .join('\n');
  return [
    `You are ${name}, an agent inside Shorts OS — Darius's personal creator co-pilot for finding dominatable YouTube niches and producing longform videos.`,
    `Your role: ${roleDescription}`,
    '',
    'Your current live state (derived from real run ledgers):',
    `- state: ${status.state}${status.overdue ? ' (OVERDUE — last successful run is older than expected)' : ''}`,
    `- current activity: ${status.currentActivity ?? 'none'}`,
    '',
    'Your recent activity:',
    eventLines || '- no runs recorded yet',
    '',
    'Rules:',
    '- Ground every factual claim in your tool results or the activity above. Factual accuracy is a hard quality gate in this product: NEVER invent numbers, stats, or video titles.',
    "- If the data doesn't answer the question, say so plainly and suggest what would.",
    '- You are read-only: you cannot trigger runs, edit data, or change settings. If asked, explain where in the app to do it.',
    '- Be concise and concrete. Plain language, no filler.',
  ].join('\n');
}
```

- [ ] **Step 5: Chat route**

Create `src/app/api/agents/[id]/chat/route.ts`:

```ts
// POST /api/agents/[id]/chat  { threadId?, message }
// Streams the assistant reply as text; persists both sides to assistant_chat_*.
// Response header x-thread-id carries the (possibly new) thread id.
import 'server-only';
import { streamText, stepCountIs, type ModelMessage } from 'ai';
import { getServiceClient } from '@/lib/supabase/server';
import { getClaudeModel, type ClaudeModelId } from '@/lib/ai/gateway';
import { getAssistantById, getAssistantSettings } from '@/lib/supabase/repositories/assistants';
import {
  createChatThread,
  appendChatMessage,
  listChatMessages,
} from '@/lib/supabase/repositories/assistant-chat';
import { getLiveDashboard } from '@/lib/assistants/ledger';
import { buildChatTools } from '@/lib/assistants/chat-tools';
import { buildAssistantSystemPrompt } from '@/lib/assistants/chat-prompt';
import {
  ASSISTANT_DEFS,
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  isAssistantId,
} from '@/lib/assistants/registry';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  if (!isAssistantId(id)) return Response.json({ error: 'unknown assistant' }, { status: 404 });
  const def = ASSISTANT_DEFS[id];
  if (def.comingInPhase !== undefined) {
    return Response.json({ error: 'this agent ships in a later phase' }, { status: 400 });
  }

  let body: { threadId?: string; message?: string };
  try {
    body = (await req.json()) as { threadId?: string; message?: string };
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const message = body.message?.trim();
  if (!message) return Response.json({ error: 'message is required' }, { status: 400 });

  try {
    const supabase = getServiceClient();
    const [assistant, settings, dashboard] = await Promise.all([
      getAssistantById(supabase, id).catch(() => null),
      getAssistantSettings(supabase, id).catch(() => ({}) as Record<string, unknown>),
      getLiveDashboard(supabase),
    ]);

    // Thread: reuse or create (title = first 60 chars of the opening message).
    const threadId =
      body.threadId ??
      (await createChatThread(supabase, { assistantId: id, title: message.slice(0, 60) })).id;

    await appendChatMessage(supabase, { threadId, role: 'user', content: message });

    // DB is the source of truth for history (includes the message just saved).
    const history = await listChatMessages(supabase, threadId);
    const messages: ModelMessage[] = history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const chatModel = (CHAT_MODELS as readonly string[]).includes(String(settings.chat_model))
      ? (settings.chat_model as ClaudeModelId)
      : (DEFAULT_CHAT_MODEL as ClaudeModelId);

    const status = dashboard.statuses[id];
    const system = buildAssistantSystemPrompt({
      name: assistant?.display_name ?? def.fallbackName,
      roleDescription: assistant?.role_description ?? def.fallbackRole,
      status,
      recentEvents: dashboard.feed.filter((e) => e.assistantId === id),
    });

    const result = streamText({
      model: getClaudeModel(chatModel),
      system,
      messages,
      tools: buildChatTools(supabase, id),
      stopWhen: stepCountIs(5),
      onFinish: async ({ text }) => {
        try {
          if (text.trim()) await appendChatMessage(supabase, { threadId, role: 'assistant', content: text });
        } catch (err) {
          console.warn('[agent-chat] failed to persist assistant message:', err);
        }
      },
    });

    return result.toTextStreamResponse({ headers: { 'x-thread-id': threadId } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'chat failed' }, { status: 500 });
  }
}
```

NOTE: this codebase's Next.js + AI SDK versions post-date training data — confirm `streamText`/`stepCountIs`/`toTextStreamResponse` usage against `src/lib/agents/writer.ts` (existing in-repo `streamText` consumer) and `node_modules/ai/dist/` types; follow whatever the installed v6 actually exposes.

- [ ] **Step 6: Replace the ChatTab shell**

Replace `src/components/agents/chat-tab.tsx` entirely (client component with its OWN serializable types — do not import repo types here):

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, MessagesSquare, SendHorizonal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { relativeTime } from "@/lib/format/relative-time";

export interface ChatThreadData {
  id: string;
  title: string | null;
  last_message_at: string;
}

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export function ChatTab({
  agentId,
  threads,
  activeThreadId,
  initialMessages,
}: {
  agentId: string;
  threads: ChatThreadData[];
  activeThreadId: string | null;
  initialMessages: ChatMessageData[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageData[]>(
    initialMessages.filter((m) => m.role !== "system"),
  );
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = () =>
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));

  const send = async () => {
    const message = draft.trim();
    if (!message || streaming) return;
    setDraft("");
    setError(null);
    setStreaming(true);
    setMessages((prev) => [
      ...prev,
      { id: `local-u-${prev.length}`, role: "user", content: message },
      { id: `local-a-${prev.length}`, role: "assistant", content: "" },
    ]);
    scrollToEnd();
    try {
      const res = await fetch(`/api/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: activeThreadId ?? undefined, message }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `request failed (${res.status})`);
      }
      const newThreadId = res.headers.get("x-thread-id");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
        scrollToEnd();
      }
      if (!activeThreadId && newThreadId) {
        router.replace(`/agents/${agentId}?tab=chat&thread=${newThreadId}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "stream failed");
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-16rem)] min-h-[24rem] gap-4">
      {/* Thread list */}
      <aside className="hidden w-56 shrink-0 flex-col gap-1 overflow-y-auto md:flex">
        <Button
          variant="ghost"
          size="sm"
          className="justify-start"
          onClick={() => router.push(`/agents/${agentId}?tab=chat`)}
        >
          <MessageSquarePlus className="mr-2 h-4 w-4" strokeWidth={1.5} /> New chat
        </Button>
        {threads.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => router.push(`/agents/${agentId}?tab=chat&thread=${t.id}`)}
            className={cn(
              "rounded-md px-2 py-1.5 text-left text-sm transition-colors",
              t.id === activeThreadId
                ? "bg-[var(--accent-muted)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-overlay,rgba(127,127,127,0.08))]",
            )}
          >
            <span className="block truncate">{t.title ?? "Untitled"}</span>
            <span className="block text-xs text-[var(--text-tertiary)]">{relativeTime(t.last_message_at)}</span>
          </button>
        ))}
      </aside>

      {/* Messages + composer */}
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-[var(--border-subtle)]">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <MessagesSquare className="h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} />
              <p className="text-sm font-medium text-[var(--text-secondary)]">Ask about this agent's data</p>
              <p className="max-w-xs text-xs text-[var(--text-tertiary)]">
                Answers are grounded in real runs and tables — it will say when it doesn't know.
              </p>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
                  m.role === "user"
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--border-subtle)] text-[var(--text-primary)]",
                )}
              >
                {m.content || (streaming ? "…" : "")}
              </div>
            </div>
          ))}
          {error && (
            <div className="flex items-center gap-2 text-sm text-[var(--danger)]">
              <span>{error}</span>
              <Button variant="ghost" size="sm" onClick={() => setError(null)}>
                Dismiss
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-end gap-2 border-t border-[var(--border-subtle)] p-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask about niches, runs, retention…"
            rows={2}
            className="flex-1 resize-none"
            disabled={streaming}
          />
          <Button onClick={() => void send()} disabled={streaming || !draft.trim()} aria-label="Send">
            <SendHorizonal className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

Update `ChatSection` in `src/app/agents/[id]/page.tsx` to pass serializable shapes:

```tsx
async function ChatSection({ agentId, threadId }: { agentId: string; threadId?: string }) {
  const supabase = getServiceClient();
  const threads = await listChatThreads(supabase, agentId, 20).catch(() => []);
  const activeThread = threadId ? threads.find((t) => t.id === threadId) ?? null : null;
  const messages = activeThread ? await listChatMessages(supabase, activeThread.id).catch(() => []) : [];
  return (
    <ChatTab
      agentId={agentId}
      threads={threads.map((t) => ({ id: t.id, title: t.title, last_message_at: t.last_message_at }))}
      activeThreadId={activeThread?.id ?? null}
      initialMessages={messages.map((m) => ({ id: m.id, role: m.role, content: m.content }))}
    />
  );
}
```

(Remove the now-unused `ChatMessage`/`ChatThread` type imports from the page if tsc flags them.)

- [ ] **Step 7: Run everything**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/ai/gateway.ts src/lib/assistants/chat-tools.ts src/lib/assistants/chat-prompt.ts src/app/api/agents/ src/components/agents/chat-tab.tsx src/app/agents/ src/tests/lib/assistants/chat-tools.test.ts
git commit -m "feat(agents): grounded per-agent chat with read-only data tools"
```

---

### Task 16: Final verification (browser preview) + gates

**Files:** none new — verification only.

- [ ] **Step 1: Full suite + build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: every test green, clean build.

- [ ] **Step 2: Browser preview verification (preview_* tools — do NOT skip; front-end work is never shipped blind)**

Start the dev server WITH `ANTHROPIC_BASE_URL` unset (e.g. env passthrough minus that var), then verify:

1. `/mission-control`: 6 cards render in ASSISTANT_ORDER with REAL derived statuses (cross-check one against the `ingestion_runs` table); health pill math matches errored+overdue count; pill click scrolls to the first attention card; feed shows merged events with agent chips; "Load more" appends.
2. Card click → `/agents/niche_scout`; disabled Editor card is non-clickable with the Phase 3 pill.
3. `/agents/niche_scout?tab=activity`: filtered feed + type filter chips work.
4. `?tab=memory`: add a memory (JSON + plain string), edit it, delete it — each round-trips and re-renders.
5. `?tab=settings`: toggle enabled off → Mission Control card dims; toggle back on; change chat model → persists (check `assistant_settings` row).
6. `?tab=chat`: send a message to the Analyst ("how did the B58 video do?") — streams, grounds in tool data, thread appears in the left list, reload restores history from DB, `x-thread-id` URL replace works.
7. `/agents/not-an-agent` → 404.
8. Sidebar: Niches/Mission Control/Longform/Watch-list/Competitors/Settings, no Lab/Clips.
9. `preview_resize`: mobile width (grid 1-col, thread list hidden) + dark mode for /mission-control and one agent page.
10. `preview_console_logs`: no errors on any of the above.
11. Screenshot /mission-control (desktop light + dark) as proof.

- [ ] **Step 3: Gates for the orchestrator (NOT subagent work)**

- Ask Darius for the in-chat OK before applying `20260611000001` + `20260611000002` to prod (and confirm `20260528000004`/`20260528000010` exist there first — Task 0 findings).
- Flag the `/lab` + `/clips` code deletion as a separate cleanup task.
- End-of-phase handoff prompt for Darius (per the phase-boundary rule).

- [ ] **Step 4: Final commit (if verification produced fixes)**

```bash
git add -A
git commit -m "fix(mc): browser-verification polish"
```

---

## Out of scope (do not build)

- Learning loops that WRITE `assistant_memory` (UI + tables ship; writers come later).
- Deleting `/lab`, `/clips` code (separate task; only sidebar entries went).
- Push/SSE status, `/admin/health`, taste sliders, per-agent cron editing, tool-call persistence in chat.







