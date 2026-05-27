import { describe, it, expect, vi } from "vitest";
import { computeRecentMix, isFormatMixDrift } from "@/lib/agents/format-mix";

describe("isFormatMixDrift", () => {
  it("returns false when current is within 15pp of target on explainer axis", () => {
    expect(
      isFormatMixDrift(
        { explainer: 0.55, compilation: 0.45 },
        { explainer: 0.6, compilation: 0.4 },
      ),
    ).toBe(false);
  });

  it("returns true when current explainer share is >15pp below target", () => {
    expect(
      isFormatMixDrift(
        { explainer: 0.3, compilation: 0.7 },
        { explainer: 0.6, compilation: 0.4 },
      ),
    ).toBe(true);
  });

  it("returns true when current explainer share is >15pp above target", () => {
    expect(
      isFormatMixDrift(
        { explainer: 0.9, compilation: 0.1 },
        { explainer: 0.6, compilation: 0.4 },
      ),
    ).toBe(true);
  });

  it("honors a custom threshold", () => {
    expect(
      isFormatMixDrift(
        { explainer: 0.7, compilation: 0.3 },
        { explainer: 0.6, compilation: 0.4 },
        0.05,
      ),
    ).toBe(true);
  });
});

describe("computeRecentMix", () => {
  function mockCountChain(count: number) {
    const gte = vi.fn().mockResolvedValue({ count, error: null });
    const eq = vi.fn().mockReturnValue({ gte });
    const select = vi.fn().mockReturnValue({ eq });
    return select;
  }

  function mockCountChainWithStatus(count: number) {
    const inStatus = vi.fn().mockResolvedValue({ count, error: null });
    const gte = vi.fn().mockReturnValue({ in: inStatus });
    const eq = vi.fn().mockReturnValue({ gte });
    const select = vi.fn().mockReturnValue({ eq });
    return select;
  }

  it("returns 50/50 when no rows exist", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "your_videos") return { select: mockCountChain(0) };
        if (table === "compilation_drafts") return { select: mockCountChainWithStatus(0) };
        return null;
      }),
    };
    const mix = await computeRecentMix(supabase as never, { channelId: "ch1" });
    expect(mix).toEqual({ explainer: 0.5, compilation: 0.5 });
  });

  it("computes mix from your_videos + compilation_drafts counts", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "your_videos") return { select: mockCountChain(6) };
        if (table === "compilation_drafts") return { select: mockCountChainWithStatus(4) };
        return null;
      }),
    };
    const mix = await computeRecentMix(supabase as never, { channelId: "ch1" });
    expect(mix.explainer).toBeCloseTo(0.6);
    expect(mix.compilation).toBeCloseTo(0.4);
  });
});
