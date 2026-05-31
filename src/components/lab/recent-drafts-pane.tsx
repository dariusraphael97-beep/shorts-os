// src/components/lab/recent-drafts-pane.tsx
//
// Server component. Loads up to 10 of the most recent your_videos rows
// with status='draft'.

import { FileVideo } from "lucide-react";
import { getServiceClient } from "@/lib/supabase/server";
import { listRecentDrafts } from "@/lib/supabase/repositories/your-videos";
import { DraftRow } from "./draft-row";

export async function RecentDraftsPane() {
  const supabase = getServiceClient();
  const drafts = await listRecentDrafts(supabase, 10);

  return (
    <section aria-labelledby="drafts-heading">
      <div className="mb-5 flex items-center gap-3">
        <h2
          id="drafts-heading"
          className="text-sm font-semibold uppercase tracking-wide leading-none text-[var(--text-primary)]"
        >
          Recent drafts
        </h2>
        {drafts.length > 0 && (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
            {drafts.length}
          </span>
        )}
        <div className="h-px flex-1 bg-[var(--border-subtle)]" aria-hidden />
      </div>

      {drafts.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] shadow-[var(--elev-1)]">
          {drafts.map((d) => (
            <DraftRow key={d.id} draft={d} />
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
          Dispatch a reviewed topic above and the finished draft will land here,
          ready to render.
        </p>
      </div>
    </div>
  );
}
