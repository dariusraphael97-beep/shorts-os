import { describe, it, expect, vi } from "vitest";
import { listVideosByStatus } from "@/lib/supabase/repositories/your-videos";

describe("listVideosByStatus", () => {
  it("filters by single status, orders by updated_at desc", async () => {
    const limit = vi.fn(async () => ({ data: [{ id: "v1" }], error: null }));
    const order = vi.fn(() => ({ limit }));
    const inFn = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ in: inFn }));
    const from = vi.fn(() => ({ select }));

    const out = await listVideosByStatus({ from } as never, "rendered", 5);
    expect(from).toHaveBeenCalledWith("your_videos");
    expect(inFn).toHaveBeenCalledWith("status", ["rendered"]);
    expect(out).toHaveLength(1);
  });

  it("accepts an array of statuses", async () => {
    const limit = vi.fn(async () => ({ data: [], error: null }));
    const inFn = vi.fn(() => ({ order: () => ({ limit }) }));
    const supabase = { from: () => ({ select: () => ({ in: inFn }) }) } as never;
    await listVideosByStatus(supabase, ["draft", "rendering"]);
    expect(inFn).toHaveBeenCalledWith("status", ["draft", "rendering"]);
  });
});
