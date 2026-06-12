import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LongformPlan } from "@/lib/agents/longform/types";

export interface CreateLongformDraftArgs {
  channelId: string;
  topic: string;
  targetDurationSeconds: number;
  presetId: string;
  plan: LongformPlan;
  description: string | null;
  /** The niche cluster this draft was generated from — powers regenerate + outcome measurement. */
  sourceNicheClusterId?: string | null;
}

export async function createLongformDraft(supabase: SupabaseClient, args: CreateLongformDraftArgs): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("your_videos")
    .insert({
      channel_id: args.channelId,
      title: args.topic,
      script: args.plan.hook,
      description: args.description,
      status: "draft",
      format: "longform",
      orientation: "16:9",
      target_duration_seconds: args.targetDurationSeconds,
      style_preset_id: args.presetId,
      voice_provider: args.plan.voice.provider,
      voice_id: args.plan.voice.voiceId,
      longform_plan: args.plan as unknown as Record<string, unknown>,
      source_niche_cluster_id: args.sourceNicheClusterId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createLongformDraft: ${error.message}`);
  return { id: data.id };
}
