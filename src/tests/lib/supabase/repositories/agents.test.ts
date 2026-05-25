import { describe, it, expect, vi } from "vitest";
import { listAgents, updateAgentState } from "@/lib/supabase/repositories/agents";

function mockSupabaseChain(returnValue: unknown) {
  const obj: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => resolve(returnValue),
  };
  return obj;
}

describe("agents repository", () => {
  it("listAgents fetches all + orders by id", async () => {
    const supa = mockSupabaseChain({ data: [{ id: "analyst" }, { id: "writer" }], error: null });
    const rows = await listAgents(supa as any);
    expect(supa.from).toHaveBeenCalledWith("agents");
    expect(supa.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(rows).toHaveLength(2);
  });

  it("throws on supabase error", async () => {
    const supa = mockSupabaseChain({ data: null, error: { message: "no agents table" } });
    await expect(listAgents(supa as any)).rejects.toThrow(/no agents table/);
  });
});

describe("agents — updateAgentState", () => {
  it("updates current_state + current_task + updated_at", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await updateAgentState(supa as any, "writer", "working", "Drafting topic X");
    expect(supa.from).toHaveBeenCalledWith("agents");
    const updateCall = supa.update.mock.calls[0][0];
    expect(updateCall.current_state).toBe("working");
    expect(updateCall.current_task).toBe("Drafting topic X");
    expect(typeof updateCall.updated_at).toBe("string");
    expect(supa.eq).toHaveBeenCalledWith("id", "writer");
  });

  it("accepts null current_task", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await updateAgentState(supa as any, "writer", "idle", null);
    expect(supa.update).toHaveBeenCalledWith(
      expect.objectContaining({ current_state: "idle", current_task: null })
    );
  });

  it("throws on error", async () => {
    const supa = mockSupabaseChain({ data: null, error: { message: "boom" } });
    await expect(updateAgentState(supa as any, "writer", "idle", null)).rejects.toThrow(/boom/);
  });
});
