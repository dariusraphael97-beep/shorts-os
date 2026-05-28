import 'server-only';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { getServiceClient } from '@/lib/supabase/server';
import { scheduleVideo, slotIsOccupied } from '@/lib/supabase/repositories/your-videos';
import { nextOpenSlotAfter, BacklogOverflowError, type ChannelForSchedule } from '@/lib/timezone';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BodySchema = z.object({
  videoId: z.string().regex(UUID),
  scheduledFor: z.string().datetime().optional(),
});

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body;
  try { body = BodySchema.parse(await req.json()); }
  catch (err) { return Response.json({ error: err instanceof Error ? err.message : 'bad body' }, { status: 400 }); }

  const supabase = getServiceClient();
  const { data: vid, error: vErr } = await supabase
    .from('your_videos')
    .select('id, channel_id, status')
    .eq('id', body.videoId)
    .single();
  if (vErr || !vid) return Response.json({ error: 'video_not_found' }, { status: 404 });
  if ((vid as { status: string }).status !== 'rendered') {
    return Response.json({ error: 'wrong_status', currentStatus: (vid as { status: string }).status }, { status: 409 });
  }

  const channelId = (vid as { channel_id: string }).channel_id;
  const { data: chan, error: cErr } = await supabase
    .from('channels')
    .select('id, timezone, posting_schedule')
    .eq('id', channelId)
    .single();
  if (cErr || !chan) return Response.json({ error: 'channel_not_found' }, { status: 404 });

  let scheduledFor: Date;
  if (body.scheduledFor) {
    scheduledFor = new Date(body.scheduledFor);
  } else {
    const channel = chan as ChannelForSchedule;
    try {
      const slot = await nextOpenSlotAfter(
        channel,
        DateTime.utc(),
        async (slotUtc) => slotIsOccupied(supabase, channelId, slotUtc.toJSDate()),
      );
      scheduledFor = slot.toJSDate();
    } catch (err) {
      if (err instanceof BacklogOverflowError) {
        return Response.json({ error: 'backlog_overflow', channelId: err.channelId }, { status: 503 });
      }
      throw err;
    }
  }

  const ok = await scheduleVideo(supabase, { videoId: body.videoId, scheduledFor });
  if (!ok) return Response.json({ error: 'wrong_status_race' }, { status: 409 });
  return Response.json({ ok: true, video_id: body.videoId, scheduled_for: scheduledFor.toISOString() });
}
