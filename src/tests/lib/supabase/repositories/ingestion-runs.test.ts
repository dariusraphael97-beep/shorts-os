import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  startIngestionRun,
  finishIngestionRun,
  listRecentRunsByJob,
} from '@/lib/supabase/repositories/ingestion-runs';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }) }),
      select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }) }) }) }),
    }),
  } as never;
}

describe('ingestion-runs repository', () => {
  it('startIngestionRun inserts a partial placeholder', async () => {
    const row = { id: 'run-1', job: 'google_trends', status: 'partial' };
    const result = await startIngestionRun(makeClient([row]), { job: 'google_trends' });
    expect(result.id).toBe('run-1');
  });

  it('finishIngestionRun updates the row', async () => {
    const row = { id: 'run-1', job: 'google_trends', status: 'success', items_ingested: 5 };
    const result = await finishIngestionRun(makeClient([row]), {
      id: 'run-1', status: 'success', itemsIngested: 5, itemsSkipped: 0, quotaUnits: 0,
    });
    expect(result.status).toBe('success');
    expect(result.items_ingested).toBe(5);
  });

  it('listRecentRunsByJob returns rows', async () => {
    const result = await listRecentRunsByJob(makeClient([{ id: 'a' }, { id: 'b' }]), { job: 'reddit_topic_discovery', limit: 10 });
    expect(result).toHaveLength(2);
  });
});
