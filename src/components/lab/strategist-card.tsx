"use client";

import type { StrategistOutput } from "@/lib/agents/strategist";
import type { AgentChipState } from "./pipeline-strip";

export function StrategistCard({
  state,
  output,
}: {
  state: AgentChipState;
  output: StrategistOutput | null;
}) {
  return (
    <article className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <header className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-text-primary">🧭 Strategist</h3>
        <StateBadge state={state} />
      </header>
      {output ? (
        <div className="space-y-2 text-sm text-text-secondary">
          <p>
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wide">Dispatch:</span>{" "}
            <span className="text-text-primary">{output.dispatch_directive}</span>
          </p>
          <p>
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wide">Hints:</span>{" "}
            {output.format_hints.map((h, i) => (
              <span
                key={i}
                className="inline-block mr-1 px-2 py-0.5 rounded bg-[var(--bg-elevated)] text-xs font-mono"
              >
                {h}
              </span>
            ))}
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
    idle: "waiting",
    thinking: "thinking…",
    working: "working…",
    done: "✓ done",
    failed: "✗ failed",
  };
  return <span className="text-xs font-mono text-[var(--text-muted)]">{txt[state]}</span>;
}

function Skeleton() {
  return (
    <div className="space-y-2">
      <div className="h-3 w-3/4 rounded bg-[var(--bg-elevated)] animate-pulse" />
      <div className="h-3 w-1/2 rounded bg-[var(--bg-elevated)] animate-pulse" />
    </div>
  );
}
