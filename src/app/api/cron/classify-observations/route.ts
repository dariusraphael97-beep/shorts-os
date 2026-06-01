import { NextResponse } from "next/server";
import { assertCronAuth, scraperLog, serializeError } from "@/lib/scrapers/shared";
import { getServiceClient } from "@/lib/supabase/server";
import { runWithIngestionLog } from "@/lib/ingestion/run";
import { assertGatewayConfigured } from "@/lib/ai/models";
import { listUnclassifiedObservations } from "@/lib/supabase/repositories/shorts-observations";
import { upsertClassification } from "@/lib/supabase/repositories/shorts-classifications";
import { insertClassificationSample } from "@/lib/supabase/repositories/classification-samples";
import { runClassification, buildGatewayDeps } from "@/lib/ingestion/classify-observations";
import { reportAssistant } from "@/lib/agents/dashboard/report";

export const maxDuration = 300;
const PER_RUN_LIMIT = 150;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }
  try { assertGatewayConfigured(); } catch (e) { return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 }); }

  const supabase = getServiceClient();
  await reportAssistant(supabase, 'niche_scout', 'working', 'Classifying new observations…');
  try {
    const run = await runWithIngestionLog(supabase, "classify_observations", () =>
      runClassification({
        fetchQueue: (limit) => listUnclassifiedObservations(supabase, { limit }),
        upsertClassification: (r) => upsertClassification(supabase, {
          videoId: r.videoId, topicLabel: r.topicLabel, formatLabel: r.formatLabel,
          audienceSignal: r.audienceSignal, confidence: r.confidence, model: r.model,
          promptVersion: r.promptVersion, visionUsed: r.visionUsed, transcriptUsed: r.transcriptUsed,
        }).then(() => undefined),
        insertSample: (s) => insertClassificationSample(supabase, {
          videoId: s.videoId, promptFull: s.promptFull, responseFull: s.responseFull, chosenLabels: s.chosenLabels,
        }).then(() => undefined),
        deps: buildGatewayDeps(),
        limit: PER_RUN_LIMIT,
      }),
    );
    await reportAssistant(supabase, 'niche_scout', 'idle', null, { activityType: 'classification', summary: 'Classified new observations' });
    return NextResponse.json({ ok: true, ...scraperLog("classify-observations", { run }) });
  } catch (e) {
    console.error("classify-observations failed", e);
    await reportAssistant(supabase, 'niche_scout', 'errored', serializeError(e).slice(0, 160));
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
