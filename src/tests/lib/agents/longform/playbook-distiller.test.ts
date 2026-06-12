import { describe, it, expect } from "vitest";
import {
  distillPlaybook,
  WINNER_FIRST_30S_FLOOR,
  type VideoOutcome,
} from "@/lib/agents/longform/playbook-distiller";
import { EMPTY_LONGFORM_PLAYBOOK } from "@/lib/agents/longform/playbook";

function outcome(over: Partial<VideoOutcome>): VideoOutcome {
  return {
    videoId: "v",
    genre: null,
    presetId: null,
    voiceId: null,
    hook: null,
    angle: null,
    title: null,
    thumbnailWords: null,
    first30sRetention: null,
    first60sRetention: null,
    relativeRetentionOpening: null,
    ctrPct: null,
    views: null,
    avgBeatSeconds: null,
    ...over,
  };
}

describe("distillPlaybook", () => {
  it("returns the EMPTY playbook for no input (cold start)", () => {
    expect(distillPlaybook([])).toEqual(EMPTY_LONGFORM_PLAYBOOK);
  });

  it("ignores videos with no retention reading (treats them as unmeasured)", () => {
    const pb = distillPlaybook([
      outcome({ videoId: "a", hook: "no-retention hook", ctrPct: 9, views: 100000 }),
    ]);
    expect(pb).toEqual(EMPTY_LONGFORM_PLAYBOOK);
  });

  it("ranks hooks by first-30s retention ABOVE CTR (the Quality-CTR rule)", () => {
    // A: great CTR, weaker 30s hold.  B: lower CTR, stronger 30s hold. B must win.
    const pb = distillPlaybook([
      outcome({ videoId: "a", hook: "high CTR hook", first30sRetention: 0.6, ctrPct: 9.0, views: 500000 }),
      outcome({ videoId: "b", hook: "strong hold hook", first30sRetention: 0.8, ctrPct: 3.0, views: 50000 }),
    ]);
    expect(pb.writer.exemplarHooks).toEqual(["strong hold hook", "high CTR hook"]);
    expect(pb.writer.rankedExemplars[0].sourceVideoId).toBe("b");
  });

  it("excludes a high-CTR slow-open video from winners entirely (B58 lesson)", () => {
    const pb = distillPlaybook([
      // Best clicks + most views, but the open collapses below the floor → NOT teachable.
      outcome({ videoId: "slow", hook: "clickbait that doesn't deliver", first30sRetention: 0.2, ctrPct: 12, views: 900000 }),
      outcome({ videoId: "good", hook: "honest strong open", first30sRetention: 0.7, ctrPct: 4, views: 40000 }),
    ]);
    expect(pb.writer.exemplarHooks).toEqual(["honest strong open"]);
    // ...but it still counts toward the channel benchmark sample (we measured it).
    expect(pb.retention.sampleSize).toBe(2);
  });

  it("breaks ties by 60s retention, then relative-opening, then CTR — never CTR first", () => {
    const pb = distillPlaybook([
      outcome({ videoId: "x", hook: "x", first30sRetention: 0.7, first60sRetention: 0.5, ctrPct: 2 }),
      outcome({ videoId: "y", hook: "y", first30sRetention: 0.7, first60sRetention: 0.6, ctrPct: 1 }),
    ]);
    // equal 30s; y holds 60s better → y first even though x has higher CTR
    expect(pb.writer.exemplarHooks).toEqual(["y", "x"]);
  });

  it("computes retention benchmarks over all measured videos (median + best + sample size)", () => {
    const pb = distillPlaybook([
      outcome({ videoId: "a", hook: "a", first30sRetention: 0.4, first60sRetention: 0.3 }),
      outcome({ videoId: "b", hook: "b", first30sRetention: 0.6, first60sRetention: 0.5 }),
      outcome({ videoId: "c", hook: "c", first30sRetention: 0.8, first60sRetention: 0.7 }),
    ]);
    expect(pb.retention.medianFirst30sRetention).toBeCloseTo(0.6, 5);
    expect(pb.retention.medianFirst60sRetention).toBeCloseTo(0.5, 5);
    expect(pb.retention.bestFirst30sRetention).toBeCloseTo(0.8, 5);
    expect(pb.retention.sampleSize).toBe(3);
  });

  it("picks per-genre preset + voice winners by retention, and the median winning beat length", () => {
    const pb = distillPlaybook([
      outcome({ videoId: "cars1", genre: "cars", presetId: "technical-illustration", voiceId: "voiceA", first30sRetention: 0.9, avgBeatSeconds: 4 }),
      outcome({ videoId: "cars2", genre: "cars", presetId: "naturalist-illustration", voiceId: "voiceB", first30sRetention: 0.6, avgBeatSeconds: 6 }),
      outcome({ videoId: "nat1", genre: "nature", presetId: "naturalist-illustration", voiceId: "voiceC", first30sRetention: 0.7, avgBeatSeconds: 5 }),
    ]);
    expect(pb.stylePicker.presetWinsByGenre).toEqual({ cars: "technical-illustration", nature: "naturalist-illustration" });
    expect(pb.voice.bestVoiceIdByGenre).toEqual({ cars: "voiceA", nature: "voiceC" });
    // winners' avgBeatSeconds = [4,6,5] → median 5
    expect(pb.beatPlanner.bestBeatSeconds).toBe(5);
    // prompt pattern tags = distinct winning presets
    expect(pb.beatPlanner.promptPatternTags).toEqual(expect.arrayContaining(["technical-illustration", "naturalist-illustration"]));
  });

  it("dedupes exemplars and caps each list", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      outcome({ videoId: `v${i}`, hook: i < 2 ? "dup hook" : `hook ${i}`, angle: "same angle", first30sRetention: 0.9 - i * 0.01 }),
    );
    const pb = distillPlaybook(many);
    expect(pb.writer.exemplarHooks).toContain("dup hook");
    expect(pb.writer.exemplarHooks.filter((h) => h === "dup hook")).toHaveLength(1); // deduped
    expect(pb.writer.exemplarHooks.length).toBeLessThanOrEqual(5); // capped
    expect(pb.writer.winningAngleNotes).toEqual(["same angle"]); // all identical → one
  });

  it("distills thumbnail word + number combos when thumbnail text exists", () => {
    const pb = distillPlaybook([
      outcome({ videoId: "t", thumbnailWords: ["800", "WHP", "FORGED?"], first30sRetention: 0.8 }),
    ]);
    expect(pb.thumbnail.winningWordCombos).toEqual(["800 WHP FORGED?"]);
    expect(pb.thumbnail.winningNumberPatterns).toEqual(["800"]);
  });

  it("exposes the winner floor as a constant so the ranking rule is auditable", () => {
    expect(WINNER_FIRST_30S_FLOOR).toBeGreaterThan(0);
    expect(WINNER_FIRST_30S_FLOOR).toBeLessThan(1);
  });
});
