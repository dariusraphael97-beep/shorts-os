import { describe, it, expect } from "vitest";
import { mapOutcomeRow } from "@/lib/supabase/repositories/longform-outcomes";

describe("longform-outcomes/mapOutcomeRow", () => {
  it("maps a joined view row to a typed outcome", () => {
    const row = {
      decision_id: "d1", agent_id: "writer", decision_type: "longform_script",
      chosen: { hook: "h" }, your_video_id: "yv1", title: "T", status: "posted",
      posted_at: "2026-06-01T00:00:00Z", views: 1200, avg_view_duration_seconds: 210,
      ctr_pct: 4.2, watch_time_seconds: 252000, analytics_snapshot_at: "2026-06-02T00:00:00Z",
    };
    const out = mapOutcomeRow(row);
    expect(out.agentId).toBe("writer");
    expect(out.views).toBe(1200);
    expect(out.avgViewDurationSeconds).toBe(210);
  });

  it("tolerates null analytics (no snapshot yet)", () => {
    const out = mapOutcomeRow({ decision_id: "d1", agent_id: "writer", decision_type: "x", chosen: {}, your_video_id: "yv1", title: "T", status: "rendered", posted_at: null, views: null, avg_view_duration_seconds: null, ctr_pct: null, watch_time_seconds: null, analytics_snapshot_at: null });
    expect(out.views).toBeNull();
  });
});
