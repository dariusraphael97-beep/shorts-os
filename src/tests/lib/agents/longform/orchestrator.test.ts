import { describe, it, expect, vi } from "vitest";
import { runLongformPipeline, type LongformPipelineDeps } from "@/lib/agents/longform/orchestrator";
import { getStylePreset } from "@/lib/longform/style-presets";

function deps(): LongformPipelineDeps {
  return {
    runWriter: vi.fn(async () => ({ angle: "a", hook: "h", estimatedWords: 100, chapters: [{ title: "C1", purpose: "p", narration: "A man walks on. The lights dim." }], factSheet: { facts: [], uncertain: [] } })),
    runStylePicker: vi.fn(async () => ({ presetId: "cinematic-realistic" as const, musicMood: "cinematic", rationale: "r", styleBible: getStylePreset("cinematic-realistic") })),
    runBeatPlanner: vi.fn(async () => ({ chapters: [{ chapterIndex: 0, beats: [{ index: 0, narrationSlice: "A man walks on.", estDurationSeconds: 4, sceneDescription: "s", imagePrompt: "ip", negativePrompt: "no text", visualKind: "illustration" as const, photoQuery: "" }] }] })),
    pickVoice: vi.fn(async () => ({ voiceId: "5ee9feff-1265-424a-9d7f-8e4d431a12c7" as const, provider: "cartesia" as const, speed: 0.95, stability: 0.6, rationale: "r" })),
    createJob: vi.fn(async () => ({ id: "job1" })),
    createDraft: vi.fn(async () => ({ id: "yv1" })),
    recordLedger: vi.fn(async () => {}),
    enqueueRender: vi.fn(async () => ({ id: "rj1" })),
    finishJob: vi.fn(async () => {}),
    failJob: vi.fn(async () => {}),
  };
}

async function collect(gen: AsyncGenerator<{ type: string }>) {
  const events = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe("longform/orchestrator", () => {
  it("runs all agents, persists, enqueues render, and emits a job_completed event", async () => {
    const d = deps();
    const events = await collect(runLongformPipeline({ topic: "t", targetDurationSeconds: 540, channelId: "ch1" }, d));
    const types = events.map((e) => e.type);
    expect(types).toContain("job_started");
    expect(types).toContain("job_completed");
    expect(d.createDraft).toHaveBeenCalledOnce();
    expect(d.recordLedger).toHaveBeenCalledOnce();
    expect(d.enqueueRender).toHaveBeenCalledWith(expect.objectContaining({ yourVideoId: "yv1" }));
  });

  it("threads the writer's fact sheet onto the persisted plan (audit trail)", async () => {
    const d = deps();
    (d.runWriter as ReturnType<typeof vi.fn>).mockResolvedValue({
      angle: "a", hook: "h", estimatedWords: 100,
      chapters: [{ title: "C1", purpose: "p", narration: "A man walks on. The lights dim." }],
      factSheet: { facts: [{ claim: "800whp on stock block", detail: "~$6-10k", sourceUrl: "https://x.com/a" }], uncertain: [] },
    });
    await collect(runLongformPipeline({ topic: "t", targetDurationSeconds: 540, channelId: "ch1" }, d));
    expect(d.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ plan: expect.objectContaining({ factSheet: expect.objectContaining({ facts: [expect.objectContaining({ detail: "~$6-10k" })] }) }) }),
    );
  });

  it("emits job_failed and calls failJob if an agent throws", async () => {
    const d = deps();
    (d.runWriter as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("writer boom"));
    const events = await collect(runLongformPipeline({ topic: "t", targetDurationSeconds: 540, channelId: "ch1" }, d));
    expect(events.some((e) => e.type === "job_failed")).toBe(true);
    expect(d.failJob).toHaveBeenCalledOnce();
    expect(d.enqueueRender).not.toHaveBeenCalled();
  });

  it("forces the operator-selected preset and skips the style-picker LLM", async () => {
    const d = deps();
    const events = await collect(runLongformPipeline({ topic: "t", targetDurationSeconds: 540, channelId: "ch1", presetId: "stick-figure-animated" }, d));
    expect(d.runStylePicker).not.toHaveBeenCalled();
    expect(d.createDraft).toHaveBeenCalledWith(expect.objectContaining({ presetId: "stick-figure-animated" }));
    // the forced preset must drive the beat-planner's style bible too
    expect(d.runBeatPlanner).toHaveBeenCalledWith(expect.objectContaining({ styleBible: expect.objectContaining({ presetId: "stick-figure-animated" }) }));
    expect(events.map((e) => e.type)).toContain("job_completed");
  });

  it("still runs the style-picker when no preset is forced", async () => {
    const d = deps();
    await collect(runLongformPipeline({ topic: "t", targetDurationSeconds: 540, channelId: "ch1" }, d));
    expect(d.runStylePicker).toHaveBeenCalledOnce();
  });

  it("passes trustedFacts through to the writer", async () => {
    const d = deps();
    await collect(runLongformPipeline({ topic: "t", targetDurationSeconds: 540, channelId: "ch1", trustedFacts: ["800whp on stock ~$5-10k"] }, d));
    expect(d.runWriter).toHaveBeenCalledWith(expect.objectContaining({ trustedFacts: ["800whp on stock ~$5-10k"] }));
  });

  it("scriptOverride skips the Writer and persists the provided narration + trustedFacts as the fact sheet", async () => {
    const d = deps();
    const events = await collect(runLongformPipeline({
      topic: "the invention of three meals a day", targetDurationSeconds: 540, channelId: "ch1",
      presetId: "stick-figure-animated",
      scriptOverride: {
        angle: "the meal schedule is an invention",
        hook: "You eat three meals a day. Nobody asked why.",
        chapters: [{ title: "Cold open", purpose: "hook", narration: "You eat three meals a day. Nobody ever asked why. The schedule is younger than the lightbulb." }],
      },
      trustedFacts: ["Kellogg's Corn Flakes launched in 1898"],
    }, d));
    expect(d.runWriter).not.toHaveBeenCalled();
    expect(d.createDraft).toHaveBeenCalledWith(expect.objectContaining({
      plan: expect.objectContaining({
        hook: "You eat three meals a day. Nobody asked why.",
        factSheet: expect.objectContaining({ facts: [expect.objectContaining({ claim: "Kellogg's Corn Flakes launched in 1898" })] }),
        chapters: [expect.objectContaining({ narration: expect.stringContaining("younger than the lightbulb") })],
      }),
    }));
    expect(events.map((e) => e.type)).toContain("job_completed");
  });

  it("voiceId override replaces the default narrator", async () => {
    const d = deps();
    await collect(runLongformPipeline({ topic: "t", targetDurationSeconds: 540, channelId: "ch1", voiceId: "american-voice-123" }, d));
    expect(d.createDraft).toHaveBeenCalledWith(expect.objectContaining({
      plan: expect.objectContaining({ voice: expect.objectContaining({ provider: "elevenlabs", voiceId: "american-voice-123" }) }),
    }));
  });

  it("without voiceId the narrator stays the George default", async () => {
    const d = deps();
    await collect(runLongformPipeline({ topic: "t", targetDurationSeconds: 540, channelId: "ch1" }, d));
    expect(d.createDraft).toHaveBeenCalledWith(expect.objectContaining({
      plan: expect.objectContaining({ voice: expect.objectContaining({ voiceId: "JBFqnCBsd6RMkjVDRZzb" }) }),
    }));
  });

  it("yield-event sequence is identical whether the Writer runs or is skipped via scriptOverride", async () => {
    const d1 = deps();
    const eventsDefault = await collect(runLongformPipeline({ topic: "t", targetDurationSeconds: 540, channelId: "ch1", presetId: "stick-figure-animated" }, d1));

    const d2 = deps();
    const eventsOverride = await collect(runLongformPipeline({
      topic: "t", targetDurationSeconds: 540, channelId: "ch1", presetId: "stick-figure-animated",
      scriptOverride: {
        angle: "the meal schedule is an invention",
        hook: "You eat three meals a day. Nobody asked why.",
        chapters: [{ title: "Cold open", purpose: "hook", narration: "You eat three meals a day. Nobody ever asked why. The schedule is younger than the lightbulb." }],
      },
    }, d2));

    expect(eventsOverride.map((e) => e.type)).toEqual(eventsDefault.map((e) => e.type));
  });
});
