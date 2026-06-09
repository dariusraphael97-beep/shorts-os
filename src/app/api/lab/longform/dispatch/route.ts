import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import { encodeSseEvent } from "@/lib/sse";
import { runLongformPipeline } from "@/lib/agents/longform/orchestrator";
import { buildLongformDeps } from "@/lib/agents/longform/deps";
import { getDefaultChannel } from "@/lib/supabase/repositories/channels";
import { PRESET_IDS, type PresetId } from "@/lib/longform/style-presets";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as { topic?: unknown; targetDurationSeconds?: unknown; channelId?: unknown; presetId?: unknown; planOnly?: unknown; trustedFacts?: unknown };
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  const targetDurationSeconds =
    typeof body.targetDurationSeconds === "number" ? body.targetDurationSeconds : 540;
  // Optional operator override; "auto" / anything unrecognized falls through to the style-picker LLM.
  const presetId: PresetId | undefined =
    typeof body.presetId === "string" && (PRESET_IDS as readonly string[]).includes(body.presetId)
      ? (body.presetId as PresetId)
      : undefined;
  // When true, plan + persist the draft but do NOT enqueue a render — preview before spending credits.
  const planOnly = body.planOnly === true;
  // Operator/expert ground-truth facts that override web sources; accept only a clean string[] .
  const trustedFacts = Array.isArray(body.trustedFacts) && body.trustedFacts.every((f) => typeof f === "string")
    ? (body.trustedFacts as string[])
    : undefined;

  if (!topic) {
    return new Response(
      JSON.stringify({ error: "topic is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = getServiceClient();
  // channelId is optional — fall back to the default channel (mirrors the niches studio flow).
  const channelId =
    typeof body.channelId === "string" && body.channelId
      ? body.channelId
      : (await getDefaultChannel(supabase)).id;
  const deps = buildLongformDeps(supabase);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runLongformPipeline(
          { topic, targetDurationSeconds, channelId, presetId, planOnly, trustedFacts },
          deps,
        )) {
          controller.enqueue(encodeSseEvent(event));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(
          encodeSseEvent({ type: "job_failed", data: { agent: "writer", error: message } }),
        );
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
