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
import { reportAssistant } from '@/lib/agents/dashboard/report';

export const maxDuration = 300;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }

  const env = loadEnv();
  if (!env.YOUTUBE_API_KEY) return NextResponse.json({ error: 'YOUTUBE_API_KEY not set' }, { status: 500 });
  const supabase = getServiceClient();
  const apiKey = env.YOUTUBE_API_KEY;

  const active = await listActiveWatchedChannels(supabase, 1000);
  const channels = await fetchChannels({ apiKey, channelIds: active.map((c) => c.channel_id) });
  const uploadsById = new Map(channels.map((c) => [c.channelId, c.uploadsPlaylistId]));
  const activeChannels: ActiveChannelRow[] = active.map((c) => ({ channel_id: c.channel_id, uploads_playlist_id: uploadsById.get(c.channel_id) ?? null }));

  await reportAssistant(supabase, 'watch_list_curator', 'working', 'Syncing the watch list…');
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
            const { data, error } = await supabase.from('watched_channels').select('channel_id').eq('channel_id', channelId).maybeSingle();
            if (error) throw new Error(`isWatched: ${error.message}`);
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
    await reportAssistant(supabase, 'watch_list_curator', 'idle', null, { activityType: 'watch_list_sync', summary: `Synced ${active.length} channels` });
    return NextResponse.json({ ok: true, ...scraperLog('watch-list-sync', { run }) });
  } catch (e) {
    console.error('watch-list-sync failed', e);
    await reportAssistant(supabase, 'watch_list_curator', 'errored', serializeError(e).slice(0, 160));
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
