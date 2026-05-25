import { describe, it, expect } from "vitest";
import { encodeSseEvent } from "@/lib/sse";

describe("encodeSseEvent", () => {
  it("formats a single event with type and JSON data", () => {
    const out = encodeSseEvent({ type: "job_started", data: { jobId: "j1", topicId: "t1", channelId: "c1", startedAt: "2026-05-24T00:00:00Z" } });
    const decoded = new TextDecoder().decode(out);
    expect(decoded).toContain("event: job_started\n");
    expect(decoded).toContain('data: {"jobId":"j1"');
    expect(decoded.endsWith("\n\n")).toBe(true);
  });

  it("escapes newlines inside data so the SSE framing isn't broken", () => {
    const out = encodeSseEvent({ type: "writer_chunk", data: { text: "line1\nline2" } });
    const decoded = new TextDecoder().decode(out);
    // The literal JSON-escaped newline must appear in the data line.
    expect(decoded).toContain('"text":"line1\\nline2"');
    // And the payload must NOT contain a raw newline between line1 and line2 —
    // that would break SSE framing by splitting the data line.
    expect(decoded).not.toContain("line1\nline2");
  });

  it("returns a Uint8Array for stream controller.enqueue()", () => {
    const out = encodeSseEvent({ type: "agent_done", data: { agent: "writer", durationMs: 1234 } });
    expect(out).toBeInstanceOf(Uint8Array);
  });
});
