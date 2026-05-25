import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  enqueueRenderJob, claimPendingJobs, markJobRunning,
  markJobSucceeded, markJobFailed, resetStuckJobs,
} from '@/lib/supabase/repositories/render-jobs';

describe('render-jobs repo', () => {
  it('enqueueRenderJob inserts a pending row', async () => {
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'j1', status: 'pending' }, error: null }) }) });
    const supabase = { from: vi.fn().mockReturnValue({ insert }) } as unknown as SupabaseClient;
    const job = await enqueueRenderJob(supabase, { jobType: 'render_f1', payload: { your_video_id: 'v1' }, yourVideoId: 'v1' });
    expect(job.id).toBe('j1');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      job_type: 'render_f1', status: 'pending', payload: { your_video_id: 'v1' }, your_video_id: 'v1',
    }));
  });

  it('claimPendingJobs calls the claim RPC and returns claimed rows', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'j1', status: 'claimed' }, { id: 'j2', status: 'claimed' }], error: null });
    const supabase = { rpc } as unknown as SupabaseClient;
    const claimed = await claimPendingJobs(supabase, { limit: 4 });
    expect(rpc).toHaveBeenCalledWith('claim_render_jobs', { p_limit: 4 });
    expect(claimed.map(j => j.id)).toEqual(['j1', 'j2']);
  });

  it('markJobRunning updates status with sandbox_invocation_id', async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const supabase = { from: vi.fn().mockReturnValue({ update }) } as unknown as SupabaseClient;
    await markJobRunning(supabase, { jobId: 'j1', sandboxInvocationId: 'sb-123' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'running', sandbox_invocation_id: 'sb-123',
    }));
    expect(eq).toHaveBeenCalledWith('id', 'j1');
  });

  it('markJobSucceeded transitions running → succeeded idempotently', async () => {
    const match = vi.fn().mockResolvedValue({ data: { count: 1 }, error: null, count: 1 });
    const eq = vi.fn().mockReturnValue({ eq: match });
    const update = vi.fn().mockReturnValue({ eq });
    const supabase = { from: vi.fn().mockReturnValue({ update }) } as unknown as SupabaseClient;
    const rowsUpdated = await markJobSucceeded(supabase, { jobId: 'j1' });
    expect(rowsUpdated).toBe(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: 'succeeded' }), { count: 'exact' });
  });

  it('markJobFailed records last_error and increments attempts', async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const supabase = { from: vi.fn().mockReturnValue({ update }) } as unknown as SupabaseClient;
    await markJobFailed(supabase, { jobId: 'j1', error: 'sandbox crashed' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed', last_error: 'sandbox crashed',
    }));
  });

  it('resetStuckJobs is callable (watchdog)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'j1' }], error: null });
    const supabase = { rpc } as unknown as SupabaseClient;
    const reset = await resetStuckJobs(supabase);
    expect(rpc).toHaveBeenCalledWith('reset_stuck_render_jobs');
    expect(reset.length).toBe(1);
  });
});
