// src/app/api/clips/candidates/[id]/approve/route.ts
//
// POST: transition compilation_drafts.status proposed → approved, then enqueue
// a render_f2 job pointing at the draft. 404/409 for missing/wrong-status row.

import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import {
  getDraftById,
  updateDraftStatus,
} from "@/lib/supabase/repositories/compilation-drafts";
import { enqueueRenderJob } from "@/lib/supabase/repositories/render-jobs";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const supabase = getServiceClient();
  const draft = await getDraftById(supabase, id);
  if (!draft) return Response.json({ error: "draft not found" }, { status: 404 });
  if (draft.status !== "proposed") {
    return Response.json({ error: `cannot approve from ${draft.status}` }, { status: 409 });
  }
  await updateDraftStatus(supabase, { id, from: "proposed", to: "approved" });
  const job = await enqueueRenderJob(supabase, {
    jobType: "render_f2",
    payload: { compilation_draft_id: id },
    compilationDraftId: id,
  });
  return Response.json({ ok: true, job_id: job.id });
}
