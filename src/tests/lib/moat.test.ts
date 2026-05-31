import { describe, it, expect } from "vitest";
import { earliestExternalLagDays, averageLagDays } from "@/lib/admin/moat";

const base = {
  canonical_topic: "t", format_label: "talking_head_facts" as const,
  first_surfaced_by_1of10_at: null, notes: null, created_at: "", id: "x",
};

describe("earliestExternalLagDays", () => {
  it("uses the earliest external surfacing date", () => {
    const lag = earliestExternalLagDays({
      ...base,
      first_surfaced_by_shorts_os_at: "2026-05-01T00:00:00Z",
      first_surfaced_by_vidiq_at: "2026-05-11T00:00:00Z",
      first_surfaced_by_exploding_topics_at: "2026-05-06T00:00:00Z",
    });
    expect(lag).toBe(5);
  });
  it("returns null when no external date exists", () => {
    expect(earliestExternalLagDays({
      ...base,
      first_surfaced_by_shorts_os_at: "2026-05-01T00:00:00Z",
      first_surfaced_by_vidiq_at: null,
      first_surfaced_by_exploding_topics_at: null,
    })).toBeNull();
  });
});

describe("averageLagDays", () => {
  it("averages over rows that have an external date; null if none", () => {
    const rows = [
      { ...base, first_surfaced_by_shorts_os_at: "2026-05-01T00:00:00Z", first_surfaced_by_vidiq_at: "2026-05-05T00:00:00Z", first_surfaced_by_exploding_topics_at: null },
      { ...base, first_surfaced_by_shorts_os_at: "2026-05-01T00:00:00Z", first_surfaced_by_vidiq_at: "2026-05-09T00:00:00Z", first_surfaced_by_exploding_topics_at: null },
      { ...base, first_surfaced_by_shorts_os_at: "2026-05-01T00:00:00Z", first_surfaced_by_vidiq_at: null, first_surfaced_by_exploding_topics_at: null },
    ];
    expect(averageLagDays(rows)).toBe(6);
    expect(averageLagDays([])).toBeNull();
  });
});
