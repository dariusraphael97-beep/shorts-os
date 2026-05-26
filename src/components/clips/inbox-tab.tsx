// src/components/clips/inbox-tab.tsx
//
// Server component: fetches clip_library via service-role Supabase, renders the
// grid of ClipCards plus the manual-URL input form.
import { getServiceClient } from "@/lib/supabase/server";
import { listInboxClips } from "@/lib/supabase/repositories/clip-library";
import { ClipCard } from "@/components/clips/clip-card";
import { IngestUrlInput } from "@/components/clips/ingest-url-input";

export async function InboxTab() {
  const supabase = getServiceClient();
  const clips = await listInboxClips(supabase, { limit: 60 });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Inbox ({clips.length})</h2>
        <IngestUrlInput />
      </div>
      {clips.length === 0 ? (
        <p className="text-text-secondary text-sm border border-dashed border-border rounded p-6 text-center">
          No clips yet. The reddit-clip-discovery cron runs every 30 minutes and writes here.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clips.map((clip) => (
            <ClipCard key={clip.id} clip={clip} />
          ))}
        </div>
      )}
    </section>
  );
}
