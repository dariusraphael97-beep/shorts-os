// src/components/lab/posted-row.tsx
import type { YourVideo } from "@/lib/supabase/repositories/your-videos";

export function PostedRow({ video }: { video: YourVideo }) {
  return (
    <li className="px-4 py-3 flex items-center justify-between gap-3">
      <span className="text-sm text-text-primary truncate">{video.title}</span>
      {video.url ? (
        <a href={video.url} target="_blank" rel="noopener" className="text-xs text-accent-electric hover:underline">
          View on YouTube ↗
        </a>
      ) : (
        <span className="text-xs text-text-muted">Posted at {video.posted_at ?? "—"}</span>
      )}
    </li>
  );
}
