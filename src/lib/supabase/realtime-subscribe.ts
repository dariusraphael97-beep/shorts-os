"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserSupabase } from "./browser-client";

type ChangeEvent = "INSERT" | "UPDATE" | "DELETE" | "*";

export type RealtimePayload<T = Record<string, unknown>> = {
  eventType: ChangeEvent;
  new: T;
  old: T;
  table: string;
};

/**
 * Subscribe to postgres_changes on a single table. Returns a teardown function
 * suitable for useEffect cleanup.
 */
export function subscribeToTable<T = Record<string, unknown>>(args: {
  table: string;
  event?: ChangeEvent;
  onEvent: (payload: RealtimePayload<T>) => void;
}): () => void {
  const { table, event = "*", onEvent } = args;
  const supabase = getBrowserSupabase();
  const channel = supabase
    .channel(`public:${table}`)
    .on(
      "postgres_changes",
      { event, schema: "public", table },
      (payload) => {
        onEvent({
          eventType: payload.eventType as ChangeEvent,
          new: (payload.new ?? {}) as T,
          old: (payload.old ?? {}) as T,
          table: payload.table,
        });
      },
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel as RealtimeChannel);
  };
}
