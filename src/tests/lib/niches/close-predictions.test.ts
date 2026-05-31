import { describe, it, expect, vi } from "vitest";
import { runPredictionClose } from "@/lib/niches/close-predictions";

describe("runPredictionClose", () => {
  it("closes only predictions whose linked video has 7d analytics", async () => {
    const closeable = [
      { predictionId: "p1", actualViews7d: 5000 },
      { predictionId: "p2", actualViews7d: 12000 },
    ];
    const attach = vi.fn(async () => {});
    const res = await runPredictionClose({ fetchCloseable: async () => closeable, attachOutcome: attach });
    expect(attach).toHaveBeenCalledTimes(2);
    expect(res.closed).toBe(2);
  });
  it("no-ops cleanly when nothing is closeable (cold start)", async () => {
    const attach = vi.fn(async () => {});
    const res = await runPredictionClose({ fetchCloseable: async () => [], attachOutcome: attach });
    expect(attach).not.toHaveBeenCalled();
    expect(res.closed).toBe(0);
  });
});
