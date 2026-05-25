"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { ViralObservation, ObservationSource } from "@/lib/supabase/repositories/viral-observations";
import { TrendingRow } from "./trending-row";

const SOURCES: ObservationSource[] = ["youtube", "tiktok", "reddit", "instagram"];

export function TrendingClient({ initial }: { initial: ViralObservation[] }) {
  const [filter, setFilter] = useState<ObservationSource | "all">("all");
  const filtered = filter === "all" ? initial : initial.filter((o) => o.source === filter);

  return (
    <section className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 py-3 border-b border-subtle">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Trending Shorts</h2>
          <span className="text-[10px] font-mono text-text-muted">{filtered.length} shown</span>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="p-1.5 rounded hover:bg-elevated text-text-muted"
          aria-label="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </header>

      <div className="flex gap-1 px-4 py-2 border-b border-subtle">
        <button
          onClick={() => setFilter("all")}
          className={`text-[11px] px-2 py-1 rounded ${
            filter === "all" ? "bg-elevated text-text-primary" : "text-text-muted hover:bg-elevated"
          }`}
        >
          All
        </button>
        {SOURCES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-[11px] px-2 py-1 rounded ${
              filter === s ? "bg-elevated text-text-primary" : "text-text-muted hover:bg-elevated"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <p className="text-sm text-text-muted max-w-md">
            No trending shorts observed in this filter. YouTube + TikTok crons fire daily 6:00 / 6:30 ET.
          </p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto p-3 space-y-2">
          {filtered.map((o) => (
            <TrendingRow key={o.id} obs={o} />
          ))}
        </ul>
      )}
    </section>
  );
}
