import "server-only";
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import {
  assertCronAuth,
  scraperLog,
  serializeError,
} from "@/lib/scrapers/shared";
import { getTopPosts } from "@/lib/clients/reddit";
import { runRedditClipDiscovery } from "@/lib/scrapers/reddit-clip-discovery";
import { scoreRedditPostForClipIngest } from "@/lib/ai/clip-triage";
import {
  isSourceUrlIngested,
  countTodayClipIngestJobs,
} from "@/lib/supabase/repositories/clip-library";
import { loadBlocklistForPlatform } from "@/lib/supabase/repositories/ingest-blocklist";
import { logIngestSkip } from "@/lib/supabase/repositories/ingest-skip-log";
import { enqueueRenderJob } from "@/lib/supabase/repositories/render-jobs";
import { loadEnv } from "@/lib/env";

export const maxDuration = 300;

export async function GET(req: Request) {
  try { assertCronAuth(req); }
  catch (e) { if (e instanceof Response) return e; throw e; }

  const env = loadEnv();
  const supabase = getServiceClient();

  const repo = {
    listActiveChannelsWithNiches: async () => {
      const { data, error } = await supabase
        .from("channels")
        .select(`
          id, max_clip_ingest_per_day,
          niche:niches!inner(id, slug, subreddits)
        `)
        .eq("is_active", true)
        .not("niche_id", "is", null);
      if (error) throw error;
      return (data ?? []).map((row: {
        id: string; max_clip_ingest_per_day: number;
        niche: { id: string; slug: string; subreddits: string[] } |
               Array<{ id: string; slug: string; subreddits: string[] }>;
      }) => {
        const niche = Array.isArray(row.niche) ? row.niche[0] : row.niche;
        return {
          channelId: row.id,
          nicheId: niche.id,
          nicheSlug: niche.slug,
          subreddits: niche.subreddits ?? [],
          nicheTagVocabulary: [] as string[],
          maxClipIngestPerDay: row.max_clip_ingest_per_day,
        };
      });
    },
    countTodayClipIngestJobs: (args: { channelId: string }) =>
      countTodayClipIngestJobs(supabase, args),
    loadBlocklistForPlatform: () => loadBlocklistForPlatform(supabase, "reddit"),
    isSourceUrlIngested: (url: string) => isSourceUrlIngested(supabase, url),
    logIngestSkip: (args: { sourcePlatform: string; sourceUrl: string; stage1Score: number; reasoning: string }) =>
      logIngestSkip(supabase, args),
    enqueueClipIngestJob: async (args: {
      sourceUrl: string; sourceCreator: string | null;
      nicheId: string; channelId: string; postMetadata: unknown;
    }) => {
      const row = await enqueueRenderJob(supabase, {
        jobType: "clip_ingest",
        payload: {
          source_url: args.sourceUrl,
          source_creator: args.sourceCreator,
          niche_id: args.nicheId,
          channel_id: args.channelId,
          post_metadata: args.postMetadata,
        },
      });
      return { id: row.id };
    },
  };

  try {
    const result = await runRedditClipDiscovery({
      client: { getTopPosts },
      repo,
      scorer: {
        score: (i) => scoreRedditPostForClipIngest(i),
      },
      stage1Threshold: env.STAGE_1_SCORE_THRESHOLD,
      now: new Date(),
    });
    return NextResponse.json({
      ok: true,
      ...scraperLog("reddit-clip-discovery", { ...result }),
    });
  } catch (e) {
    console.error("reddit-clip-discovery failed", e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
