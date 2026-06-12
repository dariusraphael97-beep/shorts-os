// src/components/lab/draft-row.tsx
//
// Client component. Collapsed by default; clicking expands to show
// script + voice + visual_treatment + Render / Re-dispatch / Discard buttons.
// Phase 2: adds Render button (POST /api/lab/render) + rendering-state UI.

"use client";

import { useState } from "react";
import type { YourVideo } from "@/lib/supabase/repositories/your-videos";

export function DraftRow({ draft }: { draft: YourVideo }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

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
    <li className="px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 text-left"
      >
        <span className="text-xs font-mono text-[var(--text-muted)] w-28 shrink-0">
          {formatTime(draft.created_at)}
        </span>
        <span className="flex-1 min-w-0 text-sm text-text-primary truncate">{draft.title}</span>
        <span className="text-xs font-mono text-[var(--text-muted)]">
          {draft.voice_id ?? "—"} · {draft.visual_treatment ?? "—"}
        </span>
        {isRendering && (
          <span className="text-xs font-mono text-[var(--accent-electric)]">rendering…</span>
        )}
        <span className="text-[var(--text-muted)] text-xs">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 pl-2 border-l border-[var(--border-subtle)]">
          <section>
            <p className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-wide">Script</p>
            <p className="mt-1 text-sm text-text-primary whitespace-pre-wrap">{draft.script}</p>
          </section>
          <section className="flex items-center gap-2">
            {!isRendering && (
              <button
                onClick={render}
                disabled={busy}
                className="px-3 py-1.5 rounded bg-[var(--accent-electric)] text-[var(--bg-app)] text-xs font-medium hover:opacity-90 disabled:opacity-50"
              >
                Render
              </button>
            )}
            <button
              onClick={reDispatch}
              className="px-3 py-1.5 rounded bg-[var(--bg-elevated)] text-text-primary text-xs font-medium hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] disabled:opacity-50"
              disabled={!draft.topic_queue_id || isRendering}
            >
              Re-dispatch
            </button>
            <button
              onClick={discard}
              className="px-3 py-1.5 rounded bg-[var(--bg-elevated)] text-[var(--accent-red)] text-xs font-medium hover:bg-[var(--bg-hover)] border border-[var(--accent-red)]/40 disabled:opacity-50"
              disabled={isRendering}
            >
              Discard
            </button>
          </section>
        </div>
      )}
    </li>
  );
}
