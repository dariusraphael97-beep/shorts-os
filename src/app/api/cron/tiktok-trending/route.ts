import { NextResponse } from "next/server";
import {
  runTikTokTrendingScrape,
  type TikTokViralObservationRow,
} from "@/lib/scrapers/tiktok-trending";
import { searchTrendingByHashtag } from "@/lib/clients/tikapi";
import { getServiceClient } from "@/lib/supabase/server";
import { loadEnv } from "@/lib/env";
import { assertCronAuth, scraperLog, serializeError } from "@/lib/scrapers/shared";

export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    assertCronAuth(req);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const env = loadEnv();
  if (!env.TIKAPI_KEY) {
    return NextResponse.json({ error: "TIKAPI_KEY not set" }, { status: 500 });
  }
  const supabase = getServiceClient();

  const repo = {
    getActiveNiches: async () => {
      const { data, error } = await supabase
        .from("niches")
        .select("id, tiktok_hashtags")
        .eq("is_active", true);
      if (error)
        throw new Error(`niches select failed: ${serializeError(error)}`);
      return (data ?? []) as Array<{ id: string; tiktok_hashtags: string[] }>;
    },
    recordViralObservations: async (rows: TikTokViralObservationRow[]) => {
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
    const result = await runTikTokTrendingScrape({
      client: { searchTrendingByHashtag },
      repo,
      apiKey: env.TIKAPI_KEY,
    });
    return NextResponse.json({
      ok: true,
      ...scraperLog("tiktok-trending", result),
    });
  } catch (e) {
    console.error("tiktok-trending failed", e);
    return NextResponse.json(
      { ok: false, error: serializeError(e) },
      { status: 500 },
    );
  }
}
