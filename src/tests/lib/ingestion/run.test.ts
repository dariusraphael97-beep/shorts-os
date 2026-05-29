import { describe, it, expect, vi, beforeEach } from 'vitest';

const { startIngestionRun, finishIngestionRun } = vi.hoisted(() => ({
  startIngestionRun: vi.fn(),
  finishIngestionRun: vi.fn(),
}));
vi.mock('@/lib/supabase/repositories/ingestion-runs', () => ({ startIngestionRun, finishIngestionRun }));

import { runWithIngestionLog } from '@/lib/ingestion/run';

const fakeSupabase = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  startIngestionRun.mockResolvedValue({ id: 'run-1' });
  finishIngestionRun.mockImplementation(async (_c, p) => p);
});

describe('runWithIngestionLog', () => {
  it('records success when the adapter returns cleanly', async () => {
    await runWithIngestionLog(fakeSupabase, 'google_trends', async () => ({ ingested: 3, skipped: 0, quotaUnits: 0 }));
    expect(finishIngestionRun).toHaveBeenCalledWith(fakeSupabase, expect.objectContaining({ id: 'run-1', status: 'success', itemsIngested: 3 }));
  });

  it('records partial when the adapter flags partial', async () => {
    await runWithIngestionLog(fakeSupabase, 'google_trends', async () => ({ ingested: 1, skipped: 2, quotaUnits: 0, partial: true }));
    expect(finishIngestionRun).toHaveBeenCalledWith(fakeSupabase, expect.objectContaining({ status: 'partial' }));
  });

  it('honors an explicit status override (skipped)', async () => {
    await runWithIngestionLog(fakeSupabase, 'tiktok_creative_center', async () => ({ ingested: 0, skipped: 0, quotaUnits: 0, status: 'skipped' }));
    expect(finishIngestionRun).toHaveBeenCalledWith(fakeSupabase, expect.objectContaining({ status: 'skipped' }));
  });

  it('records failed and rethrows when the adapter throws', async () => {
    await expect(
      runWithIngestionLog(fakeSupabase, 'reddit_topic_discovery', async () => { throw new Error('boom'); }),
    ).rejects.toThrow('boom');
    expect(finishIngestionRun).toHaveBeenCalledWith(fakeSupabase, expect.objectContaining({ status: 'failed', error: 'boom' }));
  });

  it('forwards context from the adapter result', async () => {
    await runWithIngestionLog(fakeSupabase, 'google_trends', async () => ({ ingested: 0, skipped: 0, quotaUnits: 0, context: { foo: 'bar' } }));
    expect(finishIngestionRun).toHaveBeenCalledWith(fakeSupabase, expect.objectContaining({ context: { foo: 'bar' } }));
  });
});
