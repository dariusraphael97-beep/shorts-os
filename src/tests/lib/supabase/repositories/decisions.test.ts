import { describe, it, expect, vi } from "vitest";
import { recordDecision } from "@/lib/supabase/repositories/decisions";

function mockSupabaseChain(returnValue: unknown) {
  const obj: any = {
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => resolve(returnValue),
  };
  return obj;
}

describe("decisions repository", () => {
  it("recordDecision inserts with correct fields and defaults alternatives to []", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await recordDecision(supa as any, {
      jobId: "j1",
      agentId: "strategist",
      decisionType: "topic_dispatch",
      inputs: { topic: { id: "t1" } },
      chosen: { directive: "x" },
      reasoning: "because",
    });
    expect(supa.from).toHaveBeenCalledWith("decisions");
    expect(supa.insert).toHaveBeenCalledWith({
      job_id: "j1",
      agent_id: "strategist",
      decision_type: "topic_dispatch",
      inputs: { topic: { id: "t1" } },
      alternatives: [],
      chosen: { directive: "x" },
      scores: null,
      reasoning: "because",
    });
  });

  it("accepts custom alternatives + scores", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await recordDecision(supa as any, {
      jobId: "j1",
      agentId: "voice_coach",
      decisionType: "voice_pick",
      inputs: { script: "x" },
      alternatives: [{ id: "a" }, { id: "b" }],
      chosen: { id: "a" },
      reasoning: "because",
      scores: { a: 0.8, b: 0.5 },
    });
    expect(supa.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        alternatives: [{ id: "a" }, { id: "b" }],
        scores: { a: 0.8, b: 0.5 },
      })
    );
  });

  it("throws on supabase error", async () => {
    const supa = mockSupabaseChain({ data: null, error: { message: "boom" } });
    await expect(
      recordDecision(supa as any, {
        jobId: "j1",
        agentId: "writer",
        decisionType: "script",
        inputs: {},
        chosen: {},
        reasoning: null,
      })
    ).rejects.toThrow(/boom/);
  });
});
