import "server-only";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { enqueueRenderJob } from "@/lib/supabase/repositories/render-jobs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BodySchema = z.object({ draftId: z.string().regex(UUID_RE, "draftId must be a UUID") });

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "invalid body" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data: draft, error: loadErr } = await supabase
    .from("your_videos")
    .select("id, status")
    .eq("id", body.draftId)
    .single();
  if (loadErr || !draft) {
    return Response.json({ error: "draft_not_found" }, { status: 404 });
  }
  if (draft.status !== "draft") {
    return Response.json({ error: "wrong_status", currentStatus: draft.status }, { status: 409 });
  }

  // Atomic transition (skip if someone else won the race)
  const { error: updErr, count } = await supabase
    .from("your_videos")
    .update({ status: "rendering", updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", body.draftId)
    .eq("status", "draft");
  if (updErr) return Response.json({ error: updErr.message }, { status: 500 });
  if (!count) return Response.json({ error: "wrong_status_race" }, { status: 409 });

  const job = await enqueueRenderJob(supabase, {
    jobType: "render_f1",
    payload: { your_video_id: draft.id },
    yourVideoId: draft.id,
  });

  return Response.json({ ok: true, jobId: job.id, draftId: body.draftId });
}
