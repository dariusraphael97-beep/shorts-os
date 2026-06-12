import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/classifier/classify", () => ({
  classifyBatch: vi.fn(async () => ({
    classifications: [{ videoId: "a", topicLabel: "t", formatLabel: "ai_voiceover_facts", audienceSignal: "general", confidence: 0.8, model: "m", promptVersion: "d1", visionUsed: true, transcriptUsed: false }],
    samples: [{ videoId: "a", promptFull: "p", responseFull: "r", chosenLabels: {} }],
    transcriptHits: 0,
  })),
}));

import { runClassification } from "@/lib/ingestion/classify-observations";
import type { ShortsObservation } from "@/lib/supabase/repositories/shorts-observations";

const observation = (id: string): ShortsObservation => ({
  video_id: id, source: "youtube_search", channel_id: "c", channel_subscriber_count: 1, channel_published_at: null,
  title: "t", description: "d", tags: [], thumbnail_url: "https://img/x.jpg",
  duration_seconds: 30, published_at: null, view_count: 1, like_count: 0, comment_count: 0,
  observed_at: "2026-05-29T00:00:00Z", last_refreshed_at: "2026-05-29T00:00:00Z",
});

it("classifies the queue, persists classifications + samples, returns AdapterResult", async () => {
  const upserts: unknown[] = [];
  const samples: unknown[] = [];
  const result = await runClassification({
    fetchQueue: async () => [observation("a")],
    upsertClassification: async (p) => { upserts.push(p); },
    insertSample: async (p) => { samples.push(p); },
    deps: {} as never,
    limit: 150,
  });
  expect(result.ingested).toBe(1);
  expect(upserts).toHaveLength(1);
  expect(samples).toHaveLength(1);
  expect(result.context).toMatchObject({ classified: 1, sampled: 1 });
});

it("returns ingested=0 with empty queue", async () => {
  const result = await runClassification({
    fetchQueue: async () => [],
    upsertClassification: async () => {},
    insertSample: async () => {},
    deps: {} as never,
    limit: 150,
  });
  expect(result.ingested).toBe(0);
});
