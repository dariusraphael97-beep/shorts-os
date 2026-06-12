import { describe, it, expect } from "vitest";
import { saturationInverse, nicheAgeDays, monetizationSignal, viewsToSubsRatio, computeComponents } from "@/lib/scoring/components";
import type { BuiltCluster, ClusterInputRow } from "@/lib/clustering/cluster";

const row = (over: Partial<ClusterInputRow> = {}): ClusterInputRow => ({
  video_id: "a", source: "youtube_search", channel_id: "c1", channel_subscriber_count: 1,
  channel_published_at: null, description: null, topic_label: "ai tools", format_label: "ai_voiceover_facts",
  audience_signal: "general", view_count: 1, published_at: null, observed_at: "2026-05-01T00:00:00Z", ...over,
});

const cluster = (over: Partial<BuiltCluster> = {}): BuiltCluster => ({
  canonicalTopic: "ai tools", formatLabel: "ai_voiceover_facts",
  rows: [
    row({ video_id: "a", channel_id: "c1", description: "use code SAVE10" }),
    row({ video_id: "b", channel_id: "c2", description: "no sponsor here" }),
    row({ video_id: "c", channel_id: "c3", description: null }),
  ],
  exampleVideoIds: ["a"], channelCount: 3, avgViews: 1, firstSeenAt: "2026-05-01T00:00:00Z",
  productionFit: "native", discoveryState: "pre_public", audienceSignal: "general", ...over,
});

// A "dominatable" niche: videos pulling FAR more views than the channel has subscribers
// (algorithm/search-driven, new-channel signal) and millions of views.
const dominatable = (): BuiltCluster => cluster({
  avgViews: 2_000_000,
  rows: [
    row({ video_id: "a", channel_id: "c1", channel_subscriber_count: 10_000, view_count: 1_000_000 }),
    row({ video_id: "b", channel_id: "c2", channel_subscriber_count: 10_000, view_count: 2_000_000 }),
    row({ video_id: "c", channel_id: "c3", channel_subscriber_count: 10_000, view_count: 3_000_000 }),
  ],
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

  it("viewsToSubsRatio = median of view_count / subscriber_count over rows with both present", () => {
    expect(viewsToSubsRatio(dominatable())).toBeCloseTo(200, 5); // median of [100,200,300]
    expect(viewsToSubsRatio(cluster())).toBeCloseTo(1, 5); // all 1/1
    // null when no subscriber data anywhere
    const noSubs = cluster({ rows: [row({ channel_subscriber_count: null }), row({ video_id: "b", channel_subscriber_count: null }), row({ video_id: "c", channel_subscriber_count: null })] });
    expect(viewsToSubsRatio(noSubs)).toBeNull();
  });

  it("computeComponents: a dominatable niche (views >> subs, millions of views) scores high on first-mover", () => {
    const { components, explain } = computeComponents(dominatable(), new Date("2026-05-11T00:00:00Z"));
    expect(components.firstMoverScore).not.toBeNull();
    expect(components.firstMoverScore!).toBeGreaterThan(0.7); // lands in the "dominatable" band
    expect(explain.viewsToSubsRatio).toBeCloseTo(200, 5);
  });

  it("computeComponents: a loyal-audience niche (subs >> views) scores LOW on first-mover", () => {
    const loyal = cluster({
      avgViews: 100_000,
      rows: [
        row({ channel_subscriber_count: 2_000_000, view_count: 100_000 }),
        row({ video_id: "b", channel_subscriber_count: 2_000_000, view_count: 120_000 }),
        row({ video_id: "c", channel_subscriber_count: 2_000_000, view_count: 90_000 }),
      ],
    });
    const { components } = computeComponents(loyal, new Date("2026-05-11T00:00:00Z"));
    expect(components.firstMoverScore!).toBeLessThan(0.2);
  });

  it("computeComponents: first-mover is null when there's no subscriber data", () => {
    const noSubs = cluster({ rows: [row({ channel_subscriber_count: null }), row({ video_id: "b", channel_subscriber_count: null }), row({ video_id: "c", channel_subscriber_count: null })] });
    const { components } = computeComponents(noSubs, new Date("2026-05-11T00:00:00Z"));
    expect(components.firstMoverScore).toBeNull();
  });

  it("computeComponents: cold-start proven nulls renormalize; proven=monetization only", () => {
    const { components, explain } = computeComponents(cluster(), new Date("2026-05-11T00:00:00Z"));
    expect(components.saturationInverse).toBeCloseTo(1 / Math.log(5), 6);
    expect(components.productionFitWeight).toBe(1.0);
    expect(components.discoveryStateWeight).toBe(1.0);
    expect(components.provenScore).toBeCloseTo(1 / 3, 5);
    expect(explain.nicheAgeDays).toBeCloseTo(10, 5);
  });
});
