# Audience-retention-curve ingest — design

**Date:** 2026-06-10
**Branch:** `feat/niche-finder-dominatable` (work may move to its own branch)
**Status:** approved scope (paste path + API hardening), in-app UI surface

> **Update (post-`233d27f`):** while this spec was being written, commit `233d27f` (Phase L2 playbook store) landed in parallel — it built the curve's *consumer* (`summarizeOpeningRetention`, derived `first_30s_retention`/`first_60s_retention`/`relative_retention_opening` columns written by `upsertVideoAnalytics`, the `longform_playbooks` table + distiller; migration already applied to prod). The implementation plan (`docs/superpowers/plans/2026-06-10-retention-curve-ingest.md`) is reconciled against it: the manual ingest now ALSO computes + stores the derived opening-hold columns (so a pasted curve feeds the distiller), the parser keeps a 2-field type that is a structural subset of L2's `RetentionCurvePoint`, and the planned `performance-sync` tweak + `RetentionPoint` re-export are dropped to avoid colliding with L2's files. The "stale `il` test" note below was a mis-read — the test correctly imports `performance-sync/route`; ignore it.

## Problem

The longform learning loop's `video_analytics` table has a `retention_curve_jsonb`
column that is empty in practice. The L2 playbook engine (not built yet) needs the
absolute-retention curve — *where viewers drop off* — to know which part of a video is
failing, not just the average view duration. This is a **prerequisite for L2**, not L2
itself.

## What already exists (verified 2026-06-10, against prod Supabase `jfmjppzjicvbpnlkmxbg`)

The "pull from YouTube Analytics API → upsert" path is **already built**:

| Piece | Status | Location |
|---|---|---|
| Fetch curve from YT Analytics API | ✅ | `fetchRetentionReport()` `src/lib/clients/youtube-analytics.ts:71` |
| Call it + pass `retentionCurve` to upsert | ✅ | `src/app/api/cron/performance-sync/route.ts:99-120` |
| Write `retention_curve_jsonb` | ✅ | `src/lib/supabase/repositories/video-analytics.ts:37` |
| OAuth start + callback + encrypted token storage | ✅ | `src/app/api/youtube/oauth/{start,callback}/route.ts`, `channels.ts:69` |
| `performance-sync` cron registered (daily) | ✅ | `vercel.ts` crons, `0 12 * * *` |

The tool-knowledge-map's claim that "`retention_curve_jsonb` has no ingest from YT Studio"
is **stale at the code level**.

### The real situation

- The Dyfrx channel (`channels.id = c8edc30f-375d-4b38-b6b0-77fa4b5e59a7`,
  `external_channel_id = UCUXkixLGmtaKukPT3plv9YQ`) exists, is active, and has an OAuth
  refresh token stored. The `performance-sync` cron **is** fetching scalar analytics in
  prod (OAuth works).
- The B58 video is posted and registered: `your_videos.id =
  7f7eef94-de2b-4348-a857-86037563f2e7`, `external_video_id = GwC66BSw7wU`,
  `status = posted`. It is the **only** posted video with an external id.
- `video_analytics` has 3 snapshots for B58. The latest (snapshot 14:21Z) has
  `views=16, avg_view_duration_seconds=58, ctr_pct=2.9, impressions=280` — but
  **`retention_curve_jsonb` is NULL in all three rows.**

### Why the curve is NULL even though the cron runs

YouTube's Analytics API withholds the `elapsedVideoTimeRatio`/`audienceWatchRatio` curve
until a video crosses a views/watch-hours threshold. B58 has 16 views, so the API returns
no retention rows. **YouTube *Studio* shows the creator the curve well before the *API*
exposes it.** Therefore the manual paste path is not merely an OAuth stopgap — it is the
**only** way to get the curve for a low-view video like B58, and a permanent fallback for
every early-stage video.

## Scope

**In scope**
1. **Manual paste path** (the missing, immediately useful piece): parse a YT Studio
   retention export (CSV) or JSON paste → normalize → upsert via `upsertVideoAnalytics`.
   Surfaces: a shared parser lib, an API route, an in-app settings UI, and a CLI script.
2. **API-path hardening** (light): declare the OAuth env vars in the schema + `.env.example`
   (they are read with `!` today, undeclared); make empty-retention visible in
   `performance-sync` logs; write an operator runbook.

**Out of scope**
- The L2 playbook engine that *consumes* the curve (this is its prerequisite).
- Fixing the pre-existing stale test import (`src/tests/api/performance-sync.test.ts`
  imports `@/app/api/cron/il/route`, which no longer exists). Flag, do not fix here.
- Auto-detecting "key moments" / drop-off classification (L2's job).

## Architecture

One canonical write path, two manual front doors, plus the existing cron:

```
YT Studio (manual) ──paste CSV/JSON──┐
npm run ingest-retention ────────────┤─> retention-parser.ts (pure: text → RetentionPoint[])
                                      │        └─> ingestManualRetention() — merge w/ latest snapshot scalars
                                      │              └─> upsertVideoAnalytics()  ──> video_analytics.retention_curve_jsonb
performance-sync cron (existing) ─────┘   (fills curve automatically once YT exposes it)
```

### Component 1 — `src/lib/clients/retention-parser.ts` (new, pure)

- **Purpose:** turn arbitrary pasted text into a validated, normalized `RetentionPoint[]`.
- **Owns the canonical type:** define `RetentionPoint { elapsedVideoTimeRatio: number; audienceWatchRatio: number }` here; `youtube-analytics.ts` imports/re-exports it (single source of truth → manual and API paths produce identical shapes for L2).
- **No `server-only`, no DB, no secrets** — so both the Next route and the `scripts/` CLI can import it (the script imports via a relative path; a `server-only` import would still be a no-op under tsx, but keeping it pure avoids the question entirely).
- **Public API:** `parseRetentionCurve(input: string): RetentionPoint[]` (throws `RetentionParseError` with a human-readable message on failure).
- **Accepted input formats** (auto-detected):
  1. **JSON array** of objects — tolerant keys: `elapsedVideoTimeRatio|x|position|elapsed`, `audienceWatchRatio|y|retention|watch`.
  2. **Raw YT Analytics API JSON** — `{ rows: [[elapsed, watch], …] }` (and the full
     `{ columnHeaders, rows }` response). Same shape `fetchRetentionReport` consumes.
  3. **Delimited text (CSV/TSV)** — two numeric columns, optional header row (detected by
     non-numeric first row), tolerant of `%`, thousands commas, surrounding whitespace.
- **Normalization rules:**
  - Strip `%`, commas, whitespace per cell.
  - Per column, if `max(values) > 1.5`, treat as percentages → divide by 100 (handles
    both `50` and `0.5`; both `98%` and `0.98`).
  - `elapsedVideoTimeRatio` clamped to `[0,1]`, sorted ascending, de-duplicated by elapsed.
  - `audienceWatchRatio` clamped to `>= 0` (relative retention can exceed 1.0; keep, only
    clamp negatives to 0).
  - **Validate:** ≥ 2 points; elapsed strictly increasing after dedup. Else throw.

### Component 2 — ingest helper + video resolver

- `src/lib/supabase/repositories/your-videos.ts` — add
  `getYourVideoIdByExternalId(supabase, externalVideoId): Promise<string | null>`
  (resolve the YouTube watch id → internal uuid; `your-videos.ts` has `getYourVideoById`
  but no by-external-id lookup today).
- `src/lib/supabase/repositories/video-analytics.ts` — add:
  - `getLatestSnapshot(supabase, yourVideoId): Promise<VideoAnalyticsRow | null>`.
  - `ingestManualRetention(supabase, { yourVideoId, curve, metricsOverride?, snapshotAt? }): Promise<{ points: number; snapshotAt: string }>`.
    - Loads the latest snapshot (if any), **carries forward its scalar metrics**, applies
      any operator-provided `metricsOverride`, sets `retentionCurve = curve`, sets
      `snapshotAt = now` (a fresh, newest snapshot) unless an explicit `snapshotAt` is given.
    - Calls the existing `upsertVideoAnalytics` (single dumb writer — task requirement).
  - **Rationale:** a curve-only write at `now` would create a newest snapshot with NULL
    scalars, and `longform_decision_outcomes` reads the *latest* row — nulling B58's good
    scalars. Carrying forward keeps the newest row complete.

### Component 3 — `POST /api/youtube/retention-ingest/route.ts` (new)

- `import 'server-only'`, `export const dynamic = 'force-dynamic'`.
- **Auth:** operator mutation → verify the cockpit session cookie via
  `verifySession(cookie)` from `@/lib/auth/session` (read `COCKPIT_COOKIE_NAME`); 401 on
  failure. (Existing settings pages are cookie-gated at the page level; this route is
  reachable directly, so it guards itself.)
- **Body (Zod):** `{ externalVideoId?: string; yourVideoId?: string; rawCurve: string;
  metrics?: { views?, likes?, comments?, avgViewDurationSeconds?, ctrPct?, impressions?,
  watchTimeSeconds?, subscribersGained? }; snapshotAt?: string }` — exactly one of
  `externalVideoId`/`yourVideoId` required.
- **Flow:** validate → `parseRetentionCurve(rawCurve)` → resolve video (404 if unknown) →
  `ingestManualRetention(...)` → `200 { ok: true, yourVideoId, points }`. 400 on parse/
  validation error with the parser's message.

### Component 4 — in-app UI on `src/app/settings/channel/page.tsx`

A card titled "Audience retention — manual import" (use the existing settings/shadcn
design system; match the page's current patterns). Leads with the primary action:
- **Video selector** — dropdown of `status='posted'` videos, defaulting to B58 (currently
  the only one).
- **Paste textarea** — "Paste from YouTube Studio (CSV or JSON)".
- **Collapsible "Headline metrics (optional)"** — numeric inputs (views, avg view
  duration s, CTR %, impressions) for when the operator reads them off the same screen.
- **Live parse preview** — on input, the card imports `parseRetentionCurve` directly
  (it is a pure client-safe module) and shows the detected point count + an inline SVG
  sparkline of the curve so the operator eyeballs the drop-off before saving. Parse errors
  shown inline. The same parsed array is sent to the route on Save (server re-parses from
  `rawCurve` as the source of truth — the client preview never bypasses server validation).
- **Save** → POST to the route; success toast; sparkline persists.

(If the channel settings page is a server component, the card is a small client component
island; verify the page's structure during implementation and match it.)

### Component 5 — `scripts/ingest-retention.ts` (new CLI)

- Run via `npm run ingest-retention -- --video <externalId|uuid> (--file <path> | --stdin)
  [--views N --avd S --ctr P --impressions N]`.
- Reuses `parseRetentionCurve` + `ingestManualRetention` (relative imports from `src/`),
  with a service-role Supabase client built from `SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` (the `scripts/` env-file pattern). Add the `package.json`
  script entry mirroring the `render-worker` invocation style
  (`node --import tsx --env-file=.env.local scripts/ingest-retention.ts`).

### Component 6 — API-path hardening

- `src/lib/env.ts` + `.env.example`: add `GOOGLE_OAUTH_CLIENT_ID`,
  `GOOGLE_OAUTH_CLIENT_SECRET`, `OAUTH_TOKEN_ENCRYPTION_KEY_V1` (64 hex chars),
  `OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION` as **optional** (code reads them directly
  with `!`; declaring documents them and enables a clear startup error if half-set).
- `performance-sync/route.ts`: when `fetchRetentionReport` returns `[]`, include it in the
  per-video summary/log (e.g. `retentionEmpty: true`) so the YT-threshold case is visible
  rather than silently looking like a bug.
- Runbook: `docs/superpowers/research/2026-06-10-retention-ingest-runbook.md` — how to
  confirm prod OAuth is live, why retention is empty for low-view videos, exact steps to
  read the curve from YT Studio and paste it (UI or script), and how to verify the row
  landed.

## Error handling

- Parser: throws `RetentionParseError(message)`; route maps to 400 with the message; UI
  shows it inline; script prints to stderr and exits non-zero.
- Unknown video: route → 404 `{ error: 'video_not_found', externalVideoId }`; script exits
  non-zero with guidance to register/post the video first.
- Auth failure: route → 401.
- Upsert/DB error: surfaces via `upsertVideoAnalytics`'s thrown error → 500.

## Testing (vitest, TDD — write tests first)

- **Parser (core):** JSON array (incl. key aliases); raw API `{rows}`; CSV with header;
  CSV without header; TSV; `%`/comma stripping; 0–100 vs 0–1 scale detection; negative
  watch clamp; non-monotonic rejection; <2 points rejection; total garbage rejection;
  realistic YT Studio export sample.
- **Ingest helper:** carry-forward merge (latest scalars preserved, curve added);
  `metricsOverride` wins; no prior snapshot → curve-only row; unknown video resolution.
- **Route:** rejects missing/!1-of video id (400); rejects bad cockpit cookie (401);
  parse error → 400; happy path calls `ingestManualRetention` with parsed curve and returns
  `{ ok, points }`. (Mock Supabase as in `video-analytics.test.ts`.)
- Run full suite; note the pre-existing `il`-import failure is unrelated.

## Verification (definition of done)

1. Tests green (parser/helper/route), `npm run build` + typecheck clean.
2. Paste B58's real curve (from YT Studio) via the UI **and** confirm
   `video_analytics` newest row for `7f7eef94…` has a non-null `retention_curve_jsonb`
   array with the scalar metrics still present.
3. Script backfill produces the same result for `GwC66BSw7wU`.
4. Runbook committed; env vars declared; `.env.example` updated.
