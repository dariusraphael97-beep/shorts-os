import "server-only";
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { assertCronAuth, scraperLog } from "@/lib/scrapers/shared";

export const maxDuration = 300;

/**
 * Stub performance-sync cron. The real implementation arrives in Plan #4
 * once channels are publishing and we have a YouTube Analytics integration
 * to pull view/retention metrics from. For now we just confirm we can read
 * the active channels list and exit.
 */
export async function GET(req: Request) {
  try {
    assertCronAuth(req);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const supabase = getServiceClient();
  const { data: channels, error } = await supabase
    .from("channels")
    .select("id, external_channel_id")
    .eq("is_active", true)
    .eq("platform", "youtube");

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    ...scraperLog("performance-sync", {
      channelsFound: channels?.length ?? 0,
      note: "stub until Plan #4",
    }),
  });
}
