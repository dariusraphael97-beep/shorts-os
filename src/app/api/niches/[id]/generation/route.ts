// src/app/api/niches/[id]/generation/route.ts
//
// GET /api/niches/[id]/generation?topicId=<id>
// Topic-keyed poll for the niche-Generate live state. Resolves the produced
// output across your_videos / compilation_drafts (the jobs row has no
// your_video_id column).

import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import { getProduceVideoJobByTopic } from "@/lib/supabase/repositories/jobs";
import { getLatestYourVideoByTopic } from "@/lib/supabase/repositories/your-videos";
import { getLatestCompilationDraftByTopic } from "@/lib/supabase/repositories/compilation-drafts";
import { resolveGenerationResult } from "@/lib/agents/generation-status";

export const dynamic = "force-dynamic";

export async function GET(req: Request, _ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const topicId = new URL(req.url).searchParams.get("topicId");
  if (!topicId) return Response.json({ error: "topicId required" }, { status: 400 });

  const supabase = getServiceClient();
  const job = await getProduceVideoJobByTopic(supabase, topicId);
  if (!job) return Response.json({ job: null, result: null });

  let yourVideoId: string | null = null;
  let compilationDraftId: string | null = null;
  if (job.status === "succeeded") {
    const yv = await getLatestYourVideoByTopic(supabase, topicId);
    yourVideoId = yv?.id ?? null;
    if (!yourVideoId) {
      const cd = await getLatestCompilationDraftByTopic(supabase, topicId);
      compilationDraftId = cd?.id ?? null;
    }
  }

  return Response.json({
    job: { status: job.status, currentAgent: job.current_agent, progressPct: job.progress_pct },
    result: resolveGenerationResult({ jobStatus: job.status, yourVideoId, compilationDraftId }),
  });
}
