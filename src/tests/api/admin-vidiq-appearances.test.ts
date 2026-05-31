import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getServiceClient: vi.fn(() => ({})) }));
const insertVidiqAppearance = vi.fn(async () => ({ id: "v1" }));
vi.mock("@/lib/supabase/repositories/vidiq-appearances", () => ({
  insertVidiqAppearance: (...a: Parameters<typeof insertVidiqAppearance>) => insertVidiqAppearance(...a),
}));

import { POST } from "@/app/api/admin/vidiq-appearances/route";

function req(body: unknown) {
  return new Request("http://x/api/admin/vidiq-appearances", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/admin/vidiq-appearances", () => {
  it("400s on a missing topic", async () => {
    const res = await POST(req({ formatLabel: "talking_head_facts", firstSurfacedByShortsOsAt: "2026-05-01" }));
    expect(res.status).toBe(400);
  });
  it("inserts a valid appearance", async () => {
    const res = await POST(req({
      canonicalTopic: "ai tools", formatLabel: "talking_head_facts",
      firstSurfacedByShortsOsAt: "2026-05-01", firstSurfacedByVidiqAt: "2026-05-10",
    }));
    expect(res.status).toBe(201);
    expect(insertVidiqAppearance).toHaveBeenCalled();
  });
});
