// src/components/lab/recent-drafts-pane.tsx
//
// Server component. Loads up to 10 of the most recent your_videos rows
// with status='draft'.

import { getServiceClient } from "@/lib/supabase/server";
import { listRecentDrafts } from "@/lib/supabase/repositories/your-videos";
import { DraftRow } from "./draft-row";

export async function RecentDraftsPane() {
  const supabase = getServiceClient();
  const drafts = await listRecentDrafts(supabase, 10);

  return (
    <section className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
        <h2 className="text-lg font-semibold text-text-primary">Recent Drafts</h2>
        <span className="text-xs font-mono text-[var(--text-muted)]">{drafts.length} drafts</span>
      </header>
      {drafts.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--text-muted)]">
          No drafts yet — dispatch a reviewed topic above to make one.
        </p>
      ) : (
        <ul className="divide-y divide-subtle">
          {drafts.map((d) => (
            <DraftRow key={d.id} draft={d} />
          ))}
        </ul>
      )}
    </section>
  );
}
