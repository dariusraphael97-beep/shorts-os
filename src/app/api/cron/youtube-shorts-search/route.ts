import { NextResponse } from 'next/server';
import { assertCronAuth, scraperLog, serializeError } from '@/lib/scrapers/shared';
import { loadEnv } from '@/lib/env';
import { getServiceClient } from '@/lib/supabase/server';
import { searchShortsByQuery } from '@/lib/clients/youtube';
import { upsertShortsObservation } from '@/lib/supabase/repositories/shorts-observations';
import { runWithIngestionLog } from '@/lib/ingestion/run';
import { runShortsSearch } from '@/lib/ingestion/youtube-shorts-search';
import { SHORTS_SEARCH_SEEDS, rotatingSeedSlice } from '@/lib/ingestion/config';

export const maxDuration = 300;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }

  const env = loadEnv();
  if (!env.YOUTUBE_API_KEY) return NextResponse.json({ error: 'YOUTUBE_API_KEY not set' }, { status: 500 });
  const supabase = getServiceClient();
  const apiKey = env.YOUTUBE_API_KEY;
  const seeds = rotatingSeedSlice(SHORTS_SEARCH_SEEDS, 8);

  try {
    const run = await runWithIngestionLog(supabase, 'youtube_shorts_search', () =>
      runShortsSearch({
        client: { searchShortsByQuery },
        repo: { upsertObservation: (p) => upsertShortsObservation(supabase, p).then(() => undefined) },
        seeds,
        apiKey,
      }),
    );
    return NextResponse.json({ ok: true, ...scraperLog('youtube-shorts-search', { run, seeds }) });
  } catch (e) {
    console.error('youtube-shorts-search failed', e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
