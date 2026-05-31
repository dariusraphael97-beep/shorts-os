// src/components/lab/scheduled-row.tsx
//
// Client component. A scheduled (or actively uploading) video. Leads with
// the countdown / scheduled time; "Post now" and "Cancel" are subordinate.
// Both handlers (POST /api/lab/upload, /api/lab/cancel-schedule), the
// uploading-state lockout, and the countdown math are preserved exactly.

'use client';

import { useState } from 'react';
import { CalendarClock, Loader2, Send, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { YourVideo } from '@/lib/supabase/repositories/your-videos';
import { Button } from '@/components/ui/button';
import { fadeRise } from '@/lib/motion';

export function ScheduledRow({ video }: { video: YourVideo }) {
  const [busy, setBusy] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  async function cancel() {
    if (!confirm('Cancel this scheduled post? It returns to Rendered.')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/lab/cancel-schedule', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ videoId: video.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Cancel failed: ${j.error ?? res.statusText}`);
        return;
      }
      location.reload();
    } finally { setBusy(false); }
  }

  async function postNow() {
    setBusy(true);
    try {
      const res = await fetch('/api/lab/upload', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ videoId: video.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Post-now failed: ${j.error ?? res.statusText}`);
        return;
      }
      location.reload();
    } finally { setBusy(false); }
  }

  const scheduledFor = video.scheduled_for ? new Date(video.scheduled_for) : null;
  const countdown = scheduledFor ? Math.max(0, scheduledFor.getTime() - Date.now()) : 0;
  const hours = Math.floor(countdown / 3_600_000);
  const minutes = Math.floor((countdown % 3_600_000) / 60_000);
  const isUploading = video.status === 'uploading';

  return (
    <motion.li
      variants={prefersReducedMotion ? undefined : fadeRise}
      className="border-t border-[var(--border-subtle)] first:border-t-0"
    >
      <div className="flex items-center gap-4 px-4 py-3.5">
        <div
          className={
            isUploading
              ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--accent)]/30 bg-[var(--accent-muted)] text-[var(--accent)]'
              : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-secondary)]'
          }
          aria-hidden
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CalendarClock className="h-4 w-4" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">{video.title}</p>
          {isUploading ? (
            <p className="mt-0.5 font-mono text-[11px] text-[var(--accent)]">uploading…</p>
          ) : (
            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
              posts in {hours}h {minutes}m
              {scheduledFor && (
                <span className="text-[var(--text-tertiary)]"> · {scheduledFor.toLocaleString()}</span>
              )}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <Button onClick={postNow} disabled={busy || isUploading} variant="outline" size="sm" className="gap-1.5">
            <Send className="h-3.5 w-3.5" aria-hidden />
            Post now
          </Button>
          <Button onClick={cancel} disabled={busy || isUploading} variant="destructive" size="sm" className="gap-1.5">
            <X className="h-3.5 w-3.5" aria-hidden />
            Cancel
          </Button>
        </div>
      </div>
    </motion.li>
  );
}
