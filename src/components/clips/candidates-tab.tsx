// src/components/clips/candidates-tab.tsx
//
// Server component: fetches compilation_drafts.status='proposed' rows, bulk-fetches
// the clip_library + music_tracks details that each draft references, and hands
// everything to the per-card client component for render + button interactions.

import { Layers } from "lucide-react";
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
    (
      (clips ?? []) as Array<{
        id: string;
        local_path: string;
        description: string | null;
        duration_seconds: number;
      }>
    ).map((c) => [c.id, c]),
  );
  const musicMap = Object.fromEntries(
    (
      (music ?? []) as Array<{
        id: string;
        title: string;
        local_path: string;
      }>
    ).map((m) => [m.id, m]),
  );

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-[var(--text-tertiary)] uppercase tracking-widest">
          {drafts.length} candidate{drafts.length !== 1 ? "s" : ""}
        </p>
      </div>

      {drafts.length === 0 ? (
        /* Designed empty state */
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-1)]/40 px-6 py-16 text-center">
          <Layers className="h-10 w-10 text-[var(--text-tertiary)]" aria-hidden />
          <p className="text-sm font-medium text-[var(--text-secondary)]">
            No proposed compilations yet
          </p>
          <p className="max-w-xs text-xs text-[var(--text-tertiary)] leading-relaxed">
            Dispatch a topic that Strategist routes to compilation to generate candidates here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {drafts.map((d, i) => (
            <CandidateCard
              key={d.id}
              draft={d}
              clipMap={clipMap}
              musicMap={musicMap}
              index={i}
            />
          ))}
        </div>
      )}
    </section>
  );
}
