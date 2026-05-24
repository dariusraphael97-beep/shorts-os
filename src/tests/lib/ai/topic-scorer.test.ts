import { describe, it, expect, vi } from "vitest";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

import { generateObject } from "ai";
import { scoreTopic } from "@/lib/ai/topic-scorer";

describe("scoreTopic", () => {
  it("returns parsed score object from generateObject", async () => {
    (generateObject as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      object: {
        hookability: 78,
        novelty: 65,
        visual_richness: 70,
        reasoning: "decent",
      },
    });
    const result = await scoreTopic({
      title: "The Eiffel Tower grows in summer",
      summary: "Heat expands the metal...",
      modelId: "claude-haiku-4-5",
    });
    expect(result.hookability).toBe(78);
    expect(result.novelty).toBe(65);
    expect(result.visual_richness).toBe(70);
    expect(result.reasoning).toBe("decent");
  });

  it("defaults to claude-haiku-4-5 when modelId omitted", async () => {
    (generateObject as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      object: {
        hookability: 50,
        novelty: 50,
        visual_richness: 50,
        reasoning: "ok",
      },
    });
    const result = await scoreTopic({
      title: "Some topic",
      summary: "Some summary",
    });
    expect(result.hookability).toBe(50);
    expect(generateObject).toHaveBeenCalled();
  });
});
