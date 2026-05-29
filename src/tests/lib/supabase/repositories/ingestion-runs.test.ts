import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  startIngestionRun,
  finishIngestionRun,
  listRecentRunsByJob,
} from '@/lib/supabase/repositories/ingestion-runs';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  const single = vi.fn(async () => ({ data: rows?.[0] ?? null, error }));
  const limit = vi.fn(() => ({
    then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }),
  }));
  const order = vi.fn(() => ({ limit }));
  const eqSelect = vi.fn(() => ({ order }));
  const insertSelect = vi.fn(() => ({ single }));
  const updateSelect = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select: insertSelect }));
  const updateEq = vi.fn(() => ({ select: updateSelect }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const select = vi.fn(() => ({ eq: eqSelect }));
  const from = vi.fn(() => ({ insert, update, select }));
  const client = { from } as never;
  return { client, spies: { from, insert, update, updateEq, select, eqSelect, order, limit, single } };
}

describe('ingestion-runs repository', () => {
  it('startIngestionRun inserts a partial placeholder', async () => {
    const { client, spies } = makeClient([{ id: 'run-1', job: 'google_trends', status: 'partial' }]);
    const result = await startIngestionRun(client, { job: 'google_trends' });
    expect(spies.from).toHaveBeenCalledWith('ingestion_runs');
    expect(spies.insert).toHaveBeenCalledWith({ job: 'google_trends', status: 'partial' });
    expect(result.id).toBe('run-1');
  });

  it('finishIngestionRun updates the row by id', async () => {
    const { client, spies } = makeClient([{ id: 'run-1', status: 'success', items_ingested: 5 }]);
    const result = await finishIngestionRun(client, {
      id: 'run-1', status: 'success', itemsIngested: 5, itemsSkipped: 0, quotaUnits: 0,
    });
    expect(spies.updateEq).toHaveBeenCalledWith('id', 'run-1');
    expect(result.status).toBe('success');
    expect(result.items_ingested).toBe(5);
  });

  it('listRecentRunsByJob applies the job filter, order, and limit', async () => {
    const { client, spies } = makeClient([{ id: 'a' }, { id: 'b' }]);
    const result = await listRecentRunsByJob(client, { job: 'watch_list_sync', limit: 7 });
    expect(spies.eqSelect).toHaveBeenCalledWith('job', 'watch_list_sync');
    expect(spies.order).toHaveBeenCalledWith('started_at', { ascending: false });
    expect(spies.limit).toHaveBeenCalledWith(7);
    expect(result).toHaveLength(2);
  });

  it('throws a prefixed error when supabase returns an error', async () => {
    const { client } = makeClient(null, { message: 'db down' });
    await expect(listRecentRunsByJob(client, { job: 'google_trends', limit: 5 }))
      .rejects.toThrow('listRecentRunsByJob: db down');
  });
});
