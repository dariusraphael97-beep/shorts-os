import "server-only";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BodySchema = z.object({ videoId: z.string().regex(UUID_RE, "videoId must be a UUID") });

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try { body = BodySchema.parse(await req.json()); }
  catch (err) { return Response.json({ error: err instanceof Error ? err.message : "invalid body" }, { status: 400 }); }

  const supabase = getServiceClient();
  const { error } = await supabase
    .from("your_videos")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("id", body.videoId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
