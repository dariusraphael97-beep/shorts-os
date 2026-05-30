import { describe, it, expect } from "vitest";
import { renderDigest } from "@/lib/digest/render-digest";
import { buildEmailProps, type DigestClusterRow } from "@/lib/digest/build-email-props";

const row = (over: Partial<DigestClusterRow>): DigestClusterRow => ({
  id: "c1", canonical_topic: "ai productivity tools", format_label: "ai_voiceover_facts",
  niche_score: 0.7, proven_score: 0.7, first_mover_score: 0.2, channel_count: 5, avg_views: 12345,
  production_fit: "native", discovery_state: "public", digest_rank: 1, example_video_ids: ["abc123"], ...over,
});

describe("renderDigest", () => {
  it("renders HTML + plaintext containing the hero topic", async () => {
    const props = buildEmailProps("2026-05-25", [row({})]);
    const { html, text } = await renderDigest(props);
    expect(html).toContain("ai productivity tools");
    expect(html).toContain("i.ytimg.com/vi/abc123/hqdefault.jpg");
    // The plaintext renderer uppercases headings, so compare case-insensitively.
    expect(text.toLowerCase()).toContain("ai productivity tools");
  });

  it("renders a graceful empty state for a week with no niches", async () => {
    const { html } = await renderDigest(buildEmailProps("2026-05-25", []));
    expect(html).toContain("No niches surfaced this week");
  });
});
