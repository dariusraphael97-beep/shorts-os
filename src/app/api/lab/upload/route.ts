import 'server-only';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server';
import { enqueueRenderJob } from '@/lib/supabase/repositories/render-jobs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BodySchema = z.object({ videoId: z.string().regex(UUID_RE, 'videoId must be a UUID') });

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body;
  try { body = BodySchema.parse(await req.json()); }
  catch (err) { return Response.json({ error: err instanceof Error ? err.message : 'bad body' }, { status: 400 }); }

  const supabase = getServiceClient();
  const { data: vid, error: vErr } = await supabase
    .from('your_videos')
    .select('id, status')
    .eq('id', body.videoId)
    .single();
  if (vErr || !vid) return Response.json({ error: 'video_not_found' }, { status: 404 });
  const status = (vid as { status: string }).status;
  if (status !== 'rendered' && status !== 'scheduled') {
    return Response.json({ error: 'wrong_status', currentStatus: status }, { status: 409 });
  }

  const { error: upErr, count } = await supabase
    .from('your_videos')
    .update({ status: 'uploading', scheduled_for: null, updated_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', body.videoId)
    .in('status', ['rendered', 'scheduled']);
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 });
  if (!count) return Response.json({ error: 'wrong_status_race' }, { status: 409 });

  const job = await enqueueRenderJob(supabase, {
    jobType: 'upload',
    payload: { your_video_id: body.videoId },
    yourVideoId: body.videoId,
  });
  return Response.json({ ok: true, video_id: body.videoId, job_id: job.id });
}
