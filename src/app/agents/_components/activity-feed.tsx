"use client";

import Link from "next/link";
import {
  Compass,
  Eye,
  Sparkles,
  ShieldCheck,
  LineChart,
  Scissors,
  Bot,
  Activity,
  type LucideIcon,
} from "lucide-react";
import type { AssistantActivity } from "@/lib/supabase/repositories/assistants";

// Icon keyed by assistant_id (the feed only carries assistant_id, not icon_name).
const AGENT_ICONS: Record<string, LucideIcon> = {
  niche_scout: Compass,
  watch_list_curator: Eye,
  generator: Sparkles,
  video_reviewer: ShieldCheck,
  analyst: LineChart,
  editor_copilot: Scissors,
};

function iconFor(assistantId: string): LucideIcon {
  return AGENT_ICONS[assistantId] ?? Bot;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / (60 * 1000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-1)]/40 px-6 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <Activity className="h-5 w-5 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
      </div>
      <p className="max-w-[28ch] text-[13px] text-[var(--text-secondary)]">
        No activity yet — agents will report here as they work.
      </p>
    </div>
  );
}

export function ActivityFeed({ initial }: { initial: AssistantActivity[] }) {
  return (
    <section className="mt-12" aria-labelledby="activity-heading">
      <div className="mb-4 flex items-center gap-3">
        <h2
          id="activity-heading"
          className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]"
        >
          Recent activity
        </h2>
        <div className="h-px flex-1 bg-[var(--border-subtle)]" aria-hidden />
      </div>

      {initial.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-px overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]">
          {initial.map((row) => {
            const Icon = iconFor(row.assistant_id);
            return (
              <li key={row.id}>
                <Link
                  href={`/agents/${row.assistant_id}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:bg-[var(--surface-2)]"
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-tertiary)]"
                    aria-hidden
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-secondary)]">
                    {row.summary}
                  </span>
                  <time
                    className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]"
                    dateTime={row.created_at}
                  >
                    {relativeTime(row.created_at)}
                  </time>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
