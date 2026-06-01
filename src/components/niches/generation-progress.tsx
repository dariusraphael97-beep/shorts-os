"use client";

import Link from "next/link";
import { PipelineStrip } from "@/components/lab/pipeline-strip";
import { chipStatesFromProgress } from "@/lib/agents/generation-status";
import type { GenerateState } from "./use-generate-pipeline";

export function GenerationProgress({ state, clusterId }: { state: GenerateState; clusterId: string }) {
  if (state.clusterId !== clusterId || state.phase === "idle") return null;
  const chips = chipStatesFromProgress({ currentAgent: state.currentAgent, status: state.status });
  return (
    <div className="mt-3 flex flex-col gap-2">
      <PipelineStrip states={chips} />
      {state.phase === "generating" && (
        <p className="text-xs text-[var(--text-tertiary)]">Generating your draft…</p>
      )}
      {state.phase === "done" && state.result?.kind === "your_video" && (
        <Link href={`/lab/${state.result.videoId}/review`} className="text-xs font-medium text-[var(--accent)] hover:underline">
          Review →
        </Link>
      )}
      {state.phase === "done" && state.result?.kind === "compilation" && (
        <Link href="/clips" className="text-xs font-medium text-[var(--accent)] hover:underline">
          Open Clips →
        </Link>
      )}
    </div>
  );
}
