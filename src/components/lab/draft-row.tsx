// src/components/lab/draft-row.tsx
//
// Client component. Collapsed by default; clicking expands to show
// script + voice + visual_treatment + Render / Re-dispatch / Discard buttons.
// Phase 2: adds Render button (POST /api/lab/render) + rendering-state UI.

"use client";

import { useState } from "react";
import {
  ChevronRight,
  Film,
  Loader2,
  RotateCw,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { YourVideo } from "@/lib/supabase/repositories/your-videos";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DraftRow({ draft }: { draft: YourVideo }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  function reDispatch() {
    if (!draft.topic_queue_id) return;
    window.dispatchEvent(
      new CustomEvent("lab:dispatch-start", { detail: { topicId: draft.topic_queue_id } }),
    );
  }

  async function discard() {
    if (!confirm("Discard this draft?")) return;
    await fetch(`/api/lab/drafts/${draft.id}`, { method: "DELETE" }).catch(() => null);
    location.reload();
  }

  async function render() {
    setBusy(true);
    try {
      const res = await fetch("/api/lab/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draftId: draft.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Render failed: ${err.error ?? res.statusText}`);
        return;
      }
      location.reload();
    } finally { setBusy(false); }
  }

  const isRendering = draft.status === "rendering";

  return (
    <li className="border-t border-[var(--border-subtle)] first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-[var(--duration-quick)] hover:bg-[var(--surface-2)]/50"
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform duration-[var(--duration-quick)]",
            open && "rotate-90",
          )}
          aria-hidden
        />
        <span className="w-28 shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
          {formatTime(draft.created_at)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">
          {draft.title}
        </span>
        {isRendering && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-muted)] px-2 py-0.5 font-mono text-[10px] text-[var(--accent)]">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            rendering
          </span>
        )}
        <span className="hidden shrink-0 font-mono text-[11px] text-[var(--text-tertiary)] sm:inline">
          {draft.voice_id ?? "—"} · {draft.visual_treatment ?? "—"}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-4 pb-4 pl-11">
              <section className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                  Script
                </p>
                <p className="whitespace-pre-wrap rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]/60 p-3 text-sm leading-relaxed text-[var(--text-primary)]">
                  {draft.script}
                </p>
              </section>
              <section className="flex flex-wrap items-center gap-2">
                {!isRendering && (
                  <Button
                    onClick={render}
                    disabled={busy}
                    size="sm"
                    className="gap-1.5"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Film className="h-3.5 w-3.5" aria-hidden />
                    )}
                    Render
                  </Button>
                )}
                <Button
                  onClick={reDispatch}
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={!draft.topic_queue_id || isRendering}
                >
                  <RotateCw className="h-3.5 w-3.5" aria-hidden />
                  Re-dispatch
                </Button>
                <Button
                  onClick={discard}
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  disabled={isRendering}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Discard
                </Button>
              </section>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
