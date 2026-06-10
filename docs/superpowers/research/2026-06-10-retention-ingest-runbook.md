# Audience-retention-curve ingest — operator runbook

**What this is:** how to get a video's audience-retention curve (where viewers drop off)
into `video_analytics.retention_curve_jsonb` + the derived `first_30s_retention` column,
which the L2 longform playbook engine ranks on.

## Why a manual path exists (and isn't going away)

YouTube's Analytics **API** withholds the per-position retention curve
(`audienceWatchRatio`) until a video crosses a views/watch-hours threshold. YouTube
**Studio** shows you the curve in its UI well before the API will return it. So for any
early-stage video — like B58 with ~16 views — the `performance-sync` cron fetches the
scalar metrics fine but gets an **empty** retention curve from the API.

The manual paste path is therefore the only way to capture the curve for low-view videos,
and a permanent fallback. It computes the same `first_30s_retention` / `first_60s_retention`
/ `relative_retention_opening` columns the cron does (via `summarizeOpeningRetention`), so a
manually-imported curve feeds the L2 distiller **identically** to a cron-fetched one.

## How to import a curve (the fix that works today)

### 1. Get the curve from YouTube Studio
YT Studio → **Content** → click the video → **Analytics** → **Engagement** tab →
**Audience retention**. You have two easy ways to capture it:
- **Easiest:** open the browser **Network** tab, reload, find the analytics request whose
  response contains `audienceWatchRatio` rows, and copy that JSON response. You can paste it
  as-is — the parser accepts the raw `{ "rows": [[elapsed, watch], …] }` shape.
- **Or** read the curve off the graph and type a small CSV (elapsed%, retention%): a handful
  of points is enough; more is better.

### 2a. Import via the app (recommended)
Go to **Settings → Channel → "Audience retention — manual import"**:
- Pick the video (B58 is the only posted one today).
- Paste the CSV or JSON. A live sparkline + "N points parsed" confirms it parsed; you'll see
  the drop-off shape before saving.
- Optionally expand **"Add headline metrics"** to set views / avg-view-duration / CTR /
  impressions from the same Studio screen (otherwise they carry forward from the last
  snapshot).
- Click **Save retention curve**. The toast reports the points saved + the computed
  first-30s retention.

### 2b. Or import via the CLI (headless backfill)
From the repo root:
```
npm run ingest-retention -- --video GwC66BSw7wU --file curve.csv
# with explicit metrics from the same Studio screen:
npm run ingest-retention -- --video GwC66BSw7wU --file curve.csv --views 16 --avd 58 --ctr 2.9 --impressions 280
# or pipe it:
pbpaste | npm run ingest-retention -- --video GwC66BSw7wU --stdin
```
`--video` accepts either the YouTube watch id (`GwC66BSw7wU`) or the internal `your_videos`
UUID. It prints the points saved + the first-30s retention.

### Accepted formats
- 2-column CSV/TSV: `elapsed, retention` — values as percent (0–100) or ratio (0–1); `%`
  signs and thousands commas are tolerated; a header row is auto-skipped; per-column scale
  is auto-detected.
- JSON array of `{ "elapsedVideoTimeRatio": …, "audienceWatchRatio": … }` (key aliases like
  `x`/`y`, `position`/`retention` also work).
- Raw YT Analytics API JSON: `{ "rows": [[elapsed, watch], …] }` (extra columns ignored).

### 3. Verify it landed
The newest `video_analytics` row for the video should have a non-null
`retention_curve_jsonb` array AND a non-null `first_30s_retention`, with the carried-forward
scalar metrics (views, avg_view_duration_seconds, ctr_pct, impressions) intact. The
`longform_decision_outcomes` view then surfaces `first_30s_retention` to the distiller.

## The automatic path (already live in prod)

The `performance-sync` cron (daily, registered in `vercel.ts`) refreshes the channel's OAuth
token and fetches stats + the retention curve, computing the same derived columns. It will
fill the curve automatically **once YouTube exposes the data** for a video. It requires, in
Vercel prod: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`OAUTH_TOKEN_ENCRYPTION_KEY_V1` (64 hex chars), `OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION`,
plus a stored channel refresh token (re-authorize at `/api/youtube/oauth/start`). These are
now declared in `src/lib/env.ts` + `.env.example`. (As of 2026-06-10 the Dyfrx channel
already has a stored token and the cron is fetching scalar metrics in prod; only the curve is
still withheld for B58 due to the view threshold.)
