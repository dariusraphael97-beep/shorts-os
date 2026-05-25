import { describe, it, expect, vi } from "vitest";
import { listRecentObservations } from "@/lib/supabase/repositories/viral-observations";

function mockSupabaseChain(returnValue: unknown) {
  const obj: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => resolve(returnValue),
  };
  return obj;
}

describe("viral-observations repository", () => {
  it("listRecentObservations queries shape with no source filter", async () => {
    const supa = mockSupabaseChain({ data: [{ id: "x" }], error: null });
    const rows = await listRecentObservations(supa as any, { limit: 25 });
    expect(supa.from).toHaveBeenCalledWith("viral_observations");
    expect(supa.order).toHaveBeenCalledWith("observed_at", { ascending: false });
    expect(supa.limit).toHaveBeenCalledWith(25);
    expect(supa.in).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
  });

  it("listRecentObservations applies source filter", async () => {
    const supa = mockSupabaseChain({ data: [], error: null });
    await listRecentObservations(supa as any, { limit: 10, sources: ["youtube", "tiktok"] });
    expect(supa.in).toHaveBeenCalledWith("source", ["youtube", "tiktok"]);
  });

  it("throws on supabase error", async () => {
    const supa = mockSupabaseChain({ data: null, error: { message: "kaboom" } });
    await expect(listRecentObservations(supa as any, { limit: 5 })).rejects.toThrow(/kaboom/);
  });
});
