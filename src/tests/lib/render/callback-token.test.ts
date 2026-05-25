import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signCallbackToken, verifyCallbackToken, CallbackTokenError } from '@/lib/render/callback-token';

describe('callback-token', () => {
  beforeEach(() => { vi.stubEnv('RENDER_CALLBACK_SECRET', 'test-secret-do-not-use-in-prod'); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('round-trips a job_id', () => {
    const token = signCallbackToken({ jobId: 'job-1', ttlSeconds: 60 });
    const decoded = verifyCallbackToken(token);
    expect(decoded.jobId).toBe('job-1');
  });

  it('rejects an expired token', () => {
    const token = signCallbackToken({ jobId: 'job-1', ttlSeconds: -1 });
    expect(() => verifyCallbackToken(token)).toThrow(CallbackTokenError);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signCallbackToken({ jobId: 'job-1', ttlSeconds: 60 });
    vi.stubEnv('RENDER_CALLBACK_SECRET', 'different-secret');
    expect(() => verifyCallbackToken(token)).toThrow(CallbackTokenError);
  });

  it('rejects malformed token', () => {
    expect(() => verifyCallbackToken('not-a-jwt')).toThrow(CallbackTokenError);
  });
});
