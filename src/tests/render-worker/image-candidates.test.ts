// src/tests/render-worker/image-candidates.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchImageCandidates } from "../../../scripts/render-worker/lib/image-search";

describe("render-worker searchImageCandidates", () => {
  const origFetch = globalThis.fetch;
  const origKey = process.env.SERPER_API_KEY;

  beforeEach(() => {
    process.env.SERPER_API_KEY = "test-serper-key";
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    if (origKey === undefined) delete process.env.SERPER_API_KEY;
    else process.env.SERPER_API_KEY = origKey;
    vi.restoreAllMocks();
  });

  it("returns parsed imageUrls from the Serper response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        images: [
          { imageUrl: "https://example.com/a.jpg" },
          { imageUrl: "https://example.com/b.png" },
        ],
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const out = await searchImageCandidates("bmw b58 engine");
    expect(out).toEqual(["https://example.com/a.jpg", "https://example.com/b.png"]);

    // Hits the Serper /images endpoint with the API key + query.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://google.serper.dev/images");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["X-API-KEY"]).toBe("test-serper-key");
    expect(String((init as RequestInit).body)).toContain("bmw b58 engine");
  });

  it("drops entries without a valid http(s) imageUrl", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        images: [
          { imageUrl: "https://example.com/ok.jpg" },
          { imageUrl: "ftp://nope.com/x.jpg" },
          {}, // no imageUrl
          { imageUrl: "https://example.com/ok2.jpg" },
        ],
      }),
    }) as unknown as typeof fetch;

    const out = await searchImageCandidates("subject");
    expect(out).toEqual(["https://example.com/ok.jpg", "https://example.com/ok2.jpg"]);
  });

  it("returns [] when SERPER_API_KEY is missing (and does not fetch)", async () => {
    delete process.env.SERPER_API_KEY;
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const out = await searchImageCandidates("subject");
    expect(out).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] for a blank query (and does not fetch)", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const out = await searchImageCandidates("   ");
    expect(out).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] on a non-ok response", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;

    const out = await searchImageCandidates("subject");
    expect(out).toEqual([]);
  });

  it("returns [] when fetch throws", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;

    const out = await searchImageCandidates("subject");
    expect(out).toEqual([]);
  });

  it("returns [] when images is absent", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;

    const out = await searchImageCandidates("subject");
    expect(out).toEqual([]);
  });

  it("respects the num cap by slicing to at most num results", async () => {
    const images = Array.from({ length: 10 }, (_, i) => ({
      imageUrl: `https://example.com/${i}.jpg`,
    }));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ images }) });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const out = await searchImageCandidates("subject", 3);
    expect(out).toHaveLength(3);
    expect(out).toEqual([
      "https://example.com/0.jpg",
      "https://example.com/1.jpg",
      "https://example.com/2.jpg",
    ]);
    // num is forwarded to the request body.
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String((init as RequestInit).body)).num).toBe(3);
  });
});
