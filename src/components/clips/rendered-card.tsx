"use client";
// src/components/clips/rendered-card.tsx
//
// Per-rendered-draft tile: inline preview + Approve/Reject buttons.
// Approve promotes the draft into your_videos. Reject flips the draft status
// to 'failed'. All API endpoints and payloads preserved.

import { useState } from "react";
import { Send, CalendarClock, XCircle, Loader2, Film } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { fadeRise } from "@/lib/motion";
import { HoverLift } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CompilationDraftRow } from "@/lib/supabase/repositories/compilation-drafts";

// ─── Status badge for rendered state ─────────────────────────────────────────

function RenderedBadge() {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5",
        "font-mono text-[10px] uppercase tracking-wider",
        "border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]",
      )}
    >
      Rendered
    </span>
  );
}

// ─── RenderedCard ─────────────────────────────────────────────────────────────

interface RenderedCardProps {
  draft: CompilationDraftRow;
  /** stagger index for fadeRise */
  index?: number;
}

export function RenderedCard({ draft, index = 0 }: RenderedCardProps) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const [busy, setBusy] = useState(false);

  // ── Mutation (preserving original endpoints/payloads) ─────────────────────

  async function post(path: string) {
    setBusy(true);
    try {
      const res = await fetch(path, { method: "POST" });
      if (!res.ok) {
        const text = await res.text().catch(() => String(res.status));
        toast.error(`Action failed: ${text}`);
        return;
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const canAct = Boolean(draft.rendered_path);

  const motionProps = prefersReducedMotion
    ? {}
    : {
        variants: fadeRise,
        initial: "initial" as const,
        animate: "animate" as const,
        transition: {
          delay: Math.min(index * 0.04, 0.28),
          duration: 0.32,
          ease: [0, 0, 0.2, 1] as [number, number, number, number],
        },
      };

  return (
    <motion.div {...motionProps}>
      <HoverLift>
        <article
          className={cn(
            "rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]",
            "overflow-hidden flex flex-col",
          )}
        >
          {/* Video preview */}
          <div
            className="relative bg-black"
            style={{ aspectRatio: "9 / 16" }}
          >
            {draft.rendered_path ? (
              <video
                src={draft.rendered_path}
                controls
                preload="metadata"
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[var(--text-tertiary)]">
                <Film className="h-8 w-8" aria-hidden />
                <p className="font-mono text-[11px]">rendered_path missing</p>
              </div>
            )}
          </div>

          {/* Card body */}
          <div className="flex flex-col gap-3 p-4">
            {/* Title + status */}
            <div className="flex items-start gap-2">
              <p
                className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)] truncate"
                title={draft.title_template}
              >
                {draft.title_template}
              </p>
              <RenderedBadge />
            </div>

            {/* Meta pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5",
                  "font-mono text-[10px] uppercase tracking-wider",
                  "border-[var(--accent)]/30 bg-[var(--accent-muted)] text-[var(--accent)]",
                )}
              >
                {draft.layout_variant}
              </span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5",
                  "font-mono text-[10px] uppercase tracking-wider",
                  "border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-tertiary)]",
                )}
              >
                {draft.reveal_pattern}
              </span>
            </div>

            {/* Action row */}
            <div
              className={cn(
                "flex items-center gap-2 pt-3 mt-1",
                "border-t border-[var(--border-subtle)]",
              )}
            >
              {/* Approve & Schedule */}
              <Button
                size="sm"
                disabled={busy || !canAct}
                onClick={() =>
                  post(`/api/clips/rendered/${draft.id}/approve`)
                }
                className="h-7 gap-1.5 px-3 text-[11px]"
                aria-label="Approve and schedule this compilation"
              >
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <CalendarClock className="h-3 w-3" aria-hidden />
                )}
                Schedule
              </Button>

              {/* Post now */}
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !canAct}
                onClick={() =>
                  post(`/api/clips/rendered/${draft.id}/approve?action=post_now`)
                }
                className="h-7 gap-1.5 px-3 text-[11px]"
                aria-label="Post this compilation now"
              >
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-3 w-3" aria-hidden />
                )}
                Post now
              </Button>

              {/* Reject */}
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  post(`/api/clips/rendered/${draft.id}/reject`)
                }
                className={cn(
                  "ml-auto h-7 gap-1.5 px-3 text-[11px]",
                  "text-[var(--text-tertiary)] hover:text-[var(--danger)]",
                )}
                aria-label="Reject this compilation"
              >
                <XCircle className="h-3 w-3" aria-hidden />
                Reject
              </Button>
            </div>
          </div>
        </article>
      </HoverLift>
    </motion.div>
  );
}
