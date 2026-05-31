import { NextResponse } from 'next/server';
import { assertCronAuth, scraperLog, serializeError } from '@/lib/scrapers/shared';
import { getServiceClient } from '@/lib/supabase/server';
import { realTrendsClient } from '@/lib/clients/google-trends';
import { upsertShortsObservation } from '@/lib/supabase/repositories/shorts-observations';
import { runWithIngestionLog } from '@/lib/ingestion/run';
import { runGoogleTrends } from '@/lib/ingestion/google-trends';
import { GOOGLE_TRENDS_GEO } from '@/lib/ingestion/config';

export const maxDuration = 300;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }

  const supabase = getServiceClient();
  try {
    const run = await runWithIngestionLog(supabase, 'google_trends', () =>
      runGoogleTrends({
        client: realTrendsClient,
        repo: { upsertObservation: (p) => upsertShortsObservation(supabase, p).then(() => undefined) },
        geo: GOOGLE_TRENDS_GEO,
      }),
    );
    return NextResponse.json({ ok: true, ...scraperLog('google-trends', { run }) });
  } catch (e) {
    console.error('google-trends failed', e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
