import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({ getClaudeModel: vi.fn(() => ({ __mock: "model" })) }));
vi.mock("ai", () => ({ generateObject: vi.fn(), NoObjectGeneratedError: class { static isInstance() { return false; } } }));
vi.mock("@/lib/research/web-search", () => ({ webSearch: vi.fn() }));

import { generateObject } from "ai";
import { webSearch } from "@/lib/research/web-search";
import { runResearcher } from "@/lib/agents/longform/researcher";

const outline = [{ title: "Overbuilt", purpose: "architecture" }, { title: "Stages", purpose: "tuning costs" }];

describe("runResearcher", () => {
  beforeEach(() => { vi.mocked(generateObject).mockReset(); vi.mocked(webSearch).mockReset(); });

  it("derives queries, searches, and distills a sourced fact sheet", async () => {
    vi.mocked(generateObject)
      .mockResolvedValueOnce({ object: { queries: ["B58 stage 1 cost", "B58 800whp stock internals"] } } as any)
      .mockResolvedValueOnce({ object: { facts: [{ claim: "800whp on stock block", detail: "~$6-10k", sourceUrl: "https://x.com/a" }], uncertain: [] } } as any);
    vi.mocked(webSearch).mockResolvedValue([{ title: "t", snippet: "s", link: "https://x.com/a" }]);

    const fs = await runResearcher({ topic: "B58 800whp", outline });
    expect(vi.mocked(webSearch).mock.calls.length).toBe(2);
    expect(fs.facts[0].detail).toBe("~$6-10k");
  });

  it("returns an empty fact sheet (no extraction LLM call) when no search results", async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({ object: { queries: ["q1"] } } as any);
    vi.mocked(webSearch).mockResolvedValue([]);
    const fs = await runResearcher({ topic: "obscure", outline });
    expect(fs).toEqual({ facts: [], uncertain: [] });
    expect(vi.mocked(generateObject).mock.calls.length).toBe(1);
  });

  it("returns an empty fact sheet if query derivation throws", async () => {
    vi.mocked(generateObject).mockRejectedValueOnce(new Error("llm down"));
    const fs = await runResearcher({ topic: "x", outline });
    expect(fs).toEqual({ facts: [], uncertain: [] });
  });
});
