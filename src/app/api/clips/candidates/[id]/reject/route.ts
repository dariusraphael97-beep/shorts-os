// src/app/api/clips/candidates/[id]/reject/route.ts
//
// POST: transition compilation_drafts.status proposed → rejected. 404/409 for
// missing/wrong-status row.

import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import {
  getDraftById,
  updateDraftStatus,
} from "@/lib/supabase/repositories/compilation-drafts";

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
    return Response.json({ error: `cannot reject from ${draft.status}` }, { status: 409 });
  }
  await updateDraftStatus(supabase, { id, from: "proposed", to: "rejected" });
  return Response.json({ ok: true });
}
