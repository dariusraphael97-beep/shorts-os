import { NextResponse } from "next/server";
import { assertCronAuth, serializeError } from "@/lib/scrapers/shared";
import { getServiceClient } from "@/lib/supabase/server";
import {
  listCloseablePredictions,
  attachActualOutcome,
} from "@/lib/supabase/repositories/niche-predictions";
import { runPredictionClose } from "@/lib/niches/close-predictions";
import {
  listAssistantMemory,
  upsertAssistantMemory,
} from "@/lib/supabase/repositories/assistants";
import {
  rollupPredictionAccuracy,
  type PredictionAccuracy,
  type AccuracyOutcome,
} from "@/lib/agents/review/feedback-memory";

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
    const verdicts: AccuracyOutcome[] = [];

    const result = await runPredictionClose({
      fetchCloseable: async () => {
        const rows = await listCloseablePredictions(supabase);
        return rows.map((r) => ({ predictionId: r.predictionId, actualViews7d: r.actualViews7d }));
      },
      attachOutcome: async (predictionId, actualViews7d) => {
        const updated = await attachActualOutcome(supabase, predictionId, actualViews7d);
        if (updated.accuracy_verdict) {
          verdicts.push(updated.accuracy_verdict);
        }
      },
    });

    // Best-effort: fold verdicts into niche_scout memory ONCE after all outcomes are attached.
    // Non-fatal — a memory write must never fail the cron response.
    if (verdicts.length > 0) {
      try {
        const mem = await listAssistantMemory(supabase, 'niche_scout');
        const prevRow = mem.find((m) => m.memory_key === 'prediction_accuracy');
        let acc = (prevRow?.memory_value as PredictionAccuracy | undefined) ?? null;
        for (const v of verdicts) acc = rollupPredictionAccuracy(acc, v);
        const total = acc!.n;
        await upsertAssistantMemory(supabase, {
          assistantId: 'niche_scout',
          memoryKey: 'prediction_accuracy',
          memoryValue: acc!,
          confidence: total > 0 ? acc!.within / total : 0.5,
        });
      } catch (e) {
        console.error('niche_scout accuracy memory (non-fatal):', e);
      }
    }

    return NextResponse.json({ ok: true, closed: result.closed });
  } catch (e) {
    console.error("prediction-close failed", e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
