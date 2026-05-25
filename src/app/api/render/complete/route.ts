// src/app/api/render/complete/route.ts
//
// Sandbox callback endpoint. The render worker POSTs here with a JWT (per-job,
// signed with RENDER_CALLBACK_SECRET) when its handler finishes. The endpoint:
//   1. Verifies JWT signature + jobId match.
//   2. Atomically transitions render_jobs row status (idempotent against duplicate calls).
//   3. Applies job-type-specific side effects:
//        render_f1 succeeded → update your_videos.render_artifact_url + status='rendered'
//        Other types: Phase 3/4/5 extend.
import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server';
import { verifyCallbackToken, CallbackTokenError } from '@/lib/render/callback-token';
import { markJobSucceeded, markJobFailed } from '@/lib/supabase/repositories/render-jobs';

const CompleteBody = z.object({
  job_id: z.string().uuid(),
  sandbox_invocation_id: z.string(),
  result: z.discriminatedUnion('status', [
    z.object({
      status: z.literal('succeeded'),
      output: z.record(z.string(), z.unknown()),
    }),
    z.object({
      status: z.literal('failed'),
      error: z.string(),
      output: z.record(z.string(), z.unknown()).optional(),
    }),
  ]),
});

export async function POST(req: Request) {
  // 1. Auth — Bearer JWT, NOT CRON_SECRET
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'missing_token' }, { status: 401 });
  }
  const token = authHeader.slice('Bearer '.length);
  let decoded;
  try {
    decoded = verifyCallbackToken(token);
  } catch (err) {
    if (err instanceof CallbackTokenError) {
      return NextResponse.json({ error: 'invalid_token', detail: err.message }, { status: 401 });
    }
    throw err;
  }

  // 2. Body
  let body;
  try {
    body = CompleteBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (body.job_id !== decoded.jobId) {
    return NextResponse.json({ error: 'job_id_mismatch' }, { status: 403 });
  }

  // 3. State transition + side effects
  const supabase = getServiceClient();
  if (body.result.status === 'succeeded') {
    const rows = await markJobSucceeded(supabase, { jobId: body.job_id });
    // Phase 1: only render_f1 side-effect wired.
    if (rows > 0 && 'render_artifact_url' in body.result.output) {
      const url = body.result.output.render_artifact_url as string;
      // Look up the render_jobs row to get the your_video_id
      const { data: jobRow } = await supabase
        .from('render_jobs')
        .select('your_video_id')
        .eq('id', body.job_id)
        .single();
      if (jobRow?.your_video_id) {
        await supabase
          .from('your_videos')
          .update({ render_artifact_url: url, status: 'rendered', updated_at: new Date().toISOString() })
          .eq('id', jobRow.your_video_id);
      }
    }
  } else {
    await markJobFailed(supabase, { jobId: body.job_id, error: body.result.error });
  }
  return NextResponse.json({ ok: true });
}
