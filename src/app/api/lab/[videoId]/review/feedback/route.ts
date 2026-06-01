import { NextResponse } from "next/server";
import { z } from "zod";
import { serializeError } from "@/lib/scrapers/shared";
import { getServiceClient } from "@/lib/supabase/server";
import { recordReviewFeedback } from "@/lib/supabase/repositories/video-reviews";
import {
  listAssistantMemory,
  upsertAssistantMemory,
} from "@/lib/supabase/repositories/assistants";
import {
  rollupReviewFeedback,
  type ReviewFeedbackWeights,
} from "@/lib/agents/review/feedback-memory";

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

    // Best-effort: update video_reviewer memory with suggestion feedback weights.
    // Non-fatal — a memory write must never fail the API response.
    try {
      const { data: reviewRow } = await supabase
        .from('video_reviews').select('suggestions').eq('id', videoReviewId).maybeSingle();
      const suggestions = (reviewRow?.suggestions as { component: string }[] | null) ?? [];
      const component = suggestions[suggestionIndex]?.component ?? 'unknown';
      const mem = await listAssistantMemory(supabase, 'video_reviewer');
      const prev = (mem.find((m) => m.memory_key === 'suggestion_feedback_weights')?.memory_value as ReviewFeedbackWeights | undefined) ?? null;
      const updated = rollupReviewFeedback(prev, { component, actionTaken });
      await upsertAssistantMemory(supabase, {
        assistantId: 'video_reviewer',
        memoryKey: 'suggestion_feedback_weights',
        memoryValue: updated,
      });
    } catch (e) {
      console.error('video_reviewer feedback memory (non-fatal):', e);
    }

    return NextResponse.json({ ok: true, feedback });
  } catch (e) {
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
