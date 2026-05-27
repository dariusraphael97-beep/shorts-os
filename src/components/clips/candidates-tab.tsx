// src/components/clips/candidates-tab.tsx
//
// Server component: fetches compilation_drafts.status='proposed' rows, bulk-fetches
// the clip_library + music_tracks details that each draft references, and hands
// everything to the per-card client component for render + button interactions.

import { getServiceClient } from "@/lib/supabase/server";
import { listProposedDrafts } from "@/lib/supabase/repositories/compilation-drafts";
import { CandidateCard } from "@/components/clips/candidate-card";

const SENTINEL_UUID = "00000000-0000-0000-0000-000000000000";

export async function CandidatesTab() {
  const supabase = getServiceClient();
  const drafts = await listProposedDrafts(supabase, { limit: 30 });

  const clipIds = [
    ...new Set(drafts.flatMap((d) => d.clip_refs.map((r) => r.clip_id))),
  ];
  const musicIds = [
    ...new Set(
      drafts
        .map((d) => d.music_track_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [{ data: clips }, { data: music }] = await Promise.all([
    supabase
      .from("clip_library")
      .select("id,local_path,description,duration_seconds")
      .in("id", clipIds.length > 0 ? clipIds : [SENTINEL_UUID]),
    supabase
      .from("music_tracks")
      .select("id,title,local_path")
      .in("id", musicIds.length > 0 ? musicIds : [SENTINEL_UUID]),
  ]);

  const clipMap = Object.fromEntries(
    ((clips ?? []) as Array<{ id: string; local_path: string; description: string | null; duration_seconds: number }>).map(
      (c) => [c.id, c],
    ),
  );
  const musicMap = Object.fromEntries(
    ((music ?? []) as Array<{ id: string; title: string; local_path: string }>).map(
      (m) => [m.id, m],
    ),
  );

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">Candidates ({drafts.length})</h2>
      {drafts.length === 0 ? (
        <p className="text-text-secondary text-sm border border-dashed border-border rounded p-6 text-center">
          No proposed compilations yet. Dispatch a topic that Strategist routes to compilation.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {drafts.map((d) => (
            <CandidateCard key={d.id} draft={d} clipMap={clipMap} musicMap={musicMap} />
          ))}
        </div>
      )}
    </section>
  );
}
