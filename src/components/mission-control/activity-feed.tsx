"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Clock,
  Info,
  Loader2,
  MinusCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActivityEvent, ActivityEventStatus } from "@/lib/assistants/live-status";
import { relativeTime } from "@/lib/format/relative-time";

const STATUS_ICONS: Record<ActivityEventStatus, { icon: LucideIcon; className: string }> = {
  success: { icon: CheckCircle2, className: "text-[var(--success)]" },
  partial: { icon: CheckCircle2, className: "text-[var(--warning)]" },
  failed: { icon: AlertCircle, className: "text-[var(--danger)]" },
  running: { icon: Loader2, className: "animate-spin text-[var(--accent)]" },
  queued: { icon: Clock, className: "text-[var(--text-tertiary)]" },
  skipped: { icon: MinusCircle, className: "text-[var(--text-tertiary)]" },
  info: { icon: Info, className: "text-[var(--text-tertiary)]" },
};

export interface ActivityFeedProps {
  initialEvents: ActivityEvent[];
  initialNextBefore: string | null;
  /** Names for the agent chips (assistantId → display name). */
  nameById: Record<string, string>;
  /** When set: per-agent mode — no agent chips, adds client-side type filter chips. */
  assistantId?: string;
}

export function ActivityFeed({ initialEvents, initialNextBefore, nameById, assistantId }: ActivityFeedProps) {
  const [events, setEvents] = useState(initialEvents);
  const [nextBefore, setNextBefore] = useState(initialNextBefore);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const loadMore = async () => {
    if (!nextBefore || loading) return;
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ before: nextBefore, limit: "30" });
      if (assistantId) params.set("assistantId", assistantId);
      const res = await fetch(`/api/mission-control/activity?${params}`);
      if (!res.ok) {
        setLoadError("Couldn't load more — try again.");
        return;
      }
      const body = (await res.json()) as { events: ActivityEvent[]; nextBefore: string | null };
      setEvents((prev) => [...prev, ...body.events]);
      setNextBefore(body.nextBefore);
    } catch {
      setLoadError("Couldn't load more — try again.");
    } finally {
      setLoading(false);
    }
  };

  const types = assistantId ? [...new Set(events.map((e) => e.type))] : [];
  const visible = typeFilter ? events.filter((e) => e.type === typeFilter) : events;

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--border-subtle)] py-12 text-center">
        <CircleDashed className="h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} />
        <p className="text-sm font-medium text-[var(--text-secondary)]">No runs recorded yet</p>
        <p className="text-xs text-[var(--text-tertiary)]">
          Activity appears here as crons and pipelines run.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {types.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <FilterChip active={typeFilter === null} onClick={() => setTypeFilter(null)} label="All" />
          {types.map((t) => (
            <FilterChip
              key={t}
              active={typeFilter === t}
              onClick={() => setTypeFilter(t)}
              label={t.replace(/_/g, " ")}
            />
          ))}
        </div>
      )}
      {events.length > 0 && visible.length === 0 && (
        <p className="py-4 text-center text-xs text-[var(--text-tertiary)]">
          No {typeFilter?.replace(/_/g, " ")} events yet.
        </p>
      )}
      <ul className="flex flex-col">
        {visible.map((event) => {
          const { icon: Icon, className } = STATUS_ICONS[event.status] ?? STATUS_ICONS.info;
          return (
            <li
              key={event.id}
              className="flex items-center gap-3 border-b border-[var(--border-subtle)] py-2.5 last:border-b-0"
            >
              <Icon className={cn("h-4 w-4 shrink-0", className)} strokeWidth={1.5} />
              {!assistantId && (
                <Badge variant="secondary" className="shrink-0">
                  {nameById[event.assistantId] ?? event.assistantId}
                </Badge>
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">
                {event.summary}
              </span>
              <span
                className="shrink-0 font-mono text-xs text-[var(--text-tertiary)]"
                title={new Date(event.at).toLocaleString()}
                suppressHydrationWarning
              >
                {relativeTime(event.at)}
              </span>
            </li>
          );
        })}
      </ul>
      {loadError && (
        <p className="mt-2 text-center text-xs text-[var(--danger)]">{loadError}</p>
      )}
      {nextBefore && (
        <Button variant="ghost" size="sm" className="mt-2 self-center" onClick={loadMore} disabled={loading}>
          {loading ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors",
        active
          ? "border-[var(--accent)] text-[var(--accent)]"
          : "border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
      )}
    >
      {label}
    </button>
  );
}
