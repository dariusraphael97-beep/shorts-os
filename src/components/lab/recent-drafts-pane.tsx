// src/components/lab/recent-drafts-pane.tsx
//
// Server component. Loads up to 10 of the most recent your_videos rows
// (all statuses) with their review verdict, maps each to a DraftRowVM,
// and renders a premium staggered table.

import { FileVideo } from "lucide-react";
import { getServiceClient } from "@/lib/supabase/server";
import { listRecentVideosWithReview } from "@/lib/supabase/repositories/your-videos";
import { toDraftRow } from "@/lib/lab/drafts-view";
import { DraftRow } from "./draft-row";

export async function RecentDraftsPane() {
  const supabase = getServiceClient();
  const videos = await listRecentVideosWithReview(supabase, 10);

  const rows = videos.map((v) =>
    toDraftRow({
      id: v.id,
      title: v.title,
      status: v.status,
      review_verdict: v.overall_verdict,
      thumbnail_url: v.render_artifact_url,
    }),
  );

  return (
    <section aria-labelledby="drafts-heading">
      {/* ── Section header ── */}
      <div className="mb-5 flex items-center gap-3">
        <h2
          id="drafts-heading"
          className="text-sm font-semibold uppercase tracking-wide leading-none text-[var(--text-primary)]"
        >
          Recent drafts
        </h2>
        {rows.length > 0 && (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
            {rows.length}
          </span>
        )}
        <div className="h-px flex-1 bg-[var(--border-subtle)]" aria-hidden />
      </div>

      {/* ── Body ── */}
      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <ul
          className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] shadow-[var(--elev-1)]"
          role="list"
        >
          {rows.map((row, i) => (
            <DraftRow key={row.id} row={row} index={i} />
          ))}
        </ul>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-1)]/40 px-8 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <FileVideo className="h-5 w-5 text-[var(--text-tertiary)]" aria-hidden />
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">No drafts yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--text-secondary)]">
          Generate one from a niche above — it will land here ready to render.
        </p>
      </div>
    </div>
  );
}
