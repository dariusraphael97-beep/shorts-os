// src/app/api/niches/studio/plan/route.ts
import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import { encodeSseEvent } from "@/lib/sse";
import { runLongformPipeline, type LongformPipelineArgs } from "@/lib/agents/longform/orchestrator";
import { buildLongformDeps } from "@/lib/agents/longform/deps";
import { getClusterById } from "@/lib/supabase/repositories/niche-clusters";
import { getDefaultChannel } from "@/lib/supabase/repositories/channels";
import { clusterToLongformInput } from "@/lib/niches/longform-topic";
import { recordNicheAction } from "@/lib/supabase/repositories/niche-actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Pure, testable: cluster + channel + optional topic override → planOnly pipeline args. */
export function buildPlanArgs(
  cluster: { canonical_topic: string; production_fit: string; winnerDurationSeconds?: number | null },
  channelId: string,
  topicOverride: string | undefined,
  sourceNicheClusterId?: string,
): LongformPipelineArgs {
  const base = clusterToLongformInput(cluster);
  return {
    topic: topicOverride?.trim() || base.topic,
    targetDurationSeconds: base.targetDurationSeconds,
    channelId,
    planOnly: true,
    sourceNicheClusterId,
  };
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as { clusterId?: unknown; topic?: unknown };
  const clusterId = typeof body.clusterId === "string" ? body.clusterId : "";
  const topicOverride = typeof body.topic === "string" ? body.topic : undefined;
  if (!clusterId) {
    return new Response(JSON.stringify({ error: "clusterId is required" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = getServiceClient();
  const cluster = await getClusterById(supabase, clusterId);
  if (!cluster) {
    return new Response(JSON.stringify({ error: "cluster_not_found" }), {
      status: 404, headers: { "Content-Type": "application/json" },
    });
  }

  let args: LongformPipelineArgs;
  try {
    const channel = await getDefaultChannel(supabase);
    args = buildPlanArgs(
      {
        canonical_topic: cluster.canonical_topic,
        production_fit: cluster.production_fit ?? "manual_only",
        winnerDurationSeconds: cluster.explainability_top_signals?.winnerDurationSeconds,
      },
      channel.id,
      topicOverride,
      clusterId,
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 422, headers: { "Content-Type": "application/json" },
    });
  }

  const deps = buildLongformDeps(supabase);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runLongformPipeline(args, deps)) {
          if (event.type === "job_completed") {
            // Best-effort: restores the cluster → outcome link. A logging failure must not abort the stream.
            await recordNicheAction(supabase, { nicheClusterId: clusterId, action: "generated_from" }).catch(() => {});
          }
          controller.enqueue(encodeSseEvent(event));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(encodeSseEvent({ type: "job_failed", data: { agent: "writer", error: message } }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
