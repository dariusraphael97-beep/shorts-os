import { describe, it, expect, vi } from "vitest";
import { getDefaultChannel } from "@/lib/supabase/repositories/channels";

function mockSupabaseChain(returnValue: unknown) {
  const obj: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => resolve(returnValue),
  };
  return obj;
}

describe("channels repository", () => {
  it("getDefaultChannel queries the only active channel", async () => {
    const fakeChannel = { id: "uuid-123", slug: "dyfrx_9754", display_name: "dyfrx_9754", is_active: true };
    const supa = mockSupabaseChain({ data: fakeChannel, error: null });
    const channel = await getDefaultChannel(supa as any);
    expect(supa.from).toHaveBeenCalledWith("channels");
    expect(supa.eq).toHaveBeenCalledWith("is_active", true);
    expect(supa.single).toHaveBeenCalled();
    expect(channel).toEqual(fakeChannel);
  });

  it("throws on supabase error", async () => {
    const supa = mockSupabaseChain({ data: null, error: { message: "boom" } });
    await expect(getDefaultChannel(supa as any)).rejects.toThrow(/boom/);
  });

  it("throws if no active channel exists", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await expect(getDefaultChannel(supa as any)).rejects.toThrow(/no active channel/i);
  });
});
