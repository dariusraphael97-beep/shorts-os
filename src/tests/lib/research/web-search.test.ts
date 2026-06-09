import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { webSearch } from "@/lib/research/web-search";

describe("webSearch", () => {
  const realKey = process.env.SERPER_API_KEY;
  beforeEach(() => { process.env.SERPER_API_KEY = "test-key"; vi.restoreAllMocks(); });
  afterEach(() => { if (realKey === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = realKey; });

  it("returns parsed organic results from Serper", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ organic: [
        { title: "B58 build cost", snippet: "A 700whp B58 runs about $8k.", link: "https://x.com/a" },
        { title: "no link", snippet: "ignored if no link" },
      ] }), { status: 200 })
    );
    const out = await webSearch("B58 800whp cost");
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ title: "B58 build cost", snippet: "A 700whp B58 runs about $8k.", link: "https://x.com/a" });
  });

  it("returns [] when no API key is set", async () => {
    delete process.env.SERPER_API_KEY;
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await webSearch("anything")).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns [] on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    expect(await webSearch("anything")).toEqual([]);
  });

  it("returns [] on fetch throw / timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    expect(await webSearch("anything")).toEqual([]);
  });

  it("returns [] for an empty query without calling fetch", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await webSearch("   ")).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
