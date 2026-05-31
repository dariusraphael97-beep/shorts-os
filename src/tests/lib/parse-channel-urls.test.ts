import { describe, it, expect } from "vitest";
import { parseChannelUrls } from "@/lib/onboarding/parse-channel-urls";

describe("parseChannelUrls", () => {
  it("splits on newlines and commas, trims, drops blanks", () => {
    expect(parseChannelUrls("https://youtube.com/@a\nhttps://youtube.com/@b , @c"))
      .toEqual(["https://youtube.com/@a", "https://youtube.com/@b", "@c"]);
  });
  it("dedupes case-sensitively-distinct entries while preserving order", () => {
    expect(parseChannelUrls("@a\n@a\n@b")).toEqual(["@a", "@b"]);
  });
  it("returns [] for empty/whitespace input", () => {
    expect(parseChannelUrls("   \n  ,  ")).toEqual([]);
  });
});
