"use client";

import type { VoiceCoachOutput } from "@/lib/agents/voice-coach";
import type { AgentChipState } from "./pipeline-strip";
import { VOICE_POOL } from "@/lib/agents/constants";

export function VoiceCoachCard({
  state,
  output,
}: {
  state: AgentChipState;
  output: VoiceCoachOutput | null;
}) {
  const entry = output ? VOICE_POOL.find((v) => v.id === output.voice_id) : null;
  return (
    <article className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <header className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-text-primary">🎙️ Voice Coach</h3>
        <StateBadge state={state} />
      </header>
      {output && entry ? (
        <div className="space-y-2 text-sm text-text-secondary">
          <p>
            <span className="text-text-primary font-medium">{entry.id}</span>{" "}
            <span className="text-[var(--text-muted)] text-xs">· {entry.provider}</span>
          </p>
          <p className="text-[var(--text-muted)] text-xs">{entry.description}</p>
          <p className="text-xs font-mono text-[var(--text-muted)]">
            speed: {output.speed.toFixed(2)} · stability: {output.stability.toFixed(2)}
          </p>
          <p className="text-[var(--text-muted)] italic text-xs">{output.rationale}</p>
        </div>
      ) : (
        <Skeleton />
      )}
    </article>
  );
}

function StateBadge({ state }: { state: AgentChipState }) {
  const txt: Record<AgentChipState, string> = {
    idle: "waiting", thinking: "thinking…", working: "working…", done: "✓ done", failed: "✗ failed",
  };
  return <span className="text-xs font-mono text-[var(--text-muted)]">{txt[state]}</span>;
}

function Skeleton() {
  return (
    <div className="space-y-2">
      <div className="h-3 w-1/2 rounded bg-[var(--bg-elevated)] animate-pulse" />
      <div className="h-3 w-2/3 rounded bg-[var(--bg-elevated)] animate-pulse" />
    </div>
  );
}
