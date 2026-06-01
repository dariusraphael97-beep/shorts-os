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
import { markJobSucceeded, markJobFailed, enqueueRenderJob } from '@/lib/supabase/repositories/render-jobs';
import { markPosted } from '@/lib/supabase/repositories/your-videos';
import { getVideoReviewByVideoId, insertVideoReview, type InsertVideoReviewParams } from '@/lib/supabase/repositories/video-reviews';
import { updateAssistantStatus, recordAssistantActivity } from '@/lib/supabase/repositories/assistants';

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
          // Pre-publish QA: enqueue a review pass on the freshly rendered MP4 (idempotent).
          // Non-fatal — the render genuinely succeeded and is already marked 'rendered';
          // a blip enqueuing the secondary QA pass must not fail (or retry) the callback.
          try {
            const existingReview = await getVideoReviewByVideoId(supabase, jobRow.your_video_id);
            if (!existingReview) {
              await enqueueRenderJob(supabase, {
                jobType: 'review',
                payload: { your_video_id: jobRow.your_video_id },
                yourVideoId: jobRow.your_video_id,
              });
              await updateAssistantStatus(supabase, 'video_reviewer', 'working', 'Reviewing a freshly rendered video…');
            }
          } catch (e) { console.error('review enqueue (non-fatal):', e); }
        }
      }

      // render_f2 side-effect — update compilation_drafts.rendered_path + status='rendered'
      if ('compilation_draft_id' in out && 'rendered_path' in out) {
        const draftId = out.compilation_draft_id as string;
        const renderedPath = out.rendered_path as string;
        const { error: updErr } = await supabase
          .from('compilation_drafts')
          .update({
            rendered_path: renderedPath,
            status: 'rendered',
            updated_at: new Date().toISOString(),
          })
          .eq('id', draftId);
        if (updErr) console.error('compilation_drafts rendered update failed:', updErr);
      }

      // upload side-effect — mark your_videos posted + record local hour/dow
      if ('your_video_id' in out && 'external_video_id' in out && 'url' in out) {
        const yourVideoId = out.your_video_id as string;
        const externalVideoId = out.external_video_id as string;
        const url = out.url as string;
        const { data: vidRow } = await supabase
          .from('your_videos')
          .select('channel_id')
          .eq('id', yourVideoId)
          .single();
        const channelId = vidRow?.channel_id;
        let channelTimezone = 'America/New_York';
        if (channelId) {
          const { data: chanRow } = await supabase
            .from('channels')
            .select('timezone')
            .eq('id', channelId)
            .single();
          if (chanRow?.timezone) channelTimezone = chanRow.timezone as string;
        }
        await markPosted(supabase, {
          videoId: yourVideoId,
          externalVideoId,
          url,
          postedAt: new Date(),
          channelTimezone,
        });
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

      // review side-effect — persist the worker's review object + link it on your_videos.
      if ('review' in out) {
        const { data: reviewJobRow } = await supabase
          .from('render_jobs')
          .select('your_video_id, job_type')
          .eq('id', body.job_id)
          .single();
        if (reviewJobRow?.job_type === 'review') {
          const review = await insertVideoReview(supabase, out.review as InsertVideoReviewParams);
          if (reviewJobRow.your_video_id) {
            await supabase
              .from('your_videos')
              .update({ review_id: review.id, updated_at: new Date().toISOString() })
              .eq('id', reviewJobRow.your_video_id);
          }
          try {
            await updateAssistantStatus(supabase, 'video_reviewer', 'idle', null);
            await recordAssistantActivity(supabase, {
              assistantId: 'video_reviewer',
              activityType: 'review',
              summary: `Reviewed video → ${review.overall_verdict}`,
              payload: { videoId: reviewJobRow.your_video_id, verdict: review.overall_verdict },
            });
          } catch (e) { console.error('video_reviewer report failed (non-fatal):', e); }
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

    // render_f2 failure side-effect — flip the linked compilation_draft to status='failed'
    // so the operator sees the broken draft surfaced. compilation_draft_id is recorded on
    // the render_jobs row at enqueue time.
    const { data: jobRow } = await supabase
      .from('render_jobs')
      .select('job_type, compilation_draft_id, your_video_id')
      .eq('id', body.job_id)
      .maybeSingle();
    if (jobRow?.job_type === 'render_f2' && jobRow.compilation_draft_id) {
      await supabase
        .from('compilation_drafts')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', jobRow.compilation_draft_id);
    }
    // upload failure side-effect — flip your_videos.status='failed' + write operator_alert on token-related errors.
    if (jobRow?.job_type === 'upload' && jobRow.your_video_id) {
      await supabase
        .from('your_videos')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', jobRow.your_video_id);
      const isOAuth = body.result.error.toLowerCase().includes('token refresh') ||
                      body.result.error.toLowerCase().includes('invalid_grant');
      if (isOAuth) {
        const { data: vidRow } = await supabase
          .from('your_videos')
          .select('channel_id')
          .eq('id', jobRow.your_video_id)
          .single();
        if (vidRow?.channel_id) {
          await supabase.from('operator_alerts').insert({
            channel_id: vidRow.channel_id,
            category: 'oauth_token_revoked',
            severity: 'error',
            message: 'YouTube refresh token rejected. Reconnect at /settings/channel.',
            context: { job_id: body.job_id, error: body.result.error },
          });
        }
      }
    }
    if (jobRow?.job_type === 'review') {
      try {
        await updateAssistantStatus(supabase, 'video_reviewer', 'errored', body.result.error.slice(0, 160));
      } catch (e) { console.error('video_reviewer errored-status (non-fatal):', e); }
    }
  }
  return NextResponse.json({ ok: true });
}
