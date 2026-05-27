import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/render/complete/route';
import { signCallbackToken } from '@/lib/render/callback-token';

// Mock the service supabase to capture writes
const mockUpdate = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: () => ({
    from: (table: string) => ({
      update: (...args: unknown[]) => {
        mockUpdate(...args);
        return { eq: () => ({ eq: () => Promise.resolve({ count: 1, error: null, data: null }) }) };
      },
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({
            data: table === 'render_jobs' ? { your_video_id: null } : null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

describe('POST /api/render/complete', () => {
  beforeEach(() => {
    vi.stubEnv('RENDER_CALLBACK_SECRET', 'test-secret');
    mockUpdate.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('accepts a succeeded result with valid JWT', async () => {
    const token = signCallbackToken({ jobId: '550e8400-e29b-41d4-a716-446655440000', ttlSeconds: 60 });
    const req = new Request('http://localhost/api/render/complete', {
      method: 'POST',
      headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        job_id: '550e8400-e29b-41d4-a716-446655440000',
        sandbox_invocation_id: 'sb-abc',
        result: { status: 'succeeded', output: { render_artifact_url: 'https://blob/x.mp4' } },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('rejects when token is missing', async () => {
    const req = new Request('http://localhost/api/render/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ job_id: '550e8400-e29b-41d4-a716-446655440000', sandbox_invocation_id: 'sb', result: { status: 'succeeded', output: {} } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects when token jobId mismatches body job_id', async () => {
    const token = signCallbackToken({ jobId: '550e8400-e29b-41d4-a716-446655440000', ttlSeconds: 60 });
    const req = new Request('http://localhost/api/render/complete', {
      method: 'POST',
      headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ job_id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', sandbox_invocation_id: 'sb', result: { status: 'succeeded', output: {} } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('updates compilation_drafts on render_f2 success', async () => {
    const token = signCallbackToken({ jobId: '550e8400-e29b-41d4-a716-446655440000', ttlSeconds: 60 });
    const req = new Request('http://localhost/api/render/complete', {
      method: 'POST',
      headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        job_id: '550e8400-e29b-41d4-a716-446655440000',
        sandbox_invocation_id: 'sb-f2',
        result: {
          status: 'succeeded',
          output: {
            compilation_draft_id: '11111111-1111-4111-8111-111111111111',
            rendered_path: 'https://blob/compilation/x.mp4',
            duration_seconds_actual: 28.5,
          },
        },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const updateCall = mockUpdate.mock.calls.find(
      (call) =>
        typeof call[0] === 'object' &&
        call[0] !== null &&
        'rendered_path' in (call[0] as Record<string, unknown>) &&
        'status' in (call[0] as Record<string, unknown>),
    );
    expect(updateCall).toBeDefined();
    expect((updateCall![0] as Record<string, unknown>).rendered_path).toBe(
      'https://blob/compilation/x.mp4',
    );
    expect((updateCall![0] as Record<string, unknown>).status).toBe('rendered');
  });

  it('rejects malformed body via Zod', async () => {
    const token = signCallbackToken({ jobId: '550e8400-e29b-41d4-a716-446655440000', ttlSeconds: 60 });
    const req = new Request('http://localhost/api/render/complete', {
      method: 'POST',
      headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ /* missing fields */ }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
