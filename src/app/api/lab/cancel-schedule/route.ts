import 'server-only';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server';
import { cancelSchedule } from '@/lib/supabase/repositories/your-videos';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BodySchema = z.object({ videoId: z.string().regex(UUID_RE) });
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body;
  try { body = BodySchema.parse(await req.json()); }
  catch { return Response.json({ error: 'bad body' }, { status: 400 }); }
  const supabase = getServiceClient();
  const ok = await cancelSchedule(supabase, body.videoId);
  if (!ok) return Response.json({ error: 'wrong_status_race' }, { status: 409 });
  return Response.json({ ok: true });
}
