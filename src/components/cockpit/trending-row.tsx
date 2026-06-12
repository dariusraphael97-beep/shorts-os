"use client";

import { useState, useTransition } from "react";
import type { ViralObservation } from "@/lib/supabase/repositories/viral-observations";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ExternalLink, Sparkles, ChevronDown, ChevronUp } from "lucide-react";

const SOURCE_LABEL: Record<string, string> = {
  youtube: "YT",
  tiktok: "TT",
  reddit: "RD",
  instagram: "IG",
};

function formatViews(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / (60 * 60 * 1000));
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function TrendingRow({ obs }: { obs: ViralObservation }) {
  const [expanded, setExpanded] = useState(false);
  const [breakdown, setBreakdown] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function explain() {
    if (breakdown) {
      setExpanded((v) => !v);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/trending/${obs.id}/explain`, { method: "POST" });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        setBreakdown(json.breakdown);
        setExpanded(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "failed");
      }
    });
  }

  return (
    <li className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] transition">
      <div className="p-3 flex items-start gap-3">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] text-text-secondary border border-[var(--border-subtle)] shrink-0">
          {SOURCE_LABEL[obs.source] ?? obs.source}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-text-primary line-clamp-2">{obs.title ?? "(untitled)"}</h3>
          <div className="text-[11px] text-text-secondary mt-1 flex items-center gap-2">
            {obs.channel_name && <span className="truncate">{obs.channel_name}</span>}
            <span className="font-mono">{formatViews(obs.views)} views</span>
            <span>·</span>
            <span>{relativeTime(obs.observed_at)}</span>
          </div>
          {error && <p className="text-xs text-[var(--accent-red)] mt-1">{error}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Tooltip>
            <TooltipTrigger
              render={
                <a
                  href={obs.url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded hover:bg-[var(--bg-elevated)] text-[var(--text-muted)]"
                  aria-label="Open source"
                />
              }
            >
              <ExternalLink className="w-4 h-4" />
            </TooltipTrigger>
            <TooltipContent side="top">Open source</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={explain}
                  disabled={isPending}
                  className="p-2 rounded hover:bg-[var(--bg-elevated)] text-[var(--accent-electric)] disabled:opacity-50"
                  aria-label="Ask Claude why this works"
                />
              }
            >
              <Sparkles className="w-4 h-4" />
            </TooltipTrigger>
            <TooltipContent side="top">Ask Claude</TooltipContent>
          </Tooltip>
          {breakdown && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="p-2 rounded hover:bg-[var(--bg-elevated)] text-[var(--text-muted)]"
                    aria-label="Toggle breakdown"
                  />
                }
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </TooltipTrigger>
              <TooltipContent side="top">Toggle breakdown</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      {expanded && breakdown && (
        <div className="px-3 pb-3 text-xs text-text-secondary leading-relaxed border-t border-[var(--border-subtle)] pt-2">
          {breakdown}
        </div>
      )}
    </li>
  );
}
