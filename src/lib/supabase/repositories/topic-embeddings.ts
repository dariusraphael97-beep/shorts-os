import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getEmbeddings(
  supabase: SupabaseClient,
  params: { labels: string[]; model: string },
): Promise<Map<string, number[]>> {
  if (params.labels.length === 0) return new Map();
  const { data, error } = await supabase
    .from("topic_embeddings")
    .select("topic_label, embedding")
    .eq("model", params.model)
    .in("topic_label", params.labels);
  if (error) throw new Error(`getEmbeddings: ${error.message}`);
  const map = new Map<string, number[]>();
  for (const row of (data ?? []) as Array<{ topic_label: string; embedding: unknown }>) {
    map.set(row.topic_label, row.embedding as number[]);
  }
  return map;
}

export async function upsertEmbeddings(
  supabase: SupabaseClient,
  rows: Array<{ topicLabel: string; model: string; embedding: number[] }>,
): Promise<void> {
  if (rows.length === 0) return;
  const payload = rows.map((r) => ({
    topic_label: r.topicLabel,
    model: r.model,
    embedding: r.embedding as unknown,
  }));
  const { error } = await supabase
    .from("topic_embeddings")
    .upsert(payload as Parameters<ReturnType<typeof supabase.from>["upsert"]>[0]);
  if (error) throw new Error(`upsertEmbeddings: ${error.message}`);
}
