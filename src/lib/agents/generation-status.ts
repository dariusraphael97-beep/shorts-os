// src/lib/agents/generation-status.ts
//
// Pure helpers for the niche-Generate live poll. No IO.

import type { AgentId } from "./types";
import type { JobStatus } from "@/lib/supabase/repositories/jobs";
import type { AgentChipState } from "@/components/lab/pipeline-strip";

export type GenerationResult =
  | { kind: "your_video"; videoId: string }
  | { kind: "compilation"; draftId: string }
  | null;

export function resolveGenerationResult(args: {
  jobStatus: JobStatus | null;
  yourVideoId: string | null;
  compilationDraftId: string | null;
}): GenerationResult {
  if (args.jobStatus !== "succeeded") return null;
  if (args.yourVideoId) return { kind: "your_video", videoId: args.yourVideoId };
  if (args.compilationDraftId) return { kind: "compilation", draftId: args.compilationDraftId };
  return null;
}

const ALL_AGENTS: AgentId[] = ["strategist", "writer", "voice_coach", "director", "composer"];
const STRIP_ORDER: AgentId[] = ["strategist", "writer", "voice_coach", "director"];

export function chipStatesFromProgress(args: {
  currentAgent: string | null;
  status: JobStatus | null;
}): Record<AgentId, AgentChipState> {
  const out = Object.fromEntries(ALL_AGENTS.map((a) => [a, "idle"])) as Record<AgentId, AgentChipState>;
  const done = args.status === "succeeded";
  const failed = args.status === "failed";
  const idx = args.currentAgent ? STRIP_ORDER.indexOf(args.currentAgent as AgentId) : -1;
  // currentAgent set but not a strip agent (e.g. "composer" on the compilation
  // branch) → the run moved past strategist down a non-explainer path. Show
  // strategist done, the rest idle (writer/voice_coach/director won't run).
  const pastStrip = idx < 0 && args.currentAgent !== null;

  STRIP_ORDER.forEach((id, i) => {
    if (done) { out[id] = "done"; return; }
    if (pastStrip) { out[id] = i === 0 ? "done" : "idle"; return; }
    if (failed) {
      if (idx < 0) { out[id] = i === 0 ? "failed" : "idle"; return; }
      out[id] = i < idx ? "done" : i === idx ? "failed" : "idle";
      return;
    }
    if (idx < 0) { out[id] = i === 0 ? "working" : "idle"; return; }
    out[id] = i < idx ? "done" : i === idx ? "working" : "idle";
  });
  return out;
}
