"use client";

import { motion, useReducedMotion } from "motion/react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { StudioStatus } from "@/components/niches/studio/studio-cockpit";

export function RenderProgress({ status }: { status: StudioStatus }) {
  const reduceMotion = useReducedMotion();
  const jobStatus = status.job?.status ?? "pending";
  const stale = status.job?.workerStale ?? false;

  const label =
    jobStatus === "pending"
      ? "Queued"
      : jobStatus === "claimed"
        ? "Starting"
        : jobStatus === "running"
          ? "Rendering frames + voice"
          : jobStatus;

  // Honest, coarse progress: a little while queued, more once frames are running.
  const progress = jobStatus === "running" ? 66 : 20;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2.5">
        <span className="relative flex size-2 shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex size-2 rounded-full bg-[var(--accent)]" />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          {label}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Coarse progress with an indeterminate shimmer */}
        <div
          role="progressbar"
          aria-label="Render progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]"
        >
          <motion.div
            className="relative h-full overflow-hidden rounded-full bg-[var(--accent)]"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: [0, 0, 0.2, 1] }}
          >
            {!reduceMotion && (
              <motion.div
                className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                animate={{ x: ["0%", "400%"] }}
                transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity }}
              />
            )}
          </motion.div>
        </div>

        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          {status.estimate ? `This takes roughly ${status.estimate.minutes} minutes. ` : ""}
          You can leave this page and come back — the render keeps going.
        </p>

        {stale && (
          <div className="flex items-start gap-3 rounded-lg border border-[var(--warning)]/25 bg-[var(--warning)]/10 px-4 py-3">
            <svg
              viewBox="0 0 24 24"
              className="mt-0.5 size-4 shrink-0 text-[var(--warning)]"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="space-y-1 text-sm">
              <p className="text-[var(--text-secondary)]">No render worker has picked this up yet.</p>
              <p className="text-[var(--text-tertiary)]">
                Start it locally:{" "}
                <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-xs text-[var(--text-primary)]">
                  npm run render-worker
                </code>
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
