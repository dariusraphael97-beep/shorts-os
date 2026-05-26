import "server-only";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { addBlocklistEntry } from "@/lib/supabase/repositories/ingest-blocklist";
import { softDeleteClip } from "@/lib/supabase/repositories/clip-library";

const BodySchema = z.object({
  sourcePlatform: z.enum(["reddit", "youtube", "tiktok"]),
  identifierType: z.enum(["subreddit", "author"]),
  identifier: z.string().min(1).max(80),
  reason: z.string().max(500).optional(),
  softDeleteClipId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).optional(),
});

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try { body = BodySchema.parse(await req.json()); }
  catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "invalid_body" }, { status: 400 });
  }
  const supabase = getServiceClient();
  await addBlocklistEntry(supabase, {
    sourcePlatform: body.sourcePlatform,
    identifierType: body.identifierType,
    identifier: body.identifier,
    reason: body.reason,
  });
  if (body.softDeleteClipId) {
    await softDeleteClip(supabase, body.softDeleteClipId);
  }
  return Response.json({ ok: true });
}
