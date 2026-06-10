"use client";
// src/components/clips/rendered-card.tsx
//
// Per-rendered-draft tile: inline preview + Approve/Reject buttons.
// Approve promotes the draft into your_videos (Task 15 route). Reject flips
// the draft status to 'failed'.

import { useState } from "react";
import type { CompilationDraftRow } from "@/lib/supabase/repositories/compilation-drafts";

export function RenderedCard(props: { draft: CompilationDraftRow }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST" });
      if (!res.ok) {
        setError(`${res.status}: ${await res.text()}`);
        return;
      }
      window.location.reload();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="border border-border rounded p-3 space-y-3 bg-surface-1">
      <h3 className="text-sm font-medium text-text-primary truncate">
        {props.draft.title_template}
      </h3>
      {props.draft.rendered_path ? (
        <video
          src={props.draft.rendered_path}
          controls
          className="w-full aspect-[9/16] rounded bg-black"
          preload="metadata"
        />
      ) : (
        <div className="w-full aspect-[9/16] rounded bg-surface-2 grid place-items-center text-text-secondary text-xs">
          rendered_path missing
        </div>
      )}
      {error && <p className="text-xs text-red-400 font-mono">{error}</p>}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          disabled={busy || !props.draft.rendered_path}
          onClick={() => post(`/api/clips/rendered/${props.draft.id}/approve`)}
          className="px-3 py-1.5 rounded text-sm bg-text-primary text-[var(--bg-app)] disabled:opacity-50"
        >
          Approve &amp; Schedule
        </button>
        <button
          type="button"
          disabled={busy || !props.draft.rendered_path}
          onClick={() => post(`/api/clips/rendered/${props.draft.id}/approve?action=post_now`)}
          className="px-3 py-1.5 rounded text-sm border border-border hover:bg-surface-2 disabled:opacity-50"
        >
          Post now
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => post(`/api/clips/rendered/${props.draft.id}/reject`)}
          className="px-3 py-1.5 rounded text-sm border border-border hover:bg-surface-2 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </article>
  );
}
