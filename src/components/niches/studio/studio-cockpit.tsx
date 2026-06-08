"use client";

import { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { StudioPhase } from "@/app/api/niches/studio/[draftId]/status/route";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkpoint } from "@/components/niches/studio/checkpoint";
import { RenderProgress } from "@/components/niches/studio/render-progress";
import { DonePanel } from "@/components/niches/studio/done-panel";

export interface StudioStatus {
  phase: StudioPhase;
  draft: {
    id: string;
    title: string;
    status: string;
    renderArtifactUrl: string | null;
    durationSeconds: number | null;
    sourceNicheClusterId: string | null;
    plan: Record<string, unknown> | null;
  };
  estimate: { credits: number; minutes: number } | null;
  job: { status: string; attempts: number; lastError: string | null; workerStale: boolean } | null;
}

export function StudioCockpit({
  draftId,
  initialPhase,
}: {
  draftId: string;
  initialPhase: StudioPhase;
}) {
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const reduceMotion = useReducedMotion();
  const phase = status?.phase ?? initialPhase;

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/niches/studio/${draftId}/status`, { cache: "no-store" });
    if (res.ok) setStatus((await res.json()) as StudioStatus);
  }, [draftId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (phase !== "rendering") return;
    const t = setInterval(() => void refresh(), 5_000);
    return () => clearInterval(t);
  }, [phase, refresh]);

  const body = (() => {
    if (!status) return <LoadingState />;
    if (phase === "checkpoint") return <Checkpoint draftId={draftId} status={status} onApproved={refresh} />;
    if (phase === "rendering") return <RenderProgress status={status} />;
    if (phase === "done") return <DonePanel status={status} />;
    if (phase === "error") return <ErrorState message={status.job?.lastError ?? null} />;
    return <PlanningState />;
  })();

  // Crossfade between phases. Loading shares a key so the spinner doesn't restart on refresh.
  const phaseKey = status ? phase : "loading";

  if (reduceMotion) {
    return <div className="mx-auto max-w-2xl">{body}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={phaseKey}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Designed inline states ─────────────────────────────────────────────────

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.2" />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="origin-center motion-safe:animate-spin"
        style={{ animationDuration: "0.8s" }}
      />
    </svg>
  );
}

function LoadingState() {
  return (
    <Card>
      <CardHeader>
        <div className="h-3.5 w-40 animate-pulse rounded-full bg-[var(--surface-2)]" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-3 w-3/4 animate-pulse rounded-full bg-[var(--surface-2)]" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-3 animate-pulse rounded-full bg-[var(--surface-2)]" />
          ))}
        </div>
        <div className="flex items-center gap-2 pt-1 text-[var(--text-tertiary)]">
          <Spinner className="h-4 w-4" />
          <span className="text-xs">Loading cockpit…</span>
        </div>
      </CardContent>
    </Card>
  );
}

function PlanningState() {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-8">
        <Spinner className="h-5 w-5 text-[var(--accent)]" />
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Planning your video</p>
          <p className="text-xs text-[var(--text-tertiary)]">Reload if this persists.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorState({ message }: { message: string | null }) {
  return (
    <Card className="ring-[var(--danger)]/25">
      <CardHeader className="flex-row items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--danger)]/10"
          aria-hidden
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-[var(--danger)]" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 8v5" strokeLinecap="round" />
            <circle cx="12" cy="16.5" r="0.5" fill="currentColor" stroke="none" />
            <path d="M10.3 3.9 2.5 17.5A1.9 1.9 0 0 0 4.2 20.5h15.6a1.9 1.9 0 0 0 1.7-3L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z" strokeLinejoin="round" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">Render failed</p>
          <p className="text-xs text-[var(--text-tertiary)]">No credits are still burning.</p>
        </div>
      </CardHeader>
      <CardContent>
        <p className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2 font-mono text-xs leading-relaxed text-[var(--text-secondary)]">
          {message ?? "Unknown error"}
        </p>
      </CardContent>
    </Card>
  );
}
