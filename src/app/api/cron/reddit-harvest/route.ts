import "server-only";
import { NextResponse } from "next/server";
import {
  runRedditHarvest,
  type RedditTopicRow,
} from "@/lib/scrapers/reddit-harvest";
import { getTopPosts } from "@/lib/clients/reddit";
import { getServiceClient } from "@/lib/supabase/server";
import { assertCronAuth, scraperLog, serializeError } from "@/lib/scrapers/shared";

export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    assertCronAuth(req);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const supabase = getServiceClient();

  const repo = {
    listActiveNiches: async () => {
      const { data, error } = await supabase
        .from("niches")
        .select("id, subreddits")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; subreddits: string[] }>;
    },
    insertTopics: async (rows: RedditTopicRow[]) => {
      const { data, error } = await supabase
        .from("topic_queue")
        .insert(rows)
        .select("id");
      if (error) throw error;
      return { inserted: data?.length ?? 0 };
    },
  };

  try {
    const result = await runRedditHarvest({
      client: { getTopPosts },
      repo,
    });

    // Score newly-queued reddit-source topics. Cap at 8/run so we fit
    // inside Vercel Hobby's 300s function timeout: 8 topics * ~10s each
    // (Claude call) + ~30s reddit fetch + ~5s DB writes ≈ 115s, leaving
    // headroom for retries and slow runs. Triggering all 4 crons in
    // parallel previously exceeded 300s at limit=20. Remaining unscored
    // topics get picked up on the next cron tick.
    const { data: unscored } = await supabase
      .from("topic_queue")
      .select("id, title, summary")
      .eq("source", "reddit")
      .is("hookability_score", null)
      .limit(8);

    const { scoreTopic } = await import("@/lib/ai/topic-scorer");
    let scored = 0;
    for (const t of (unscored ?? []) as Array<{
      id: string;
      title: string;
      summary: string | null;
    }>) {
      try {
        const s = await scoreTopic({
          title: t.title,
          summary: t.summary ?? "",
        });
        await supabase
          .from("topic_queue")
          .update({
            hookability_score: s.hookability,
            scored_at: new Date().toISOString(),
          })
          .eq("id", t.id);
        scored += 1;
      } catch (e) {
        console.warn("score failed for", t.id, e);
      }
    }

    return NextResponse.json({
      ok: true,
      ...scraperLog("reddit-harvest", { ...result, scored }),
    });
  } catch (e) {
    console.error("reddit-harvest failed", e);
    return NextResponse.json(
      { ok: false, error: serializeError(e) },
      { status: 500 },
    );
  }
}
