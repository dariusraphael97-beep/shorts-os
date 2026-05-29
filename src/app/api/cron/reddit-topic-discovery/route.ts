import { NextResponse } from 'next/server';
import { assertCronAuth, scraperLog, serializeError } from '@/lib/scrapers/shared';
import { getServiceClient } from '@/lib/supabase/server';
import { getTopPosts } from '@/lib/clients/reddit';
import { upsertShortsObservation } from '@/lib/supabase/repositories/shorts-observations';
import { runWithIngestionLog } from '@/lib/ingestion/run';
import { runRedditTopicDiscovery } from '@/lib/ingestion/reddit-topic-discovery';
import { REDDIT_SEED_SUBREDDITS } from '@/lib/ingestion/config';

export const maxDuration = 300;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }

  const supabase = getServiceClient();
  try {
    const run = await runWithIngestionLog(supabase, 'reddit_topic_discovery', () =>
      runRedditTopicDiscovery({
        client: { getTopPosts },
        repo: { upsertObservation: (p) => upsertShortsObservation(supabase, p).then(() => undefined) },
        subreddits: REDDIT_SEED_SUBREDDITS,
      }),
    );
    return NextResponse.json({ ok: true, ...scraperLog('reddit-topic-discovery', { run }) });
  } catch (e) {
    console.error('reddit-topic-discovery failed', e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
