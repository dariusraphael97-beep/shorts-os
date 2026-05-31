import { describe, it, expect, vi } from "vitest";
import { cronPathForJob, triggerIngestion } from "@/lib/ingestion/registry";

describe("cronPathForJob", () => {
  it("maps known jobs to cron paths", () => {
    expect(cronPathForJob("youtube_shorts_search")).toBe("/api/cron/youtube-shorts-search");
    expect(cronPathForJob("classify_observations")).toBe("/api/cron/classify-observations");
    expect(cronPathForJob("cluster_niches")).toBe("/api/cron/cluster-niches");
  });
  it("returns null for an unknown job", () => {
    expect(cronPathForJob("nope" as never)).toBeNull();
  });
});

describe("triggerIngestion", () => {
  it("calls the cron path with the CRON_SECRET bearer", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const res = await triggerIngestion({
      job: "cluster_niches", origin: "https://app.example", secret: "s3cret", fetchImpl,
    });
    expect(res.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://app.example/api/cron/cluster-niches",
      expect.objectContaining({ headers: { authorization: "Bearer s3cret" } }),
    );
  });
  it("rejects an unknown job without fetching", async () => {
    const fetchImpl = vi.fn();
    await expect(triggerIngestion({ job: "nope" as never, origin: "x", secret: "s", fetchImpl }))
      .rejects.toThrow(/unknown job/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
