"use client";

import { cn } from "@/lib/utils";
import { type AssistantStatus, assistantStatusTone } from "@/lib/design/badges";

const toneDot: Record<string, string> = {
  muted:   "bg-[var(--text-tertiary)]",
  accent:  "bg-[var(--accent)]",
  warning: "bg-[var(--warning)]",
  danger:  "bg-[var(--danger)]",
  success: "bg-[var(--success)]",
};

interface AssistantStatusDotProps {
  status: AssistantStatus;
  label?: string;
}

export function AssistantStatusDot({ status, label }: AssistantStatusDotProps) {
  const tone = assistantStatusTone(status);
  const dotColor = toneDot[tone];

  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          dotColor,
          status === "working" && "animate-pulse motion-reduce:animate-none",
        )}
        aria-hidden="true"
      />
      {label && (
        <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      )}
    </span>
  );
}
