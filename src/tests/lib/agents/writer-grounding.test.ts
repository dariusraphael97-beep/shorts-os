import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({ getClaudeModel: vi.fn(() => ({ __mock: "model" })) }));
const generateObject = vi.fn();
vi.mock("ai", () => ({ generateObject: (...a: unknown[]) => generateObject(...a), NoObjectGeneratedError: class { static isInstance() { return false; } } }));
const runResearcher = vi.fn();
vi.mock("@/lib/agents/longform/researcher", async (orig) => ({ ...(await orig() as object), runResearcher: (...a: unknown[]) => runResearcher(...a) }));

import { runLongformWriter } from "@/lib/agents/longform/writer";

const playbook = { writer: { exemplarHooks: [] } } as any;

describe("runLongformWriter grounding", () => {
  beforeEach(() => { generateObject.mockReset(); runResearcher.mockReset(); });

  it("passes the fact sheet into the narration prompt and returns it on output", async () => {
    runResearcher.mockResolvedValue({ facts: [{ claim: "800whp on stock block", detail: "~$6-10k" }], uncertain: [] });
    generateObject
      .mockResolvedValueOnce({ object: { angle: "a", hook: "the hook goes here and is long enough" } })
      .mockResolvedValueOnce({ object: { chapters: [{ title: "T1", purpose: "p1" }, { title: "T2", purpose: "p2" }] } })
      .mockResolvedValueOnce({ object: { narration: "grounded narration one ".repeat(10) } })
      .mockResolvedValueOnce({ object: { narration: "grounded narration two ".repeat(10) } });

    const out = await runLongformWriter({ topic: "B58 800whp", targetDurationSeconds: 510, playbook });

    const narrationCalls = generateObject.mock.calls.slice(2);
    for (const call of narrationCalls) {
      expect(call[0].prompt).toContain("~$6-10k");
      expect(call[0].prompt).toMatch(/do NOT (state|invent)/i);
    }
    expect(out.factSheet.facts[0].detail).toBe("~$6-10k");
  });

  it("still includes the no-invention rule when the fact sheet is empty", async () => {
    runResearcher.mockResolvedValue({ facts: [], uncertain: [] });
    generateObject
      .mockResolvedValueOnce({ object: { angle: "a", hook: "the hook goes here and is long enough" } })
      .mockResolvedValueOnce({ object: { chapters: [{ title: "T1", purpose: "p1" }] } })
      .mockResolvedValueOnce({ object: { narration: "narration text ".repeat(10) } });

    await runLongformWriter({ topic: "x", targetDurationSeconds: 300, playbook });
    const narrationCall = generateObject.mock.calls[2];
    expect(narrationCall[0].prompt).toMatch(/do NOT (state|invent)/i);
  });
});
