// src/components/clips/rendered-tab.tsx
//
// Server component: lists compilation_drafts.status='rendered' as playable
// cards. Operator approves → promote to your_videos (Task 15 route) or
// rejects → flip status to 'failed'.

import { getServiceClient } from "@/lib/supabase/server";
import { listRenderedDrafts } from "@/lib/supabase/repositories/compilation-drafts";
import { RenderedCard } from "@/components/clips/rendered-card";

export async function RenderedTab() {
  const supabase = getServiceClient();
  const drafts = await listRenderedDrafts(supabase, { limit: 30 });
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">Rendered ({drafts.length})</h2>
      {drafts.length === 0 ? (
        <p className="text-text-secondary text-sm border border-dashed border-border rounded p-6 text-center">
          No rendered compilations yet. Approve a Candidate and wait for render_f2 to finish.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {drafts.map((d) => (
            <RenderedCard key={d.id} draft={d} />
          ))}
        </div>
      )}
    </section>
  );
}
