'use client';

import { useState } from 'react';
import type { YourVideo } from '@/lib/supabase/repositories/your-videos';

export function ScheduledRow({ video }: { video: YourVideo }) {
  const [busy, setBusy] = useState(false);

  async function cancel() {
    if (!confirm('Cancel this scheduled post? It returns to Rendered.')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/lab/cancel-schedule', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ videoId: video.id }),
      });
      if (!res.ok) alert('Cancel failed.');
      else location.reload();
    } finally { setBusy(false); }
  }

  async function postNow() {
    setBusy(true);
    try {
      const res = await fetch('/api/lab/upload', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ videoId: video.id }),
      });
      if (!res.ok) alert('Post-now failed.');
      else location.reload();
    } finally { setBusy(false); }
  }

  const scheduledFor = video.scheduled_for ? new Date(video.scheduled_for) : null;
  const countdown = scheduledFor ? Math.max(0, scheduledFor.getTime() - Date.now()) : 0;
  const hours = Math.floor(countdown / 3_600_000);
  const minutes = Math.floor((countdown % 3_600_000) / 60_000);
  const isUploading = video.status === 'uploading';

  return (
    <li className="px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-text-primary truncate">{video.title}</p>
        {isUploading ? (
          <p className="text-xs font-mono text-accent-electric">uploading…</p>
        ) : (
          <p className="text-xs font-mono text-text-muted">
            posts in {hours}h {minutes}m
            {scheduledFor && ` · ${scheduledFor.toLocaleString()}`}
          </p>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        <button onClick={postNow} disabled={busy || isUploading} className="px-3 py-1.5 rounded bg-elevated text-text-primary text-xs font-medium hover:bg-hover border border-subtle disabled:opacity-50">
          Post now
        </button>
        <button onClick={cancel} disabled={busy || isUploading} className="px-3 py-1.5 rounded bg-elevated text-accent-red text-xs font-medium hover:bg-hover border border-accent-red/40 disabled:opacity-50">
          Cancel
        </button>
      </div>
    </li>
  );
}
