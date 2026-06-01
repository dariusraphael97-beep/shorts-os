import { NextResponse } from "next/server";
import { serializeError } from "@/lib/scrapers/shared";
import { getServiceClient } from "@/lib/supabase/server";
import { getVideoReviewByVideoId } from "@/lib/supabase/repositories/video-reviews";

export const dynamic = "force-dynamic";

// GET /api/lab/[videoId]/review
// Returns the latest review for a video (or null while QA is still running).
// Powers the "review in progress" poller on the review split-view.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ videoId: string }> },
): Promise<Response> {
  const { videoId } = await ctx.params;
  const supabase = getServiceClient();

  try {
    const review = await getVideoReviewByVideoId(supabase, videoId);
    return NextResponse.json({ ok: true, review });
  } catch (e) {
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
