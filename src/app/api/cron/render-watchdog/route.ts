// src/app/api/cron/render-watchdog/route.ts
// Watchdog runs every 5 min — see vercel.ts (Task 1.14). Calls reset_stuck_render_jobs.
import 'server-only';
import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { assertCronAuth } from '@/lib/scrapers/shared';
import { runWatchdog } from '@/lib/render/watchdog';

export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    assertCronAuth(req);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const supabase = getServiceClient();
  const result = await runWatchdog({ supabase });
  return NextResponse.json({ ok: true, ...result });
}
