"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { type AssistantStatus } from "@/lib/design/badges";
import { AssistantStatusDot } from "@/components/compositions/assistant-status-dot";
import { HoverLift, Tappable } from "@/components/motion";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface AssistantCardProps {
  icon: LucideIcon;
  name: string;
  role: string;
  status: AssistantStatus;
  activitySummary?: string;
  recentActivity?: { id: string; summary: string; at: string }[];
  disabled?: boolean;
  comingInPhase?: number;
  /** Amber annotation: cron hasn't completed within its expected window. */
  overdue?: boolean;
  onOpen?: () => void;
}

function CardInner({ icon: Icon, name, role, status, activitySummary, recentActivity, disabled, comingInPhase, overdue }: Omit<AssistantCardProps, "onOpen">) {
  const entries = recentActivity?.slice(0, 3) ?? [];

  return (
    <Card
      size="sm"
      className={cn(
        "transition-colors",
        disabled && "cursor-default opacity-60",
        !disabled && "cursor-pointer",
      )}
    >
      {/* Header: icon tile + name + role */}
      <CardHeader className="flex-row items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)] text-[var(--accent)]"
          aria-hidden="true"
        >
          <Icon className="h-5 w-5" strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold leading-snug text-[var(--text-primary)]">
            {name}
          </p>
          <p className="truncate text-sm text-[var(--text-secondary)]">{role}</p>
        </div>
        {overdue && !disabled && (
          <Badge variant="secondary" className="shrink-0 text-[var(--warning)]">
            Overdue
          </Badge>
        )}
        {disabled && comingInPhase !== undefined && (
          <Badge variant="secondary" className="shrink-0">
            Phase {comingInPhase}
          </Badge>
        )}
      </CardHeader>

      {/* Middle: status dot + activity summary */}
      <CardContent>
        <div className="flex min-w-0 items-center gap-2">
          <AssistantStatusDot status={status} />
          {activitySummary && (
            <span className="min-w-0 truncate text-sm text-[var(--text-secondary)]">
              {activitySummary}
            </span>
          )}
        </div>
      </CardContent>

      {/* Footer: up to 3 recent activity entries */}
      {entries.length > 0 && (
        <CardFooter className="flex-col items-start gap-1 border-t bg-transparent">
          {entries.map((entry) => (
            <div key={entry.id} className="flex w-full min-w-0 items-center justify-between gap-3">
              <span className="min-w-0 truncate text-xs text-[var(--text-tertiary)]">
                {entry.summary}
              </span>
              <span className="shrink-0 font-mono text-xs text-[var(--text-tertiary)]">
                {entry.at}
              </span>
            </div>
          ))}
        </CardFooter>
      )}
    </Card>
  );
}

export function AssistantCard(props: AssistantCardProps) {
  const { disabled, onOpen } = props;

  if (disabled) {
    return <CardInner {...props} />;
  }

  if (onOpen) {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen();
      }
    };

    return (
      <HoverLift>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 rounded-xl"
        >
          <Tappable onClick={onOpen}>
            <CardInner {...props} />
          </Tappable>
        </div>
      </HoverLift>
    );
  }

  return (
    <HoverLift>
      <CardInner {...props} />
    </HoverLift>
  );
}
