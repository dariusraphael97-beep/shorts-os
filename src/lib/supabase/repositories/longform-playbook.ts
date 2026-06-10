// src/lib/supabase/repositories/longform-playbook.ts
// The L2 read path: assemble posted-video outcomes from the decision-ledger ⨝ analytics view, then
// distill them into a LongformPlaybook (retention-first). This is what replaces the hardcoded
// EMPTY_LONGFORM_PLAYBOOK at orchestrator time.
//
// BACK-COMPAT CONTRACT: this NEVER throws and ALWAYS returns a valid playbook. On a cold channel, a
// pre-migration schema, or any read error, it returns EMPTY_LONGFORM_PLAYBOOK — so wiring it into the
// dispatch path can't regress a working pipeline. Learning only switches on once real retention
// accrues.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PresetId } from "@/lib/longform/style-presets";
import { EMPTY_LONGFORM_PLAYBOOK, type LongformPlaybook } from "@/lib/agents/longform/playbook";
import { distillPlaybook, type VideoOutcome } from "@/lib/agents/longform/playbook-distiller";
import { summarizeOpeningRetention, type RetentionCurvePoint } from "@/lib/longform/retention";

/** One row of longform_decision_outcomes (decision ⨝ video ⨝ latest analytics). */
interface OutcomeViewRow {
  agent_id: string | null;
  chosen: Record<string, unknown> | null;
  your_video_id: string | null;
  title: string | null;
  ctr_pct: number | null;
  views: number | null;
  // Added by the L2 retention migrations; absent (→ undefined → null) before they are applied.
  first_30s_retention?: number | null;
  first_60s_retention?: number | null;
  relative_retention_opening?: number | null;
  duration_seconds?: number | null;
  /** Raw curve — lets us derive opening retention when the scalar columns weren't pre-computed
   *  (e.g. a manual YT-Studio paste, which writes the curve but not the derived scalars). */
  retention_curve_jsonb?: RetentionCurvePoint[] | null;
}

const numOrNull = (x: unknown): number | null => (typeof x === "number" ? x : null);
const strOrNull = (x: unknown): string | null => (typeof x === "string" && x.length > 0 ? x : null);

/** The channel's niche slug, used as the genre bucket for per-genre preset/voice winners. */
async function resolveGenre(supabase: SupabaseClient, channelId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("channels")
      .select("niche:niches(slug)")
      .eq("id", channelId)
      .maybeSingle();
    const niche = (data as { niche?: { slug?: string } | { slug?: string }[] } | null)?.niche;
    const slug = Array.isArray(niche) ? niche[0]?.slug : niche?.slug;
    return strOrNull(slug);
  } catch {
    return null;
  }
}

/** Fold every decision row for one video into a single outcome the distiller understands. */
function foldVideo(rows: OutcomeViewRow[], genre: string | null): VideoOutcome {
  const chosenOf = (agentId: string): Record<string, unknown> =>
    (rows.find((r) => r.agent_id === agentId)?.chosen ?? {}) as Record<string, unknown>;
  const writer = chosenOf("writer");
  const style = chosenOf("style_picker");
  const voice = chosenOf("voice_coach");
  const beat = chosenOf("beat_planner");
  const any = rows[0];

  // Prefer the pre-computed scalar columns (the cron path). Fall back to deriving them from the raw
  // curve (the manual-paste path writes the curve but not the scalars) so the engine learns either way.
  let first30 = numOrNull(any.first_30s_retention);
  let first60 = numOrNull(any.first_60s_retention);
  let relOpen = numOrNull(any.relative_retention_opening);
  if (first30 == null && Array.isArray(any.retention_curve_jsonb) && any.retention_curve_jsonb.length > 0) {
    const o = summarizeOpeningRetention(any.retention_curve_jsonb, numOrNull(any.duration_seconds));
    first30 = o.first30sRetention;
    first60 = o.first60sRetention;
    relOpen = o.relativeRetentionOpening;
  }

  return {
    videoId: any.your_video_id ?? "",
    genre,
    presetId: (strOrNull(style.presetId) as PresetId | null) ?? null,
    voiceId: strOrNull(voice.voiceId),
    hook: strOrNull(writer.hook),
    angle: strOrNull(writer.angle),
    title: strOrNull(any.title),
    thumbnailWords: null, // no thumbnail-text field tracked yet
    first30sRetention: first30,
    first60sRetention: first60,
    relativeRetentionOpening: relOpen,
    ctrPct: numOrNull(any.ctr_pct),
    views: numOrNull(any.views),
    avgBeatSeconds: numOrNull(beat.avgBeatSeconds),
  };
}

export async function loadLongformPlaybook(
  supabase: SupabaseClient,
  channelId: string,
): Promise<LongformPlaybook> {
  try {
    // 1) This channel's posted longform videos (scopes the global view to one channel).
    const { data: vids, error: vidErr } = await supabase
      .from("your_videos")
      .select("id")
      .eq("channel_id", channelId)
      .eq("format", "longform")
      .eq("status", "posted");
    if (vidErr) throw vidErr;
    const ids = (vids ?? []).map((v: { id: string }) => v.id);
    if (ids.length === 0) return EMPTY_LONGFORM_PLAYBOOK;

    // 2) Their decision-ledger rows joined to the latest analytics snapshot.
    const { data: rows, error: rowErr } = await supabase
      .from("longform_decision_outcomes")
      .select("agent_id, chosen, your_video_id, title, ctr_pct, views, first_30s_retention, first_60s_retention, relative_retention_opening, duration_seconds, retention_curve_jsonb")
      .in("your_video_id", ids);
    if (rowErr) throw rowErr;

    const genre = await resolveGenre(supabase, channelId);

    // 3) Group decision rows by video, fold, distill.
    const byVideo = new Map<string, OutcomeViewRow[]>();
    for (const r of (rows ?? []) as OutcomeViewRow[]) {
      const key = r.your_video_id ?? "";
      if (!key) continue;
      (byVideo.get(key) ?? byVideo.set(key, []).get(key)!).push(r);
    }
    const outcomes = [...byVideo.values()].map((group) => foldVideo(group, genre));
    return distillPlaybook(outcomes);
  } catch {
    // Cold start, unmigrated schema, or transient read failure → behave exactly like L1.
    return EMPTY_LONGFORM_PLAYBOOK;
  }
}
