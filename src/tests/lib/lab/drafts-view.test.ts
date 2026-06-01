import { describe, it, expect } from "vitest";
import { toDraftRow } from "@/lib/lab/drafts-view";

describe("toDraftRow", () => {
  it("a rendered draft with a ship verdict shows Review + Upload actions", () => {
    const row = toDraftRow({ id: "v1", title: "T", status: "rendered", review_verdict: "ship", thumbnail_url: null });
    expect(row.statusLabel).toBe("Rendered");
    expect(row.verdict).toBe("ship");
    expect(row.actions).toEqual(["review", "upload"]);
  });
  it("a draft (not yet rendered) shows the Render action only", () => {
    const row = toDraftRow({ id: "v1", title: "T", status: "draft", review_verdict: null, thumbnail_url: null });
    expect(row.actions).toEqual(["render"]);
    expect(row.verdict).toBeNull();
  });
  it("a blocked verdict still allows Review (the gate lives on the review page)", () => {
    const row = toDraftRow({ id: "v1", title: "T", status: "rendered", review_verdict: "block", thumbnail_url: null });
    expect(row.actions).toContain("review");
  });
  it("a rendering draft has no actions", () => {
    const row = toDraftRow({ id: "v1", title: "T", status: "rendering", review_verdict: null, thumbnail_url: null });
    expect(row.actions).toEqual([]);
    expect(row.statusLabel).toBe("Rendering");
  });
  it("a scheduled draft shows review + upload actions", () => {
    const row = toDraftRow({ id: "v1", title: "T", status: "scheduled", review_verdict: "revise", thumbnail_url: null });
    expect(row.actions).toContain("review");
    expect(row.actions).toContain("upload");
    expect(row.verdict).toBe("revise");
  });
  it("thumbnail_url is passed through", () => {
    const row = toDraftRow({ id: "v1", title: "T", status: "draft", review_verdict: null, thumbnail_url: "https://example.com/thumb.jpg" });
    expect(row.thumbnailUrl).toBe("https://example.com/thumb.jpg");
  });
});
