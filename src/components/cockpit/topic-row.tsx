"use client";

import { useState, useTransition } from "react";
import type { QueuedTopic } from "@/lib/supabase/repositories/topic-queue";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Check, X, ChevronDown, ChevronUp } from "lucide-react";

export function TopicRow({ topic, onResolved }: { topic: QueuedTopic; onResolved: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const score = Math.round(topic.hookability_score ?? 0);
  const scoreColor =
    score >= 80 ? "text-accent-electric" : score >= 60 ? "text-accent-amber" : "text-text-muted";

  async function submitState(state: "reviewed" | "rejected", reasonText?: string) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/topics/${topic.id}/state`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state, reason: reasonText }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        onResolved(topic.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed");
      }
    });
  }

  return (
    <li className="rounded-md border border-subtle bg-surface hover:bg-hover transition">
      <div className="p-3 flex items-start gap-3">
        <div className={`text-3xl font-mono font-semibold tabular-nums shrink-0 ${scoreColor}`}>
          <NumberTicker value={score} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wide text-text-muted">
              {topic.source}
            </span>
            <span className="text-[10px] text-text-muted">·</span>
            <span className="text-[10px] text-text-muted">
              {new Date(topic.created_at).toLocaleTimeString()}
            </span>
          </div>
          <h3 className="text-sm font-medium text-text-primary line-clamp-2">{topic.title}</h3>
          {topic.summary && (
            <p className="text-xs text-text-secondary mt-1 line-clamp-2">{topic.summary}</p>
          )}
          {error && <p className="text-xs text-accent-red mt-1">{error}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => submitState("reviewed")}
            disabled={isPending}
            className="p-2 rounded hover:bg-elevated text-accent-electric disabled:opacity-50"
            aria-label="Queue for production"
            title="Queue for production"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setReasonOpen((v) => !v)}
            disabled={isPending}
            className="p-2 rounded hover:bg-elevated text-accent-red disabled:opacity-50"
            aria-label="Reject"
            title="Reject"
          >
            <X className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="p-2 rounded hover:bg-elevated text-text-muted"
            aria-label="Expand"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {reasonOpen && (
        <div className="px-3 pb-3 flex gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="flex-1 h-8 px-2 text-xs bg-elevated border border-subtle rounded text-text-primary placeholder:text-text-muted"
          />
          <button
            type="button"
            onClick={() => submitState("rejected", reason.trim() || undefined)}
            disabled={isPending}
            className="h-8 px-3 text-xs rounded bg-accent-red/10 text-accent-red border border-accent-red/30 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
      {expanded && (
        <pre className="px-3 pb-3 text-[11px] font-mono text-text-muted overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(topic.raw_payload, null, 2)}
        </pre>
      )}
    </li>
  );
}
