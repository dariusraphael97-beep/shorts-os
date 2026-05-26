import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_KEY = process.env.GROQ_API_KEY;
beforeEach(() => { process.env.GROQ_API_KEY = "fake-groq"; });
afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY) process.env.GROQ_API_KEY = ORIGINAL_KEY;
  else delete process.env.GROQ_API_KEY;
});

describe("transcribeWithWordTimestamps", () => {
  it("returns word list parsed from verbose_json", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
      return new Response(JSON.stringify({
        text: "hello world",
        segments: [],
        words: [
          { word: "hello", start: 0.0, end: 0.4 },
          { word: "world", start: 0.5, end: 0.9 },
        ],
      }), { status: 200 });
    }));

    const { transcribeWithWordTimestamps } = await import("@/lib/clients/groq-whisper");
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
    const result = await transcribeWithWordTimestamps(blob, "v.wav");
    expect(result.words).toHaveLength(2);
    expect(result.words[0]).toEqual({ word: "hello", start: 0.0, end: 0.4 });
  });

  it("throws on missing GROQ_API_KEY", async () => {
    delete process.env.GROQ_API_KEY;
    const { transcribeWithWordTimestamps } = await import("@/lib/clients/groq-whisper");
    const blob = new Blob([new Uint8Array([1])]);
    await expect(transcribeWithWordTimestamps(blob, "v.wav")).rejects.toThrow(/GROQ_API_KEY/);
  });
});
