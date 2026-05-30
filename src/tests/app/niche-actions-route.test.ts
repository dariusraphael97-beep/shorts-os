import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getServiceClient: vi.fn(() => ({})) }));
const recordNicheAction = vi.fn(async () => {});
vi.mock("@/lib/supabase/repositories/niche-actions", () => ({ recordNicheAction: (...a: Parameters<typeof recordNicheAction>) => recordNicheAction(...a) }));

import { POST } from "@/app/api/niches/actions/route";

function req(body: unknown) {
  return new Request("http://x/api/niches/actions", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/niches/actions", () => {
  it("400s on invalid action", async () => {
    const res = await POST(req({ nicheClusterId: "11111111-1111-1111-1111-111111111111", action: "nope" }));
    expect(res.status).toBe(400);
  });
  it("records a valid action", async () => {
    const res = await POST(req({ nicheClusterId: "11111111-1111-1111-1111-111111111111", action: "dismissed" }));
    expect(res.status).toBe(200);
    expect(recordNicheAction).toHaveBeenCalled();
  });
});
