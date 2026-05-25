import { describe, it, expect, vi } from "vitest";
import { listAgents } from "@/lib/supabase/repositories/agents";

function mockSupabaseChain(returnValue: unknown) {
  const obj: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
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
