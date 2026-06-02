import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import { encodeSseEvent } from "@/lib/sse";
import { runLongformPipeline } from "@/lib/agents/longform/orchestrator";
import { buildLongformDeps } from "@/lib/agents/longform/deps";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as { topic?: unknown; targetDurationSeconds?: unknown; channelId?: unknown };
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  const channelId = typeof body.channelId === "string" ? body.channelId : "";
  const targetDurationSeconds =
    typeof body.targetDurationSeconds === "number" ? body.targetDurationSeconds : 540;

  if (!topic || !channelId) {
    return new Response(
      JSON.stringify({ error: "topic and channelId are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = getServiceClient();
  const deps = buildLongformDeps(supabase);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runLongformPipeline(
          { topic, targetDurationSeconds, channelId },
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
