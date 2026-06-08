// scripts/render-worker/lib/jobs.ts
// Worker-side queue helpers (mirror of the relevant src render-jobs repo logic).
import type { SupabaseClient } from '@supabase/supabase-js';

export interface RenderJob {
  id: string;
  job_type: string;
  payload: unknown;
  status: string;
  your_video_id: string | null;
}

export async function claimOne(supabase: SupabaseClient): Promise<RenderJob | null> {
  const { data, error } = await supabase.rpc('claim_render_jobs', { p_limit: 1 });
  if (error) throw new Error(`claim_render_jobs: ${error.message}`);
  const rows = (data as RenderJob[] | null) ?? [];
  return rows[0] ?? null;
}

export async function markRunning(supabase: SupabaseClient, jobId: string): Promise<void> {
  const { error } = await supabase
    .from('render_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw new Error(`markRunning: ${error.message}`);
}

export async function markSucceeded(supabase: SupabaseClient, jobId: string): Promise<void> {
  const { error } = await supabase
    .from('render_jobs')
    .update({ status: 'succeeded', finished_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw new Error(`markSucceeded: ${error.message}`);
}

export async function markFailed(supabase: SupabaseClient, jobId: string, message: string): Promise<void> {
  const { error } = await supabase
    .from('render_jobs')
    .update({ status: 'failed', last_error: message.slice(0, 2000), finished_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) throw new Error(`markFailed: ${error.message}`);
}
