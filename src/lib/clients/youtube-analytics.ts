import 'server-only';

export interface VideoStats {
  views: number;
  likes: number;
  comments: number;
}

export async function fetchVideoStats(args: {
  accessToken: string;
  externalVideoId: string;
}): Promise<VideoStats> {
  const u = new URL('https://www.googleapis.com/youtube/v3/videos');
  u.searchParams.set('part', 'statistics');
  u.searchParams.set('id', args.externalVideoId);
  const res = await fetch(u, { headers: { Authorization: `Bearer ${args.accessToken}` } });
  if (!res.ok) throw new Error(`fetchVideoStats: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    items?: Array<{ statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }>;
  };
  const s = json.items?.[0]?.statistics ?? {};
  return {
    views: parseInt(s.viewCount ?? '0', 10),
    likes: parseInt(s.likeCount ?? '0', 10),
    comments: parseInt(s.commentCount ?? '0', 10),
  };
}

export interface CoreReport {
  estimatedMinutesWatched: number;
  averageViewDurationSeconds: number;
  subscribersGained: number;
  impressions: number | null;
  ctrPct: number | null;
}

// Always-supported core metrics. `impressions` + `ctrPct` are Reach metrics that the
// YouTube Analytics API exposes only for some accounts/videos (they are frequently
// Studio-only) — requesting them can 400 the whole query, which silently zeroed the sync.
const CORE_METRICS = ['estimatedMinutesWatched', 'averageViewDuration', 'subscribersGained'];
const REACH_METRICS = [...CORE_METRICS, 'impressions', 'ctrPct'];

export async function fetchCoreReport(args: {
  accessToken: string;
  externalChannelId: string;
  externalVideoId: string;
  startDate: string;
  endDate: string;
}): Promise<CoreReport> {
  const query = (metrics: string[]) => {
    const u = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
    u.searchParams.set('ids', `channel==${args.externalChannelId}`);
    u.searchParams.set('startDate', args.startDate);
    u.searchParams.set('endDate', args.endDate);
    u.searchParams.set('metrics', metrics.join(','));
    u.searchParams.set('filters', `video==${args.externalVideoId}`);
    return fetch(u, { headers: { Authorization: `Bearer ${args.accessToken}` } });
  };
  // Try impressions+CTR; if the API rejects that metric set, fall back to the core metrics
  // so views / watch-time / AVD / subs still land (impressions+CTR then stay null and are
  // sourced elsewhere). This keeps the per-video sync from silently writing nothing.
  let withReach = true;
  let res = await query(REACH_METRICS);
  if (!res.ok) { withReach = false; res = await query(CORE_METRICS); }
  if (!res.ok) throw new Error(`fetchCoreReport: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { rows?: Array<Array<number>> };
  const row = json.rows?.[0] ?? [];
  return {
    estimatedMinutesWatched: row[0] ?? 0,
    averageViewDurationSeconds: row[1] ?? 0,
    subscribersGained: row[2] ?? 0,
    impressions: withReach ? (row[3] ?? null) : null,
    ctrPct: withReach ? (row[4] ?? null) : null,
  };
}

export interface RetentionPoint {
  elapsedVideoTimeRatio: number;
  audienceWatchRatio: number;
  /**
   * YouTube's relativeRetentionPerformance at this point (0–1; 0.5 = median peer of similar length).
   * This is the algorithm's own "is this hook above or below par?" read — null when YouTube has too
   * little data to compute it. Pulled alongside audienceWatchRatio so the opening hold can be scored
   * both absolutely (did people stay?) and relative to peers (did we beat the median?).
   */
  relativeRetentionPerformance: number | null;
}

export async function fetchRetentionReport(args: {
  accessToken: string;
  externalChannelId: string;
  externalVideoId: string;
  startDate: string;
  endDate: string;
}): Promise<RetentionPoint[]> {
  const u = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  u.searchParams.set('ids', `channel==${args.externalChannelId}`);
  u.searchParams.set('startDate', args.startDate);
  u.searchParams.set('endDate', args.endDate);
  u.searchParams.set('dimensions', 'elapsedVideoTimeRatio');
  u.searchParams.set('metrics', 'audienceWatchRatio,relativeRetentionPerformance');
  u.searchParams.set('filters', `video==${args.externalVideoId}`);
  const res = await fetch(u, { headers: { Authorization: `Bearer ${args.accessToken}` } });
  if (!res.ok) throw new Error(`fetchRetentionReport: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { rows?: Array<[number, number, number?]> };
  return (json.rows ?? []).map(([elapsedVideoTimeRatio, audienceWatchRatio, relative]) => ({
    elapsedVideoTimeRatio,
    audienceWatchRatio,
    relativeRetentionPerformance: relative ?? null,
  }));
}
