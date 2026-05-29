import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { serializeError } from '@/lib/scrapers/shared';
import {
  startIngestionRun,
  finishIngestionRun,
  type IngestionJob,
  type IngestionStatus,
  type IngestionRunRow,
} from '@/lib/supabase/repositories/ingestion-runs';

export interface AdapterResult {
  ingested: number;
  skipped: number;
  quotaUnits: number;
  /** Optional explicit status (e.g. the disabled TikTok stub uses 'skipped'). */
  status?: IngestionStatus;
  /** When true and no explicit status, the run is recorded as 'partial'. */
  partial?: boolean;
  context?: Record<string, unknown>;
}

export async function runWithIngestionLog(
  supabase: SupabaseClient,
  job: IngestionJob,
  fn: () => Promise<AdapterResult>,
): Promise<IngestionRunRow> {
  const run = await startIngestionRun(supabase, { job });
  try {
    const result = await fn();
    const status: IngestionStatus = result.status ?? (result.partial ? 'partial' : 'success');
    return await finishIngestionRun(supabase, {
      id: run.id,
      status,
      itemsIngested: result.ingested,
      itemsSkipped: result.skipped,
      quotaUnits: result.quotaUnits,
      context: result.context,
    });
  } catch (e) {
    await finishIngestionRun(supabase, {
      id: run.id,
      status: 'failed',
      itemsIngested: 0,
      itemsSkipped: 0,
      quotaUnits: 0,
      error: serializeError(e),
    });
    throw e;
  }
}
