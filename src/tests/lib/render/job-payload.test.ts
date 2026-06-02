import { describe, it, expect } from "vitest";
import { RenderLongformPayload } from "@/lib/render/job-payload";

describe("RenderLongformPayload", () => {
  it("accepts a uuid your_video_id", () => {
    expect(RenderLongformPayload.parse({ your_video_id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" }).your_video_id).toBeTruthy();
  });
  it("rejects a non-uuid", () => {
    expect(() => RenderLongformPayload.parse({ your_video_id: "nope" })).toThrow();
  });
});
