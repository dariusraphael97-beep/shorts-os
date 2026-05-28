import 'server-only';
import { DateTime } from 'luxon';
import { getServiceClient } from '@/lib/supabase/server';
import {
  getDraftById,
  setPromotedYourVideoId,
} from '@/lib/supabase/repositories/compilation-drafts';
import { createPromotedVideo, slotIsOccupied } from '@/lib/supabase/repositories/your-videos';
import { getChannelById } from '@/lib/supabase/repositories/channels';
import { enqueueRenderJob } from '@/lib/supabase/repositories/render-jobs';
import { nextOpenSlotAfter, BacklogOverflowError } from '@/lib/timezone';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const action = new URL(req.url).searchParams.get('action') === 'post_now' ? 'post_now' : 'schedule';
  const supabase = getServiceClient();

  const draft = await getDraftById(supabase, id);
  if (!draft) return Response.json({ error: 'draft not found' }, { status: 404 });
  if (draft.status !== 'rendered') {
    return Response.json({ error: `cannot approve from ${draft.status}` }, { status: 409 });
  }
  if (!draft.rendered_path) return Response.json({ error: 'rendered_path missing' }, { status: 422 });

  const totalDuration = draft.clip_refs.reduce((a, r) => a + (r.end_sec - r.start_sec), 0);

  if (action === 'post_now') {
    const yvId = await createPromotedVideo(supabase, {
      channelId: draft.channel_id,
      title: draft.title_template,
      renderArtifactUrl: draft.rendered_path,
      durationSeconds: totalDuration,
      sourceCompilationDraftId: id,
      targetStatus: 'uploading',
    });
    await enqueueRenderJob(supabase, {
      jobType: 'upload',
      payload: { your_video_id: yvId },
      yourVideoId: yvId,
    });
    await setPromotedYourVideoId(supabase, { id, your_video_id: yvId });
    return Response.json({ ok: true, your_video_id: yvId, posting_now: true });
  }

  // action === 'schedule' — default
  const channel = await getChannelById(supabase, draft.channel_id);
  if (!channel) return Response.json({ error: 'channel not found' }, { status: 404 });
  let scheduledFor: Date;
  try {
    const slot = await nextOpenSlotAfter(
      channel,
      DateTime.utc(),
      async (slotUtc) => slotIsOccupied(supabase, channel.id, slotUtc.toJSDate()),
    );
    scheduledFor = slot.toJSDate();
  } catch (err) {
    if (err instanceof BacklogOverflowError) {
      return Response.json({ error: 'backlog_overflow' }, { status: 503 });
    }
    throw err;
  }

  const yvId = await createPromotedVideo(supabase, {
    channelId: draft.channel_id,
    title: draft.title_template,
    renderArtifactUrl: draft.rendered_path,
    durationSeconds: totalDuration,
    sourceCompilationDraftId: id,
    targetStatus: 'scheduled',
    scheduledFor,
  });
  await setPromotedYourVideoId(supabase, { id, your_video_id: yvId });
  return Response.json({
    ok: true,
    your_video_id: yvId,
    scheduled_for: scheduledFor.toISOString(),
  });
}
