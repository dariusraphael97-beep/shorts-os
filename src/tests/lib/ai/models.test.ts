import { describe, it, expect, afterEach, vi } from "vitest";

describe("ai/models config", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it("defaults to the spec model strings", async () => {
    const m = await import("@/lib/ai/models");
    expect(m.CLASSIFIER_TOPIC_MODEL).toBe("anthropic/claude-haiku-4-5");
    expect(m.CLASSIFIER_FORMAT_MODEL).toBe("anthropic/claude-haiku-4-5");
    expect(m.EMBEDDING_MODEL).toBe("openai/text-embedding-3-small");
  });

  it("is runtime-swappable via env", async () => {
    vi.stubEnv("CLASSIFIER_TOPIC_MODEL", "openai/gpt-4o-mini");
    vi.resetModules();
    const m = await import("@/lib/ai/models");
    expect(m.CLASSIFIER_TOPIC_MODEL).toBe("openai/gpt-4o-mini");
  });
});
