import { describe, it, expect } from "vitest";
import { buildEmailProps, type DigestClusterRow } from "@/lib/digest/build-email-props";

const row = (over: Partial<DigestClusterRow>): DigestClusterRow => ({
  id: "c1", canonical_topic: "ai tools", format_label: "ai_voiceover_facts", niche_score: 0.7,
  proven_score: 0.7, first_mover_score: 0.2, channel_count: 5, avg_views: 12345,
  production_fit: "native", discovery_state: "public", digest_rank: 1, example_video_ids: ["v1"], ...over,
});

describe("buildEmailProps", () => {
  it("uses digest_rank #1 as hero and the rest as condensed", () => {
    const props = buildEmailProps("2026-05-25", [row({ id: "a", digest_rank: 2 }), row({ id: "b", digest_rank: 1 })]);
    expect(props.hero?.id).toBe("b");
    expect(props.rest.map((r) => r.id)).toEqual(["a"]);
    expect(props.weekStart).toBe("2026-05-25");
  });
  it("labels each niche with its band", () => {
    const props = buildEmailProps("2026-05-25", [row({ id: "a", digest_rank: 1, proven_score: 0.3, first_mover_score: 0.9 })]);
    expect(props.hero?.band).toBe("unproven");
  });
  it("returns hero=null for an empty week", () => {
    expect(buildEmailProps("2026-05-25", []).hero).toBeNull();
  });
});
