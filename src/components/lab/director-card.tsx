"use client";

import type { DirectorOutput } from "@/lib/agents/director";
import type { AgentChipState } from "./pipeline-strip";

export function DirectorCard({
  state,
  output,
}: {
  state: AgentChipState;
  output: DirectorOutput | null;
}) {
  return (
    <article className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <header className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-text-primary">🎬 Director</h3>
        <StateBadge state={state} />
      </header>
      {output ? (
        <div className="space-y-3 text-sm text-text-secondary">
          <p>
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wide">Treatment:</span>{" "}
            <span className="text-text-primary font-mono">{output.visual_treatment}</span>{" "}
            <span className="text-[var(--text-muted)] text-xs">· music: {output.music_mood}</span>
          </p>
          <div className="rounded border border-[var(--border-subtle)] overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                <tr>
                  <th className="text-left px-2 py-1 font-mono">#</th>
                  <th className="text-left px-2 py-1 font-mono">b-roll query</th>
                  <th className="text-left px-2 py-1 font-mono">dur</th>
                  <th className="text-left px-2 py-1 font-mono">segment</th>
                </tr>
              </thead>
              <tbody>
                {output.shot_list.map((shot, i) => (
                  <tr key={i} className="border-t border-[var(--border-subtle)]">
                    <td className="px-2 py-1 font-mono text-[var(--text-muted)]">{i + 1}</td>
                    <td className="px-2 py-1 font-mono text-[var(--accent-electric)]">{shot.broll_search_query}</td>
                    <td className="px-2 py-1 font-mono text-[var(--text-muted)]">{shot.duration_seconds}s</td>
                    <td className="px-2 py-1 text-text-primary truncate max-w-xs" title={shot.segment_text}>
                      {shot.segment_text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
      <div className="h-20 w-full rounded bg-[var(--bg-elevated)] animate-pulse" />
    </div>
  );
}
