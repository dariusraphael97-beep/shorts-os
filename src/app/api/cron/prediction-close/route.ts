import { NextResponse } from "next/server";
import { assertCronAuth, serializeError } from "@/lib/scrapers/shared";
import { getServiceClient } from "@/lib/supabase/server";
import {
  listCloseablePredictions,
  attachActualOutcome,
} from "@/lib/supabase/repositories/niche-predictions";
import { runPredictionClose } from "@/lib/niches/close-predictions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily +7d close-loop. Finds posted niche-sourced videos with an open prediction and ≥7d of
// analytics, then attaches the actual outcome (which computes within/below/above). No-ops
// cleanly (closed: 0) until generation → post → 7d-analytics data exists (cold start).
export async function GET(req: Request): Promise<Response> {
  try {
    assertCronAuth(req);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const supabase = getServiceClient();

  try {
    const result = await runPredictionClose({
      fetchCloseable: async () => {
        const rows = await listCloseablePredictions(supabase);
        return rows.map((r) => ({ predictionId: r.predictionId, actualViews7d: r.actualViews7d }));
      },
      attachOutcome: async (predictionId, actualViews7d) => {
        await attachActualOutcome(supabase, predictionId, actualViews7d);
      },
    });
    return NextResponse.json({ ok: true, closed: result.closed });
  } catch (e) {
    console.error("prediction-close failed", e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
