import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_KEY = process.env.PEXELS_API_KEY;
beforeEach(() => {
  process.env.PEXELS_API_KEY = "fake-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY) process.env.PEXELS_API_KEY = ORIGINAL_KEY;
  else delete process.env.PEXELS_API_KEY;
});

describe("searchVideos", () => {
  it("returns the largest vertical video_file from the top result", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toContain("https://api.pexels.com/videos/search");
      expect(url).toContain("query=vintage+car");
      expect(url).toContain("orientation=portrait");
      expect((init.headers as Record<string, string>).Authorization).toBe("fake-key");
      return new Response(JSON.stringify({
        page: 1, per_page: 5, total_results: 1, videos: [
          {
            id: 1, width: 1080, height: 1920, duration: 12,
            video_files: [
              { id: 11, quality: "sd", file_type: "video/mp4", width: 540, height: 960, link: "https://cdn.example/sd.mp4" },
              { id: 12, quality: "hd", file_type: "video/mp4", width: 1080, height: 1920, link: "https://cdn.example/hd.mp4" },
            ],
          },
        ],
      }), { status: 200 });
    }));

    const { searchVideos } = await import("@/lib/clients/pexels");
    const result = await searchVideos({ query: "vintage car", perPage: 5 });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].downloadUrl).toBe("https://cdn.example/hd.mp4");
    expect(result[0].width).toBe(1080);
    expect(result[0].height).toBe(1920);
  });

  it("returns the highest-quality file when no vertical exists", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      page: 1, per_page: 1, total_results: 1, videos: [
        {
          id: 2, width: 1920, height: 1080, duration: 8,
          video_files: [
            { id: 21, quality: "hd", file_type: "video/mp4", width: 1920, height: 1080, link: "https://cdn.example/landscape.mp4" },
          ],
        },
      ],
    }), { status: 200 })));

    const { searchVideos } = await import("@/lib/clients/pexels");
    const result = await searchVideos({ query: "anything" });
    expect(result[0].downloadUrl).toBe("https://cdn.example/landscape.mp4");
  });

  it("returns empty array on Pexels 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
    const { searchVideos } = await import("@/lib/clients/pexels");
    const result = await searchVideos({ query: "asdf" });
    expect(result).toEqual([]);
  });

  it("throws when PEXELS_API_KEY is missing", async () => {
    delete process.env.PEXELS_API_KEY;
    const { searchVideos } = await import("@/lib/clients/pexels");
    await expect(searchVideos({ query: "x" })).rejects.toThrow(/PEXELS_API_KEY/);
  });
});
