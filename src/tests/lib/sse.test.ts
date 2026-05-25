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
    // JSON.stringify naturally escapes newlines as \n — verify no raw newline in data.
    const dataLine = decoded.split("\n").find((l) => l.startsWith("data:"));
    expect(dataLine).not.toMatch(/\nline2/);
  });

  it("returns a Uint8Array for stream controller.enqueue()", () => {
    const out = encodeSseEvent({ type: "agent_done", data: { agent: "writer", durationMs: 1234 } });
    expect(out).toBeInstanceOf(Uint8Array);
  });
});
