import 'server-only';
import type { TrendsClient } from '@/lib/clients/google-trends';
import type { AdapterResult } from '@/lib/ingestion/run';

export function parseFormattedTraffic(formatted: string): number {
  const m = formatted.trim().match(/^([\d.]+)\s*([KM]?)\+?$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const mult = m[2].toUpperCase() === 'M' ? 1_000_000 : m[2].toUpperCase() === 'K' ? 1_000 : 1;
  return Math.round(n * mult);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export interface GoogleTrendsRepo {
  upsertObservation(params: {
    videoId: string; source: 'google_trends'; channelId: null; title: string;
    description: string | null; viewCount: number; likeCount: number; commentCount: number;
  }): Promise<void>;
}

export async function runGoogleTrends(args: {
  client: TrendsClient;
  repo: GoogleTrendsRepo;
  geo: string;
}): Promise<AdapterResult> {
  const { client, repo, geo } = args;
  let searches;
  try {
    searches = await client.dailyTrends({ geo });
  } catch (err) {
    // Google Trends has no official API; the unofficial daily-trends endpoint is best-effort and
    // frequently blocks scraping outright. Record an unreachable source as 'skipped' (like the
    // TikTok stub) rather than 'failed' — a dead supplementary source must not red-flag the whole
    // Niche Scout agent in Mission Control. The reason is preserved for traceability.
    console.warn('[google-trends] dailyTrends unavailable:', err instanceof Error ? err.message : err);
    return { ingested: 0, skipped: 0, quotaUnits: 0, status: 'skipped', context: { reason: 'source_unavailable' } };
  }
  let ingested = 0;
  for (const s of searches) {
    await repo.upsertObservation({
      videoId: `gtrends:${geo}:${slugify(s.title)}`, source: 'google_trends', channelId: null, title: s.title,
      description: s.relatedQueries.length ? s.relatedQueries.join(', ') : null,
      viewCount: parseFormattedTraffic(s.traffic), likeCount: 0, commentCount: 0,
    });
    ingested++;
  }
  return { ingested, skipped: 0, quotaUnits: 0, context: { count: ingested } };
}
