import { describe, it, expect, vi } from "vitest";
import { classifyBatch } from "@/lib/classifier/classify";
import type { ClassifierDeps, ClassifierInput, TopicCall, FormatCall } from "@/lib/classifier/classify";

const input = (id: string): ClassifierInput => ({
  videoId: id, title: `t-${id}`, description: "d", tags: ["x"], channelTitle: "ch",
  channelSubscriberCount: 1000, durationSeconds: 30, viewCount: 5, likeCount: 1,
  commentCount: 0, thumbnailUrl: `https://img/${id}.jpg`,
});

function deps(over: Partial<ClassifierDeps> = {}): ClassifierDeps {
  return {
    topicModel: "m-topic", formatModel: "m-format", promptVersion: "test1",
    generateTopicBatch: vi.fn(async (items: ClassifierInput[]): Promise<TopicCall[]> => items.map((i) => ({
      videoId: i.videoId, topic_label: `topic ${i.videoId}`, audience_signal: "general", confidence: 0.9,
    }))),
    generateFormat: vi.fn(async (i: ClassifierInput): Promise<FormatCall> => ({ videoId: i.videoId, format_label: "ai_voiceover_facts", confidence: 0.8 })),
    fetchTranscript: vi.fn(async () => ({ text: "transcript words", language: "en", auto_generated: true })),
    fetchThumbnail: vi.fn(async () => "data:image/jpeg;base64,AAAA"),
    rng: () => 0.99,
    formatConcurrency: 2,
    ...over,
  };
}

describe("classifyBatch", () => {
  it("classifies each video with min(topic,format) confidence", async () => {
    const out = await classifyBatch([input("a"), input("b")], deps());
    expect(out.classifications).toHaveLength(2);
    const a = out.classifications.find((c) => c.videoId === "a")!;
    expect(a.topicLabel).toBe("topic a");
    expect(a.formatLabel).toBe("ai_voiceover_facts");
    expect(a.confidence).toBe(0.8);
    expect(a.visionUsed).toBe(true);
    expect(a.transcriptUsed).toBe(true);
    expect(a.model).toContain("m-topic");
    expect(a.model).toContain("m-format");
  });

  it("proceeds with transcriptUsed=false when transcript is null", async () => {
    const out = await classifyBatch([input("a")], deps({ fetchTranscript: vi.fn(async () => null) }));
    expect(out.classifications[0].transcriptUsed).toBe(false);
  });

  it("emits a sample when rng falls below 0.05", async () => {
    const out = await classifyBatch([input("a")], deps({ rng: () => 0.01 }));
    expect(out.samples).toHaveLength(1);
    expect(out.samples[0].videoId).toBe("a");
    expect(out.samples[0].promptFull.length).toBeGreaterThan(0);
    expect(out.samples[0].responseFull.length).toBeGreaterThan(0);
  });

  it("batches the topic pass in groups of 10", async () => {
    const gen = vi.fn(async (items: ClassifierInput[]) =>
      items.map((i) => ({ videoId: i.videoId, topic_label: "t", audience_signal: "general" as const, confidence: 0.7 })));
    const inputs = Array.from({ length: 23 }, (_, i) => input(`v${i}`));
    await classifyBatch(inputs, deps({ generateTopicBatch: gen }));
    expect(gen).toHaveBeenCalledTimes(3);
  });

  it("re-issues singly for videos the topic batch dropped", async () => {
    let call = 0;
    const gen = vi.fn(async (items: ClassifierInput[]) => {
      call++;
      if (call === 1) return items.filter((i) => i.videoId !== "b").map((i) => ({ videoId: i.videoId, topic_label: "t", audience_signal: "general" as const, confidence: 0.7 }));
      return items.map((i) => ({ videoId: i.videoId, topic_label: "retry", audience_signal: "general" as const, confidence: 0.6 }));
    });
    const out = await classifyBatch([input("a"), input("b")], deps({ generateTopicBatch: gen }));
    expect(out.classifications.find((c) => c.videoId === "b")?.topicLabel).toBe("retry");
  });
});
