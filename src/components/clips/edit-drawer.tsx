"use client";
// src/components/clips/edit-drawer.tsx
//
// Modal drawer for editing a proposed compilation draft. v1 supports:
//   - Reorder the 5 clips with ↑/↓ buttons
//   - Edit each clip's label text
// v2 (deferred): swap a clip from the candidate pool, change music track.

import { useState } from "react";
import type {
  ClipRef,
  CompilationDraftRow,
} from "@/lib/supabase/repositories/compilation-drafts";

interface ClipLite {
  id: string;
  local_path: string;
  description: string | null;
  duration_seconds: number;
}

export function EditDrawer(props: {
  draft: CompilationDraftRow;
  clipMap: Record<string, ClipLite>;
  onClose: () => void;
}) {
  const initial = [...props.draft.clip_refs].sort((a, b) => a.order - b.order);
  const [refs, setRefs] = useState<ClipRef[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/clips/candidates/${props.draft.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clip_refs: refs,
          music_track_id: props.draft.music_track_id,
        }),
      });
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

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= refs.length) return;
    const next = [...refs];
    [next[i], next[j]] = [next[j], next[i]];
    setRefs(next.map((r, idx) => ({ ...r, order: idx + 1 })));
  }

  function setLabel(clipId: string, label: string) {
    setRefs((rs) => rs.map((r) => (r.clip_id === clipId ? { ...r, label } : r)));
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={props.onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-1 border border-border rounded p-6 max-w-2xl w-full space-y-4"
      >
        <h3 className="font-medium text-text-primary">Edit compilation</h3>
        <ol className="space-y-2">
          {refs.map((r, i) => {
            const c = props.clipMap[r.clip_id];
            return (
              <li key={r.clip_id} className="flex gap-2 items-center">
                <span className="text-xs text-text-secondary w-6 text-right">#{i + 1}</span>
                <div className="w-12 h-20 rounded overflow-hidden bg-black shrink-0">
                  {c && (
                    <video
                      src={c.local_path}
                      className="w-full h-full object-cover"
                      muted
                      preload="metadata"
                    />
                  )}
                </div>
                <input
                  value={r.label}
                  onChange={(e) => setLabel(r.clip_id, e.target.value)}
                  className="flex-1 bg-surface-2 border border-border rounded px-2 py-1 text-sm text-text-primary"
                  placeholder="Label"
                />
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="text-sm px-1 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === refs.length - 1}
                    className="text-sm px-1 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
        {error && (
          <p className="text-xs text-red-400 font-mono">{error}</p>
        )}
        <div className="flex gap-2 justify-end items-center">
          <p className="text-xs text-text-secondary mr-auto">
            v1: reorder + label edit. Clip-swap from pool ships in a follow-up.
          </p>
          <button
            type="button"
            onClick={props.onClose}
            className="px-3 py-1.5 rounded text-sm border border-border hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="px-3 py-1.5 rounded text-sm bg-text-primary text-[var(--bg-app)] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
