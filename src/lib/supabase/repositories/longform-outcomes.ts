// src/lib/supabase/repositories/longform-outcomes.ts
// Reads the longform_decision_outcomes view (decision ledger ⨝ latest analytics).
// This is the feedback-flywheel join; it returns rows only as posted videos accrue analytics.
// Phase L2's learning engine will mine this; L1 only needs the join to exist + read cleanly.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface LongformOutcome {
  decisionId: string;
  agentId: string;
  decisionType: string;
  chosen: Record<string, unknown>;
  yourVideoId: string;
  title: string;
  status: string;
  postedAt: string | null;
  views: number | null;
  avgViewDurationSeconds: number | null;
  ctrPct: number | null;
  watchTimeSeconds: number | null;
  analyticsSnapshotAt: string | null;
}

export interface OutcomeRow {
  decision_id: string;
  agent_id: string;
  decision_type: string;
  chosen: unknown;
  your_video_id: string;
  title: string;
  status: string;
  posted_at: string | null;
  views: number | null;
  avg_view_duration_seconds: number | null;
  ctr_pct: number | null;
  watch_time_seconds: number | null;
  analytics_snapshot_at: string | null;
}

export function mapOutcomeRow(row: OutcomeRow): LongformOutcome {
  return {
    decisionId: row.decision_id,
    agentId: row.agent_id,
    decisionType: row.decision_type,
    chosen: (row.chosen ?? {}) as Record<string, unknown>,
    yourVideoId: row.your_video_id,
    title: row.title,
    status: row.status,
    postedAt: row.posted_at,
    views: row.views,
    avgViewDurationSeconds: row.avg_view_duration_seconds,
    ctrPct: row.ctr_pct,
    watchTimeSeconds: row.watch_time_seconds,
    analyticsSnapshotAt: row.analytics_snapshot_at,
  };
}

export async function getLongformOutcomes(supabase: SupabaseClient, yourVideoId: string): Promise<LongformOutcome[]> {
  const { data, error } = await supabase
    .from("longform_decision_outcomes")
    .select("*")
    .eq("your_video_id", yourVideoId);
  if (error) throw new Error(`getLongformOutcomes: ${error.message}`);
  return (data as OutcomeRow[]).map(mapOutcomeRow);
}
