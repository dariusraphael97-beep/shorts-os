import { describe, it, expect, vi } from "vitest";
import { recordAgentMessage } from "@/lib/supabase/repositories/agent-messages";

function mockSupabaseChain(returnValue: unknown) {
  const obj: any = {
    from: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => resolve(returnValue),
  };
  return obj;
}

describe("agent-messages repository", () => {
  it("recordAgentMessage inserts with correct fields", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await recordAgentMessage(supa as any, {
      jobId: "job-1",
      fromAgent: "strategist",
      toAgent: "writer",
      intent: "dispatch",
      payload: { directive: "x" },
    });
    expect(supa.from).toHaveBeenCalledWith("agent_messages");
    expect(supa.insert).toHaveBeenCalledWith({
      job_id: "job-1",
      from_agent: "strategist",
      to_agent: "writer",
      intent: "dispatch",
      payload: { directive: "x" },
    });
  });

  it("accepts null to_agent for terminal agents (director)", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await recordAgentMessage(supa as any, {
      jobId: "job-1",
      fromAgent: "director",
      toAgent: null,
      intent: "shot_list",
      payload: { treatment: "x" },
    });
    expect(supa.insert).toHaveBeenCalledWith(
      expect.objectContaining({ to_agent: null })
    );
  });

  it("throws on supabase error", async () => {
    const supa = mockSupabaseChain({ data: null, error: { message: "boom" } });
    await expect(
      recordAgentMessage(supa as any, {
        jobId: "j1",
        fromAgent: "writer",
        toAgent: "voice_coach",
        intent: "script",
        payload: {},
      })
    ).rejects.toThrow(/boom/);
  });
});
