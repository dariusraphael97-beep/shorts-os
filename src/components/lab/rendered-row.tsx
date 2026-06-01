// src/components/lab/rendered-row.tsx
//
// Client component. A rendered video awaiting review. Primary action is
// "Approve & Schedule"; "Post now" and "Reject" are subordinate. All three
// action handlers (POST /api/lab/schedule, /api/lab/upload, /api/lab/reject)
// and their behavior are preserved exactly.

"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Film, Loader2, Send, ShieldCheck, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { YourVideo } from "@/lib/supabase/repositories/your-videos";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fadeRise } from "@/lib/motion";

export function RenderedRow({ video }: { video: YourVideo }) {
  const [busy, setBusy] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  async function postNow() {
    setBusy(true);
    try {
      const res = await fetch("/api/lab/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId: video.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Upload failed: ${j.error ?? res.statusText}`);
        return;
      }
      location.reload();
    } finally { setBusy(false); }
  }

  async function approveAndSchedule() {
    setBusy(true);
    try {
      const res = await fetch("/api/lab/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId: video.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Schedule failed: ${j.error ?? res.statusText}`);
        return;
      }
      location.reload();
    } finally { setBusy(false); }
  }

  async function reject() {
    if (!confirm("Reject this render?")) return;
    setBusy(true);
    try {
      await fetch("/api/lab/reject", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId: video.id }),
      });
      location.reload();
    } finally { setBusy(false); }
  }

  return (
    <motion.li
      variants={prefersReducedMotion ? undefined : fadeRise}
      className="border-t border-[var(--border-subtle)] first:border-t-0"
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        {/* Preview */}
        <div className="shrink-0">
          {video.render_artifact_url ? (
            <video
              src={video.render_artifact_url}
              controls
              playsInline
              className="w-full overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-black shadow-[var(--elev-1)] sm:w-40"
              style={{ aspectRatio: "9 / 16" }}
            />
          ) : (
            <div
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-2)]/40 px-4 text-center sm:w-40"
              style={{ aspectRatio: "9 / 16" }}
            >
              <Film className="h-5 w-5 text-[var(--text-tertiary)]" aria-hidden />
              <p className="text-[11px] leading-snug text-[var(--text-tertiary)]">
                No preview available
              </p>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--success)]/30 bg-[var(--success)]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--success)]">
                Rendered
              </span>
              <h3 className="mt-1.5 truncate text-sm font-medium text-[var(--text-primary)]">
                {video.title}
              </h3>
            </div>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
              {video.duration_seconds ? `${video.duration_seconds.toFixed(0)}s` : "—"}
            </span>
          </div>

          {/* Actions — Review leads, primary CTA next, secondaries subordinate */}
          <div className="mt-auto flex flex-wrap items-center gap-2">
            <Link
              href={`/lab/${video.id}/review`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Review
            </Link>
            <Button onClick={approveAndSchedule} disabled={busy} size="sm" className="gap-1.5">
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              )}
              Approve &amp; Schedule
            </Button>
            <Button onClick={postNow} disabled={busy} variant="outline" size="sm" className="gap-1.5">
              <Send className="h-3.5 w-3.5" aria-hidden />
              Post now
            </Button>
            <Button onClick={reject} disabled={busy} variant="destructive" size="sm" className="gap-1.5">
              <X className="h-3.5 w-3.5" aria-hidden />
              Reject
            </Button>
          </div>
        </div>
      </div>
    </motion.li>
  );
}
