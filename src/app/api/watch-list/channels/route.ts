import 'server-only';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server';
import { loadEnv } from '@/lib/env';
import { resolveChannel } from '@/lib/clients/youtube';
import { upsertWatchedChannel } from '@/lib/supabase/repositories/watched-channels';

const BodySchema = z.object({ urlOrHandle: z.string().min(1) });

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body;
  try { body = BodySchema.parse(await req.json()); }
  catch (err) { return Response.json({ error: err instanceof Error ? err.message : 'bad body' }, { status: 400 }); }

  const env = loadEnv();
  if (!env.YOUTUBE_API_KEY) return Response.json({ error: 'YOUTUBE_API_KEY not set' }, { status: 500 });

  const channel = await resolveChannel({ apiKey: env.YOUTUBE_API_KEY, urlOrHandle: body.urlOrHandle });
  if (!channel) return Response.json({ error: 'channel_not_found' }, { status: 400 });

  const supabase = getServiceClient();
  const row = await upsertWatchedChannel(supabase, {
    channelId: channel.channelId,
    channelHandle: channel.handle,
    channelTitle: channel.title,
    channelThumbnailUrl: channel.thumbnailUrl,
    subscriberCountAtAdd: channel.subscriberCount,
    currentSubscriberCount: channel.subscriberCount,
    discoverySource: 'manual',
  });
  return Response.json({ ok: true, channel: row }, { status: 201 });
}
