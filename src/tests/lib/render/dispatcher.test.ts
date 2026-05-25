import { describe, it, expect, vi } from 'vitest';
import { runDispatcher } from '@/lib/render/dispatcher';

describe('runDispatcher', () => {
  it('claims up to RENDER_CONCURRENCY jobs and dispatches each via the worker', async () => {
    const claimedJobs = [
      { id: 'j1', job_type: 'render_f1', payload: { your_video_id: 'v1' } },
      { id: 'j2', job_type: 'clip_ingest', payload: { source_url: 'https://r/x', niche_id: 'n1' } },
    ];
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: claimedJobs, error: null }),
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }),
    };
    const worker = { dispatch: vi.fn().mockResolvedValue({ invocationId: 'sb-id' }) };
    vi.stubEnv('RENDER_CONCURRENCY', '4');
    vi.stubEnv('RENDER_CALLBACK_SECRET', 'test-secret');

    const result = await runDispatcher({ supabase: supabase as never, worker, now: new Date() });
    expect(result.claimed).toBe(2);
    expect(worker.dispatch).toHaveBeenCalledTimes(2);
    expect(supabase.rpc).toHaveBeenCalledWith('claim_render_jobs', { p_limit: 4 });
    vi.unstubAllEnvs();
  });

  it('returns claimed=0 when nothing is pending', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const worker = { dispatch: vi.fn() };
    vi.stubEnv('RENDER_CONCURRENCY', '4');
    vi.stubEnv('RENDER_CALLBACK_SECRET', 'test-secret');
    const result = await runDispatcher({ supabase: supabase as never, worker, now: new Date() });
    expect(result.claimed).toBe(0);
    expect(worker.dispatch).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('marks a job failed if worker.dispatch throws', async () => {
    const claimedJobs = [{ id: 'j1', job_type: 'render_f1', payload: { your_video_id: 'v1' } }];
    const updateChain = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: claimedJobs, error: null }),
      from: vi.fn().mockReturnValue({ update: updateChain }),
    };
    const worker = { dispatch: vi.fn().mockRejectedValue(new Error('sandbox quota exceeded')) };
    vi.stubEnv('RENDER_CONCURRENCY', '4');
    vi.stubEnv('RENDER_CALLBACK_SECRET', 'test-secret');
    const result = await runDispatcher({ supabase: supabase as never, worker, now: new Date() });
    expect(result.claimed).toBe(1);
    expect(result.failed).toBe(1);
    expect(updateChain).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    vi.unstubAllEnvs();
  });
});
