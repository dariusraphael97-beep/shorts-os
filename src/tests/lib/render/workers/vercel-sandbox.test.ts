import { describe, it, expect, vi } from 'vitest';
import { VercelSandboxRenderWorker } from '@/lib/render/workers/vercel-sandbox';
import type { RenderJobRow } from '@/lib/supabase/repositories/render-jobs';

vi.mock('@vercel/sandbox', () => ({
  Sandbox: {
    create: vi.fn().mockResolvedValue({
      name: 'sandbox-abc',
      runCommand: vi.fn().mockResolvedValue({ id: 'cmd-1' }),
    }),
  },
}));

describe('VercelSandboxRenderWorker', () => {
  it('creates a sandbox, runs the worker entrypoint detached, and returns the invocation id', async () => {
    // Ensure git source env is set so the worker doesn't throw on env validation
    vi.stubEnv('SANDBOX_GIT_URL', 'https://github.com/test/repo.git');
    vi.stubEnv('SANDBOX_GIT_REF', 'abc123');
    const worker = new VercelSandboxRenderWorker();
    const job = { id: 'job-1', job_type: 'render_f1', payload: { your_video_id: 'v1' } } as RenderJobRow;
    const result = await worker.dispatch(job, 'mock-jwt-token');
    expect(result.invocationId).toBe('sandbox-abc');
    vi.unstubAllEnvs();
  });

  it('passes job id and token to the worker command', async () => {
    vi.stubEnv('SANDBOX_GIT_URL', 'https://github.com/test/repo.git');
    vi.stubEnv('SANDBOX_GIT_REF', 'abc123');
    const { Sandbox } = await import('@vercel/sandbox');
    const runCommand = vi.fn().mockResolvedValue({ id: 'cmd-1' });
    (Sandbox.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ name: 'sb-xyz', runCommand });
    const worker = new VercelSandboxRenderWorker();
    const job = { id: 'job-2', job_type: 'render_f1', payload: {} } as RenderJobRow;
    await worker.dispatch(job, 'token-xyz');
    expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({
      detached: true,
      args: expect.arrayContaining(['job-2', 'token-xyz']),
    }));
    vi.unstubAllEnvs();
  });
});
