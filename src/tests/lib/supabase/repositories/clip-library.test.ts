import { describe, it, expect, vi } from "vitest";
import {
  isSourceUrlIngested,
  insertClipLibraryRow,
} from "@/lib/supabase/repositories/clip-library";

describe("clip-library repo", () => {
  it("isSourceUrlIngested returns true when a matching row exists", async () => {
    const eq = vi.fn().mockReturnThis();
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "c2" }, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq, maybeSingle }),
      }),
    };
    eq.mockReturnValue({ maybeSingle });
    const seen = await isSourceUrlIngested(supabase as never, "https://reddit.com/r/cars/comments/x");
    expect(seen).toBe(true);
  });

  it("insertClipLibraryRow returns the inserted row id", async () => {
    const select = vi.fn().mockReturnThis();
    const single = vi.fn().mockResolvedValue({ data: { id: "new-id" }, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({ select, single }),
      }),
    };
    select.mockReturnValue({ single });
    const id = await insertClipLibraryRow(supabase as never, {
      source_url: "https://reddit.com/r/cars/comments/x",
      source_platform: "reddit",
      source_creator: "u/somebody",
      local_path: "https://blob.vercel.app/clip-library/abc.mp4",
      duration_seconds: 42,
      width: 1080,
      height: 1920,
      description: "Mechanic discovers thing",
      tags: ["mechanic_fail", "garage"],
      niche_id: "00000000-0000-0000-0000-000000000001",
      added_by: "reddit_ingest",
    });
    expect(id).toBe("new-id");
  });
});
