import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({ getClaudeModel: vi.fn(() => ({ __mock: "model" })) }));
vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateObject: vi.fn() };
});

import { generateObject, NoObjectGeneratedError } from "ai";
import { runLongformWriter } from "@/lib/agents/longform/writer";
import { EMPTY_LONGFORM_PLAYBOOK } from "@/lib/agents/longform/playbook";

function makeNoObjectErr(): NoObjectGeneratedError {
  return new NoObjectGeneratedError({
    message: "No object generated: response did not match schema.",
    response: { id: "r", timestamp: new Date(), modelId: "m" },
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokenDetails: { textTokens: 1, reasoningTokens: 0 },
    },
    finishReason: "stop",
  });
}

function routeByPrompt(prompt: string) {
  if (prompt.includes("PASS:HOOK")) return { object: { angle: "A city out of room builds down.", hook: "It's the 4th of March, 2023. A marble hall in Dubai." } };
  if (prompt.includes("PASS:OUTLINE")) return { object: { chapters: [
    { title: "The Reveal", purpose: "open on the stage" },
    { title: "The Problem", purpose: "Dubai is out of room" },
    { title: "The Payoff", purpose: "the underwater ring" },
  ] } };
  return { object: { narration: "A man walks on. The lights dim. But this is no ordinary talk." } };
}

function mockByPrompt() {
  return async (args: Parameters<typeof generateObject>[0]) => {
    const prompt = (typeof args.prompt === "string" ? args.prompt : "") ;
    return routeByPrompt(prompt) as never;
  };
}

beforeEach(() => {
  vi.mocked(generateObject).mockReset();
  vi.mocked(generateObject).mockImplementation(mockByPrompt());
});

const ctx = () => ({ topic: "Why Dubai is building an underwater city", targetDurationSeconds: 540, playbook: EMPTY_LONGFORM_PLAYBOOK });

describe("longform/writer", () => {
  it("produces angle, hook, and one narrated chapter per outline entry", async () => {
    const out = await runLongformWriter(ctx());
    expect(out.hook.length).toBeGreaterThan(0);
    expect(out.chapters).toHaveLength(3);
    for (const c of out.chapters) {
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.narration.length).toBeGreaterThan(0);
    }
    expect(out.estimatedWords).toBeGreaterThan(0);
  });

  it("retries a pass once on NoObjectGeneratedError", async () => {
    const err = makeNoObjectErr();
    vi.mocked(generateObject)
      .mockImplementationOnce(async () => { throw err; })
      .mockImplementation(mockByPrompt());
    const out = await runLongformWriter(ctx());
    expect(out.chapters.length).toBe(3);
  });

  it("falls back to a minimal chapter set if the outline pass keeps failing", async () => {
    const err = makeNoObjectErr();
    vi.mocked(generateObject).mockImplementation(async (args: Parameters<typeof generateObject>[0]) => {
      const prompt = (typeof args.prompt === "string" ? args.prompt : "");
      if (prompt.includes("PASS:OUTLINE")) throw err;
      return routeByPrompt(prompt) as never;
    });
    const out = await runLongformWriter(ctx());
    expect(out.chapters.length).toBeGreaterThanOrEqual(3); // deriveChapterCount(540) === 5 fallback titles
  });
});
