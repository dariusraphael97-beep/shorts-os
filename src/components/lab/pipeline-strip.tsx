// src/components/lab/pipeline-strip.tsx
//
// 4 agent chips with state badges. The Active Run pane drives the state
// via props; this component is purely presentational.

"use client";

import type { AgentId, AgentState } from "@/lib/agents/types";

export type AgentChipState = "idle" | "thinking" | "working" | "done" | "failed";

export type AgentChip = {
  id: AgentId;
  label: string;
  emoji: string;
  state: AgentChipState;
};

const AGENT_BASE: Record<AgentId, { label: string; emoji: string }> = {
  strategist: { label: "Strategist", emoji: "🧭" },
  writer:     { label: "Writer",     emoji: "✍️" },
  voice_coach:{ label: "Voice Coach",emoji: "🎙️" },
  director:   { label: "Director",   emoji: "🎬" },
  composer:   { label: "Composer",   emoji: "🎼" },
};

const STATE_STYLES: Record<AgentChipState, string> = {
  idle:     "bg-elevated text-text-muted border-subtle",
  thinking: "bg-elevated text-accent-amber border-accent-amber/40 animate-pulse",
  working:  "bg-elevated text-accent-electric border-accent-electric/40 shadow-[0_0_12px_rgba(0,255,136,0.25)]",
  done:     "bg-elevated text-accent-electric border-accent-electric/40",
  failed:   "bg-elevated text-accent-red border-accent-red/60",
};

export function PipelineStrip({ states }: { states: Record<AgentId, AgentChipState> }) {
  const order: AgentId[] = ["strategist", "writer", "voice_coach", "director"];

  return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-surface border border-subtle sticky top-0 z-10">
      {order.map((id, idx) => {
        const base = AGENT_BASE[id];
        const s = states[id];
        return (
          <span key={id} className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition ${STATE_STYLES[s]}`}
              data-testid={`pipeline-chip-${id}`}
            >
              <span aria-hidden>{base.emoji}</span>
              <span>{base.label}</span>
            </span>
            {idx < order.length - 1 && (
              <span className="text-text-muted text-xs">━━</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

// Convenience: derive a state map from raw AgentState (database value) + a "done" flag.
export function deriveChipState(state: AgentState | null, hasOutput: boolean, failed: boolean): AgentChipState {
  if (failed) return "failed";
  if (hasOutput) return "done";
  if (state === "thinking") return "thinking";
  if (state === "working") return "working";
  return "idle";
}
