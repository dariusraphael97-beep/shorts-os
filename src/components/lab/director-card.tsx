"use client";

import type { DirectorOutput } from "@/lib/agents/director";
import type { AgentChipState } from "./pipeline-strip";
import {
  AgentCardShell,
  CardSkeleton,
  FieldLabel,
} from "./agent-card-shell";

export function DirectorCard({
  state,
  output,
}: {
  state: AgentChipState;
  output: DirectorOutput | null;
}) {
  return (
    <AgentCardShell agent="director" state={state}>
      {output ? (
        <div className="space-y-3 text-sm text-[var(--text-secondary)]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[11px]">
              <FieldLabel>treatment</FieldLabel>
              <span className="text-[var(--text-primary)]">{output.visual_treatment}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[11px]">
              <FieldLabel>music</FieldLabel>
              <span className="text-[var(--text-primary)]">{output.music_mood}</span>
            </span>
          </div>

          <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)]">
            <table className="w-full text-xs">
              <thead className="bg-[var(--surface-2)] text-[var(--text-tertiary)]">
                <tr>
                  <th className="px-2.5 py-1.5 text-left font-mono text-[10px] font-medium uppercase tracking-wider">#</th>
                  <th className="px-2.5 py-1.5 text-left font-mono text-[10px] font-medium uppercase tracking-wider">b-roll query</th>
                  <th className="px-2.5 py-1.5 text-left font-mono text-[10px] font-medium uppercase tracking-wider">dur</th>
                  <th className="px-2.5 py-1.5 text-left font-mono text-[10px] font-medium uppercase tracking-wider">segment</th>
                </tr>
              </thead>
              <tbody>
                {output.shot_list.map((shot, i) => (
                  <tr key={i} className="border-t border-[var(--border-subtle)]">
                    <td className="px-2.5 py-1.5 font-mono tabular-nums text-[var(--text-tertiary)]">{i + 1}</td>
                    <td className="px-2.5 py-1.5 font-mono text-[var(--accent)]">{shot.broll_search_query}</td>
                    <td className="px-2.5 py-1.5 font-mono tabular-nums text-[var(--text-tertiary)]">{shot.duration_seconds}s</td>
                    <td
                      className="max-w-xs truncate px-2.5 py-1.5 text-[var(--text-primary)]"
                      title={shot.segment_text}
                    >
                      {shot.segment_text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="border-t border-[var(--border-subtle)] pt-3 text-xs italic text-[var(--text-tertiary)]">
            {output.rationale}
          </p>
        </div>
      ) : (
        <CardSkeleton lines={3} />
      )}
    </AgentCardShell>
  );
}
