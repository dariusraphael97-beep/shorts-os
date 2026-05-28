// src/components/lab/rendered-row.tsx
"use client";

import { useState } from "react";
import type { YourVideo } from "@/lib/supabase/repositories/your-videos";

export function RenderedRow({ video }: { video: YourVideo }) {
  const [busy, setBusy] = useState(false);

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
    <li className="px-4 py-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-text-primary truncate">{video.title}</h3>
        <span className="text-xs font-mono text-text-muted">
          {video.duration_seconds ? `${video.duration_seconds.toFixed(0)}s` : "—"}
        </span>
      </div>

      {video.render_artifact_url ? (
        <video
          src={video.render_artifact_url}
          controls
          playsInline
          className="w-full max-w-xs rounded border border-subtle bg-black"
          style={{ aspectRatio: "9 / 16" }}
        />
      ) : (
        <p className="text-xs text-text-muted">No render_artifact_url; cannot preview.</p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={approveAndSchedule}
          disabled={busy}
          className="px-3 py-1.5 rounded bg-accent-electric text-app text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          Approve &amp; Schedule
        </button>
        <button
          onClick={postNow}
          disabled={busy}
          className="px-3 py-1.5 rounded bg-elevated text-text-primary text-xs font-medium hover:bg-hover border border-subtle disabled:opacity-50"
        >
          Post now
        </button>
        <button
          onClick={reject}
          disabled={busy}
          className="px-3 py-1.5 rounded bg-elevated text-accent-red text-xs font-medium hover:bg-hover border border-accent-red/40 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </li>
  );
}
