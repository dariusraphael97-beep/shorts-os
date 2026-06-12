import { describe, it, expect, vi } from "vitest";
import {
  loadBlocklistForPlatform,
  isBlocked,
} from "@/lib/supabase/repositories/ingest-blocklist";

describe("ingest-blocklist repo", () => {
  it("loadBlocklistForPlatform returns subreddit + author identifiers grouped", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              { identifier_type: "subreddit", identifier: "carfails" },
              { identifier_type: "author",    identifier: "spamuser" },
              { identifier_type: "subreddit", identifier: "weird_subset" },
            ],
            error: null,
          }),
        }),
      }),
    };
    const out = await loadBlocklistForPlatform(supabase as never, "reddit");
    expect(out.subreddits).toEqual(new Set(["carfails", "weird_subset"]));
    expect(out.authors).toEqual(new Set(["spamuser"]));
  });

  it("isBlocked is true when subreddit matches", () => {
    const b = { subreddits: new Set(["spam"]), authors: new Set<string>() };
    expect(isBlocked(b, { subreddit: "spam", author: "anyone" })).toBe(true);
    expect(isBlocked(b, { subreddit: "ok", author: "anyone" })).toBe(false);
  });

});
