import 'server-only';
import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { getServiceClient } from '@/lib/supabase/server';
import { assertCronAuth, scraperLog } from '@/lib/scrapers/shared';
import { loadEncryptedRefreshToken } from '@/lib/supabase/repositories/channels';
import { refreshAccessToken, GoogleTokenError } from '@/lib/clients/google-oauth';
import {
  fetchVideoStats,
  fetchCoreReport,
  fetchRetentionReport,
} from '@/lib/clients/youtube-analytics';
import { upsertVideoAnalytics } from '@/lib/supabase/repositories/video-analytics';
import { summarizeOpeningRetention } from '@/lib/longform/retention';
import {
  startIngestionRun,
  finishIngestionRun,
  type IngestionRunRow,
} from '@/lib/supabase/repositories/ingestion-runs';

export const maxDuration = 300;

interface ChannelRow {
  id: string;
  external_channel_id: string | null;
  timezone: string;
}

interface VideoRow {
  id: string;
  external_video_id: string | null;
  channel_id: string;
  posted_at: string | null;
  duration_seconds: number | null;
}

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }
  const supabase = getServiceClient();

  // Ledger entry for Mission Control's Analyst card. Tolerate the un-migrated
  // CHECK constraint (performance_sync added in 20260611000001) — never let
  // ledger bookkeeping break the actual sync.
  let ledgerRun: IngestionRunRow | null = null;
  try {
    ledgerRun = await startIngestionRun(supabase, { job: 'performance_sync' });
  } catch (err) {
    console.warn('[performance-sync] ledger start failed:', err instanceof Error ? err.message : err);
  }

  const windowDays = parseInt(process.env.ANALYTICS_SYNC_WINDOW_DAYS ?? '14', 10);

  // Wrap the entire post-ledger body so any unexpected throw closes the ledger
  // row before propagating (prevents a permanently "running" Analyst card).
  // Guard against double-finish: null out ledgerRun after each finishIngestionRun
  // so the outer catch can tell the row is already closed.
  try {
    const { data: channels, error: chanErr } = await supabase
      .from('channels')
      .select('id, external_channel_id, timezone')
      .eq('is_active', true)
      .eq('platform', 'youtube');
    if (chanErr) {
      if (ledgerRun) {
        try {
          await finishIngestionRun(supabase, {
            id: ledgerRun.id, status: 'failed', itemsIngested: 0, itemsSkipped: 0, quotaUnits: 0,
            error: chanErr.message,
          });
        } catch { /* ledger is best-effort */ }
        ledgerRun = null;
      }
      return NextResponse.json({ ok: false, error: chanErr.message }, { status: 500 });
    }

    const summary: Array<{ channelId: string; videos: number; errors: number }> = [];

    for (const c of (channels ?? []) as ChannelRow[]) {
      let videosCount = 0;
      let errCount = 0;

      if (!c.external_channel_id) {
        summary.push({ channelId: c.id, videos: 0, errors: 1 });
        continue;
      }

      const refreshToken = await loadEncryptedRefreshToken(supabase, c.id);
      if (!refreshToken) {
        summary.push({ channelId: c.id, videos: 0, errors: 1 });
        continue;
      }

      let accessToken: string;
      try {
        const r = await refreshAccessToken({
          refreshToken,
          clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
        });
        accessToken = r.accessToken;
      } catch (err) {
        if (err instanceof GoogleTokenError) {
          summary.push({ channelId: c.id, videos: 0, errors: 1 });
          continue;
        }
        throw err;
      }

      const windowStart = DateTime.utc().minus({ days: windowDays }).toISO();
      const { data: videos, error: vidErr } = await supabase
        .from('your_videos')
        .select('id, external_video_id, channel_id, posted_at, duration_seconds')
        .eq('channel_id', c.id)
        .eq('status', 'posted')
        .gte('posted_at', windowStart);
      if (vidErr) { summary.push({ channelId: c.id, videos: 0, errors: 1 }); continue; }

      const startDate = DateTime.utc().minus({ days: windowDays }).toISODate();
      const endDate = DateTime.utc().toISODate();

      for (const v of (videos ?? []) as VideoRow[]) {
        if (!v.external_video_id) continue;
        try {
          const [stats, core, retention] = await Promise.all([
            fetchVideoStats({ accessToken, externalVideoId: v.external_video_id }),
            fetchCoreReport({
              accessToken,
              externalChannelId: c.external_channel_id,
              externalVideoId: v.external_video_id,
              startDate: startDate!,
              endDate: endDate!,
            }),
            fetchRetentionReport({
              accessToken,
              externalChannelId: c.external_channel_id,
              externalVideoId: v.external_video_id,
              startDate: startDate!,
              endDate: endDate!,
            }),
          ]);
          // Reduce the curve to the opening-hold numbers the L2 playbook ranks on. Falls back to nulls
          // when the curve or duration is missing (the distiller then treats this video as unmeasured).
          const opening = summarizeOpeningRetention(retention, v.duration_seconds);
          await upsertVideoAnalytics(supabase, {
            yourVideoId: v.id,
            snapshotAt: new Date(),
            views: stats.views,
            likes: stats.likes,
            comments: stats.comments,
            shares: null,
            avgViewDurationSeconds: core.averageViewDurationSeconds,
            ctrPct: core.ctrPct,
            subscribersGained: core.subscribersGained,
            impressions: core.impressions,
            watchTimeSeconds: core.estimatedMinutesWatched * 60,
            retentionCurve: retention,
            first30sRetention: opening.first30sRetention,
            first60sRetention: opening.first60sRetention,
            relativeRetentionOpening: opening.relativeRetentionOpening,
            rawPayload: { stats, core, retention },
          });
          videosCount += 1;
        } catch {
          errCount += 1;
        }
      }
      summary.push({ channelId: c.id, videos: videosCount, errors: errCount });
    }

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
      ledgerRun = null;
    }

    return NextResponse.json({ ok: true, ...scraperLog('performance-sync', { summary }) });
  } catch (err) {
    // Unexpected throw (e.g. non-GoogleTokenError from refreshAccessToken).
    // Best-effort close the ledger row so the Analyst card doesn't hang on "running".
    if (ledgerRun) {
      try {
        await finishIngestionRun(supabase, {
          id: ledgerRun.id,
          status: 'failed',
          itemsIngested: 0,
          itemsSkipped: 0,
          quotaUnits: 0,
          error: String(err),
        });
      } catch { /* never let ledger failure mask the original error */ }
      ledgerRun = null;
    }
    throw err;
  }
}
