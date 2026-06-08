// src/app/api/niches/studio/[draftId]/approve/route.ts
import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase/server";
import { enqueueRenderJob, getLatestRenderJobForVideo } from "@/lib/supabase/repositories/render-jobs";

const ACTIVE_STATUSES = new Set(["pending", "claimed", "running", "succeeded"]);

/** Pure, testable: enqueue exactly one render job for a draft, idempotently. */
export async function approveDraftForRender(
  supabase: SupabaseClient,
  draftId: string,
): Promise<{ enqueued: boolean; jobId: string | null }> {
  const existing = await getLatestRenderJobForVideo(supabase, draftId);
  if (existing && ACTIVE_STATUSES.has(existing.status)) {
    return { enqueued: false, jobId: existing.id };
  }
  const job = await enqueueRenderJob(supabase, {
    jobType: "render_longform",
    payload: { your_video_id: draftId },
    yourVideoId: draftId,
  });
  await supabase
    .from("your_videos")
    .update({ status: "rendering", updated_at: new Date().toISOString() })
    .eq("id", draftId);
  return { enqueued: true, jobId: job.id };
}

export async function POST(_req: Request, ctx: { params: Promise<{ draftId: string }> }): Promise<Response> {
  const { draftId } = await ctx.params;
  const supabase = getServiceClient();
  try {
    const res = await approveDraftForRender(supabase, draftId);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    console.error("approve failed", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
