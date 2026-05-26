import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function logIngestSkip(
  supabase: SupabaseClient,
  args: {
    sourcePlatform: string;
    sourceUrl: string;
    stage1Score: number;
    reasoning: string;
  },
): Promise<void> {
  const { error } = await supabase.from("ingest_skip_log").insert({
    source_platform: args.sourcePlatform,
    source_url: args.sourceUrl,
    stage_1_score: args.stage1Score,
    reasoning: args.reasoning,
  });
  if (error) throw new Error(`logIngestSkip: ${error.message}`);
}
