import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/env', () => ({ loadEnv: () => ({ YOUTUBE_API_KEY: 'test-key' }) }));
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({})) }));
vi.mock('@/lib/scrapers/shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/scrapers/shared')>('@/lib/scrapers/shared');
  return { ...actual, assertCronAuth: vi.fn() };
});
vi.mock('@/lib/clients/youtube', () => ({
  YOUTUBE_QUOTA_COST: { search: 100, videosList: 1, channelsList: 1, playlistItems: 1 },
  searchVideoIds: vi.fn(async () => []),
  fetchVideosByIds: vi.fn(async () => []),
  fetchChannels: vi.fn(async () => []),
}));
vi.mock('@/lib/supabase/repositories/shorts-observations', () => ({ upsertShortsObservation: vi.fn(async () => ({})) }));
vi.mock('@/lib/ingestion/run', () => ({
  runWithIngestionLog: vi.fn(async (_supabase: unknown, job: string, fn: () => Promise<unknown>) => {
    await fn();
    return { id: 'run-1', job, status: 'success', started_at: '', finished_at: null, items_ingested: 0, items_skipped: 0, quota_units: 0, error: null, context: {} };
  }),
}));

import { GET } from '@/app/api/cron/youtube-dominatable-sweep/route';
import { runWithIngestionLog } from '@/lib/ingestion/run';
import { searchVideoIds } from '@/lib/clients/youtube';

beforeEach(() => vi.clearAllMocks());

describe('GET /api/cron/youtube-dominatable-sweep', () => {
  it('runs the dominatable sweep under the youtube_dominatable_sweep ledger job', async () => {
    const req = new Request('https://app/api/cron/youtube-dominatable-sweep', { headers: { authorization: 'Bearer ANYCRON' } });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(vi.mocked(runWithIngestionLog)).toHaveBeenCalledWith(expect.anything(), 'youtube_dominatable_sweep', expect.any(Function));
    expect(vi.mocked(searchVideoIds)).toHaveBeenCalled(); // the adapter actually ran over the seeds
  });
});
