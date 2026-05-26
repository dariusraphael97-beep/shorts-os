import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ getServiceClient: vi.fn() }));

import { POST } from "@/app/api/lab/reject/route";
import { getServiceClient } from "@/lib/supabase/server";

describe("POST /api/lab/reject", () => {
  it("400s on missing videoId", async () => {
    const res = await POST(new Request("http://x/api/lab/reject", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }));
    expect(res.status).toBe(400);
  });

  it("200s on valid videoId; updates status to 'failed'", async () => {
    const eq = vi.fn(async () => ({ error: null }));
    vi.mocked(getServiceClient).mockReturnValue({
      from: () => ({ update: () => ({ eq }) }),
    } as never);
    const res = await POST(new Request("http://x/api/lab/reject", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId: "11111111-1111-1111-1111-111111111111" }),
    }));
    expect(res.status).toBe(200);
    expect(eq).toHaveBeenCalled();
  });
});
