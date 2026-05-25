import { describe, it, expect, vi } from "vitest";
import { getDefaultChannel } from "@/lib/supabase/repositories/channels";

function mockSupabaseChain(returnValue: unknown) {
  const obj: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) => resolve(returnValue),
  };
  return obj;
}

describe("channels repository", () => {
  it("getDefaultChannel queries the right shape", async () => {
    const fakeChannel = { id: "uuid-123", slug: "default", display_name: "Default Channel" };
    const supa = mockSupabaseChain({ data: fakeChannel, error: null });
    const channel = await getDefaultChannel(supa as any);
    expect(supa.from).toHaveBeenCalledWith("channels");
    expect(supa.eq).toHaveBeenCalledWith("slug", "default");
    expect(supa.single).toHaveBeenCalled();
    expect(channel).toEqual(fakeChannel);
  });

  it("throws on supabase error", async () => {
    const supa = mockSupabaseChain({ data: null, error: { message: "boom" } });
    await expect(getDefaultChannel(supa as any)).rejects.toThrow(/boom/);
  });

  it("throws if no channel row found", async () => {
    const supa = mockSupabaseChain({ data: null, error: null });
    await expect(getDefaultChannel(supa as any)).rejects.toThrow(/default channel not found/i);
  });
});
