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

export async function fetchCoreReport(args: {
  accessToken: string;
  externalChannelId: string;
  externalVideoId: string;
  startDate: string;
  endDate: string;
}): Promise<CoreReport> {
  const u = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  u.searchParams.set('ids', `channel==${args.externalChannelId}`);
  u.searchParams.set('startDate', args.startDate);
  u.searchParams.set('endDate', args.endDate);
  u.searchParams.set('metrics', [
    'estimatedMinutesWatched',
    'averageViewDuration',
    'subscribersGained',
    'impressions',
    'ctrPct',
  ].join(','));
  u.searchParams.set('filters', `video==${args.externalVideoId}`);
  const res = await fetch(u, { headers: { Authorization: `Bearer ${args.accessToken}` } });
  if (!res.ok) throw new Error(`fetchCoreReport: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { rows?: Array<Array<number>> };
  const row = json.rows?.[0] ?? [0, 0, 0, null, null];
  return {
    estimatedMinutesWatched: row[0] ?? 0,
    averageViewDurationSeconds: row[1] ?? 0,
    subscribersGained: row[2] ?? 0,
    impressions: row[3] ?? null,
    ctrPct: row[4] ?? null,
  };
}

export interface RetentionPoint { elapsedVideoTimeRatio: number; audienceWatchRatio: number; }

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
  u.searchParams.set('metrics', 'audienceWatchRatio');
  u.searchParams.set('filters', `video==${args.externalVideoId}`);
  const res = await fetch(u, { headers: { Authorization: `Bearer ${args.accessToken}` } });
  if (!res.ok) throw new Error(`fetchRetentionReport: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { rows?: Array<[number, number]> };
  return (json.rows ?? []).map(([elapsedVideoTimeRatio, audienceWatchRatio]) => ({
    elapsedVideoTimeRatio,
    audienceWatchRatio,
  }));
}
