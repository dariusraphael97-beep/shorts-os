// src/lib/supabase/repositories/render-jobs.ts
//
// Repository for the render_jobs queue. Atomic claim + watchdog reset are
// implemented as Postgres functions (see migration 20260525000004) so we get
// transactional semantics for free.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type RenderJobType = 'clip_ingest' | 'render_f1' | 'render_f2' | 'upload' | 'render_longform';
export type RenderJobStatus = 'pending' | 'claimed' | 'running' | 'succeeded' | 'failed';

export interface RenderJobRow {
  id: string;
  job_type: RenderJobType;
  payload: unknown;
  status: RenderJobStatus;
  attempts: number;
  last_error: string | null;
  claimed_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  sandbox_invocation_id: string | null;
  your_video_id: string | null;
  compilation_draft_id: string | null;
  clip_library_id: string | null;
  created_at: string;
}

export interface EnqueueRenderJobParams {
  jobType: RenderJobType;
  payload: Record<string, unknown>;
  yourVideoId?: string;
  compilationDraftId?: string;
  clipLibraryId?: string;
}

export async function enqueueRenderJob(
  supabase: SupabaseClient,
  params: EnqueueRenderJobParams,
): Promise<RenderJobRow> {
  const { data, error } = await supabase
    .from('render_jobs')
    .insert({
      job_type: params.jobType,
      payload: params.payload,
      status: 'pending',
      your_video_id: params.yourVideoId ?? null,
      compilation_draft_id: params.compilationDraftId ?? null,
      clip_library_id: params.clipLibraryId ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as RenderJobRow;
}

export async function claimPendingJobs(
  supabase: SupabaseClient,
  args: { limit: number },
): Promise<RenderJobRow[]> {
  const { data, error } = await supabase.rpc('claim_render_jobs', { p_limit: args.limit });
  if (error) throw error;
  return (data ?? []) as RenderJobRow[];
}

export async function markJobRunning(
  supabase: SupabaseClient,
  args: { jobId: string; sandboxInvocationId: string },
): Promise<void> {
  const { error } = await supabase
    .from('render_jobs')
    .update({
      status: 'running',
      sandbox_invocation_id: args.sandboxInvocationId,
      started_at: new Date().toISOString(),
    })
    .eq('id', args.jobId);
  if (error) throw error;
}

export async function markJobSucceeded(
  supabase: SupabaseClient,
  args: { jobId: string },
): Promise<number> {
  // Only transition if currently running (idempotent against duplicate callbacks)
  const { count, error } = await supabase
    .from('render_jobs')
    .update({ status: 'succeeded', finished_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', args.jobId)
    .eq('status', 'running');
  if (error) throw error;
  return count ?? 0;
}

export async function markJobFailed(
  supabase: SupabaseClient,
  args: { jobId: string; error: string },
): Promise<void> {
  const { error } = await supabase
    .from('render_jobs')
    .update({
      status: 'failed',
      last_error: args.error,
      finished_at: new Date().toISOString(),
    })
    .eq('id', args.jobId);
  if (error) throw error;
}

export async function resetStuckJobs(supabase: SupabaseClient): Promise<RenderJobRow[]> {
  const { data, error } = await supabase.rpc('reset_stuck_render_jobs');
  if (error) throw error;
  return (data ?? []) as RenderJobRow[];
}
