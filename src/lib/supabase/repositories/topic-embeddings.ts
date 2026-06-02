import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// The niche-clustering job operates over the full set of distinct topic labels,
// which routinely exceeds 1k. A single bulk read or write over that whole set
// blows two Supabase limits: the per-statement timeout (large vector upserts)
// and PostgREST's URL-length cap (a giant `IN (...)` filter). Chunk both so each
// round-trip stays comfortably under both. Writes are smaller (vector inserts do
// per-row index maintenance), reads can be larger (cheap key lookups).
const READ_CHUNK = 200;
const WRITE_CHUNK = 100;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function getEmbeddings(
  supabase: SupabaseClient,
  params: { labels: string[]; model: string },
): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  if (params.labels.length === 0) return map;
  for (const group of chunk(params.labels, READ_CHUNK)) {
    const { data, error } = await supabase
      .from("topic_embeddings")
      .select("topic_label, embedding")
      .eq("model", params.model)
      .in("topic_label", group);
    if (error) throw new Error(`getEmbeddings: ${error.message}`);
    for (const row of (data ?? []) as Array<{ topic_label: string; embedding: unknown }>) {
      map.set(row.topic_label, row.embedding as number[]);
    }
  }
  return map;
}

export async function upsertEmbeddings(
  supabase: SupabaseClient,
  rows: Array<{ topicLabel: string; model: string; embedding: number[] }>,
): Promise<void> {
  if (rows.length === 0) return;
  for (const group of chunk(rows, WRITE_CHUNK)) {
    const payload = group.map((r) => ({
      topic_label: r.topicLabel,
      model: r.model,
      embedding: r.embedding as unknown,
    }));
    const { error } = await supabase
      .from("topic_embeddings")
      .upsert(payload as Parameters<ReturnType<typeof supabase.from>["upsert"]>[0]);
    if (error) throw new Error(`upsertEmbeddings: ${error.message}`);
  }
}
