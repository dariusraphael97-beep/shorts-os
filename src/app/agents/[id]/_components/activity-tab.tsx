"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime } from "../../_components/agent-presentation";

const POLL_MS = 15_000;

interface ActivityRow {
  id: string;
  assistant_id: string;
  activity_type: string;
  summary: string;
  created_at: string;
}

const ALL = "__all__";

export function ActivityTab({ assistantId }: { assistantId: string }) {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>(ALL);

  // Guards: skip overlapping fetches; never setState after unmount.
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    async function poll() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await fetch(`/api/agents/${assistantId}/activity`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const json = (await res.json()) as { ok: boolean; activity?: ActivityRow[] };
        if (mounted.current && json.ok && json.activity) setRows(json.activity);
      } catch {
        // Network blip — keep the last good state, retry next tick.
      } finally {
        inFlight.current = false;
        if (mounted.current) setLoading(false);
      }
    }

    void poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
    };
  }, [assistantId]);

  // Distinct types present in the current rows, for the filter dropdown.
  const types = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.activity_type);
    return Array.from(set).sort();
  }, [rows]);

  const visible = useMemo(
    () => (filter === ALL ? rows : rows.filter((r) => r.activity_type === filter)),
    [rows, filter],
  );

  if (loading) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter row */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-tertiary)]">
          {visible.length} {visible.length === 1 ? "event" : "events"}
        </p>
        <Select value={filter} onValueChange={(v) => setFilter(v as string)}>
          <SelectTrigger size="sm" className="min-w-[160px]">
            <SelectValue placeholder="All activity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All activity</SelectItem>
            {types.map((t) => (
              <SelectItem key={t} value={t}>
                {prettyType(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {visible.length === 0 ? (
        <EmptyActivity />
      ) : (
        <ul className="space-y-2">
          {visible.map((r) => (
            <li
              key={r.id}
              className="flex items-start gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3"
            >
              <Badge
                variant="outline"
                className="mt-0.5 shrink-0 font-mono text-[10px] tracking-tight text-[var(--text-tertiary)]"
              >
                {prettyType(r.activity_type)}
              </Badge>
              <p className="min-w-0 flex-1 text-[13px] leading-snug text-[var(--text-secondary)]">
                {r.summary}
              </p>
              <span className="shrink-0 pt-0.5 font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
                {relativeTime(r.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function prettyType(t: string): string {
  return t.replace(/_/g, " ");
}

function EmptyActivity() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-1)] px-6 py-16 text-center">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg"
        style={{ backgroundColor: "var(--surface-2)", color: "var(--text-tertiary)" }}
        aria-hidden
      >
        <Activity className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--text-secondary)]">No activity yet</p>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          This agent hasn&apos;t logged any work. New events will appear here automatically.
        </p>
      </div>
    </div>
  );
}
