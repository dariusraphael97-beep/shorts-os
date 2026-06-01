import { NextResponse, after } from "next/server";
import { serializeError } from "@/lib/scrapers/shared";
import { getServiceClient } from "@/lib/supabase/server";
import { getClusterById } from "@/lib/supabase/repositories/niche-clusters";
import { clusterToBrief, type TopicBrief } from "@/lib/niches/cluster-brief";
import { insertManualTopic } from "@/lib/supabase/repositories/topic-queue";
import { recordNicheAction } from "@/lib/supabase/repositories/niche-actions";
import { getActiveProduceVideoJob } from "@/lib/supabase/repositories/jobs";
import { drainPipeline } from "@/lib/agents/auto-dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // the after() pipeline runs up to this long

// POST /api/niches/[id]/generate
//
// Auto-dispatch: cluster → brief → manual topic, then drive the orchestrator
// end-to-end in a background `after()` callback. On success drainPipeline
// auto-enqueues render_f1 (your_videos) so the video lands at the review page.
// Returns immediately; the UI polls GET /api/niches/[id]/generation?topicId=.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = getServiceClient();

  const cluster = await getClusterById(supabase, id);
  if (!cluster) return NextResponse.json({ ok: false, error: "cluster_not_found" }, { status: 404 });

  let brief: TopicBrief;
  try {
    brief = clusterToBrief({
      id: cluster.id,
      canonical_topic: cluster.canonical_topic,
      format_label: cluster.format_label,
      audience_signal: cluster.audience_signal,
      example_video_ids: cluster.example_video_ids,
      production_fit: cluster.production_fit ?? "manual_only",
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 422 });
  }

  // One generation at a time (Sub-phase H decision: reject the 2nd).
  const active = await getActiveProduceVideoJob(supabase);
  if (active) {
    return NextResponse.json({ ok: false, error: "generation_in_progress", activeJobId: active.id }, { status: 409 });
  }

  try {
    const topic = await insertManualTopic(supabase, {
      title: brief.title,
      summary: brief.summary,
      rawPayload: brief.rawPayload,
      state: "reviewed",
    });
    await recordNicheAction(supabase, { nicheClusterId: cluster.id, action: "generated_from" });

    // Drive the orchestrator after the response is sent (bounded by maxDuration).
    after(() =>
      drainPipeline({
        topicId: topic.id,
        sourceNicheClusterId: cluster.id,
        scriptBrief: brief.rawPayload,
        supabase,
      }),
    );

    return NextResponse.json({ ok: true, dispatched: true, topicId: topic.id });
  } catch (e) {
    console.error("niche generate failed", e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
