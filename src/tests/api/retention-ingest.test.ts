import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({})) }));
vi.mock('@/lib/supabase/repositories/video-analytics', () => ({
  ingestManualRetention: vi.fn(async () => ({
    points: 3, snapshotAt: '2026-06-10T15:00:00.000Z', first30sRetention: 0.42,
  })),
}));
vi.mock('@/lib/supabase/repositories/your-videos', () => ({
  getVideoForRetentionIngest: vi.fn(async (_s: unknown, ref: { externalVideoId?: string; yourVideoId?: string }) =>
    ref.externalVideoId === 'GwC66BSw7wU' || ref.yourVideoId === '7f7eef94-de2b-4348-a857-86037563f2e7'
      ? { id: '7f7eef94-de2b-4348-a857-86037563f2e7', durationSeconds: 503 }
      : null,
  ),
}));

import { POST } from '@/app/api/youtube/retention-ingest/route';
import { signSession } from '@/lib/auth/session';
import { ingestManualRetention } from '@/lib/supabase/repositories/video-analytics';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.COCKPIT_SESSION_SECRET = 'test-secret-at-least-32-chars-long-xyz';
});

function req(body: unknown, opts: { cookie?: string } = {}) {
  return new Request('https://app/api/youtube/retention-ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(opts.cookie ? { cookie: opts.cookie } : {}) },
    body: JSON.stringify(body),
  });
}
const goodCookie = () => `cockpit_session=${signSession()}`;
const CSV = '0,1\n0.5,0.5\n1,0.2';

describe('POST /api/youtube/retention-ingest', () => {
  it('401s without a valid cockpit cookie', async () => {
    const res = await POST(req({ externalVideoId: 'GwC66BSw7wU', rawCurve: CSV }));
    expect(res.status).toBe(401);
  });

  it('400s when neither/both video ids are provided', async () => {
    const res = await POST(req({ rawCurve: CSV }, { cookie: goodCookie() }));
    expect(res.status).toBe(400);
  });

  it('400s on an unparseable curve', async () => {
    const res = await POST(req({ externalVideoId: 'GwC66BSw7wU', rawCurve: 'garbage\nnope' }, { cookie: goodCookie() }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('parse_error');
  });

  it('404s when the video is unknown', async () => {
    const res = await POST(req({ externalVideoId: 'UNKNOWN', rawCurve: CSV }, { cookie: goodCookie() }));
    expect(res.status).toBe(404);
  });

  it('401s when the cockpit cookie is present but forged', async () => {
    const res = await POST(req({ externalVideoId: 'GwC66BSw7wU', rawCurve: CSV }, { cookie: 'cockpit_session=tampered.payload' }));
    expect(res.status).toBe(401);
  });

  it('401s (not 500) when the cookie value is malformed percent-encoding', async () => {
    const res = await POST(req({ externalVideoId: 'GwC66BSw7wU', rawCurve: CSV }, { cookie: 'cockpit_session=%zz' }));
    expect(res.status).toBe(401);
  });

  it('400s when both video ids are provided', async () => {
    const res = await POST(
      req({ externalVideoId: 'GwC66BSw7wU', yourVideoId: '7f7eef94-de2b-4348-a857-86037563f2e7', rawCurve: CSV }, { cookie: goodCookie() }),
    );
    expect(res.status).toBe(400);
  });

  it('ingests on the happy path, passing the resolved id + duration', async () => {
    const res = await POST(
      req({ externalVideoId: 'GwC66BSw7wU', rawCurve: CSV, metrics: { views: 16 } }, { cookie: goodCookie() }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, yourVideoId: '7f7eef94-de2b-4348-a857-86037563f2e7', points: 3 });
    expect(vi.mocked(ingestManualRetention)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        yourVideoId: '7f7eef94-de2b-4348-a857-86037563f2e7',
        durationSeconds: 503,
        curve: expect.arrayContaining([{ elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 }]),
        metricsOverride: { views: 16 },
      }),
    );
  });
});
