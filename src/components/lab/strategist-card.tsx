"use client";

import type { StrategistOutput } from "@/lib/agents/strategist";
import type { AgentChipState } from "./pipeline-strip";
import {
  AgentCardShell,
  CardSkeleton,
  FieldLabel,
} from "./agent-card-shell";

export function StrategistCard({
  state,
  output,
}: {
  state: AgentChipState;
  output: StrategistOutput | null;
}) {
  return (
    <AgentCardShell agent="strategist" state={state}>
      {output ? (
        <div className="space-y-3 text-sm text-[var(--text-secondary)]">
          <div className="space-y-1">
            <FieldLabel>Dispatch</FieldLabel>
            <p className="text-[var(--text-primary)]">{output.dispatch_directive}</p>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Format hints</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {output.format_hints.map((h, i) => (
                <span
                  key={i}
                  className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]"
                >
                  {h}
                </span>
              ))}
            </div>
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
