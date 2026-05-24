import { describe, it, expect, vi } from "vitest";
import { withRetry, scraperLog } from "@/lib/scrapers/shared";

describe("withRetry", () => {
  it("returns the value on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { attempts: 3 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure up to attempts", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue("eventually");
    const result = await withRetry(fn, { attempts: 3, baseDelayMs: 1 });
    expect(result).toBe("eventually");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("nope"));
    await expect(withRetry(fn, { attempts: 2, baseDelayMs: 1 })).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("scraperLog", () => {
  it("returns structured log object", () => {
    const log = scraperLog("youtube-trending", { items: 5 });
    expect(log.scraper).toBe("youtube-trending");
    expect(log.items).toBe(5);
    expect(log.at).toBeDefined();
  });
});
