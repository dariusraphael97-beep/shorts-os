import { describe, it, expect } from "vitest";
import { buildLongformLedgerRows } from "@/lib/longform/ledger";
import type { LongformPlan } from "@/lib/agents/longform/types";

const plan: LongformPlan = {
  topic: "t", targetDurationSeconds: 540, presetId: "cinematic-realistic", musicMood: "cinematic",
  angle: "angle", hook: "hook", estimatedWords: 1200, captionsEnabled: false,
  voice: { provider: "cartesia", voiceId: "v1", speed: 0.95, stability: 0.6 },
  styleBible: { presetId: "cinematic-realistic", positivePrefix: "x", negativePrompt: "no text", lighting: "l", palette: "teal", framing: "f", aspect: "16:9", kenBurnsZoom: 0.06, targetBeatSeconds: 4.5, musicMood: "cinematic" },
  chapters: [
    { index: 0, title: "A", purpose: "p", narration: "n", beats: [
      { index: 0, narrationSlice: "n", estDurationSeconds: 4, sceneDescription: "s", imagePrompt: "ip", negativePrompt: "no text" },
      { index: 1, narrationSlice: "n2", estDurationSeconds: 5, sceneDescription: "s2", imagePrompt: "ip2", negativePrompt: "no text" },
    ] },
  ],
};

describe("longform/ledger", () => {
  it("emits one row per agent keyed to the draft", () => {
    const rows = buildLongformLedgerRows(plan, { jobId: "j1", yourVideoId: "yv1" });
    const agents = rows.map((r) => r.agentId).sort();
    expect(agents).toEqual(["beat_planner", "style_picker", "voice_coach", "writer"]);
    for (const r of rows) {
      expect(r.jobId).toBe("j1");
      expect(r.yourVideoId).toBe("yv1");
    }
  });

  it("captures each agent's salient decision fields", () => {
    const rows = buildLongformLedgerRows(plan, { jobId: "j1", yourVideoId: "yv1" });
    const byAgent = Object.fromEntries(rows.map((r) => [r.agentId, r]));
    expect(byAgent.writer.decisionType).toBe("longform_script");
    expect((byAgent.writer.chosen as Record<string, unknown>).chapterTitles).toEqual(["A"]);
    expect((byAgent.style_picker.chosen as Record<string, unknown>).presetId).toBe("cinematic-realistic");
    expect((byAgent.beat_planner.chosen as Record<string, unknown>).beatCount).toBe(2);
    expect((byAgent.beat_planner.chosen as Record<string, unknown>).avgBeatSeconds).toBeCloseTo(4.5, 5);
    expect((byAgent.voice_coach.chosen as Record<string, unknown>).voiceId).toBe("v1");
  });
});
