// src/components/clips/inbox-tab.tsx
//
// Server component: fetches clip_library via service-role Supabase, renders the
// grid of ClipCards plus the manual-URL input form.
import { Inbox } from "lucide-react";
import { getServiceClient } from "@/lib/supabase/server";
import { listInboxClips } from "@/lib/supabase/repositories/clip-library";
import { ClipCard } from "@/components/clips/clip-card";

export async function InboxTab() {
  const supabase = getServiceClient();
  const clips = await listInboxClips(supabase, { limit: 60 });

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-[var(--text-tertiary)] uppercase tracking-widest">
          {clips.length} clip{clips.length !== 1 ? "s" : ""}
        </p>
      </div>

      {clips.length === 0 ? (
        /* Designed empty state */
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-1)]/40 px-6 py-16 text-center">
          <Inbox className="h-10 w-10 text-[var(--text-tertiary)]" aria-hidden />
          <p className="text-sm font-medium text-[var(--text-secondary)]">No clips yet</p>
          <p className="max-w-xs text-xs text-[var(--text-tertiary)] leading-relaxed">
            The reddit-clip-discovery cron runs every 30 minutes and writes here.
            Use the Ingest URL input above to add clips manually.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clips.map((clip, i) => (
            <ClipCard key={clip.id} clip={clip} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}
