import "server-only";
import { NextResponse } from "next/server";
import { assertCronAuth, scraperLog } from "@/lib/scrapers/shared";

/**
 * Placeholder until Reddit OAuth credentials are configured.
 * Replace with the real reddit-harvest scraper once REDDIT_CLIENT_ID,
 * REDDIT_CLIENT_SECRET, and REDDIT_USER_AGENT are set in the environment.
 */
export async function GET(req: Request) {
  try {
    assertCronAuth(req);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  return NextResponse.json({
    ok: true,
    ...scraperLog("reddit-harvest", {
      skipped: true,
      reason:
        "Reddit creds not configured (set REDDIT_CLIENT_ID/SECRET/USER_AGENT)",
    }),
  });
}
