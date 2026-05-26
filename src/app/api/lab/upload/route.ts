import "server-only";
import { z } from "zod";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BodySchema = z.object({ videoId: z.string().regex(UUID_RE, "videoId must be a UUID") });

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try { body = BodySchema.parse(await req.json()); }
  catch (err) { return Response.json({ error: err instanceof Error ? err.message : "invalid body" }, { status: 400 }); }

  console.log(`[lab/upload] STUB: would upload videoId=${body.videoId} — real upload ships Phase 5`);
  return Response.json({ ok: true, stub: true, message: "Upload pipeline lands in Phase 5." });
}
