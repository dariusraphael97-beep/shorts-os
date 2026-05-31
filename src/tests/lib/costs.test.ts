import { describe, it, expect } from "vitest";
import { aggregateQuotaByDay } from "@/lib/admin/costs";

describe("aggregateQuotaByDay", () => {
  it("sums quota_units per UTC day, sorted ascending", () => {
    const out = aggregateQuotaByDay([
      { started_at: "2026-05-02T09:00:00Z", quota_units: 100 },
      { started_at: "2026-05-01T09:00:00Z", quota_units: 50 },
      { started_at: "2026-05-01T18:00:00Z", quota_units: 30 },
    ]);
    expect(out).toEqual([
      { date: "2026-05-01", quota: 80 },
      { date: "2026-05-02", quota: 100 },
    ]);
  });
  it("returns [] for no runs", () => {
    expect(aggregateQuotaByDay([])).toEqual([]);
  });
});
