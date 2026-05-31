// src/components/lab/writer-card.tsx
//
// Renders the live-streaming script. Word count + estimated duration
// update as new tokens arrive. Once the final agent_output event arrives,
// the canonical script replaces the assembled text.

"use client";

import type { WriterOutput } from "@/lib/agents/writer";
import type { AgentChipState } from "./pipeline-strip";
import { AgentCardShell, FieldLabel } from "./agent-card-shell";

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
    <AgentCardShell agent="writer" state={state}>
      <FieldLabel>Script</FieldLabel>
      <div
        className="mt-2 min-h-[120px] whitespace-pre-wrap rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-3 text-[15px] leading-relaxed text-[var(--text-primary)]"
        data-testid="writer-script-area"
      >
        {displayed || (
          <span className="text-sm italic text-[var(--text-tertiary)]">
            Waiting for the Strategist&hellip;
          </span>
        )}
        {state === "working" && (
          <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-[var(--accent)] align-text-bottom" />
        )}
      </div>

      {wordCount > 0 && (
        <footer className="mt-3 flex items-center gap-4 font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
          <span>
            <span className="text-[var(--accent)]">{wordCount}</span> words
          </span>
          <span>est ~{estDuration.toFixed(0)}s</span>
        </footer>
      )}
    </AgentCardShell>
  );
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
