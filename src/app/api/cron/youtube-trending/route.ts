import { NextResponse } from "next/server";
import {
  runYouTubeTrendingScrape,
  type YouTubeViralObservationRow,
} from "@/lib/scrapers/youtube-trending";
import { searchShortsByQuery } from "@/lib/clients/youtube";
import { getServiceClient } from "@/lib/supabase/server";
import { loadEnv } from "@/lib/env";
import { assertCronAuth, scraperLog, serializeError } from "@/lib/scrapers/shared";

export const maxDuration = 300; // 5 min

export async function GET(req: Request) {
  try {
    assertCronAuth(req);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const env = loadEnv();
  if (!env.YOUTUBE_API_KEY) {
    return NextResponse.json(
      { error: "YOUTUBE_API_KEY not set" },
      { status: 500 },
    );
  }
  const supabase = getServiceClient();

  const repo = {
    getActiveNiches: async () => {
      const { data, error } = await supabase
        .from("niches")
        .select("id, slug, youtube_search_terms")
        .eq("is_active", true);
      if (error)
        throw new Error(`niches select failed: ${serializeError(error)}`);
      return (data ?? []) as Array<{
        id: string;
        slug: string;
        youtube_search_terms: string[];
      }>;
    },
    recordViralObservations: async (rows: YouTubeViralObservationRow[]) => {
      const { data, error } = await supabase
        .from("viral_observations")
        .upsert(rows, { onConflict: "source,external_id,observed_at" })
        .select("id");
      if (error)
        throw new Error(
          `viral_observations upsert failed: ${serializeError(error)}`,
        );
      return { inserted: data?.length ?? 0 };
    },
  };

  try {
    const result = await runYouTubeTrendingScrape({
      client: { searchShortsByQuery },
      repo,
      apiKey: env.YOUTUBE_API_KEY,
    });
    return NextResponse.json({
      ok: true,
      ...scraperLog("youtube-trending", result),
    });
  } catch (e) {
    console.error("youtube-trending scrape failed", e);
    return NextResponse.json(
      { ok: false, error: serializeError(e) },
      { status: 500 },
    );
  }
}
