"use client";
import type { AgentId } from "@/lib/agents/types";

export type ChipState = "idle" | "working" | "done" | "failed";

const ORDER: { id: AgentId; emoji: string; label: string }[] = [
  { id: "writer", emoji: "✍️", label: "Writer" },
  { id: "style_picker", emoji: "🎨", label: "Style" },
  { id: "beat_planner", emoji: "🎞️", label: "Beats" },
  { id: "voice_coach", emoji: "🎙️", label: "Voice" },
];

const STATE_STYLES: Record<ChipState, string> = {
  idle: "bg-elevated text-text-muted border-subtle",
  working: "bg-elevated text-accent-electric border-accent-electric/40 shadow-[0_0_12px_rgba(0,255,136,0.25)] animate-pulse",
  done: "bg-elevated text-accent-electric border-accent-electric/40",
  failed: "bg-elevated text-accent-red border-accent-red/60",
};

export function LongformPipelineStrip({ states }: { states: Record<AgentId, ChipState> }) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-surface border border-subtle sticky top-0 z-10">
      {ORDER.map((a, idx) => (
        <span key={a.id} className="flex items-center gap-2">
          <span
            data-testid={`longform-chip-${a.id}`}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition ${STATE_STYLES[states[a.id] ?? "idle"]}`}
          >
            <span aria-hidden>{a.emoji}</span>
            <span>{a.label}</span>
          </span>
          {idx < ORDER.length - 1 && <span className="text-text-muted text-xs">━━</span>}
        </span>
      ))}
    </div>
  );
}
