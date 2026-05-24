"use client";

import { useEffect, useState } from "react";

type HealthStatus = "healthy" | "degraded" | "unknown";

export function HealthPill() {
  const [status, setStatus] = useState<HealthStatus>("unknown");

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled) setStatus(json?.status === "healthy" ? "healthy" : "degraded");
      } catch {
        if (!cancelled) setStatus("degraded");
      }
    };
    probe();
    const interval = setInterval(probe, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const dotColor =
    status === "healthy" ? "bg-accent-electric" : status === "degraded" ? "bg-accent-red" : "bg-text-muted";
  const label = status === "healthy" ? "Healthy" : status === "degraded" ? "Degraded" : "Checking…";

  return (
    <a
      href="/api/health"
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-elevated border border-subtle text-xs text-text-secondary hover:bg-hover transition"
    >
      <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} aria-hidden />
      {label}
    </a>
  );
}
