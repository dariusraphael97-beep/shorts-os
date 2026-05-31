// src/components/lab/agent-card-shell.tsx
//
// Shared presentational shell for the four live-run agent cards. Gives them
// one consistent premium frame: header with icon + title + state badge, a
// left accent rail that reflects the current state, and entrance motion.
// Purely presentational — no behavior, no data fetching.

"use client";

import type { ReactNode } from "react";
import { Check, Loader2, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { AgentId } from "@/lib/agents/types";
import type { AgentChipState } from "./pipeline-strip";
import { AGENT_ICON, AGENT_LABEL } from "./agent-icons";
import { cn } from "@/lib/utils";

const RAIL: Record<AgentChipState, string> = {
  idle: "bg-[var(--border-subtle)]",
  thinking: "bg-[var(--warning)]",
  working: "bg-[var(--accent)]",
  done: "bg-[var(--success)]",
  failed: "bg-[var(--danger)]",
};

export function AgentCardShell({
  agent,
  state,
  children,
}: {
  agent: AgentId;
  state: AgentChipState;
  children: ReactNode;
}) {
  const prefersReducedMotion = useReducedMotion();
  const Icon = AGENT_ICON[agent];

  return (
    <motion.article
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0, 0, 0.2, 1] }}
      className="relative overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] shadow-[var(--elev-1)]"
    >
      {/* State accent rail */}
      <span
        className={cn("absolute inset-y-0 left-0 w-0.5", RAIL[state])}
        aria-hidden
      />
      <header className="flex items-center justify-between gap-3 px-4 pt-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <span className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-secondary)]">
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
          {AGENT_LABEL[agent]}
        </h3>
        <StateBadge state={state} />
      </header>
      <div className="px-4 pb-4 pt-3">{children}</div>
    </motion.article>
  );
}

export function StateBadge({ state }: { state: AgentChipState }) {
  if (state === "done") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--success)]/30 bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--success)]">
        <Check className="h-3 w-3" aria-hidden />
        Done
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--danger)]/40 bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--danger)]">
        <X className="h-3 w-3" aria-hidden />
        Failed
      </span>
    );
  }
  if (state === "working" || state === "thinking") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        {state === "thinking" ? "Thinking" : "Working"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-tertiary)]">
      Waiting
    </span>
  );
}

// Shared skeleton lines for cards awaiting output.
export function CardSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 animate-pulse rounded bg-[var(--surface-2)]"
          style={{ width: `${[75, 50, 66, 40][i % 4]}%` }}
        />
      ))}
    </div>
  );
}

// Small label used to head a field inside a card body.
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
      {children}
    </span>
  );
}
