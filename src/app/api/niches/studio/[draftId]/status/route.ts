// src/app/api/niches/studio/[draftId]/status/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getYourVideoById } from "@/lib/supabase/repositories/your-videos";
import { getLatestRenderJobForVideo } from "@/lib/supabase/repositories/render-jobs";
import { estimateRender } from "@/lib/longform/estimate";

export const dynamic = "force-dynamic";

export type StudioPhase = "planning" | "checkpoint" | "rendering" | "done" | "error";

const WORKER_STALE_MS = 60_000;

/** Pure: derive the cockpit phase from the draft status + the latest render job. */
export function deriveStudioPhase(
  draft: { status: string; longform_plan: unknown },
  job: { status: string } | null,
): StudioPhase {
  if (draft.status === "failed" || job?.status === "failed") return "error";
  if (draft.status === "rendered") return "done";
  if (draft.status === "rendering") return "rendering";
  if (draft.status === "draft" && draft.longform_plan) return "checkpoint";
  return "planning";
}

/** Pure: a render job that has sat pending past the threshold with no claim → no worker running. */
export function isWorkerStale(
  job: { status: string; claimed_at: string | null; created_at: string },
  thresholdMs: number,
): boolean {
  if (job.status !== "pending" || job.claimed_at) return false;
  return Date.now() - new Date(job.created_at).getTime() > thresholdMs;
}

export async function GET(_req: Request, ctx: { params: Promise<{ draftId: string }> }): Promise<Response> {
  const { draftId } = await ctx.params;
  const supabase = getServiceClient();
  const draft = await getYourVideoById(supabase, draftId);
  if (!draft) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const job = await getLatestRenderJobForVideo(supabase, draftId);
  const phase = deriveStudioPhase(draft, job);

  const plan = draft.longform_plan as Record<string, unknown> | null;
  const beatCount = plan ? countBeats(plan) : 0;
  const model = plan ? String((plan.styleBible as Record<string, unknown> | undefined)?.model ?? "") : "";
  const estimate = beatCount > 0 && model ? estimateRender({ beatCount, model }) : null;

  return NextResponse.json({
    ok: true,
    phase,
    draft: {
      id: draft.id,
      title: draft.title,
      status: draft.status,
      renderArtifactUrl: draft.render_artifact_url,
      durationSeconds: draft.duration_seconds,
      sourceNicheClusterId: draft.source_niche_cluster_id,
      plan,
    },
    estimate,
    job: job
      ? { status: job.status, attempts: job.attempts, lastError: job.last_error, workerStale: isWorkerStale(job, WORKER_STALE_MS) }
      : null,
  });
}

function countBeats(plan: Record<string, unknown>): number {
  const chapters = (plan.chapters as Array<{ beats?: unknown[] }> | undefined) ?? [];
  return chapters.reduce((n, c) => n + (Array.isArray(c.beats) ? c.beats.length : 0), 0);
}
