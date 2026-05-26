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
    if (rows > 0) {
      const out = body.result.output;
      // Phase 2 diagnostic: stash debug_trace string on last_error column so we can
      // query it without adding a new schema field. Applies to all job_types.
      const trace = out.debug_trace;
      const traceText = typeof trace === 'string' ? trace : null;

      // render_f1 side-effect — update your_videos.render_artifact_url + status
      if ('render_artifact_url' in out) {
        const url = out.render_artifact_url as string;
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

      // clip_ingest side-effect — insert clip_library row + link via clip_library_id
      if ('source_url' in out && 'local_path' in out) {
        const { data: inserted, error: insErr } = await supabase
          .from('clip_library')
          .insert({
            source_url: out.source_url as string,
            source_platform: out.source_platform as string,
            source_creator: (out.source_creator as string | null) ?? null,
            local_path: out.local_path as string,
            duration_seconds: out.duration_seconds as number,
            width: (out.width as number | null) ?? null,
            height: (out.height as number | null) ?? null,
            description: (out.description as string | null) ?? null,
            tags: (out.tags as string[] | undefined) ?? [],
            niche_id: (out.niche_id as string | null) ?? null,
            added_by: (out.added_by as string | undefined) ?? 'reddit_ingest',
          })
          .select('id')
          .single();
        // 23505 = unique_violation on source_url — idempotent on duplicate callback
        if (insErr && insErr.code !== '23505') {
          console.error('clip_library insert failed:', insErr);
        }
        if (inserted) {
          await supabase
            .from('render_jobs')
            .update({ clip_library_id: inserted.id })
            .eq('id', body.job_id);
        }
      }

      if (traceText) {
        await supabase
          .from('render_jobs')
          .update({ last_error: traceText })
          .eq('id', body.job_id);
      }
    }
  } else {
    // Phase 2 diagnostic: append the trace (if present) to the error so we
    // can read it back from render_jobs.last_error after a stuck/crashed run.
    const trace = body.result.output?.debug_trace;
    const traceText = typeof trace === 'string' ? `\n\nTRACE:\n${trace}` : '';
    await markJobFailed(supabase, { jobId: body.job_id, error: body.result.error + traceText });
  }
  return NextResponse.json({ ok: true });
}
