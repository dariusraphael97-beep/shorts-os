"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HealthAttention {
  id: string;
  name: string;
  reason: "errored" | "overdue";
}

/**
 * The ONE primary signal on Mission Control: is anything broken / overdue?
 * Clicking scrolls to the first affected agent card (`#agent-card-<id>`).
 */
export function HealthPill({ attention }: { attention: HealthAttention[] }) {
  const healthy = attention.length === 0;

  const scrollToFirst = () => {
    if (healthy) return;
    document
      .getElementById(`agent-card-${attention[0].id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <button
      type="button"
      onClick={scrollToFirst}
      disabled={healthy}
      title={healthy ? undefined : attention.map((a) => `${a.name}: ${a.reason}`).join(" · ")}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        healthy
          ? "cursor-default border-[var(--border-subtle)] text-[var(--text-secondary)]"
          : "border-transparent bg-[var(--danger-muted)] text-[var(--danger)] hover:opacity-90",
      )}
    >
      {healthy ? (
        <CheckCircle2 className="h-4 w-4 text-[var(--success)]" strokeWidth={1.5} />
      ) : (
        <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />
      )}
      {healthy
        ? "All systems healthy"
        : `${attention.length} agent${attention.length > 1 ? "s" : ""} need${attention.length === 1 ? "s" : ""} attention`}
    </button>
  );
}
