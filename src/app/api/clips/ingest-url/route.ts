import "server-only";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { enqueueRenderJob } from "@/lib/supabase/repositories/render-jobs";
import { getDefaultChannel } from "@/lib/supabase/repositories/channels";
import { isSourceUrlIngested } from "@/lib/supabase/repositories/clip-library";

const BodySchema = z.object({ url: z.string().url() });

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try { body = BodySchema.parse(await req.json()); }
  catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "invalid_body" }, { status: 400 });
  }

  const supabase = getServiceClient();
  if (await isSourceUrlIngested(supabase, body.url)) {
    return Response.json({ error: "already_ingested" }, { status: 409 });
  }

  const channel = await getDefaultChannel(supabase);
  if (!channel.niche_id) {
    return Response.json({ error: "channel_missing_niche" }, { status: 400 });
  }
  const job = await enqueueRenderJob(supabase, {
    jobType: "clip_ingest",
    payload: {
      source_url: body.url,
      source_creator: null,
      niche_id: channel.niche_id,
      channel_id: channel.id,
      added_by: "manual",
    },
  });
  return Response.json({ ok: true, jobId: job.id });
}
