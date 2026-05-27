// src/app/api/clips/candidates/[id]/edit/route.ts
//
// POST: replace clip_refs / music_track_id on a proposed compilation draft.
// 400 if body is malformed, 404 if draft missing, 409 if status !== proposed.

import "server-only";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import {
  getDraftById,
  updateDraftClipRefs,
} from "@/lib/supabase/repositories/compilation-drafts";

const Body = z.object({
  clip_refs: z
    .array(
      z.object({
        clip_id: z.string().uuid(),
        start_sec: z.number().min(0),
        end_sec: z.number().min(0),
        label: z.string().min(1).max(80),
        order: z.number().int().min(1).max(5),
      }),
    )
    .length(5),
  music_track_id: z.string().uuid().nullable().optional(),
});

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "invalid_body" },
      { status: 400 },
    );
  }
  const supabase = getServiceClient();
  const draft = await getDraftById(supabase, id);
  if (!draft) return Response.json({ error: "draft not found" }, { status: 404 });
  if (draft.status !== "proposed") {
    return Response.json({ error: `cannot edit from ${draft.status}` }, { status: 409 });
  }
  await updateDraftClipRefs(supabase, {
    id,
    clip_refs: parsed.clip_refs,
    music_track_id: parsed.music_track_id,
  });
  return Response.json({ ok: true });
}
