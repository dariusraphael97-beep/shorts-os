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
    <li className="px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-text-primary truncate">{video.title}</p>
        {stats ? (
          <p className="text-xs font-mono text-[var(--text-muted)]">
            {stats.views ?? 0} views · {stats.avg_view_duration_seconds?.toFixed(1) ?? '—'}s avg · {stats.ctr_pct?.toFixed(1) ?? '—'}% CTR
          </p>
        ) : (
          <p className="text-xs font-mono text-[var(--text-muted)]">no analytics yet (sync runs daily)</p>
        )}
      </div>
      {video.url && (
        <a href={video.url} target="_blank" rel="noopener" className="text-xs text-[var(--accent-electric)] hover:underline shrink-0">
          View on YouTube ↗
        </a>
      )}
    </li>
  );
}
