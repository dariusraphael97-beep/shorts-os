"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { subscribeToTable } from "@/lib/supabase/realtime-subscribe";
import { BackgroundBeams } from "@/components/ui/background-beams";

type TickerEvent = {
  key: string;
  at: string;
  source: string;
  title: string;
};

const MAX_EVENTS = 50;

function pushEvent(prev: TickerEvent[], ev: TickerEvent): TickerEvent[] {
  return [ev, ...prev].slice(0, MAX_EVENTS);
}

export function ScraperTickerFooter() {
  const [events, setEvents] = useState<TickerEvent[]>([]);

  useEffect(() => {
    const unsubTopic = subscribeToTable<{ id: string; source: string; title: string; created_at: string }>({
      table: "topic_queue",
      event: "INSERT",
      onEvent: (p) => {
        const row = p.new;
        if (!row?.id) return;
        setEvents((prev) =>
          pushEvent(prev, {
            key: `tq-${row.id}`,
            at: row.created_at ?? new Date().toISOString(),
            source: `${row.source}-harvest`,
            title: row.title ?? "(untitled)",
          }),
        );
      },
    });

    const unsubViral = subscribeToTable<{ id: string; source: string; title: string | null; observed_at: string }>({
      table: "viral_observations",
      event: "INSERT",
      onEvent: (p) => {
        const row = p.new;
        if (!row?.id) return;
        setEvents((prev) =>
          pushEvent(prev, {
            key: `vo-${row.id}`,
            at: row.observed_at ?? new Date().toISOString(),
            source: `${row.source}-trending`,
            title: row.title ?? "(untitled)",
          }),
        );
      },
    });

    return () => {
      unsubTopic();
      unsubViral();
    };
  }, []);

  return (
    <div className="relative h-15 max-h-15 overflow-hidden">
      <BackgroundBeams className="opacity-30" />
      <div className="relative z-10 h-full overflow-y-auto px-4 py-2 bg-elevated/40">
        {events.length === 0 ? (
          <p className="text-[11px] font-mono text-text-muted">
            Scrapers quiet. Next fire: 6:00 AM ET (YouTube trending).
          </p>
        ) : (
          <ul className="space-y-0.5">
            {events.map((e) => (
              <motion.li
                key={e.key}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="text-[11px] font-mono text-text-secondary truncate"
              >
                <span className="text-text-muted">{new Date(e.at).toLocaleTimeString()}</span>{" "}
                <span className="text-accent-electric">{e.source}</span>{" "}
                <span className="text-text-primary">— {e.title}</span>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
