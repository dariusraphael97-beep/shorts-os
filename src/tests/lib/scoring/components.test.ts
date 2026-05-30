import { describe, it, expect } from "vitest";
import { saturationInverse, nicheAgeDays, monetizationSignal, computeComponents } from "@/lib/scoring/components";
import type { BuiltCluster } from "@/lib/clustering/cluster";

const cluster = (over: Partial<BuiltCluster> = {}): BuiltCluster => ({
  canonicalTopic: "ai tools", formatLabel: "ai_voiceover_facts",
  rows: [
    { video_id: "a", source: "youtube_search", channel_id: "c1", channel_subscriber_count: 1, description: "use code SAVE10", topic_label: "ai tools", format_label: "ai_voiceover_facts", audience_signal: "general", view_count: 1, published_at: null, observed_at: "2026-05-01T00:00:00Z" },
    { video_id: "b", source: "youtube_search", channel_id: "c2", channel_subscriber_count: 1, description: "no sponsor here", topic_label: "ai tools", format_label: "ai_voiceover_facts", audience_signal: "general", view_count: 1, published_at: null, observed_at: "2026-05-01T00:00:00Z" },
    { video_id: "c", source: "youtube_search", channel_id: "c3", channel_subscriber_count: 1, description: null, topic_label: "ai tools", format_label: "ai_voiceover_facts", audience_signal: "general", view_count: 1, published_at: null, observed_at: "2026-05-01T00:00:00Z" },
  ],
  exampleVideoIds: ["a"], channelCount: 3, avgViews: 1, firstSeenAt: "2026-05-01T00:00:00Z",
  productionFit: "native", discoveryState: "pre_public", audienceSignal: "general", ...over,
});

describe("scoring components", () => {
  it("saturationInverse = 1/ln(count+2)", () => {
    expect(saturationInverse(3)).toBeCloseTo(1 / Math.log(5), 6);
  });

  it("nicheAgeDays from firstSeenAt", () => {
    const age = nicheAgeDays("2026-05-01T00:00:00Z", new Date("2026-05-11T00:00:00Z"));
    expect(age).toBeCloseTo(10, 5);
    expect(nicheAgeDays(null, new Date())).toBeNull();
  });

  it("monetizationSignal = fraction of distinct channels with a mention", () => {
    expect(monetizationSignal(cluster())).toBeCloseTo(1 / 3, 5);
  });

  it("computeComponents: cold-start nulls renormalize; proven=monetization only", () => {
    const { components, explain } = computeComponents(cluster(), new Date("2026-05-11T00:00:00Z"));
    expect(components.saturationInverse).toBeCloseTo(1 / Math.log(5), 6);
    expect(components.productionFitWeight).toBe(1.0);
    expect(components.discoveryStateWeight).toBe(1.0);
    expect(components.provenScore).toBeCloseTo(1 / 3, 5);
    expect(components.firstMoverScore).toBeNull();
    expect(components.outlierDensity).toBeNull();
    expect(explain.nicheAgeDays).toBeCloseTo(10, 5);
  });
});
