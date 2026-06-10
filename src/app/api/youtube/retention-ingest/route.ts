import 'server-only';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server';
import { verifySession, COCKPIT_COOKIE_NAME } from '@/lib/auth/session';
import { parseRetentionCurve, RetentionParseError } from '@/lib/clients/retention-parser';
import { ingestManualRetention } from '@/lib/supabase/repositories/video-analytics';
import { getVideoForRetentionIngest } from '@/lib/supabase/repositories/your-videos';

export const dynamic = 'force-dynamic';

const MetricsSchema = z
  .object({
    views: z.number().nonnegative().optional(),
    likes: z.number().nonnegative().optional(),
    comments: z.number().nonnegative().optional(),
    shares: z.number().nonnegative().optional(),
    avgViewDurationSeconds: z.number().nonnegative().optional(),
    ctrPct: z.number().nonnegative().optional(),
    impressions: z.number().nonnegative().optional(),
    watchTimeSeconds: z.number().nonnegative().optional(),
    subscribersGained: z.number().optional(),
  })
  .optional();

const BodySchema = z
  .object({
    externalVideoId: z.string().min(1).optional(),
    yourVideoId: z.string().min(1).optional(),
    rawCurve: z.string().min(1),
    metrics: MetricsSchema,
    snapshotAt: z.string().min(1).optional(),
  })
  .refine((b) => !!b.externalVideoId !== !!b.yourVideoId, {
    message: 'Provide exactly one of externalVideoId or yourVideoId',
  });

function readCockpitCookie(req: Request): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COCKPIT_COOKIE_NAME) {
      try {
        return decodeURIComponent(v.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function POST(req: Request): Promise<Response> {
  if (!verifySession(readCockpitCookie(req)).valid) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    const detail = err instanceof z.ZodError ? err.issues.map((i) => i.message).join('; ') : 'invalid body';
    return Response.json({ error: 'invalid_body', detail }, { status: 400 });
  }

  let curve;
  try {
    curve = parseRetentionCurve(body.rawCurve);
  } catch (err) {
    if (err instanceof RetentionParseError) {
      return Response.json({ error: 'parse_error', detail: err.message }, { status: 400 });
    }
    throw err;
  }

  let snapshotAt: Date | undefined;
  if (body.snapshotAt) {
    const d = new Date(body.snapshotAt);
    if (Number.isNaN(d.getTime())) {
      return Response.json({ error: 'invalid_body', detail: 'snapshotAt is not a valid date' }, { status: 400 });
    }
    snapshotAt = d;
  }

  const supabase = getServiceClient();
  const video = await getVideoForRetentionIngest(
    supabase,
    body.yourVideoId ? { yourVideoId: body.yourVideoId } : { externalVideoId: body.externalVideoId },
  );
  if (!video) {
    return Response.json(
      {
        error: 'video_not_found',
        detail: 'No posted video matches that id — register/post the video first.',
        externalVideoId: body.externalVideoId,
        yourVideoId: body.yourVideoId,
      },
      { status: 404 },
    );
  }

  const result = await ingestManualRetention(supabase, {
    yourVideoId: video.id,
    curve,
    durationSeconds: video.durationSeconds,
    metricsOverride: body.metrics,
    snapshotAt,
    rawPayload: { source: 'manual_paste', rawCurve: body.rawCurve },
  });

  return Response.json(
    {
      ok: true,
      yourVideoId: video.id,
      points: result.points,
      snapshotAt: result.snapshotAt,
      first30sRetention: result.first30sRetention,
    },
    { status: 200 },
  );
}
