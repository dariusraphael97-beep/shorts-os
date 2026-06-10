import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadLongformPlaybook } from "@/lib/supabase/repositories/longform-playbook";
import { EMPTY_LONGFORM_PLAYBOOK } from "@/lib/agents/longform/playbook";

type Result = { data: unknown; error: unknown };

/** Minimal thenable query-builder fake: every chain method returns itself; awaiting (or maybeSingle)
 *  resolves the canned result for the table. */
function fakeSupabase(byTable: Record<string, Result>): SupabaseClient {
  function builder(table: string) {
    const result = byTable[table] ?? { data: null, error: null };
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      in: () => b,
      maybeSingle: async () => result,
      then: (res: (v: Result) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(result).then(res, rej),
    };
    return b;
  }
  return { from: (t: string) => builder(t) } as unknown as SupabaseClient;
}

const v1Rows = [
  { agent_id: "writer", chosen: { hook: "strong open", angle: "the angle" }, your_video_id: "v1", title: "My Winning Title", ctr_pct: 4, views: 1000, first_30s_retention: 0.7, first_60s_retention: 0.6, relative_retention_opening: 0.5 },
  { agent_id: "style_picker", chosen: { presetId: "technical-illustration" }, your_video_id: "v1", title: "My Winning Title", ctr_pct: 4, views: 1000, first_30s_retention: 0.7, first_60s_retention: 0.6, relative_retention_opening: 0.5 },
  { agent_id: "voice_coach", chosen: { voiceId: "voiceX" }, your_video_id: "v1", title: "My Winning Title", ctr_pct: 4, views: 1000, first_30s_retention: 0.7, first_60s_retention: 0.6, relative_retention_opening: 0.5 },
  { agent_id: "beat_planner", chosen: { avgBeatSeconds: 5 }, your_video_id: "v1", title: "My Winning Title", ctr_pct: 4, views: 1000, first_30s_retention: 0.7, first_60s_retention: 0.6, relative_retention_opening: 0.5 },
];

describe("loadLongformPlaybook", () => {
  it("returns EMPTY for a channel with no posted longform videos (cold start)", async () => {
    const supabase = fakeSupabase({ your_videos: { data: [], error: null } });
    expect(await loadLongformPlaybook(supabase, "ch1")).toEqual(EMPTY_LONGFORM_PLAYBOOK);
  });

  it("folds decision rows into a distilled, retention-first playbook", async () => {
    const supabase = fakeSupabase({
      your_videos: { data: [{ id: "v1" }], error: null },
      longform_decision_outcomes: { data: v1Rows, error: null },
      channels: { data: { niche: { slug: "cars" } }, error: null },
    });
    const pb = await loadLongformPlaybook(supabase, "ch1");
    expect(pb.writer.exemplarHooks).toEqual(["strong open"]);
    expect(pb.writer.winningAngleNotes).toEqual(["the angle"]);
    expect(pb.writer.winningTitleFormulas).toEqual(["My Winning Title"]);
    expect(pb.stylePicker.presetWinsByGenre).toEqual({ cars: "technical-illustration" });
    expect(pb.voice.bestVoiceIdByGenre).toEqual({ cars: "voiceX" });
    expect(pb.beatPlanner.bestBeatSeconds).toBe(5);
    expect(pb.retention.sampleSize).toBe(1);
    expect(pb.retention.bestFirst30sRetention).toBeCloseTo(0.7, 5);
  });

  it("derives opening retention from the raw curve when the scalar columns are null (manual-paste path)", async () => {
    // Mirrors B58 after a manual YT-Studio paste: curve present, derived scalars NOT pre-computed.
    const curveRows = [
      { agent_id: "writer", chosen: { hook: "pasted-curve hook", angle: "pasted angle" }, your_video_id: "v1", title: "T", ctr_pct: 2.9, views: 16,
        first_30s_retention: null, first_60s_retention: null, relative_retention_opening: null,
        duration_seconds: 500,
        // 30s == ratio 0.06 → ~0.62 still watching; 60s == 0.12 → ~0.5
        retention_curve_jsonb: [
          { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1.0 },
          { elapsedVideoTimeRatio: 0.06, audienceWatchRatio: 0.62 },
          { elapsedVideoTimeRatio: 0.12, audienceWatchRatio: 0.5 },
          { elapsedVideoTimeRatio: 1, audienceWatchRatio: 0.1 },
        ] },
    ];
    const supabase = fakeSupabase({
      your_videos: { data: [{ id: "v1" }], error: null },
      longform_decision_outcomes: { data: curveRows, error: null },
      channels: { data: { niche: { slug: "cars" } }, error: null },
    });
    const pb = await loadLongformPlaybook(supabase, "ch1");
    expect(pb.retention.sampleSize).toBe(1);
    expect(pb.retention.bestFirst30sRetention).toBeCloseTo(0.62, 5);
    // 0.62 clears the 0.5 winner floor → it teaches the hook
    expect(pb.writer.exemplarHooks).toEqual(["pasted-curve hook"]);
  });

  it("falls back to EMPTY on any read error (back-compat with L1)", async () => {
    const supabase = fakeSupabase({ your_videos: { data: null, error: { message: "boom" } } });
    expect(await loadLongformPlaybook(supabase, "ch1")).toEqual(EMPTY_LONGFORM_PLAYBOOK);
  });
});
