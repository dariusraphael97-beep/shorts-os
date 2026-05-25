// src/components/lab/dispatch-button.tsx
//
// Client component. Polls /api/lab/jobs/active every 5s to know whether
// to disable itself, and on click POSTs to /api/lab/dispatch to start
// a Lab run. Emits a custom DOM event "lab:dispatch-start" with the
// topicId so the ActiveRunPane can pick up the open Response stream.

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function DispatchButton({ topicId }: { topicId: string }) {
  const [busy, setBusy] = useState(false);
  const [activeElsewhere, setActiveElsewhere] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const res = await fetch("/api/lab/jobs/active", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) setActiveElsewhere(Boolean(json?.activeJob));
      } catch {
        /* leave previous value */
      }
    };
    probe();
    const interval = setInterval(probe, 5_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const disabled = busy || activeElsewhere;
  const label = busy ? "Dispatching…" : activeElsewhere ? "Run in progress" : "Dispatch";

  async function handleClick() {
    if (disabled) return;
    setBusy(true);
    window.dispatchEvent(
      new CustomEvent("lab:dispatch-start", { detail: { topicId } }),
    );
  }

  return (
    <Button
      onClick={handleClick}
      disabled={disabled}
      className="bg-accent-electric text-app font-medium hover:opacity-90 disabled:opacity-40"
      title={activeElsewhere ? "A run is already in progress" : ""}
    >
      {label} ▶
    </Button>
  );
}
