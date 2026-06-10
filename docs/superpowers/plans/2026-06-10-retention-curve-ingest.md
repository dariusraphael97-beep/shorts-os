# Audience-Retention-Curve Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator drop a YouTube audience-retention curve (CSV or JSON, exported from YT Studio) into `video_analytics.retention_curve_jsonb` — via a parser, an API route, an in-app settings card, and a CLI — reusing the existing `upsertVideoAnalytics`; plus declare the already-working-in-prod OAuth env vars and write a runbook.

**Architecture:** A single pure parser (`retention-parser.ts`) normalizes any pasted format to `RetentionPoint[]`. A repository helper (`ingestManualRetention`) carries forward the latest snapshot's scalar metrics and writes a new snapshot through the existing `upsertVideoAnalytics` (kept the single writer). Two front doors call it: `POST /api/youtube/retention-ingest` (cockpit-cookie guarded) and a `tsx` CLI script. The existing `performance-sync` cron continues to fill the curve automatically once YouTube exposes it.

**Tech Stack:** Next.js 16.2.6 (App Router route handlers), TypeScript, Zod 4.4.3 (`z.url()`-style top-level validators), Supabase JS (service role), vitest (node env — no component test infra), `tsx` for the CLI.

**Reference spec:** `docs/superpowers/specs/2026-06-10-retention-curve-ingest-design.md`

**Key existing facts (verified against prod Supabase `jfmjppzjicvbpnlkmxbg`):**
- B58 video: `your_videos.id = 7f7eef94-de2b-4348-a857-86037563f2e7`, `external_video_id = GwC66BSw7wU`, `status = posted`. Its latest `video_analytics` row has `views=16, avg_view_duration_seconds=58, ctr_pct=2.9, impressions=280`, `retention_curve_jsonb = NULL`.
- `upsertVideoAnalytics` (`src/lib/supabase/repositories/video-analytics.ts`) takes camelCase params incl. `retentionCurve` and writes `retention_curve_jsonb`, `onConflict: 'your_video_id,snapshot_at'`.
- Cockpit auth: `verifySession(cookie)` + `COCKPIT_COOKIE_NAME = 'cockpit_session'` in `src/lib/auth/session.ts`; `signSession()` builds a valid cookie (tests set `process.env.COCKPIT_SESSION_SECRET`).
- Settings page `src/app/settings/channel/page.tsx` is a server component using `AppShell`/`AppSidebar` + Tailwind tokens (`text-text-primary`, `bg-surface`, `border-subtle`, `accent-electric`, `accent-red`). Client islands use `'use client'` (see `src/components/settings/connect-youtube-button.tsx`).
- Route tests mock `@/lib/supabase/server` `getServiceClient` with `vi.fn()` + `mockReturnValue`, mock repos, and invoke the handler with a `new Request(...)` directly (see `src/tests/api/performance-sync.test.ts`).

---

## Task 0: Establish a green baseline

**Files:** none

- [ ] **Step 1: Run the full suite + build to confirm a clean starting point**

Run: `npm test`
Expected: all tests pass (note the count). If anything is red *before* you start, stop and report — do not build on a broken baseline.

Run: `npm run build`
Expected: build succeeds.

---

## Task 1: Retention parser (`retention-parser.ts`) — the core logic

**Files:**
- Create: `src/lib/clients/retention-parser.ts`
- Modify: `src/lib/clients/youtube-analytics.ts:69` (replace inline `RetentionPoint` with a re-export so manual + API paths share one type)
- Test: `src/tests/lib/clients/retention-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/lib/clients/retention-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseRetentionCurve, RetentionParseError } from '@/lib/clients/retention-parser';

describe('parseRetentionCurve', () => {
  it('parses a JSON array of {elapsedVideoTimeRatio, audienceWatchRatio}', () => {
    const pts = parseRetentionCurve(
      JSON.stringify([
        { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 },
        { elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.4 },
        { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.2 },
      ]),
    );
    expect(pts).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 },
      { elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.4 },
      { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.2 },
    ]);
  });

  it('parses tolerant JSON keys (x/y, position/retention)', () => {
    const pts = parseRetentionCurve(JSON.stringify([{ x: 0, y: 1 }, { x: 1, y: 0.3 }]));
    expect(pts).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 },
      { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.3 },
    ]);
  });

  it('parses the raw YT Analytics API response { rows: [[e,w],...] }', () => {
    const pts = parseRetentionCurve(JSON.stringify({ rows: [[0, 1], [0.5, 0.6], [1, 0.25]] }));
    expect(pts).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 },
      { elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.6 },
      { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.25 },
    ]);
  });

  it('parses CSV with a header and percentage values (0-100 -> 0-1)', () => {
    const csv = 'Video position (%),Absolute audience retention (%)\n0,100\n50,42.5\n100,18';
    const pts = parseRetentionCurve(csv);
    expect(pts).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 },
      { elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.425 },
      { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.18 },
    ]);
  });

  it('parses headerless CSV already in 0-1 ratios', () => {
    const pts = parseRetentionCurve('0,1\n0.25,0.7\n1,0.2');
    expect(pts).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 },
      { elapsedVideoTimeRatio: 0.25, audienceWatchRatio: 0.7 },
      { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.2 },
    ]);
  });

  it('parses TSV and strips % and thousands commas', () => {
    const pts = parseRetentionCurve('0%\t100%\n100%\t20%');
    expect(pts).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 },
      { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.2 },
    ]);
  });

  it('detects per-column scale independently (elapsed ratio, watch percent)', () => {
    const pts = parseRetentionCurve('0,100\n1,20');
    expect(pts).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 },
      { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.2 },
    ]);
  });

  it('sorts by elapsed and de-dupes identical elapsed values', () => {
    const pts = parseRetentionCurve('1,0.2\n0,1\n0,0.9');
    expect(pts.map((p) => p.elapsedVideoTimeRatio)).toEqual([0, 1]);
    expect(pts[0].audienceWatchRatio).toBe(1); // first-seen wins for dup elapsed
  });

  it('clamps negative watch ratios to 0 and elapsed to [0,1]', () => {
    const pts = parseRetentionCurve(JSON.stringify([[0, -0.1], [1.2, 0.5]]));
    expect(pts).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 0 },
      { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.5 },
    ]);
  });

  it('throws on empty input', () => {
    expect(() => parseRetentionCurve('   ')).toThrow(RetentionParseError);
  });

  it('throws when fewer than 2 distinct points', () => {
    expect(() => parseRetentionCurve('0,1')).toThrow(RetentionParseError);
  });

  it('throws on total garbage', () => {
    expect(() => parseRetentionCurve('hello world\nthis is not data')).toThrow(RetentionParseError);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- retention-parser`
Expected: FAIL — `Cannot find module '@/lib/clients/retention-parser'`.

- [ ] **Step 3: Implement the parser**

Create `src/lib/clients/retention-parser.ts`:

```typescript
// Pure, client-safe (no server-only, no DB): turns arbitrary pasted text
// (YT Studio CSV, raw YT Analytics API JSON, or a JSON array) into a
// normalized RetentionPoint[]. Canonical home of the RetentionPoint type;
// youtube-analytics.ts re-exports it so manual + API ingest produce identical
// shapes for the L2 playbook engine.

export interface RetentionPoint {
  elapsedVideoTimeRatio: number;
  audienceWatchRatio: number;
}

export class RetentionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetentionParseError';
  }
}

const ELAPSED_KEYS = ['elapsedvideotimeratio', 'elapsed', 'position', 'videoposition', 'x'];
const WATCH_KEYS = ['audiencewatchratio', 'absoluteretention', 'retention', 'watch', 'y'];

function lc(s: string): string {
  return s.toLowerCase().replace(/[\s_()%]/g, '');
}

function toNum(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[%,\s]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function fromObjects(arr: Array<Record<string, unknown>>): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (const obj of arr) {
    const keys = Object.keys(obj);
    const eKey = keys.find((k) => ELAPSED_KEYS.includes(lc(k)));
    const wKey = keys.find((k) => WATCH_KEYS.includes(lc(k)));
    if (!eKey || !wKey) continue;
    const e = toNum(obj[eKey]);
    const w = toNum(obj[wKey]);
    if (e !== null && w !== null) pairs.push([e, w]);
  }
  return pairs;
}

function parseJson(text: string): Array<[number, number]> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new RetentionParseError('Looks like JSON but could not be parsed.');
  }
  if (data && typeof data === 'object' && !Array.isArray(data) && 'rows' in data) {
    const rows = (data as { rows: unknown }).rows;
    if (Array.isArray(rows)) data = rows;
  }
  if (!Array.isArray(data)) {
    throw new RetentionParseError('Expected a JSON array of points or an object with a "rows" array.');
  }
  if (data.length === 0) {
    throw new RetentionParseError('JSON array is empty.');
  }
  if (Array.isArray(data[0])) {
    return (data as unknown[][])
      .map((row) => [toNum(row[0]), toNum(row[1])] as [number | null, number | null])
      .filter((p): p is [number, number] => p[0] !== null && p[1] !== null);
  }
  if (typeof data[0] === 'object' && data[0] !== null) {
    return fromObjects(data as Array<Record<string, unknown>>);
  }
  throw new RetentionParseError('Unrecognized JSON array shape.');
}

function parseDelimited(text: string): Array<[number, number]> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const delim = lines.some((l) => l.includes('\t')) ? '\t' : ',';
  const pairs: Array<[number, number]> = [];
  for (const line of lines) {
    const cells = line.split(delim);
    if (cells.length < 2) continue;
    const e = toNum(cells[0]);
    const w = toNum(cells[1]);
    if (e === null || w === null) continue; // skips header + junk rows
    pairs.push([e, w]);
  }
  return pairs;
}

function scaleColumn(values: number[]): number[] {
  const max = Math.max(...values);
  return max > 1.5 ? values.map((v) => v / 100) : values;
}

function normalize(pairs: Array<[number, number]>): RetentionPoint[] {
  if (pairs.length === 0) {
    throw new RetentionParseError('No numeric data points found.');
  }
  const elapsed = scaleColumn(pairs.map((p) => p[0]));
  const watch = scaleColumn(pairs.map((p) => p[1]));
  const seen = new Set<number>();
  const points: RetentionPoint[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const e = Math.min(1, Math.max(0, elapsed[i]));
    const w = Math.max(0, watch[i]);
    const key = Math.round(e * 1e6) / 1e6;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push({ elapsedVideoTimeRatio: e, audienceWatchRatio: w });
  }
  points.sort((a, b) => a.elapsedVideoTimeRatio - b.elapsedVideoTimeRatio);
  if (points.length < 2) {
    throw new RetentionParseError('Need at least 2 distinct points to form a retention curve.');
  }
  return points;
}

export function parseRetentionCurve(input: string): RetentionPoint[] {
  const text = (input ?? '').trim();
  if (!text) throw new RetentionParseError('Empty input — paste a CSV or JSON retention curve.');
  const pairs = text.startsWith('{') || text.startsWith('[') ? parseJson(text) : parseDelimited(text);
  return normalize(pairs);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- retention-parser`
Expected: PASS (all cases).

- [ ] **Step 5: Make `RetentionPoint` a single source of truth**

In `src/lib/clients/youtube-analytics.ts`, replace the inline interface at line 69:

```typescript
export interface RetentionPoint { elapsedVideoTimeRatio: number; audienceWatchRatio: number; }
```

with a re-export of the canonical type (add the import near the top of the file, after `import 'server-only';`):

```typescript
import type { RetentionPoint } from './retention-parser';
export type { RetentionPoint };
```

Leave the rest of `youtube-analytics.ts` unchanged (it keeps using `RetentionPoint`).

- [ ] **Step 6: Verify nothing broke**

Run: `npm test`
Expected: PASS (including the existing `performance-sync` test that uses `RetentionPoint`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/clients/retention-parser.ts src/lib/clients/youtube-analytics.ts src/tests/lib/clients/retention-parser.test.ts
git commit -m "feat(analytics): retention-curve parser (CSV/JSON/API) + shared RetentionPoint type"
```

---

## Task 2: Resolve a video by its YouTube id

**Files:**
- Modify: `src/lib/supabase/repositories/your-videos.ts` (add `getYourVideoIdByExternalId` near `getYourVideoById`, ~line 302)
- Test: `src/tests/lib/supabase/your-videos-external-id.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/lib/supabase/your-videos-external-id.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getYourVideoIdByExternalId } from '@/lib/supabase/repositories/your-videos';

function mockSupabase(row: { id: string } | null, error: { code?: string; message: string } | null = null) {
  return {
    from: (table: string) => {
      if (table !== 'your_videos') throw new Error('wrong table');
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error }),
          }),
        }),
      };
    },
  } as never;
}

describe('getYourVideoIdByExternalId', () => {
  it('returns the internal id for a known external_video_id', async () => {
    const id = await getYourVideoIdByExternalId(mockSupabase({ id: 'internal-uuid' }), 'GwC66BSw7wU');
    expect(id).toBe('internal-uuid');
  });

  it('returns null when no row matches', async () => {
    const id = await getYourVideoIdByExternalId(mockSupabase(null), 'nope');
    expect(id).toBeNull();
  });

  it('throws on a non-PGRST116 db error', async () => {
    await expect(
      getYourVideoIdByExternalId(mockSupabase(null, { code: 'XX000', message: 'boom' }), 'x'),
    ).rejects.toThrow('getYourVideoIdByExternalId: boom');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- your-videos-external-id`
Expected: FAIL — `getYourVideoIdByExternalId is not a function` / not exported.

- [ ] **Step 3: Implement the helper**

In `src/lib/supabase/repositories/your-videos.ts`, add after `getYourVideoById` (after line 302):

```typescript
export async function getYourVideoIdByExternalId(
  supabase: SupabaseClient,
  externalVideoId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("your_videos")
    .select("id")
    .eq("external_video_id", externalVideoId)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== "PGRST116") {
    throw new Error(`getYourVideoIdByExternalId: ${error.message}`);
  }
  return (data as { id: string } | null)?.id ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- your-videos-external-id`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/repositories/your-videos.ts src/tests/lib/supabase/your-videos-external-id.test.ts
git commit -m "feat(analytics): resolve your_videos row by external_video_id"
```

---

## Task 3: Manual-ingest helper (carry-forward merge)

**Files:**
- Modify: `src/lib/supabase/repositories/video-analytics.ts` (append `VideoAnalyticsSnapshot`, `getLatestSnapshot`, `ManualMetricsOverride`, `ingestManualRetention`)
- Test: `src/tests/lib/supabase/ingest-manual-retention.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/lib/supabase/ingest-manual-retention.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ingestManualRetention } from '@/lib/supabase/repositories/video-analytics';

// Mock supabase: latest snapshot read returns `prior`; upsert captures values.
function mockSupabase(prior: Record<string, unknown> | null) {
  let captured: Record<string, unknown> | null = null;
  const supabase = {
    from: (table: string) => {
      if (table !== 'video_analytics') throw new Error('wrong table');
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: prior, error: null }),
              }),
            }),
          }),
        }),
        upsert: (values: Record<string, unknown>, opts?: { onConflict?: string }) => {
          captured = { ...values, __onConflict: opts?.onConflict };
          return { error: null };
        },
      };
    },
  } as never;
  return { supabase, get captured() { return captured; } };
}

const CURVE = [
  { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 },
  { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.2 },
];

describe('ingestManualRetention', () => {
  it('carries forward the latest snapshot scalars and writes the curve', async () => {
    const m = mockSupabase({
      views: 16, likes: 2, comments: 0, shares: null,
      avg_view_duration_seconds: 58, ctr_pct: 2.9, subscribers_gained: 1,
      impressions: 280, watch_time_seconds: 928,
    });
    const res = await ingestManualRetention(m.supabase, { yourVideoId: 'v1', curve: CURVE });
    expect(res.points).toBe(2);
    expect(m.captured!.views).toBe(16);
    expect(m.captured!.avg_view_duration_seconds).toBe(58);
    expect(m.captured!.impressions).toBe(280);
    expect(m.captured!.retention_curve_jsonb).toEqual(CURVE);
    expect(m.captured!.__onConflict).toBe('your_video_id,snapshot_at');
  });

  it('lets an explicit metricsOverride win over the carried-forward value', async () => {
    const m = mockSupabase({ views: 16, avg_view_duration_seconds: 58 });
    await ingestManualRetention(m.supabase, {
      yourVideoId: 'v1', curve: CURVE, metricsOverride: { views: 999 },
    });
    expect(m.captured!.views).toBe(999);
    expect(m.captured!.avg_view_duration_seconds).toBe(58); // untouched -> carried forward
  });

  it('writes a curve-only row (null scalars) when there is no prior snapshot', async () => {
    const m = mockSupabase(null);
    await ingestManualRetention(m.supabase, { yourVideoId: 'v1', curve: CURVE });
    expect(m.captured!.views).toBeNull();
    expect(m.captured!.retention_curve_jsonb).toEqual(CURVE);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- ingest-manual-retention`
Expected: FAIL — `ingestManualRetention is not a function`.

- [ ] **Step 3: Implement the helper**

Append to `src/lib/supabase/repositories/video-analytics.ts` (after `upsertVideoAnalytics`):

```typescript
export interface VideoAnalyticsSnapshot {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  avg_view_duration_seconds: number | null;
  ctr_pct: number | null;
  subscribers_gained: number | null;
  impressions: number | null;
  watch_time_seconds: number | null;
}

export async function getLatestSnapshot(
  supabase: SupabaseClient,
  yourVideoId: string,
): Promise<VideoAnalyticsSnapshot | null> {
  const { data, error } = await supabase
    .from('video_analytics')
    .select(
      'views, likes, comments, shares, avg_view_duration_seconds, ctr_pct, subscribers_gained, impressions, watch_time_seconds',
    )
    .eq('your_video_id', yourVideoId)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    throw new Error(`getLatestSnapshot: ${error.message}`);
  }
  return (data as VideoAnalyticsSnapshot | null) ?? null;
}

export interface ManualMetricsOverride {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  avgViewDurationSeconds?: number | null;
  ctrPct?: number | null;
  subscribersGained?: number | null;
  impressions?: number | null;
  watchTimeSeconds?: number | null;
}

/**
 * Ingest a manually-supplied retention curve as a NEW snapshot at `snapshotAt`
 * (default now), carrying forward the latest snapshot's scalar metrics so the
 * newest row stays complete for `longform_decision_outcomes`. Any field present
 * in `metricsOverride` wins. Reuses the single writer `upsertVideoAnalytics`.
 */
export async function ingestManualRetention(
  supabase: SupabaseClient,
  params: {
    yourVideoId: string;
    curve: unknown; // RetentionPoint[]
    metricsOverride?: ManualMetricsOverride;
    snapshotAt?: Date;
    rawPayload?: unknown;
  },
): Promise<{ points: number; snapshotAt: string }> {
  const prev = await getLatestSnapshot(supabase, params.yourVideoId);
  const o = params.metricsOverride ?? {};
  const snapshotAt = params.snapshotAt ?? new Date();
  const pick = <T>(override: T | undefined, prior: T | null | undefined): T | null =>
    override !== undefined ? override : (prior ?? null);

  await upsertVideoAnalytics(supabase, {
    yourVideoId: params.yourVideoId,
    snapshotAt,
    views: pick(o.views, prev?.views),
    likes: pick(o.likes, prev?.likes),
    comments: pick(o.comments, prev?.comments),
    shares: pick(o.shares, prev?.shares),
    avgViewDurationSeconds: pick(o.avgViewDurationSeconds, prev?.avg_view_duration_seconds),
    ctrPct: pick(o.ctrPct, prev?.ctr_pct),
    subscribersGained: pick(o.subscribersGained, prev?.subscribers_gained),
    impressions: pick(o.impressions, prev?.impressions),
    watchTimeSeconds: pick(o.watchTimeSeconds, prev?.watch_time_seconds),
    retentionCurve: params.curve,
    rawPayload: params.rawPayload ?? { source: 'manual', importedAt: snapshotAt.toISOString() },
  });

  const points = Array.isArray(params.curve) ? params.curve.length : 0;
  return { points, snapshotAt: snapshotAt.toISOString() };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- ingest-manual-retention`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/repositories/video-analytics.ts src/tests/lib/supabase/ingest-manual-retention.test.ts
git commit -m "feat(analytics): ingestManualRetention — carry-forward merge via upsertVideoAnalytics"
```

---

## Task 4: API route `POST /api/youtube/retention-ingest`

**Files:**
- Create: `src/app/api/youtube/retention-ingest/route.ts`
- Test: `src/tests/api/retention-ingest.test.ts`

> Before writing: skim `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` (this repo is Next 16; route handlers are `export async function POST(req: Request)`). Read the cockpit cookie off `req.headers.get('cookie')` (NOT `next/headers cookies()`) so the handler is a pure function of its `Request` arg and unit-testable like `performance-sync`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/api/retention-ingest.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({})) }));
vi.mock('@/lib/supabase/repositories/video-analytics', () => ({
  ingestManualRetention: vi.fn(async () => ({ points: 3, snapshotAt: '2026-06-10T15:00:00.000Z' })),
}));
vi.mock('@/lib/supabase/repositories/your-videos', () => ({
  getYourVideoIdByExternalId: vi.fn(async (_s: unknown, ext: string) =>
    ext === 'GwC66BSw7wU' ? '7f7eef94-de2b-4348-a857-86037563f2e7' : null,
  ),
}));

import { POST } from '@/app/api/youtube/retention-ingest/route';
import { signSession } from '@/lib/auth/session';
import { ingestManualRetention } from '@/lib/supabase/repositories/video-analytics';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.COCKPIT_SESSION_SECRET = 'test-secret-at-least-32-chars-long-xyz';
});

function req(body: unknown, opts: { cookie?: string } = {}) {
  return new Request('https://app/api/youtube/retention-ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

const goodCookie = () => `cockpit_session=${signSession()}`;
const CSV = '0,1\n0.5,0.5\n1,0.2';

describe('POST /api/youtube/retention-ingest', () => {
  it('401s without a valid cockpit cookie', async () => {
    const res = await POST(req({ externalVideoId: 'GwC66BSw7wU', rawCurve: CSV }));
    expect(res.status).toBe(401);
  });

  it('400s when neither/both video ids are provided', async () => {
    const res = await POST(req({ rawCurve: CSV }, { cookie: goodCookie() }));
    expect(res.status).toBe(400);
  });

  it('400s on an unparseable curve', async () => {
    const res = await POST(
      req({ externalVideoId: 'GwC66BSw7wU', rawCurve: 'garbage\nnope' }, { cookie: goodCookie() }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('parse_error');
  });

  it('404s when the external video id is unknown', async () => {
    const res = await POST(
      req({ externalVideoId: 'UNKNOWN', rawCurve: CSV }, { cookie: goodCookie() }),
    );
    expect(res.status).toBe(404);
  });

  it('ingests on the happy path', async () => {
    const res = await POST(
      req({ externalVideoId: 'GwC66BSw7wU', rawCurve: CSV, metrics: { views: 16 } }, { cookie: goodCookie() }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, yourVideoId: '7f7eef94-de2b-4348-a857-86037563f2e7', points: 3 });
    expect(vi.mocked(ingestManualRetention)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        yourVideoId: '7f7eef94-de2b-4348-a857-86037563f2e7',
        curve: expect.arrayContaining([{ elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 }]),
        metricsOverride: { views: 16 },
      }),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- retention-ingest`
Expected: FAIL — cannot find the route module.

- [ ] **Step 3: Implement the route**

Create `src/app/api/youtube/retention-ingest/route.ts`:

```typescript
import 'server-only';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server';
import { verifySession, COCKPIT_COOKIE_NAME } from '@/lib/auth/session';
import { parseRetentionCurve, RetentionParseError } from '@/lib/clients/retention-parser';
import { ingestManualRetention } from '@/lib/supabase/repositories/video-analytics';
import { getYourVideoIdByExternalId } from '@/lib/supabase/repositories/your-videos';

export const dynamic = 'force-dynamic';

const MetricsSchema = z
  .object({
    views: z.number().nonnegative().optional(),
    likes: z.number().nonnegative().optional(),
    comments: z.number().nonnegative().optional(),
    shares: z.number().nonnegative().optional(),
    avgViewDurationSeconds: z.number().nonnegative().optional(),
    ctrPct: z.number().nonnegative().optional(),
    impressions: z.number().nonnegative().optional(),
    watchTimeSeconds: z.number().nonnegative().optional(),
    subscribersGained: z.number().optional(),
  })
  .optional();

const BodySchema = z
  .object({
    externalVideoId: z.string().min(1).optional(),
    yourVideoId: z.string().min(1).optional(),
    rawCurve: z.string().min(1),
    metrics: MetricsSchema,
    snapshotAt: z.string().min(1).optional(),
  })
  .refine((b) => !!b.externalVideoId !== !!b.yourVideoId, {
    message: 'Provide exactly one of externalVideoId or yourVideoId',
  });

function readCockpitCookie(req: Request): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COCKPIT_COOKIE_NAME) return decodeURIComponent(v.join('='));
  }
  return null;
}

export async function POST(req: Request): Promise<Response> {
  if (!verifySession(readCockpitCookie(req)).valid) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    const detail = err instanceof z.ZodError ? err.issues.map((i) => i.message).join('; ') : 'invalid body';
    return Response.json({ error: 'invalid_body', detail }, { status: 400 });
  }

  let curve;
  try {
    curve = parseRetentionCurve(body.rawCurve);
  } catch (err) {
    if (err instanceof RetentionParseError) {
      return Response.json({ error: 'parse_error', detail: err.message }, { status: 400 });
    }
    throw err;
  }

  let snapshotAt: Date | undefined;
  if (body.snapshotAt) {
    const d = new Date(body.snapshotAt);
    if (Number.isNaN(d.getTime())) {
      return Response.json({ error: 'invalid_body', detail: 'snapshotAt is not a valid date' }, { status: 400 });
    }
    snapshotAt = d;
  }

  const supabase = getServiceClient();
  let yourVideoId = body.yourVideoId ?? null;
  if (!yourVideoId && body.externalVideoId) {
    yourVideoId = await getYourVideoIdByExternalId(supabase, body.externalVideoId);
  }
  if (!yourVideoId) {
    return Response.json({ error: 'video_not_found', externalVideoId: body.externalVideoId }, { status: 404 });
  }

  const result = await ingestManualRetention(supabase, {
    yourVideoId,
    curve,
    metricsOverride: body.metrics,
    snapshotAt,
    rawPayload: { source: 'manual_paste', rawCurve: body.rawCurve },
  });

  return Response.json(
    { ok: true, yourVideoId, points: result.points, snapshotAt: result.snapshotAt },
    { status: 200 },
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- retention-ingest`
Expected: PASS (all five cases).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/youtube/retention-ingest/route.ts src/tests/api/retention-ingest.test.ts
git commit -m "feat(analytics): POST /api/youtube/retention-ingest (cockpit-guarded manual paste)"
```

---

## Task 5: CLI script `scripts/ingest-retention.ts`

**Files:**
- Create: `scripts/ingest-retention.ts`
- Modify: `package.json` (add devDependency `tsx` + `ingest-retention` script)

- [ ] **Step 1: Ensure `tsx` is available at the repo root**

The root has `@supabase/supabase-js` and `server-only` but not `tsx` (it lives in `scripts/render-worker/node_modules`). Add it as a root devDependency:

Run: `npm i -D tsx`
Expected: `tsx` added to `devDependencies`; `node_modules/.bin/tsx` exists.

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add (next to `render-worker`):

```json
"ingest-retention": "node --import tsx --env-file=.env.local scripts/ingest-retention.ts"
```

- [ ] **Step 3: Write the script**

Create `scripts/ingest-retention.ts`:

```typescript
// Manually ingest a YouTube audience-retention curve into video_analytics.
// Run from the repo root (relative imports resolve src/ + root node_modules):
//   npm run ingest-retention -- --video GwC66BSw7wU --file curve.csv
//   pbpaste | npm run ingest-retention -- --video GwC66BSw7wU --stdin
//   npm run ingest-retention -- --video GwC66BSw7wU --file c.csv --views 16 --avd 58 --ctr 2.9 --impressions 280
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { parseRetentionCurve } from '../src/lib/clients/retention-parser.ts';
import { ingestManualRetention } from '../src/lib/supabase/repositories/video-analytics.ts';
import { getYourVideoIdByExternalId } from '../src/lib/supabase/repositories/your-videos.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function numArg(name: string): number | undefined {
  const v = arg(name);
  return v === undefined ? undefined : Number(v);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const video = arg('video');
  if (!video) throw new Error('Missing --video <externalVideoId|uuid>');

  const file = arg('file');
  const raw = file ? readFileSync(file, 'utf8') : flag('stdin') ? readFileSync(0, 'utf8') : undefined;
  if (!raw) throw new Error('Provide --file <path> or pipe input with --stdin');

  const curve = parseRetentionCurve(raw); // throws RetentionParseError on bad input

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must be set (.env.local)');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const yourVideoId = UUID_RE.test(video) ? video : await getYourVideoIdByExternalId(supabase, video);
  if (!yourVideoId) {
    throw new Error(`No your_videos row for external_video_id=${video}. Register/post the video first.`);
  }

  const res = await ingestManualRetention(supabase, {
    yourVideoId,
    curve,
    metricsOverride: {
      views: numArg('views'),
      avgViewDurationSeconds: numArg('avd'),
      ctrPct: numArg('ctr'),
      impressions: numArg('impressions'),
    },
  });

  console.log(`✓ Upserted ${res.points} retention points for ${yourVideoId} @ ${res.snapshotAt}`);
}

main().catch((e) => {
  console.error('ingest-retention failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
```

- [ ] **Step 4: Smoke-test argument handling without touching the DB**

Run: `npm run ingest-retention -- --video GwC66BSw7wU`
Expected: exits non-zero with `ingest-retention failed: Provide --file <path> or pipe input with --stdin` (proves imports resolve under tsx and arg parsing works).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json scripts/ingest-retention.ts
git commit -m "feat(analytics): CLI to paste/pipe a retention curve into video_analytics"
```

---

## Task 6: In-app settings card

**Files:**
- Create: `src/components/settings/retention-import-card.tsx` (client island)
- Modify: `src/app/settings/channel/page.tsx` (fetch posted videos, render the card)
- Modify: `src/lib/supabase/repositories/your-videos.ts` (add `listPostedVideos` for the dropdown)

> No component test infra exists (vitest is node-env). Verify this task with the preview workflow (Step 5), not a unit test.

- [ ] **Step 1: Add a `listPostedVideos` helper (for the dropdown)**

In `src/lib/supabase/repositories/your-videos.ts`, add after `getYourVideoIdByExternalId`:

```typescript
export async function listPostedVideos(
  supabase: SupabaseClient,
  channelId: string,
): Promise<Array<{ id: string; external_video_id: string | null; title: string }>> {
  const { data, error } = await supabase
    .from("your_videos")
    .select("id, external_video_id, title")
    .eq("channel_id", channelId)
    .eq("status", "posted")
    .order("posted_at", { ascending: false });
  if (error) throw new Error(`listPostedVideos: ${error.message}`);
  return (data as Array<{ id: string; external_video_id: string | null; title: string }>) ?? [];
}
```

- [ ] **Step 2: Build the client card**

Create `src/components/settings/retention-import-card.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { parseRetentionCurve, type RetentionPoint } from '@/lib/clients/retention-parser';

type PostedVideo = { id: string; external_video_id: string | null; title: string };

function Sparkline({ points }: { points: RetentionPoint[] }) {
  const d = useMemo(() => {
    if (points.length < 2) return '';
    const maxW = Math.max(...points.map((p) => p.audienceWatchRatio), 1);
    return points
      .map((p, i) => {
        const x = p.elapsedVideoTimeRatio * 100;
        const y = 30 - (p.audienceWatchRatio / maxW) * 28;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [points]);
  return (
    <svg viewBox="0 0 100 30" className="w-full h-16" preserveAspectRatio="none">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1} className="text-accent-electric" />
    </svg>
  );
}

export function RetentionImportCard({ videos }: { videos: PostedVideo[] }) {
  const [videoId, setVideoId] = useState(videos[0]?.id ?? '');
  const [raw, setRaw] = useState('');
  const [showMetrics, setShowMetrics] = useState(false);
  const [metrics, setMetrics] = useState({ views: '', avd: '', ctr: '', impressions: '' });
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const parsed = useMemo<{ points: RetentionPoint[] } | { error: string } | null>(() => {
    if (!raw.trim()) return null;
    try {
      return { points: parseRetentionCurve(raw) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'parse error' };
    }
  }, [raw]);

  const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch('/api/youtube/retention-ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          yourVideoId: videoId,
          rawCurve: raw,
          metrics: showMetrics
            ? {
                views: num(metrics.views),
                avgViewDurationSeconds: num(metrics.avd),
                ctrPct: num(metrics.ctr),
                impressions: num(metrics.impressions),
              }
            : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
      setStatus({ kind: 'ok', msg: `Saved ${json.points} points.` });
      setRaw('');
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : 'failed' });
    } finally {
      setSaving(false);
    }
  }

  const canSave = !!videoId && parsed !== null && 'points' in parsed && !saving;

  return (
    <section className="rounded-lg border border-subtle bg-surface p-4 space-y-3">
      <div>
        <h2 className="text-sm font-medium text-text-primary">Audience retention — manual import</h2>
        <p className="text-xs text-text-muted mt-1">
          YouTube withholds the retention curve from the API until a video has enough views. Paste it from
          YT Studio (Analytics → Engagement → Audience retention) as CSV or JSON.
        </p>
      </div>

      {videos.length === 0 ? (
        <p className="text-xs text-text-muted">No posted videos yet.</p>
      ) : (
        <>
          <label className="block text-xs text-text-secondary">
            Video
            <select
              value={videoId}
              onChange={(e) => setVideoId(e.target.value)}
              className="mt-1 w-full rounded border border-subtle bg-app px-2 py-1.5 text-xs text-text-primary"
            >
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title.slice(0, 80)} {v.external_video_id ? `(${v.external_video_id})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-text-secondary">
            Retention curve (CSV or JSON)
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={6}
              placeholder={'0,100\n25,68\n50,42\n75,31\n100,18'}
              className="mt-1 w-full rounded border border-subtle bg-app px-2 py-1.5 font-mono text-xs text-text-primary"
            />
          </label>

          {parsed && 'error' in parsed && (
            <p className="text-xs text-accent-red">⚠ {parsed.error}</p>
          )}
          {parsed && 'points' in parsed && (
            <div className="space-y-1">
              <p className="text-xs text-text-muted">{parsed.points.length} points parsed</p>
              <Sparkline points={parsed.points} />
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowMetrics((s) => !s)}
            className="text-xs text-text-muted underline"
          >
            {showMetrics ? 'Hide' : 'Add'} headline metrics (optional)
          </button>
          {showMetrics && (
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['views', 'Views'],
                  ['avd', 'Avg view duration (s)'],
                  ['ctr', 'CTR %'],
                  ['impressions', 'Impressions'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="block text-xs text-text-secondary">
                  {label}
                  <input
                    inputMode="decimal"
                    value={metrics[k]}
                    onChange={(e) => setMetrics((m) => ({ ...m, [k]: e.target.value }))}
                    className="mt-1 w-full rounded border border-subtle bg-app px-2 py-1.5 text-xs text-text-primary"
                  />
                </label>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!canSave}
              onClick={save}
              className="px-4 py-2 rounded bg-accent-electric text-app text-xs font-medium hover:opacity-90 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save retention curve'}
            </button>
            {status && (
              <span className={`text-xs ${status.kind === 'ok' ? 'text-text-secondary' : 'text-accent-red'}`}>
                {status.kind === 'ok' ? '✓ ' : '✗ '}
                {status.msg}
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Wire the card into the channel settings page**

In `src/app/settings/channel/page.tsx` (it already imports `getDefaultChannel, isYouTubeConnected` from `channels` — do NOT re-add those):

- Add two NEW imports:
```tsx
import { listPostedVideos } from '@/lib/supabase/repositories/your-videos';
import { RetentionImportCard } from '@/components/settings/retention-import-card';
```
- After `const ytConnected = ...`, add:
```tsx
  const postedVideos = await listPostedVideos(supabase, channel.id);
```
- Inside the `max-w-2xl` container, after the existing channel `<section>`, render:
```tsx
        <RetentionImportCard videos={postedVideos} />
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run build`
Expected: build succeeds (the client island compiles; `parseRetentionCurve` is client-safe).

- [ ] **Step 5: Verify in the browser (preview workflow)**

Start the dev server (`preview_start`), log in (the route needs a valid cockpit cookie), navigate to `/settings/channel`, paste the sample CSV `0,100` / `50,42` / `100,18` (newline-separated), confirm the sparkline + "3 points parsed" appears, click Save, confirm the ✓ toast. Capture a screenshot for the user.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/retention-import-card.tsx src/app/settings/channel/page.tsx src/lib/supabase/repositories/your-videos.ts
git commit -m "feat(analytics): settings card to paste a retention curve (live sparkline preview)"
```

---

## Task 7: API-path hardening — declare OAuth env vars + surface empty retention

**Files:**
- Modify: `src/lib/env.ts` (declare the OAuth vars as optional)
- Modify: `.env.example` (document them)
- Modify: `src/app/api/cron/performance-sync/route.ts` (flag empty retention in the per-video summary)
- Modify: `src/tests/api/performance-sync.test.ts` (assert the empty-retention flag)

- [ ] **Step 1: Declare the OAuth env vars**

In `src/lib/env.ts`, inside `envSchema`, add after the External API keys block:

```typescript
  // Google OAuth (YouTube upload + Analytics). Read directly with `!` in routes/crons;
  // declared here so a half-configured set fails loudly. Set in Vercel prod.
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  OAUTH_TOKEN_ENCRYPTION_KEY_V1: z.string().length(64).optional(),
  OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION: z.string().min(1).optional(),
  ANALYTICS_SYNC_WINDOW_DAYS: z.coerce.number().int().min(1).max(365).default(14),
```

- [ ] **Step 2: Document them in `.env.example`**

Append to `.env.example`:

```bash

# Google OAuth — YouTube upload + Analytics (performance-sync cron). Create an OAuth
# client in Google Cloud Console with redirect URI <app-url>/api/youtube/oauth/callback.
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
# 64 hex chars. Generate with: openssl rand -hex 32
OAUTH_TOKEN_ENCRYPTION_KEY_V1=
OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION=1
# How many days back performance-sync fetches analytics for (default 14)
ANALYTICS_SYNC_WINDOW_DAYS=14
```

- [ ] **Step 3: Surface empty retention in the cron summary**

In `src/app/api/cron/performance-sync/route.ts`, change the per-channel summary to track empty-retention videos. Update the summary array type (line ~42) and the loop:

```typescript
  const summary: Array<{ channelId: string; videos: number; errors: number; retentionEmpty: number }> = [];
```

Inside the per-channel block initialise `let retentionEmpty = 0;` next to `videosCount`/`errCount`, and immediately after the `Promise.all([...])` destructure (after line ~106) add:

```typescript
        if (!Array.isArray(retention) || retention.length === 0) retentionEmpty += 1;
```

and include it when pushing the summary:

```typescript
    summary.push({ channelId: c.id, videos: videosCount, errors: errCount, retentionEmpty });
```

(Add `retentionEmpty: 0` to the two early `summary.push(...)` continue-branches as well, e.g. `summary.push({ channelId: c.id, videos: 0, errors: 1, retentionEmpty: 0 });`.)

- [ ] **Step 4: Update the performance-sync test to assert the flag**

In `src/tests/api/performance-sync.test.ts`, after the existing assertions in the happy-path test, add:

```typescript
    const body = await res.json();
    // fetchRetentionReport mock returns a 1-point array -> not empty
    expect(body.summary[0]).toMatchObject({ videos: 1, retentionEmpty: 0 });
```

Then add a second test proving the empty case is flagged:

```typescript
  it('flags videos whose retention report is empty', async () => {
    const { fetchRetentionReport } = await import('@/lib/clients/youtube-analytics');
    vi.mocked(fetchRetentionReport).mockResolvedValueOnce([]);
    vi.mocked(getServiceClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'channels') {
          return { select: () => ({ eq: () => ({ eq: async () => ({
            data: [{ id: 'chan-1', external_channel_id: 'UC_X', timezone: 'America/New_York' }], error: null }) }) }) };
        }
        if (table === 'your_videos') {
          return { select: () => ({ eq: () => ({ eq: () => ({ gte: async () => ({
            data: [{ id: 'v1', external_video_id: 'EXT_1', channel_id: 'chan-1', posted_at: new Date().toISOString() }], error: null }) }) }) }) };
        }
        throw new Error('unmocked table ' + table);
      },
    } as never);
    const req = new Request('https://app/api/cron/performance-sync', { headers: { authorization: 'Bearer ANYCRON' } });
    const res = await GET(req);
    const body = await res.json();
    expect(body.summary[0]).toMatchObject({ retentionEmpty: 1 });
  });
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- performance-sync`
Expected: PASS (both the original and new test).

- [ ] **Step 6: Commit**

```bash
git add src/lib/env.ts .env.example src/app/api/cron/performance-sync/route.ts src/tests/api/performance-sync.test.ts
git commit -m "feat(analytics): declare OAuth env vars + flag empty retention in performance-sync"
```

---

## Task 8: Operator runbook

**Files:**
- Create: `docs/superpowers/research/2026-06-10-retention-ingest-runbook.md`

- [ ] **Step 1: Write the runbook**

Create `docs/superpowers/research/2026-06-10-retention-ingest-runbook.md` covering, in plain English:
- **Why retention is empty for new videos:** YouTube withholds the API retention curve until a view/watch-hour threshold; YT Studio shows it earlier. (B58 = 16 views → API empty, Studio populated.)
- **Manual import (the fix that works now):**
  1. YT Studio → Content → the video → Analytics → Engagement → Audience retention. Read the curve. (If you can open the Network tab, copy the `audienceWatchRatio` JSON response — paste it as-is.)
  2. Either: `/settings/channel` → "Audience retention — manual import" → pick the video, paste CSV/JSON, optionally add views/AVD/CTR/impressions, Save.
  3. Or CLI: `npm run ingest-retention -- --video GwC66BSw7wU --file curve.csv [--views 16 --avd 58 --ctr 2.9 --impressions 280]`.
- **Accepted formats:** 2-column CSV/TSV (elapsed, retention; % or ratio), JSON array of `{elapsedVideoTimeRatio, audienceWatchRatio}`, or the raw YT Analytics API `{rows:[[e,w],…]}`.
- **Verify it landed:** the newest `video_analytics` row for the video has a non-null `retention_curve_jsonb` array (and the carried-forward scalars are still present).
- **Auto path (already live in prod):** `performance-sync` cron (daily, `vercel.ts`) fills the curve once YouTube exposes it; `summary[].retentionEmpty` in its response shows which videos YT still withholds. Requires `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `OAUTH_TOKEN_ENCRYPTION_KEY_V1`, `OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION` set in Vercel + a stored channel refresh token (re-auth at `/api/youtube/oauth/start`).

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/research/2026-06-10-retention-ingest-runbook.md
git commit -m "docs(analytics): retention-curve ingest runbook"
```

---

## Task 9: Final verification (definition of done)

**Files:** none (verification only)

- [ ] **Step 1: Full suite + build green**

Run: `npm test`
Expected: all pass (baseline count + the new parser/helper/route/cron tests).

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 2: Real B58 backfill end-to-end**

Obtain B58's actual retention curve from YT Studio (operator step — ask the user to paste/export it, or use the in-app card while logged in). Ingest it via the UI card OR:

Run: `npm run ingest-retention -- --video GwC66BSw7wU --file /tmp/b58-retention.csv`
Expected: `✓ Upserted N retention points for 7f7eef94-… @ <ts>`.

- [ ] **Step 3: Confirm the row in the DB**

Confirm the newest `video_analytics` row for `7f7eef94-de2b-4348-a857-86037563f2e7` has a non-null `retention_curve_jsonb` array AND retained scalar metrics (views=16, avg_view_duration_seconds=58, ctr_pct=2.9, impressions=280 carried forward). A short throwaway `tsx` query against `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` is fine; delete it after.

- [ ] **Step 4: Report**

Summarize for the user: tests green, build green, B58 curve now populated (with point count), and that the cron will keep it fresh once YouTube exposes more data.

---

## Self-Review notes

- **Spec coverage:** parser (Task 1), video resolver (Task 2), carry-forward ingest helper (Task 3), API route (Task 4), CLI (Task 5), settings UI (Task 6), OAuth env declaration + empty-retention visibility (Task 7), runbook (Task 8), verification (Task 9). All spec sections map to a task.
- **Type consistency:** `RetentionPoint` defined once in `retention-parser.ts`, re-exported by `youtube-analytics.ts`. `ingestManualRetention` / `getLatestSnapshot` / `getYourVideoIdByExternalId` / `listPostedVideos` signatures are consistent across the helper, route, CLI, and UI. Route field names (`externalVideoId`, `yourVideoId`, `rawCurve`, `metrics`) match the UI body and the test.
- **No placeholders:** every code step contains full code; every run step has an exact command + expected result.
- **Out of scope (do not build):** the L2 playbook engine that consumes the curve.
