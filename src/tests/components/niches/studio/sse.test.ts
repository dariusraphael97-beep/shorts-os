import { describe, it, expect } from "vitest";
import { parseSseFrame } from "@/components/niches/studio/sse";

describe("parseSseFrame", () => {
  it("parses an event + data frame", () => {
    const ev = parseSseFrame('event: job_completed\ndata: {"videoId":"d1"}');
    expect(ev).toEqual({ type: "job_completed", data: { videoId: "d1" } });
  });
  it("returns null for malformed frames", () => {
    expect(parseSseFrame("nonsense")).toBeNull();
    expect(parseSseFrame("event: x\ndata: {bad json")).toBeNull();
  });
  it("parses a frame with data before event (reversed line order)", () => {
    const ev = parseSseFrame('data: {"videoId":"d1"}\nevent: job_completed');
    expect(ev).toEqual({ type: "job_completed", data: { videoId: "d1" } });
  });
  it("parses a data payload containing escaped quotes", () => {
    const ev = parseSseFrame('event: job_failed\ndata: {"error":"he said \\"hi\\""}');
    expect(ev).toEqual({ type: "job_failed", data: { error: 'he said "hi"' } });
  });
});
