import type { IngestionJob } from "@/lib/supabase/repositories/ingestion-runs";

const CRON_PATHS: Record<IngestionJob, string> = {
  youtube_category_sweep: "/api/cron/youtube-category-sweep",
  youtube_shorts_search: "/api/cron/youtube-shorts-search",
  watch_list_sync: "/api/cron/watch-list-sync",
  reddit_topic_discovery: "/api/cron/reddit-topic-discovery",
  google_trends: "/api/cron/google-trends",
  tiktok_creative_center: "/api/cron/tiktok-creative-center",
  classify_observations: "/api/cron/classify-observations",
  cluster_niches: "/api/cron/cluster-niches",
};

export const TRIGGERABLE_JOBS = Object.keys(CRON_PATHS) as IngestionJob[];

export function cronPathForJob(job: IngestionJob): string | null {
  return CRON_PATHS[job] ?? null;
}

export async function triggerIngestion(args: {
  job: IngestionJob;
  origin: string;
  secret: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; status: number; body: unknown }> {
  const path = cronPathForJob(args.job);
  if (!path) throw new Error(`triggerIngestion: unknown job '${args.job}'`);
  const doFetch = args.fetchImpl ?? fetch;
  const res = await doFetch(`${args.origin}${path}`, { headers: { authorization: `Bearer ${args.secret}` } });
  let body: unknown = null;
  try { body = await res.json(); } catch { body = null; }
  return { ok: res.ok, status: res.status, body };
}
