import { describe, it, expect, vi } from "vitest";
import { runClustering } from "@/lib/ingestion/cluster-niches";
import type { ClassifiedObservation } from "@/lib/supabase/repositories/shorts-observations";

const obs = (id: string, ch: string, topic: string): ClassifiedObservation => ({
  video_id: id, source: "youtube_search", channel_id: ch, channel_subscriber_count: 1000,
  channel_published_at: null,
  description: id === "a" ? "use code SAVE" : null, view_count: 100, like_count: 1, comment_count: 0,
  published_at: "2026-05-10T00:00:00Z", observed_at: "2026-05-20T00:00:00Z",
  topic_label: topic, format_label: "ai_voiceover_facts", audience_signal: "general", confidence: 0.9,
});

it("clusters, scores, selects a digest, and persists one week", async () => {
  const rows = [obs("a", "c1", "ai tools"), obs("b", "c2", "ai apps"), obs("c", "c3", "ai tools")];
  const embed = vi.fn(async (labels: string[]) => labels.map(() => [1, 0, 0]));
  let written: unknown[] = [];
  const result = await runClustering({
    since: new Date("2026-05-01T00:00:00Z"),
    weekStart: "2026-05-25",
    minConfidence: 0.5,
    mergeThreshold: 0.85,
    fetchRows: async () => rows,
    getCachedEmbeddings: async () => new Map(),
    embed,
    saveEmbeddings: async () => {},
    replaceWeek: async (_w, r) => { written = r; return r.length; },
    now: new Date("2026-05-25T00:00:00Z"),
  });
  expect(result.ingested).toBeGreaterThanOrEqual(1);
  expect(written.length).toBe(result.ingested);
  expect(embed).toHaveBeenCalledOnce();
});

it("returns ingested=0 without embedding when there is nothing to cluster", async () => {
  const embed = vi.fn(async () => []);
  const result = await runClustering({
    since: new Date(), weekStart: "2026-05-25", minConfidence: 0.5, mergeThreshold: 0.85,
    fetchRows: async () => [], getCachedEmbeddings: async () => new Map(),
    embed, saveEmbeddings: async () => {},
    replaceWeek: async () => 0, now: new Date(),
  });
  expect(result.ingested).toBe(0);
  expect(embed).not.toHaveBeenCalled();
});
