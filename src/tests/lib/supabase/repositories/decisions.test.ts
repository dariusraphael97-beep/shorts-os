import { describe, it, expect, vi } from "vitest";
import { recordDecision, getDirectorShotListForVideo } from "@/lib/supabase/repositories/decisions";

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
      prompt_version: null,
      guidance_ids_used: [],
      your_video_id: null,
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

  it("writes prompt_version and guidance_ids_used when provided", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await recordDecision(supa as any, {
      jobId: "job-1",
      agentId: "strategist",
      decisionType: "topic_dispatch",
      inputs: { topic_id: "t1" },
      chosen: { format: "explainer" },
      reasoning: "because",
      promptVersion: "sha256-abc12345",
      guidanceIdsUsed: ["guid-1", "guid-2"],
    });
    expect(supa.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt_version: "sha256-abc12345",
        guidance_ids_used: ["guid-1", "guid-2"],
      })
    );
  });

  it("defaults guidance_ids_used to empty array when omitted", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await recordDecision(supa as any, {
      jobId: "job-1",
      agentId: "strategist",
      decisionType: "topic_dispatch",
      inputs: {},
      chosen: {},
      reasoning: null,
    });
    expect(supa.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        guidance_ids_used: [],
      })
    );
  });
});

describe("getDirectorShotListForVideo", () => {
  it("returns the latest director decision's shot_list", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "your_videos") {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { topic_queue_id: "topic-1" } }) }) }) };
        }
        if (table === "jobs") {
          return { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [{ id: "job-1" }] }) }) }) }) }) };
        }
        if (table === "decisions") {
          return { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ single: async () => ({ data: { chosen: { shot_list: [{ segment_text: "a", broll_search_query: "q", duration_seconds: 5 }] } } }) }) }) }) }) }) };
        }
        throw new Error("unexpected table");
      }),
    } as never;

    const out = await getDirectorShotListForVideo(supabase, "video-1");
    expect(out).toEqual([{ segment_text: "a", broll_search_query: "q", duration_seconds: 5 }]);
  });

  it("returns null when no produce_video job exists", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "your_videos") {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { topic_queue_id: "topic-1" } }) }) }) };
        }
        if (table === "jobs") {
          return { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }) };
        }
        throw new Error("unexpected table");
      }),
    } as never;

    const out = await getDirectorShotListForVideo(supabase, "video-1");
    expect(out).toBeNull();
  });
});
