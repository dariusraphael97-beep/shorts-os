import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/lab/upload/route";

describe("POST /api/lab/upload (Phase 2 stub)", () => {
  it("400s on missing videoId", async () => {
    const res = await POST(new Request("http://x/api/lab/upload", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    }));
    expect(res.status).toBe(400);
  });
  it("200s on valid videoId, marks as stub", async () => {
    const res = await POST(new Request("http://x/api/lab/upload", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId: "11111111-1111-1111-1111-111111111111" }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stub).toBe(true);
  });
});
