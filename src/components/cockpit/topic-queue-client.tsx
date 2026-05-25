"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { QueuedTopic } from "@/lib/supabase/repositories/topic-queue";
import { TopicRow } from "./topic-row";

export function TopicQueueClient({ initial }: { initial: QueuedTopic[] }) {
  const [topics, setTopics] = useState(initial);
  const [isRefreshing, setIsRefreshing] = useState(false);

  function removeRow(id: string) {
    setTopics((prev) => prev.filter((t) => t.id !== id));
  }

  async function refresh() {
    setIsRefreshing(true);
    try {
      window.location.reload();
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <section className="flex flex-col h-full">
      <header className="flex items-center justify-between px-4 py-3 border-b border-subtle">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Topic Queue</h2>
          <span className="text-[10px] font-mono text-text-muted">{topics.length} queued</span>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isRefreshing}
          className="p-1.5 rounded hover:bg-elevated text-text-muted"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </button>
      </header>

      {topics.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <p className="text-sm text-text-muted max-w-md">
            Scrapers haven&apos;t queued anything yet — they fire daily around 7 AM ET. The Reddit and Wikipedia harvesters write here; YouTube and TikTok write to Trending.
          </p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto p-3 space-y-2">
          {topics.map((t) => (
            <TopicRow key={t.id} topic={t} onResolved={removeRow} />
          ))}
        </ul>
      )}
    </section>
  );
}
