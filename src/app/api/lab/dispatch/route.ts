// src/app/api/lab/dispatch/route.ts
//
// POST /api/lab/dispatch
//   Body: { topicId: string }
//   Response: text/event-stream of StreamEvents (job_started, agent_state,
//     writer_chunk, agent_output, agent_done, job_completed | job_failed).
//
// Opens a single long-running Fluid Compute invocation. The orchestrator
// runs Strategist → Writer → Voice Coach → Director, with the orchestrator's
// async-generator events serialized to SSE on the fly.

import "server-only";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { runPipeline, ConcurrentRunError } from "@/lib/agents/orchestrator";
import { encodeSseEvent } from "@/lib/sse";
import { getActiveProduceVideoJob } from "@/lib/supabase/repositories/jobs";

export const dynamic = "force-dynamic";   // never cache
export const maxDuration = 300;            // Fluid Compute timeout (seconds)

const BodySchema = z.object({ topicId: z.string().uuid() });

export async function POST(req: Request): Promise<Response> {
  let topicId: string;
  try {
    const json = await req.json();
    topicId = BodySchema.parse(json).topicId;
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "invalid body" },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();

  // Pre-flight concurrency check so we return 409 BEFORE opening the stream.
  // The orchestrator does its own check inside the generator as a safety net.
  try {
    const active = await getActiveProduceVideoJob(supabase);
    if (active) {
      return Response.json(
        { error: "A produce_video job is already running.", activeJobId: active.id },
        { status: 409 },
      );
    }
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "preflight failed" },
      { status: 500 },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runPipeline({ topicId, supabase })) {
          controller.enqueue(encodeSseEvent(event));
        }
      } catch (err) {
        if (err instanceof ConcurrentRunError) {
          controller.enqueue(
            encodeSseEvent({
              type: "job_failed",
              data: { agent: "strategist", error: err.message },
            }),
          );
        } else {
          const message = err instanceof Error ? err.message : String(err);
          controller.enqueue(
            encodeSseEvent({
              type: "job_failed",
              data: { agent: "strategist", error: `orchestrator error: ${message}` },
            }),
          );
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
