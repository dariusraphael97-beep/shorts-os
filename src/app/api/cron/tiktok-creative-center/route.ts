import { NextResponse } from 'next/server';
import { assertCronAuth, scraperLog, serializeError } from '@/lib/scrapers/shared';
import { getServiceClient } from '@/lib/supabase/server';
import { runWithIngestionLog } from '@/lib/ingestion/run';
import { runTikTokCreativeCenter } from '@/lib/ingestion/tiktok-creative-center';

export const maxDuration = 300;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }

  const supabase = getServiceClient();
  try {
    const run = await runWithIngestionLog(supabase, 'tiktok_creative_center', () => runTikTokCreativeCenter());
    return NextResponse.json({ ok: true, ...scraperLog('tiktok-creative-center', { run }) });
  } catch (e) {
    console.error('tiktok-creative-center failed', e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
