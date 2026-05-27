// src/app/api/clips/rendered/[id]/approve/route.ts
//
// POST: promote a rendered compilation_draft into your_videos. Inserts a new
// your_videos row with status='rendered' + render_artifact_url copied from
// the draft, then flips the draft to 'posted' with promoted_your_video_id set.
// Phase 4 stops here — actual upload chaining lands in Plan #5 scheduling.

import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import {
  getDraftById,
  setPromotedYourVideoId,
} from "@/lib/supabase/repositories/compilation-drafts";
import { createPromotedVideo } from "@/lib/supabase/repositories/your-videos";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const supabase = getServiceClient();
  const draft = await getDraftById(supabase, id);
  if (!draft) return Response.json({ error: "draft not found" }, { status: 404 });
  if (draft.status !== "rendered") {
    return Response.json({ error: `cannot approve from ${draft.status}` }, { status: 409 });
  }
  if (!draft.rendered_path) {
    return Response.json({ error: "rendered_path missing" }, { status: 422 });
  }
  const totalDuration = draft.clip_refs.reduce(
    (a, r) => a + (r.end_sec - r.start_sec),
    0,
  );
  const videoId = await createPromotedVideo(supabase, {
    channelId: draft.channel_id,
    title: draft.title_template,
    renderArtifactUrl: draft.rendered_path,
    durationSeconds: totalDuration,
    sourceCompilationDraftId: id,
  });
  await setPromotedYourVideoId(supabase, { id, your_video_id: videoId });
  return Response.json({ ok: true, your_video_id: videoId });
}
