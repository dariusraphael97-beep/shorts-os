import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({
  getClaudeModel: vi.fn(() => "mock-haiku-model"),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(async (args: { schema: unknown; prompt: string }) => {
    if (args.prompt.includes("Mechanic finds rats in air filter")) {
      return { object: { stage_1_score: 78, reasoning: "Strong visual hook", suggested_tags: ["mechanic_fail", "garage"] } };
    }
    return { object: { stage_1_score: 12, reasoning: "Generic political rant", suggested_tags: [] } };
  }),
}));

import { scoreRedditPostForClipIngest, Stage1ScoreSchema } from "@/lib/ai/clip-triage";

describe("clip-triage", () => {
  it("returns a Zod-shaped score for a strong post", async () => {
    const result = await scoreRedditPostForClipIngest({
      title: "Mechanic finds rats in air filter — couldn't believe it",
      subreddit: "JustRolledIntoTheShop",
      author: "u/wrenchhands",
      score: 8412,
      numComments: 312,
      nicheSlug: "cars",
      nicheTagVocabulary: ["mechanic_fail", "garage", "engine"],
    });
    expect(Stage1ScoreSchema.parse(result)).toEqual({
      stage_1_score: 78,
      reasoning: "Strong visual hook",
      suggested_tags: ["mechanic_fail", "garage"],
    });
  });

  it("returns a low score for off-topic posts", async () => {
    const result = await scoreRedditPostForClipIngest({
      title: "Political opinion thread (no video)",
      subreddit: "cars",
      author: "u/rant",
      score: 10,
      numComments: 200,
      nicheSlug: "cars",
      nicheTagVocabulary: ["mechanic_fail"],
    });
    expect(result.stage_1_score).toBeLessThan(60);
  });
});
