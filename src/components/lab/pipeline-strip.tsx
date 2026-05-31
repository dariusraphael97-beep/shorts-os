// src/components/lab/pipeline-strip.tsx
//
// 4 agent chips with state badges. The Active Run pane drives the state
// via props; this component is purely presentational.

"use client";

import { Check, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { AgentId, AgentState } from "@/lib/agents/types";
import { AGENT_ICON, AGENT_LABEL } from "./agent-icons";
import { cn } from "@/lib/utils";

export type AgentChipState = "idle" | "thinking" | "working" | "done" | "failed";

// Tailwind classes per chip state, expressed entirely in design-system tokens.
const STATE_STYLES: Record<AgentChipState, string> = {
  idle: "border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-tertiary)]",
  thinking:
    "border-[var(--warning)]/40 bg-[var(--surface-2)] text-[var(--warning)]",
  working:
    "border-[var(--accent)]/50 bg-[var(--accent-muted)] text-[var(--accent)] shadow-[0_0_0_1px_var(--accent-muted)]",
  done: "border-[var(--success)]/40 bg-[var(--surface-2)] text-[var(--success)]",
  failed: "border-[var(--danger)]/50 bg-[var(--surface-2)] text-[var(--danger)]",
};

// Connector fill: solid accent once the agent before it has completed.
const CONNECTOR_DONE = "done";

export function PipelineStrip({ states }: { states: Record<AgentId, AgentChipState> }) {
  const order: AgentId[] = ["strategist", "writer", "voice_coach", "director"];
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="flex items-center gap-0 overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-3 shadow-[var(--elev-1)]">
      {order.map((id, idx) => {
        const Icon = AGENT_ICON[id];
        const s = states[id];
        const isLast = idx === order.length - 1;
        const nextDone = !isLast && states[order[idx + 1]] === CONNECTOR_DONE;
        const selfDone = s === CONNECTOR_DONE;

        return (
          <div key={id} className="flex shrink-0 items-center">
            <motion.span
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-[var(--duration-quick)]",
                STATE_STYLES[s],
              )}
              data-testid={`pipeline-chip-${id}`}
              animate={
                prefersReducedMotion
                  ? undefined
                  : s === "working" || s === "thinking"
                    ? { opacity: [1, 0.6, 1] }
                    : { opacity: 1 }
              }
              transition={
                s === "working" || s === "thinking"
                  ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.2 }
              }
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span>{AGENT_LABEL[id]}</span>
              {s === "done" && <Check className="h-3 w-3" aria-hidden />}
              {s === "failed" && <X className="h-3 w-3" aria-hidden />}
            </motion.span>

            {!isLast && (
              <span className="mx-1.5 flex w-6 items-center" aria-hidden>
                <span className="h-px w-full bg-[var(--border-subtle)]">
                  <span
                    className={cn(
                      "block h-px origin-left transition-transform duration-[var(--duration-smooth)]",
                      selfDone || nextDone
                        ? "scale-x-100 bg-[var(--accent)]"
                        : "scale-x-0 bg-[var(--accent)]",
                    )}
                  />
                </span>
              </span>
            )}
          </div>
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
