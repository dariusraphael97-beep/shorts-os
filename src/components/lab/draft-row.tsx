// src/components/lab/draft-row.tsx
//
// Client component. Renders a single DraftRowVM as a premium table row with:
//   • thumbnail tile (render_artifact_url or placeholder)
//   • title + status pill + verdict badge
//   • status-appropriate action buttons (Render / Review / Upload)
// Mutations POST to existing API routes then call router.refresh().

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Film,
  Loader2,
  ShieldCheck,
  Send,
  Clapperboard,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { fadeRise } from "@/lib/motion";
import type { DraftRowVM } from "@/lib/lab/drafts-view";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Status pill ─────────────────────────────────────────────────────────────

const STATUS_PILL: Record<
  DraftRowVM["status"],
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className:
      "border-[var(--text-tertiary)]/25 bg-[var(--text-tertiary)]/10 text-[var(--text-tertiary)]",
  },
  rendering: {
    label: "Rendering",
    className:
      "border-[var(--accent)]/30 bg-[var(--accent-muted)] text-[var(--accent)]",
  },
  rendered: {
    label: "Rendered",
    className:
      "border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]",
  },
  scheduled: {
    label: "Scheduled",
    className:
      "border-[var(--warning)]/30 bg-[var(--warning)]/10 text-[var(--warning)]",
  },
  uploading: {
    label: "Uploading",
    className:
      "border-[var(--accent)]/30 bg-[var(--accent-muted)] text-[var(--accent)]",
  },
  posted: {
    label: "Posted",
    className:
      "border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]",
  },
  failed: {
    label: "Failed",
    className:
      "border-[var(--danger)]/30 bg-[var(--danger)]/10 text-[var(--danger)]",
  },
};

// ─── Verdict badge ────────────────────────────────────────────────────────────

const VERDICT_BADGE: Record<
  NonNullable<DraftRowVM["verdict"]>,
  { label: string; className: string }
> = {
  ship: {
    label: "Ship",
    className:
      "border-[var(--success)]/40 bg-[var(--success)]/12 text-[var(--success)]",
  },
  revise: {
    label: "Revise",
    className:
      "border-[var(--warning)]/40 bg-[var(--warning)]/12 text-[var(--warning)]",
  },
  block: {
    label: "Block",
    className:
      "border-[var(--danger)]/40 bg-[var(--danger)]/12 text-[var(--danger)]",
  },
};

// ─── Thumbnail tile ───────────────────────────────────────────────────────────

function ThumbnailTile({ url }: { url: string | null }) {
  if (url) {
    return (
      <div
        className="relative shrink-0 overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-black"
        style={{ width: 52, aspectRatio: "9 / 16" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-2)]/60"
      style={{ width: 52, aspectRatio: "9 / 16" }}
      aria-hidden="true"
    >
      <Film className="h-4 w-4 text-[var(--text-tertiary)]" />
    </div>
  );
}

// ─── DraftRow (public) ────────────────────────────────────────────────────────

interface DraftRowProps {
  row: DraftRowVM;
  /** Stagger index for fadeRise entrance */
  index: number;
}

export function DraftRow({ row, index }: DraftRowProps) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const [busy, setBusy] = useState(false);

  const pill = STATUS_PILL[row.status];
  const verdictBadge = row.verdict ? VERDICT_BADGE[row.verdict] : null;

  // ── Mutation helpers ──────────────────────────────────────────────────────

  async function postMutation(
    path: string,
    body: Record<string, string>,
    label: string,
  ) {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(`${label} failed: ${(err as { error?: string }).error ?? res.statusText}`);
        return;
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(false);
    }
  }

  function handleRender() {
    void postMutation("/api/lab/render", { draftId: row.id }, "Render");
  }

  function handleUpload() {
    void postMutation("/api/lab/upload", { videoId: row.id }, "Upload");
  }

  // ── Stagger delay ──────────────────────────────────────────────────────────

  const staggerDelay = prefersReducedMotion ? 0 : Math.min(index * 0.04, 0.24);

  const motionProps = prefersReducedMotion
    ? {}
    : {
        variants: fadeRise,
        initial: "initial",
        animate: "animate",
        transition: { delay: staggerDelay, duration: 0.32, ease: [0, 0, 0.2, 1] as [number, number, number, number] },
      };

  return (
    <motion.li
      {...motionProps}
      className="border-t border-[var(--border-subtle)] first:border-t-0"
      role="listitem"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Thumbnail */}
        <ThumbnailTile url={row.thumbnailUrl} />

        {/* Title + badges */}
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium text-[var(--text-primary)]"
            title={row.title}
          >
            {row.title}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {/* Status pill */}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                pill.className,
              )}
            >
              {row.status === "rendering" && (
                <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
              )}
              {pill.label}
            </span>

            {/* Verdict badge (when present) */}
            {verdictBadge && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                  verdictBadge.className,
                )}
                aria-label={`Review verdict: ${verdictBadge.label}`}
              >
                <ShieldCheck className="h-2.5 w-2.5" aria-hidden />
                {verdictBadge.label}
              </span>
            )}
          </div>
        </div>

        {/* Row actions */}
        {row.actions.length > 0 && (
          <div
            className="flex shrink-0 items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {row.actions.includes("render") && (
              <Button
                onClick={handleRender}
                disabled={busy}
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-[11px]"
                aria-label="Render this draft"
              >
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Clapperboard className="h-3 w-3" aria-hidden />
                )}
                Render
              </Button>
            )}

            {row.actions.includes("review") && (
              <Link
                href={`/lab/${row.id}/review`}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-7 gap-1.5 px-2.5 text-[11px]",
                )}
                aria-label="Open review for this video"
              >
                <ShieldCheck className="h-3 w-3" aria-hidden />
                Review
              </Link>
            )}

            {row.actions.includes("upload") && (
              <Button
                onClick={handleUpload}
                disabled={busy}
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-[11px]"
                aria-label="Upload this video"
              >
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-3 w-3" aria-hidden />
                )}
                Upload
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.li>
  );
}
