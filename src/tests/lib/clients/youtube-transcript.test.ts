import { describe, it, expect, vi, afterEach } from "vitest";
import { parseTimedTextXml, createTranscriptClient } from "@/lib/clients/youtube-transcript";

describe("parseTimedTextXml", () => {
  it("flattens cue segments and decodes entities", () => {
    const xml = `<?xml version="1.0"?><transcript>` +
      `<text start="0" dur="1.5">Hello &amp; welcome</text>` +
      `<text start="1.5" dur="2">to the show&#39;s intro</text>` +
      `</transcript>`;
    expect(parseTimedTextXml(xml)).toBe("Hello & welcome to the show's intro");
  });

  it("returns empty string for no cues", () => {
    expect(parseTimedTextXml(`<transcript></transcript>`)).toBe("");
  });
});

describe("createTranscriptClient.fetchTranscript", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

  it("returns null when no caption track is found", async () => {
    globalThis.fetch = vi.fn(async () => new Response("<html>no captions</html>", { status: 200 })) as typeof fetch;
    const client = createTranscriptClient();
    expect(await client.fetchTranscript("abc123")).toBeNull();
  });

  it("returns null and never throws on network error", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("boom"); }) as typeof fetch;
    const client = createTranscriptClient();
    await expect(client.fetchTranscript("abc123")).resolves.toBeNull();
  });

  it("returns text + language when a track resolves", async () => {
    const trackXml = `<transcript><text start="0">captioned line</text></transcript>`;
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/watch")) {
        const body = `"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc123&lang=en","languageCode":"en","kind":"asr"}]`;
        return new Response(body, { status: 200 });
      }
      return new Response(trackXml, { status: 200 });
    }) as typeof fetch;
    const client = createTranscriptClient();
    const res = await client.fetchTranscript("abc123");
    expect(res).toEqual({ text: "captioned line", language: "en", auto_generated: true });
  });

  it("extracts captionTracks even with nested + sibling arrays (balanced scan)", async () => {
    const trackXml = `<transcript><text start="0">nested ok</text></transcript>`;
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/watch")) {
        const body = `{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc123&lang=en","languageCode":"en","kind":"asr","altFormats":[{"id":1}]}],"translationLanguages":[{"languageCode":"fr"}],"audioTracks":[{"id":0}]}`;
        return new Response(body, { status: 200 });
      }
      return new Response(trackXml, { status: 200 });
    }) as typeof fetch;
    const client = createTranscriptClient();
    const res = await client.fetchTranscript("abc123");
    expect(res).toEqual({ text: "nested ok", language: "en", auto_generated: true });
  });
});
