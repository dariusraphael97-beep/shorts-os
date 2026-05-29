import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type IngestionJob =
  | 'youtube_category_sweep'
  | 'youtube_shorts_search'
  | 'watch_list_sync'
  | 'reddit_topic_discovery'
  | 'google_trends'
  | 'tiktok_creative_center';

export type IngestionStatus = 'success' | 'partial' | 'failed' | 'skipped';

export interface IngestionRunRow {
  id: string;
  job: IngestionJob;
  status: IngestionStatus;
  started_at: string;
  finished_at: string | null;
  items_ingested: number;
  items_skipped: number;
  quota_units: number;
  error: string | null;
  context: Record<string, unknown>;
}

export async function startIngestionRun(
  supabase: SupabaseClient,
  params: { job: IngestionJob },
): Promise<IngestionRunRow> {
  const { data, error } = await supabase
    .from('ingestion_runs')
    .insert({ job: params.job, status: 'partial' })
    .select()
    .single();
  if (error) throw new Error(`startIngestionRun: ${error.message}`);
  return data as IngestionRunRow;
}

export async function finishIngestionRun(
  supabase: SupabaseClient,
  params: {
    id: string;
    status: IngestionStatus;
    itemsIngested: number;
    itemsSkipped: number;
    quotaUnits: number;
    error?: string | null;
    context?: Record<string, unknown>;
  },
): Promise<IngestionRunRow> {
  const { data, error } = await supabase
    .from('ingestion_runs')
    .update({
      status: params.status,
      finished_at: new Date().toISOString(),
      items_ingested: params.itemsIngested,
      items_skipped: params.itemsSkipped,
      quota_units: params.quotaUnits,
      error: params.error ?? null,
      context: params.context ?? {},
    })
    .eq('id', params.id)
    .select()
    .single();
  if (error) throw new Error(`finishIngestionRun: ${error.message}`);
  return data as IngestionRunRow;
}

export async function listRecentRunsByJob(
  supabase: SupabaseClient,
  params: { job: IngestionJob; limit: number },
): Promise<IngestionRunRow[]> {
  const { data, error } = await supabase
    .from('ingestion_runs')
    .select()
    .eq('job', params.job)
    .order('started_at', { ascending: false })
    .limit(params.limit);
  if (error) throw new Error(`listRecentRunsByJob: ${error.message}`);
  return (data ?? []) as IngestionRunRow[];
}
