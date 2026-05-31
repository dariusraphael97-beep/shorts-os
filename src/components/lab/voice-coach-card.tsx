"use client";

import type { VoiceCoachOutput } from "@/lib/agents/voice-coach";
import type { AgentChipState } from "./pipeline-strip";
import { VOICE_POOL } from "@/lib/agents/constants";
import {
  AgentCardShell,
  CardSkeleton,
  FieldLabel,
} from "./agent-card-shell";

export function VoiceCoachCard({
  state,
  output,
}: {
  state: AgentChipState;
  output: VoiceCoachOutput | null;
}) {
  const entry = output ? VOICE_POOL.find((v) => v.id === output.voice_id) : null;
  return (
    <AgentCardShell agent="voice_coach" state={state}>
      {output && entry ? (
        <div className="space-y-3 text-sm text-[var(--text-secondary)]">
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-[var(--text-primary)]">{entry.id}</span>
            <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
              {entry.provider}
            </span>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">{entry.description}</p>
          <div className="flex flex-wrap gap-1.5">
            <Stat label="speed" value={output.speed.toFixed(2)} />
            <Stat label="stability" value={output.stability.toFixed(2)} />
          </div>
          <p className="border-t border-[var(--border-subtle)] pt-3 text-xs italic text-[var(--text-tertiary)]">
            {output.rationale}
          </p>
        </div>
      ) : (
        <CardSkeleton lines={2} />
      )}
    </AgentCardShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[11px] tabular-nums">
      <FieldLabel>{label}</FieldLabel>
      <span className="text-[var(--text-primary)]">{value}</span>
    </span>
  );
}
