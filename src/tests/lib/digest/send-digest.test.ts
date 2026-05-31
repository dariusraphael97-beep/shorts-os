import { describe, it, expect, vi } from "vitest";
import { runDigestSend } from "@/lib/digest/send-digest";

const cluster = (id: string) => ({ id, canonical_topic: "t", format_label: "ai_voiceover_facts", niche_score: 0.7, proven_score: 0.7, first_mover_score: 0.2, channel_count: 3, avg_views: 1000, avg_velocity_24h: 2, production_fit: "native", discovery_state: "public", digest_rank: 1, example_video_ids: ["v"] });

function deps(over = {}) {
  return {
    weekStart: "2026-05-25", recipient: "me@example.com", canSend: true,
    fetchClusters: vi.fn(async () => [cluster("a")]),
    renderHtml: vi.fn(async () => ({ html: "<p>hi</p>", text: "hi" })),
    send: vi.fn(async () => ({ id: "email_1" })),
    insertDigestRun: vi.fn(async () => {}),
    insertPrediction: vi.fn(async () => {}),
    ...over,
  };
}

describe("runDigestSend", () => {
  it("sends, logs a 'sent' run, and writes one prediction per cluster", async () => {
    const d = deps();
    const res = await runDigestSend(d);
    expect(d.send).toHaveBeenCalledOnce();
    expect(d.insertDigestRun).toHaveBeenCalledWith(expect.objectContaining({ status: "sent" }));
    expect(d.insertPrediction).toHaveBeenCalledTimes(1);
    expect(res.status).toBe("sent");
  });
  it("skips (no send, no prediction) on an empty week", async () => {
    const d = deps({ fetchClusters: vi.fn(async () => []) });
    const res = await runDigestSend(d);
    expect(res.status).toBe("skipped");
    expect(d.send).not.toHaveBeenCalled();
    expect(d.insertPrediction).not.toHaveBeenCalled();
  });
  it("logs 'skipped' when canSend is false (no RESEND key)", async () => {
    const d = deps({ canSend: false });
    const res = await runDigestSend(d);
    expect(d.send).not.toHaveBeenCalled();
    expect(d.insertDigestRun).toHaveBeenCalledWith(expect.objectContaining({ status: "skipped" }));
  });
  it("records 'failed' and does not throw when send rejects", async () => {
    const d = deps({ send: vi.fn(async () => { throw new Error("resend down"); }) });
    const res = await runDigestSend(d);
    expect(res.status).toBe("failed");
    expect(d.insertDigestRun).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });
});
