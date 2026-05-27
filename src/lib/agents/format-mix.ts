import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormatMix } from "@/lib/supabase/repositories/channels";

export type { FormatMix };

export async function computeRecentMix(
  supabase: SupabaseClient,
  args: { channelId: string; lookbackDays?: number },
): Promise<FormatMix> {
  const since = new Date(
    Date.now() - (args.lookbackDays ?? 30) * 24 * 60 * 60 * 1000,
  ).toISOString();
  const [{ count: explainerCount }, { count: compilationCount }] = await Promise.all([
    supabase
      .from("your_videos")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", args.channelId)
      .gte("created_at", since),
    supabase
      .from("compilation_drafts")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", args.channelId)
      .gte("created_at", since)
      .in("status", ["proposed", "approved", "rendering", "rendered", "posted"]),
  ]);
  const e = explainerCount ?? 0;
  const c = compilationCount ?? 0;
  const total = e + c;
  if (total === 0) return { explainer: 0.5, compilation: 0.5 };
  return { explainer: e / total, compilation: c / total };
}

export function isFormatMixDrift(
  current: FormatMix,
  target: FormatMix,
  thresholdPp = 0.15,
): boolean {
  return Math.abs(current.explainer - target.explainer) > thresholdPp;
}
