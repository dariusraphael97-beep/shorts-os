import { NextResponse } from "next/server";
import {
  runWikipediaHarvest,
  type WikipediaTopicRow,
} from "@/lib/scrapers/wikipedia-harvest";
import {
  fetchRandomArticles,
  fetchArticleExtract,
} from "@/lib/clients/wikipedia";
import { getServiceClient } from "@/lib/supabase/server";
import { assertCronAuth, scraperLog } from "@/lib/scrapers/shared";

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
    getActiveNiches: async () => {
      const { data, error } = await supabase
        .from("niches")
        .select("id")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string }>;
    },
    queueTopicCandidates: async (rows: WikipediaTopicRow[]) => {
      const { data, error } = await supabase
        .from("topic_queue")
        .insert(rows)
        .select("id");
      if (error) throw error;
      return { inserted: data?.length ?? 0 };
    },
  };

  try {
    const result = await runWikipediaHarvest({
      client: { fetchRandomArticles, fetchArticleExtract },
      repo,
      perNicheCount: 10,
    });

    // Score newly-queued topics (cap at 20 per run to control cost).
    const { data: unscored } = await supabase
      .from("topic_queue")
      .select("id, title, summary")
      .is("hookability_score", null)
      .limit(20);

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
      ...scraperLog("wikipedia-harvest", { ...result, scored }),
    });
  } catch (e) {
    console.error("wikipedia-harvest failed", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
