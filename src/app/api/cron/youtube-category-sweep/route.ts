import { NextResponse } from 'next/server';
import { assertCronAuth, scraperLog, serializeError } from '@/lib/scrapers/shared';
import { loadEnv } from '@/lib/env';
import { getServiceClient } from '@/lib/supabase/server';
import { fetchMostPopularByCategory } from '@/lib/clients/youtube';
import { upsertShortsObservation } from '@/lib/supabase/repositories/shorts-observations';
import { runWithIngestionLog } from '@/lib/ingestion/run';
import { runCategorySweep } from '@/lib/ingestion/youtube-category-sweep';
import { YOUTUBE_CATEGORIES } from '@/lib/ingestion/config';

export const maxDuration = 300;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }

  const env = loadEnv();
  if (!env.YOUTUBE_API_KEY) return NextResponse.json({ error: 'YOUTUBE_API_KEY not set' }, { status: 500 });
  const supabase = getServiceClient();
  const apiKey = env.YOUTUBE_API_KEY;

  try {
    const run = await runWithIngestionLog(supabase, 'youtube_category_sweep', () =>
      runCategorySweep({
        client: { fetchMostPopularByCategory },
        repo: { upsertObservation: (p) => upsertShortsObservation(supabase, p).then(() => undefined) },
        categories: YOUTUBE_CATEGORIES,
        apiKey,
      }),
    );
    return NextResponse.json({ ok: true, ...scraperLog('youtube-category-sweep', { run }) });
  } catch (e) {
    console.error('youtube-category-sweep failed', e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
