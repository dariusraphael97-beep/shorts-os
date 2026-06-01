import { NextResponse } from "next/server";
import { z } from "zod";
import { serializeError } from "@/lib/scrapers/shared";
import { getServiceClient } from "@/lib/supabase/server";
import { recordReviewFeedback } from "@/lib/supabase/repositories/video-reviews";

export const dynamic = "force-dynamic";

export const FeedbackBody = z.object({
  videoReviewId: z.string().uuid(),
  suggestionIndex: z.number().int().min(0),
  actionTaken: z.enum(["accepted", "ignored", "partial"]),
});

// POST /api/lab/[videoId]/review/feedback
export async function POST(
  req: Request,
  ctx: { params: Promise<{ videoId: string }> },
): Promise<Response> {
  const { videoId: _videoId } = await ctx.params;
  const supabase = getServiceClient();

  const body: unknown = await req.json();
  const parsed = FeedbackBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues },
      { status: 400 },
    );
  }

  const { videoReviewId, suggestionIndex, actionTaken } = parsed.data;

  try {
    const feedback = await recordReviewFeedback(supabase, {
      videoReviewId,
      suggestionIndex,
      actionTaken,
    });
    return NextResponse.json({ ok: true, feedback });
  } catch (e) {
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
