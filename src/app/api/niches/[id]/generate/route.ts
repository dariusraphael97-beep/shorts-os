import { NextResponse } from "next/server";
import { serializeError } from "@/lib/scrapers/shared";
import { getServiceClient } from "@/lib/supabase/server";
import { getClusterById } from "@/lib/supabase/repositories/niche-clusters";
import { clusterToBrief } from "@/lib/niches/cluster-brief";
import { insertManualTopic } from "@/lib/supabase/repositories/topic-queue";
import { getDefaultChannel } from "@/lib/supabase/repositories/channels";
import { createVideoDraft } from "@/lib/supabase/repositories/your-videos";
import { recordNicheAction } from "@/lib/supabase/repositories/niche-actions";

export const dynamic = "force-dynamic";

// POST /api/niches/[id]/generate
//
// Seeds the production pipeline from a `native` niche cluster:
//   1. cluster → brief (throws 422 for non-native; the UI only shows Generate on native,
//      this is the server-side guard).
//   2. insert a `manual` topic_queue row (state 'reviewed', clusterId in raw_payload).
//   3. create a `your_videos` draft stub linked via `source_niche_cluster_id` (+ script_brief).
//      The script field carries the brief summary as a seed; the operator opens the draft in
//      the Lab so the agent pipeline (Strategist → Writer → Voice Coach → Director) refines it.
//      Linking the cluster id here is what lets the +7d prediction-close cron measure outcomes.
//   4. log a `generated_from` niche action.
//
// NOTE (Sub-phase E): full auto-dispatch to the orchestrator is intentionally NOT wired from
// here — `/api/lab/dispatch` is an SSE streaming endpoint meant for the Lab UI, not server-to-
// server fire-and-forget. Dispatch stays operator-driven in the Lab. Voice/duration use the
// default channel's settings as placeholders. Revisit when shell-unification lands.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = getServiceClient();

  const cluster = await getClusterById(supabase, id);
  if (!cluster) return NextResponse.json({ ok: false, error: "cluster_not_found" }, { status: 404 });

  let brief;
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

  try {
    const topic = await insertManualTopic(supabase, {
      title: brief.title,
      summary: brief.summary,
      rawPayload: brief.rawPayload,
      state: "reviewed",
    });

    const channel = await getDefaultChannel(supabase);
    const draft = await createVideoDraft(supabase, {
      channelId: channel.id,
      topicQueueId: topic.id,
      title: cluster.canonical_topic,
      script: brief.summary,
      voiceProvider: channel.default_tts_provider ?? "cartesia",
      voiceId: channel.default_voice_id ?? "",
      visualTreatment: "ai_voiceover",
      durationSeconds: 45,
      captionProps: {},
      sourceNicheClusterId: cluster.id,
      scriptBrief: brief.rawPayload,
    });

    await recordNicheAction(supabase, { nicheClusterId: cluster.id, action: "generated_from" });

    return NextResponse.json({ ok: true, topicId: topic.id, draftId: draft.id, dispatched: false });
  } catch (e) {
    console.error("niche generate failed", e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
