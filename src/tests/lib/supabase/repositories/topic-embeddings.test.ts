import { describe, it, expect, vi, beforeEach } from "vitest";
import { getEmbeddings, upsertEmbeddings } from "@/lib/supabase/repositories/topic-embeddings";

// Regression: the cluster-niches job embeds the full distinct-label set (often
// >1k labels). A single bulk upsert hit Postgres' statement_timeout in prod
// ("canceling statement due to statement timeout") and a single giant IN() read
// would hit PostgREST's URL limit. Both helpers must chunk.

beforeEach(() => vi.clearAllMocks());

describe("topic-embeddings repository — chunking", () => {
  it("upsertEmbeddings batches writes (100 rows/statement) instead of one giant upsert", async () => {
    const upsert = vi.fn((_payload: unknown[]) => ({ error: null }));
    const client = { from: () => ({ upsert }) } as never;
    const rows = Array.from({ length: 250 }, (_, i) => ({ topicLabel: `t${i}`, model: "m", embedding: [i] }));

    await upsertEmbeddings(client, rows);

    expect(upsert).toHaveBeenCalledTimes(3); // 100 + 100 + 50
    expect(upsert.mock.calls[0][0].length).toBe(100);
    expect(upsert.mock.calls[2][0].length).toBe(50);
  });

  it("upsertEmbeddings is a no-op for empty input", async () => {
    const upsert = vi.fn(() => ({ error: null }));
    const client = { from: () => ({ upsert }) } as never;
    await upsertEmbeddings(client, []);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("upsertEmbeddings surfaces a Postgres error", async () => {
    const upsert = vi.fn(() => ({ error: { message: "boom" } }));
    const client = { from: () => ({ upsert }) } as never;
    await expect(
      upsertEmbeddings(client, [{ topicLabel: "t", model: "m", embedding: [1] }]),
    ).rejects.toThrow(/upsertEmbeddings: boom/);
  });

  it("getEmbeddings chunks the IN() read (200 labels/request) and merges results", async () => {
    const inFn = vi.fn((_col: string, group: string[]) => ({
      data: group.map((l) => ({ topic_label: l, embedding: [1, 2] })),
      error: null,
    }));
    const client = { from: () => ({ select: () => ({ eq: () => ({ in: inFn }) }) }) } as never;
    const labels = Array.from({ length: 250 }, (_, i) => `t${i}`);

    const map = await getEmbeddings(client, { labels, model: "m" });

    expect(inFn).toHaveBeenCalledTimes(2); // 200 + 50
    expect(map.size).toBe(250);
    expect(map.get("t0")).toEqual([1, 2]);
  });

  it("getEmbeddings short-circuits for empty input", async () => {
    const select = vi.fn();
    const client = { from: () => ({ select }) } as never;
    const map = await getEmbeddings(client, { labels: [], model: "m" });
    expect(map.size).toBe(0);
    expect(select).not.toHaveBeenCalled();
  });
});
