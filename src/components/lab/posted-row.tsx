// src/components/lab/posted-row.tsx
//
// Server component (async). Loads the latest video_analytics snapshot for a
// posted video and presents it. The getServiceClient call, the analytics
// query, the stats typing, and the "View on YouTube" link are preserved
// exactly — presentation only is reskinned.

import { ArrowUpRight, BarChart3, Send } from 'lucide-react';
import type { YourVideo } from '@/lib/supabase/repositories/your-videos';
import { getServiceClient } from '@/lib/supabase/server';

export async function PostedRow({ video }: { video: YourVideo }) {
  const supabase = getServiceClient();
  const { data: latest } = await supabase
    .from('video_analytics')
    .select('views, avg_view_duration_seconds, ctr_pct, snapshot_at')
    .eq('your_video_id', video.id)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const stats = latest as { views: number | null; avg_view_duration_seconds: number | null; ctr_pct: number | null; snapshot_at: string } | null;

  return (
    <li className="border-t border-[var(--border-subtle)] first:border-t-0">
      <div className="flex items-center gap-4 px-4 py-3.5">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-secondary)]"
          aria-hidden
        >
          <Send className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">{video.title}</p>
          {stats ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
              <Stat label="views" value={(stats.views ?? 0).toLocaleString()} />
              <span className="text-[var(--border-strong)]" aria-hidden>·</span>
              <Stat label="avg" value={`${stats.avg_view_duration_seconds?.toFixed(1) ?? '—'}s`} />
              <span className="text-[var(--border-strong)]" aria-hidden>·</span>
              <Stat label="CTR" value={`${stats.ctr_pct?.toFixed(1) ?? '—'}%`} />
            </div>
          ) : (
            <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-[var(--text-tertiary)]">
              <BarChart3 className="h-3 w-3" aria-hidden />
              no analytics yet (sync runs daily)
            </p>
          )}
        </div>

        {video.url && (
          <a
            href={video.url}
            target="_blank"
            rel="noopener"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors duration-[var(--duration-quick)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            View on YouTube
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </div>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[var(--text-primary)]">{value}</span>
      <span className="text-[var(--text-tertiary)]">{label}</span>
    </span>
  );
}
