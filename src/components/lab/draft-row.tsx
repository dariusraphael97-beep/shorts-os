// src/components/lab/draft-row.tsx
//
// Client component. Collapsed by default; clicking expands to show
// script + voice + visual_treatment + Re-dispatch / Discard buttons.

"use client";

import { useState } from "react";
import type { YourVideo } from "@/lib/supabase/repositories/your-videos";

export function DraftRow({ draft }: { draft: YourVideo }) {
  const [open, setOpen] = useState(false);

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
    // Optimistic: hide row by reloading the pane via the parent's router.refresh().
    location.reload();
  }

  return (
    <li className="px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 text-left"
      >
        <span className="text-xs font-mono text-text-muted w-28 shrink-0">
          {formatTime(draft.created_at)}
        </span>
        <span className="flex-1 min-w-0 text-sm text-text-primary truncate">
          {draft.title}
        </span>
        <span className="text-xs font-mono text-text-muted">
          {draft.voice_id ?? "—"} · {draft.visual_treatment ?? "—"}
        </span>
        <span className="text-text-muted text-xs">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 pl-2 border-l border-subtle">
          <section>
            <p className="text-xs font-mono text-text-muted uppercase tracking-wide">Script</p>
            <p className="mt-1 text-sm text-text-primary whitespace-pre-wrap">{draft.script}</p>
          </section>
          <section className="flex items-center gap-2">
            <button
              onClick={reDispatch}
              className="px-3 py-1.5 rounded bg-accent-electric text-app text-xs font-medium hover:opacity-90"
              disabled={!draft.topic_queue_id}
            >
              Re-dispatch
            </button>
            <button
              onClick={discard}
              className="px-3 py-1.5 rounded bg-elevated text-accent-red text-xs font-medium hover:bg-hover border border-accent-red/40"
            >
              Discard
            </button>
          </section>
        </div>
      )}
    </li>
  );
}
