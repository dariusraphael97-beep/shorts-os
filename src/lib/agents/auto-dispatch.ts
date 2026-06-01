// src/lib/agents/auto-dispatch.ts
//
// Background driver for niche → video auto-dispatch. Drains runPipeline to
// completion (ignoring the SSE-oriented events), then auto-enqueues render_f1
// ONLY when the orchestrator produced a your_videos draft (explainer branch).
// The compilation branch produces a compilation_drafts row that the operator
// continues from /clips, so it is intentionally skipped here. Everything is
// best-effort: this runs inside a Next `after()` callback and must never throw.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StreamEvent } from "./types";
import { runPipeline } from "./orchestrator";
import { getYourVideoById } from "@/lib/supabase/repositories/your-videos";
import { enqueueRenderJob } from "@/lib/supabase/repositories/render-jobs";

type Pipeline = (args: {
  topicId: string;
  supabase: SupabaseClient;
  sourceNicheClusterId?: string | null;
  scriptBrief?: Record<string, unknown> | null;
}) => AsyncGenerator<StreamEvent>;

export async function drainPipeline(args: {
  topicId: string;
  sourceNicheClusterId: string;
  scriptBrief: Record<string, unknown>;
  supabase: SupabaseClient;
  pipeline?: Pipeline;
}): Promise<void> {
  const { topicId, sourceNicheClusterId, scriptBrief, supabase } = args;
  const pipeline = args.pipeline ?? runPipeline;

  let producedId: string | null = null;
  try {
    for await (const ev of pipeline({ topicId, supabase, sourceNicheClusterId, scriptBrief })) {
      if (ev.type === "job_completed") producedId = ev.data.videoId;
    }
  } catch (err) {
    console.error("drainPipeline: pipeline threw (non-fatal)", err);
    return;
  }
  if (!producedId) return;

  try {
    const yv = await getYourVideoById(supabase, producedId);
    if (!yv) {
      console.info(`drainPipeline: ${producedId} is a compilation draft — skipping render_f1 (continues in /clips)`);
      return;
    }
    if (yv.status !== "draft") return;

    const { error, count } = await supabase
      .from("your_videos")
      .update({ status: "rendering", updated_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", producedId)
      .eq("status", "draft");
    if (error || !count) return;

    await enqueueRenderJob(supabase, {
      jobType: "render_f1",
      payload: { your_video_id: producedId },
      yourVideoId: producedId,
    });
  } catch (err) {
    console.error("drainPipeline: auto-render enqueue failed (non-fatal)", err);
  }
}
