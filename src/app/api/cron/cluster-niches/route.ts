import { NextResponse } from "next/server";
import { embedMany } from "ai";
import { assertCronAuth, scraperLog, serializeError } from "@/lib/scrapers/shared";
import { getServiceClient } from "@/lib/supabase/server";
import { runWithIngestionLog } from "@/lib/ingestion/run";
import { assertGatewayConfigured, getGatewayEmbeddingModel, EMBEDDING_MODEL } from "@/lib/ai/models";
import { listClassifiedObservationsSince } from "@/lib/supabase/repositories/shorts-observations";
import { getEmbeddings, upsertEmbeddings } from "@/lib/supabase/repositories/topic-embeddings";
import { replaceWeek } from "@/lib/supabase/repositories/niche-clusters";
import { runClustering } from "@/lib/ingestion/cluster-niches";
import { reportAssistant } from "@/lib/agents/dashboard/report";

export const maxDuration = 300;

/** Monday (UTC) of the given date's ISO week, as YYYY-MM-DD. */
function isoWeekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - day);
  return x.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }
  try { assertGatewayConfigured(); } catch (e) { return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 }); }

  const supabase = getServiceClient();
  const now = new Date();
  const since = new Date(now.getTime() - 28 * 86_400_000);
  const weekStart = isoWeekStart(now);
  await reportAssistant(supabase, 'niche_scout', 'working', "Clustering this week's observations…");

  try {
    const run = await runWithIngestionLog(supabase, "cluster_niches", () =>
      runClustering({
        since, weekStart, minConfidence: 0.5, mergeThreshold: 0.85, now,
        fetchRows: () => listClassifiedObservationsSince(supabase, { since, minConfidence: 0.5 }),
        getCachedEmbeddings: (labels) => getEmbeddings(supabase, { labels, model: EMBEDDING_MODEL }),
        embed: async (labels) => {
          const { embeddings } = await embedMany({ model: getGatewayEmbeddingModel(EMBEDDING_MODEL), values: labels });
          return embeddings;
        },
        saveEmbeddings: (saveRows) => upsertEmbeddings(supabase, saveRows.map((r) => ({ ...r, model: EMBEDDING_MODEL }))),
        replaceWeek: (w, clusterRows) => replaceWeek(supabase, w, clusterRows),
      }),
    );
    await reportAssistant(supabase, 'niche_scout', 'idle', null, { activityType: 'clustering', summary: `Clustered week ${weekStart}`, payload: { weekStart } });
    return NextResponse.json({ ok: true, ...scraperLog("cluster-niches", { run, weekStart }) });
  } catch (e) {
    console.error("cluster-niches failed", e);
    await reportAssistant(supabase, 'niche_scout', 'errored', serializeError(e).slice(0, 160));
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
