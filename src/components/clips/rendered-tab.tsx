// src/components/clips/rendered-tab.tsx
//
// Server component: lists compilation_drafts.status='rendered' as playable
// cards. Operator approves → promote to your_videos or post now;
// rejects → flip status to 'failed'.

import { Clapperboard } from "lucide-react";
import { getServiceClient } from "@/lib/supabase/server";
import { listRenderedDrafts } from "@/lib/supabase/repositories/compilation-drafts";
import { RenderedCard } from "@/components/clips/rendered-card";

export async function RenderedTab() {
  const supabase = getServiceClient();
  const drafts = await listRenderedDrafts(supabase, { limit: 30 });

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-[var(--text-tertiary)] uppercase tracking-widest">
          {drafts.length} rendered{drafts.length !== 1 ? "" : ""}
        </p>
      </div>

      {drafts.length === 0 ? (
        /* Designed empty state */
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-1)]/40 px-6 py-16 text-center">
          <Clapperboard className="h-10 w-10 text-[var(--text-tertiary)]" aria-hidden />
          <p className="text-sm font-medium text-[var(--text-secondary)]">
            No rendered compilations yet
          </p>
          <p className="max-w-xs text-xs text-[var(--text-tertiary)] leading-relaxed">
            Approve a Candidate and wait for the render_f2 job to finish. Renders appear here
            ready to schedule or post immediately.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {drafts.map((d, i) => (
            <RenderedCard key={d.id} draft={d} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}
