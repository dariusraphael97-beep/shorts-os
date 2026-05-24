import { describe, it, expect } from "vitest";
import { getClaudeModel } from "@/lib/ai/gateway";

describe("AI gateway", () => {
  it("returns a Claude model instance", () => {
    const model = getClaudeModel("claude-haiku-4-5");
    expect(model).toBeDefined();
    expect(typeof model.modelId).toBe("string");
  });
});
