import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/repositories/ingest-blocklist", () => ({ addBlocklistEntry: vi.fn() }));
vi.mock("@/lib/supabase/repositories/clip-library", () => ({ softDeleteClip: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getServiceClient: () => ({}) }));

import { POST } from "@/app/api/clips/block/route";
import { addBlocklistEntry } from "@/lib/supabase/repositories/ingest-blocklist";
import { softDeleteClip } from "@/lib/supabase/repositories/clip-library";

describe("POST /api/clips/block", () => {
  beforeEach(() => {
    vi.mocked(addBlocklistEntry).mockReset();
    vi.mocked(softDeleteClip).mockReset();
  });

  it("inserts the blocklist row and soft-deletes when clip id provided", async () => {
    vi.mocked(addBlocklistEntry).mockResolvedValue(undefined);
    vi.mocked(softDeleteClip).mockResolvedValue(undefined);
    const res = await POST(new Request("http://t/", {
      method: "POST",
      body: JSON.stringify({
        sourcePlatform: "reddit", identifierType: "subreddit",
        identifier: "noisysub", reason: "spam",
        softDeleteClipId: "11111111-1111-1111-1111-111111111111",
      }),
    }));
    expect(res.status).toBe(200);
    expect(addBlocklistEntry).toHaveBeenCalled();
    expect(softDeleteClip).toHaveBeenCalledWith(expect.anything(), "11111111-1111-1111-1111-111111111111");
  });

  it("rejects unknown identifier_type", async () => {
    const res = await POST(new Request("http://t/", {
      method: "POST",
      body: JSON.stringify({ sourcePlatform: "reddit", identifierType: "domain", identifier: "x" }),
    }));
    expect(res.status).toBe(400);
  });
});
