// src/components/lab/writer-card.tsx
//
// Renders the live-streaming script. Word count + estimated duration
// update as new tokens arrive. Once the final agent_output event arrives,
// the canonical script replaces the assembled text.

"use client";

import type { WriterOutput } from "@/lib/agents/writer";
import type { AgentChipState } from "./pipeline-strip";

export function WriterCard({
  state,
  streamedText,
  output,
}: {
  state: AgentChipState;
  streamedText: string;
  output: WriterOutput | null;
}) {
  const displayed = output ? output.script : streamedText;
  const wordCount = output ? output.word_count : countWords(streamedText);
  const estDuration = output ? output.estimated_duration_seconds : wordCount / 2.5;

  return (
    <article className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <header className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-text-primary">✍️ Writer</h3>
        <StateBadge state={state} />
      </header>

      <div
        className="text-text-primary text-[15px] leading-relaxed font-sans whitespace-pre-wrap min-h-[120px]"
        data-testid="writer-script-area"
      >
        {displayed || <span className="text-[var(--text-muted)] italic">waiting for Strategist…</span>}
        {state === "working" && <span className="inline-block ml-0.5 w-2 h-4 align-text-bottom bg-[var(--accent-electric)] animate-pulse" />}
      </div>

      {wordCount > 0 && (
        <footer className="mt-3 flex items-center gap-4 text-xs font-mono text-[var(--text-muted)]">
          <span>
            <span className="text-[var(--accent-electric)]">{wordCount}</span> words
          </span>
          <span>est ~{estDuration.toFixed(0)}s</span>
        </footer>
      )}
    </article>
  );
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function StateBadge({ state }: { state: AgentChipState }) {
  const txt: Record<AgentChipState, string> = {
    idle: "waiting", thinking: "thinking…", working: "streaming…", done: "✓ done", failed: "✗ failed",
  };
  return <span className="text-xs font-mono text-[var(--text-muted)]">{txt[state]}</span>;
}
