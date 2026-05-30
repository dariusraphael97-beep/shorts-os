"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DetailActionsProps {
  clusterId: string;
  canGenerate: boolean;
  prediction?: { lower: number; upper: number } | null;
}

type NicheAction = "investigated" | "hidden" | "generated_from";

// ─── Action helper (mirrors src/app/niches/niches-feed.tsx) ─────────────────────

async function postAction(
  nicheClusterId: string,
  action: NicheAction,
): Promise<void> {
  await fetch("/api/niches/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nicheClusterId, action }),
  });
}

// ─── Icons (inline — no icon-lib dependency) ────────────────────────────────────

function SparkIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-3.5 w-3.5"
    >
      <path d="M8 1.5l1.6 4.9 4.9 1.6-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6L8 1.5z" />
    </svg>
  );
}

function BookmarkIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-3.5 w-3.5"
    >
      <path d="M4 2.5h8a1 1 0 0 1 1 1v10l-5-3-5 3v-10a1 1 0 0 1 1-1z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-3.5 w-3.5"
    >
      <path d="M2 2l12 12M6.5 6.6a2 2 0 0 0 2.8 2.8" />
      <path d="M4.4 4.6C2.9 5.6 1.8 7 1.3 8c1 2 3.6 4 6.7 4 1.1 0 2.1-.2 3-.6M9.8 4.2C9.2 4.1 8.6 4 8 4 4.9 4 2.3 6 1.3 8" />
    </svg>
  );
}

// ─── DetailActions ──────────────────────────────────────────────────────────────

export function DetailActions({
  clusterId,
  canGenerate,
  prediction,
}: DetailActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<NicheAction | null>(null);

  async function handleGenerate() {
    if (!canGenerate || busy) return;
    setBusy("generated_from");
    // Always record the analytics action (best-effort).
    postAction(clusterId, "generated_from").catch(() => {});
    try {
      const res = await fetch(`/api/niches/${clusterId}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      if (res.ok) {
        toast.success("Generation queued — opening Lab…");
        router.push("/lab");
      } else {
        // Route lands in a later task — fail friendly, not loud.
        toast("Generation wiring lands soon");
      }
    } catch {
      toast("Generation wiring lands soon");
    } finally {
      setBusy(null);
    }
  }

  async function handleAdd() {
    if (busy) return;
    setBusy("investigated");
    try {
      await postAction(clusterId, "investigated");
      toast.success("Added to your niches");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleHide() {
    if (busy) return;
    setBusy("hidden");
    try {
      await postAction(clusterId, "hidden");
      toast("Niche hidden");
      router.push("/niches");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Action stack */}
      <div className="flex flex-col gap-2">
        <Button
          variant="default"
          size="default"
          disabled={!canGenerate || busy !== null}
          onClick={handleGenerate}
          className="w-full justify-center gap-2"
          aria-label={
            canGenerate
              ? "Generate a video for this niche"
              : "Generate now — only available for native-fit niches"
          }
        >
          <SparkIcon />
          {busy === "generated_from" ? "Generating…" : "Generate now"}
        </Button>
        {!canGenerate && (
          <p className="px-1 font-mono text-[10px] leading-snug tracking-wide text-[var(--text-tertiary)]">
            Available only for native-fit niches. This one needs a manual
            recording or editing step.
          </p>
        )}

        <Button
          variant="outline"
          size="default"
          disabled={busy !== null}
          onClick={handleAdd}
          className="w-full justify-center gap-2"
        >
          <BookmarkIcon />
          {busy === "investigated" ? "Adding…" : "Add to my niches"}
        </Button>

        <Button
          variant="ghost"
          size="default"
          disabled={busy !== null}
          onClick={handleHide}
          className="w-full justify-center gap-2 text-[var(--text-tertiary)] hover:text-[var(--danger)]"
        >
          <EyeOffIcon />
          {busy === "hidden" ? "Hiding…" : "Hide"}
        </Button>
      </div>

      {/* Sealed-prediction band — only when an open prediction exists */}
      {prediction && (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
              aria-hidden
            />
            <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              Sealed 7-day forecast
            </p>
          </div>
          <p className="mt-2 font-mono text-lg font-semibold tabular-nums text-[var(--text-primary)]">
            {formatViews(prediction.lower)}
            <span className="mx-1.5 text-[var(--text-tertiary)]">–</span>
            {formatViews(prediction.upper)}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-[var(--text-secondary)]">
            Predicted views over the first 7 days for a video in this niche.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Local view formatter ───────────────────────────────────────────────────────

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}
