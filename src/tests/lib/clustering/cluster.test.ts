import { describe, it, expect } from "vitest";
import { buildClusters, type ClusterInputRow } from "@/lib/clustering/cluster";

const row = (over: Partial<ClusterInputRow>): ClusterInputRow => ({
  video_id: "v", source: "youtube_search", channel_id: "c1", channel_subscriber_count: 1000,
  channel_published_at: null, description: null,
  topic_label: "ai tools", format_label: "ai_voiceover_facts", audience_signal: "general",
  view_count: 100, published_at: "2026-05-01T00:00:00Z", observed_at: "2026-05-20T00:00:00Z", ...over,
});

const canon = new Map<string, string>([["aitools", "aitools"], ["aiapps", "aitools"]]);

describe("buildClusters", () => {
  it("drops groups under the 3-video minimum", () => {
    const rows = [row({ video_id: "a", topic_label: "aitools" }), row({ video_id: "b", topic_label: "aitools" })];
    expect(buildClusters(rows, canon)).toHaveLength(0);
  });

  it("groups by (canonical_topic, format_label) and counts distinct channels", () => {
    const rows = [
      row({ video_id: "a", channel_id: "c1", topic_label: "aitools" }),
      row({ video_id: "b", channel_id: "c2", topic_label: "aiapps" }),
      row({ video_id: "c", channel_id: "c2", topic_label: "aitools" }),
    ];
    const clusters = buildClusters(rows, canon);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].canonicalTopic).toBe("aitools");
    expect(clusters[0].channelCount).toBe(2);
    expect(clusters[0].productionFit).toBe("native");
  });

  it("sets discovery_state pre_public when no broad-public source present", () => {
    const rows = ["a", "b", "c"].map((id) => row({ video_id: id, channel_id: id, topic_label: "aitools", source: "reddit_topic" }));
    expect(buildClusters(rows, canon)[0].discoveryState).toBe("pre_public");
  });

  it("sets discovery_state public when most_popular or google_trends present", () => {
    const rows = [
      row({ video_id: "a", channel_id: "c1", topic_label: "aitools", source: "youtube_most_popular" }),
      row({ video_id: "b", channel_id: "c2", topic_label: "aitools", source: "reddit_topic" }),
      row({ video_id: "c", channel_id: "c3", topic_label: "aitools", source: "reddit_topic" }),
    ];
    expect(buildClusters(rows, canon)[0].discoveryState).toBe("public");
  });

  it("picks the modal audience_signal", () => {
    const rows = [
      row({ video_id: "a", channel_id: "c1", topic_label: "aitools", audience_signal: "gen_z" }),
      row({ video_id: "b", channel_id: "c2", topic_label: "aitools", audience_signal: "gen_z" }),
      row({ video_id: "c", channel_id: "c3", topic_label: "aitools", audience_signal: "millennials" }),
    ];
    expect(buildClusters(rows, canon)[0].audienceSignal).toBe("gen_z");
  });
});
