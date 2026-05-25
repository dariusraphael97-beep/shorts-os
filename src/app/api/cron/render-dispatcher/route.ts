// src/app/api/cron/render-dispatcher/route.ts
//
// Runs every 60 seconds (Vercel Cron via vercel.ts). Thin wrapper around
// runDispatcher — just wires the Supabase service client + VercelSandboxRenderWorker.
import 'server-only';
import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { assertCronAuth } from '@/lib/scrapers/shared';
import { runDispatcher } from '@/lib/render/dispatcher';
import { VercelSandboxRenderWorker } from '@/lib/render/workers/vercel-sandbox';

export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    assertCronAuth(req);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const supabase = getServiceClient();
  const worker = new VercelSandboxRenderWorker();
  const result = await runDispatcher({ supabase, worker, now: new Date() });
  return NextResponse.json({ ok: true, ...result });
}
