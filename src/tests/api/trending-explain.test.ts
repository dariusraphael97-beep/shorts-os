import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  getServiceClient: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: { id: "obs-1", title: "Test Viral", raw_payload: { views: 100 } },
            error: null,
          }),
        }),
      }),
    }),
  })),
}));

vi.mock("@/lib/ai/gateway", () => ({
  getClaudeModel: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: vi.fn(async () => ({ text: "Because the hook is a question that creates curiosity." })),
}));

import { POST } from "@/app/api/trending/[id]/explain/route";
import { generateText } from "ai";

function makeReq() {
  return new Request("http://test/api/trending/obs-1/explain", { method: "POST" });
}

describe("POST /api/trending/[id]/explain", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns Claude-generated breakdown for a known observation", async () => {
    const res = await POST(makeReq(), { params: Promise.resolve({ id: "obs-1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.breakdown).toMatch(/hook/i);
    expect(generateText).toHaveBeenCalledOnce();
  });
});
