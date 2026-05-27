// src/app/api/clips/rendered/[id]/reject/route.ts
//
// POST: discard a rendered compilation_draft. Transitions rendered → failed.
// 404 if draft missing, 409 if status !== rendered.

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
  if (draft.status !== "rendered") {
    return Response.json({ error: `cannot reject from ${draft.status}` }, { status: 409 });
  }
  await updateDraftStatus(supabase, { id, from: "rendered", to: "failed" });
  return Response.json({ ok: true });
}
