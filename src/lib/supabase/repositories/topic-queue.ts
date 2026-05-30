import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type QueuedTopic = {
  id: string;
  niche_id: string | null;
  source: "reddit" | "wikipedia" | "news" | "manual";
  external_ref: string | null;
  title: string;
  summary: string | null;
  raw_payload: unknown;
  hookability_score: number | null;
  scored_at: string | null;
  state: "queued" | "reviewed" | "used" | "rejected";
  created_at: string;
};

export type TopicState = "queued" | "reviewed" | "used" | "rejected";

export async function listQueuedTopics(supabase: SupabaseClient, limit = 30): Promise<QueuedTopic[]> {
  const { data, error } = await supabase
    .from("topic_queue")
    .select("*")
    .eq("state", "queued")
    .not("hookability_score", "is", null)
    .order("hookability_score", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`listQueuedTopics: ${error.message}`);
  return (data ?? []) as QueuedTopic[];
}

export async function updateTopicState(
  supabase: SupabaseClient,
  id: string,
  state: TopicState,
  rejectedReason: string | null = null,
): Promise<void> {
  const { error } = await supabase
    .from("topic_queue")
    .update({ state, rejected_reason: rejectedReason })
    .eq("id", id);
  if (error) throw new Error(`updateTopicState: ${error.message}`);
}

export async function listReviewedTopics(
  supabase: SupabaseClient,
  limit = 20,
): Promise<QueuedTopic[]> {
  const { data, error } = await supabase
    .from("topic_queue")
    .select("*")
    .eq("state", "reviewed")
    .order("hookability_score", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`listReviewedTopics: ${error.message}`);
  return (data ?? []) as QueuedTopic[];
}

export async function insertManualTopic(
  supabase: SupabaseClient,
  params: { title: string; summary: string; rawPayload: unknown; state?: TopicState },
): Promise<QueuedTopic> {
  const { data, error } = await supabase
    .from("topic_queue")
    .insert({
      source: "manual",
      niche_id: null,
      title: params.title,
      summary: params.summary,
      raw_payload: params.rawPayload,
      state: params.state ?? "reviewed",
    })
    .select("*")
    .single();
  if (error) throw new Error(`insertManualTopic: ${error.message}`);
  return data as QueuedTopic;
}

export async function getTopicById(supabase: SupabaseClient, id: string): Promise<QueuedTopic> {
  const { data, error } = await supabase
    .from("topic_queue")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(`getTopicById: ${error.message}`);
  if (!data) throw new Error(`getTopicById: topic ${id} not found`);
  return data as QueuedTopic;
}
