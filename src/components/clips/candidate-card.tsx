"use client";
// src/components/clips/candidate-card.tsx
//
// Per-draft card: title, 5 clip thumbnails in order, music preview, Approve /
// Reject / Edit buttons. Edit opens EditDrawer for reorder + label tweaks.

import { useState, type ReactNode } from "react";
import type { CompilationDraftRow } from "@/lib/supabase/repositories/compilation-drafts";
import { EditDrawer } from "@/components/clips/edit-drawer";

interface ClipLite {
  id: string;
  local_path: string;
  description: string | null;
  duration_seconds: number;
}

interface MusicLite {
  id: string;
  title: string;
  local_path: string;
}

export function CandidateCard(props: {
  draft: CompilationDraftRow;
  clipMap: Record<string, ClipLite>;
  musicMap: Record<string, MusicLite>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const music = props.draft.music_track_id
    ? props.musicMap[props.draft.music_track_id]
    : null;
  const sortedRefs = [...props.draft.clip_refs].sort((a, b) => a.order - b.order);
  const totalDuration = sortedRefs.reduce((a, r) => a + (r.end_sec - r.start_sec), 0);

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
    <article className="border border-border rounded p-4 space-y-3 bg-surface-1">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-text-primary">
            {highlightAccent(props.draft.title_template, props.draft.accent_word)}
          </h3>
          <p className="text-xs text-text-secondary mt-0.5">
            Layout: {props.draft.layout_variant} · Reveal: {props.draft.reveal_pattern} ·
            Total {totalDuration.toFixed(1)}s
          </p>
        </div>
      </header>
      <ol className="grid grid-cols-5 gap-2">
        {sortedRefs.map((r) => {
          const c = props.clipMap[r.clip_id];
          return (
            <li key={r.clip_id} className="text-xs">
              {c ? (
                <video
                  src={c.local_path}
                  className="w-full aspect-[9/16] object-cover rounded bg-black"
                  muted
                  preload="metadata"
                />
              ) : (
                <div className="w-full aspect-[9/16] rounded bg-surface-2 grid place-items-center text-text-secondary">
                  ?
                </div>
              )}
              <p className="mt-1 truncate text-text-primary" title={r.label}>
                #{r.order} {r.label}
              </p>
              <p className="text-text-secondary">{(r.end_sec - r.start_sec).toFixed(1)}s</p>
            </li>
          );
        })}
      </ol>
      {music && (
        <div className="text-xs">
          <p className="text-text-secondary">Music: {music.title}</p>
          <audio src={music.local_path} controls className="w-full mt-1" />
        </div>
      )}
      {error && (
        <p className="text-xs text-red-400 font-mono">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => post(`/api/clips/candidates/${props.draft.id}/approve`)}
          className="px-3 py-1.5 rounded text-sm bg-text-primary text-[var(--bg-app)] disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => post(`/api/clips/candidates/${props.draft.id}/reject`)}
          className="px-3 py-1.5 rounded text-sm border border-border hover:bg-surface-2 disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setEditing(true)}
          className="px-3 py-1.5 rounded text-sm border border-border hover:bg-surface-2 disabled:opacity-50"
        >
          Edit
        </button>
      </div>
      {editing && (
        <EditDrawer
          draft={props.draft}
          clipMap={props.clipMap}
          onClose={() => setEditing(false)}
        />
      )}
    </article>
  );
}

function highlightAccent(title: string, accent: string): ReactNode {
  const idx = title.toLowerCase().indexOf(accent.toLowerCase());
  if (idx < 0) return title;
  return (
    <>
      {title.slice(0, idx)}
      <span className="underline decoration-2 underline-offset-2">
        {title.slice(idx, idx + accent.length)}
      </span>
      {title.slice(idx + accent.length)}
    </>
  );
}
