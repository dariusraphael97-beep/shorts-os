import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  recordAssistantActivity,
  listAssistantActivity,
  listAssistantStatuses,
  getAssistantSettings,
  updateAssistantSettings,
  deleteAssistantMemory,
} from '@/lib/supabase/repositories/assistants';

// ---------------------------------------------------------------------------
// recordAssistantActivity
// ---------------------------------------------------------------------------

function makeInsertClient(error: unknown = null) {
  return {
    from: () => ({
      insert: async () => ({ error }),
    }),
  } as never;
}

describe('recordAssistantActivity', () => {
  it('resolves when insert succeeds', async () => {
    const client = makeInsertClient(null);
    await expect(
      recordAssistantActivity(client, {
        assistantId: 'a1',
        activityType: 'job_started',
        summary: 'Started render job',
        payload: { jobId: 'j1' },
      }),
    ).resolves.toBeUndefined();
  });

  it('throws when insert returns an error', async () => {
    const client = makeInsertClient({ message: 'insert failed' });
    await expect(
      recordAssistantActivity(client, {
        assistantId: 'a1',
        activityType: 'job_started',
        summary: 'Started render job',
      }),
    ).rejects.toThrow('recordAssistantActivity: insert failed');
  });
});

// ---------------------------------------------------------------------------
// listAssistantActivity
// ---------------------------------------------------------------------------

function makeActivityListClient(
  rows: Record<string, unknown>[] | null,
  error: unknown = null,
) {
  // Chain: from().select('*').order().eq().range()  — terminal is range()
  // Also supports: from().select('*').order().range() when no filters applied
  const terminal = { data: rows, error };
  const builder = {
    // range is always the last in the chain; must be a thenable
    range: () => Promise.resolve(terminal),
    eq: () => builder,
    order: () => builder,
    select: () => builder,
  };
  return {
    from: () => builder,
  } as never;
}

describe('listAssistantActivity', () => {
  it('returns rows when assistantId filter is applied', async () => {
    const rows = [
      { id: 'act1', assistant_id: 'a1', activity_type: 'job_started', summary: 'started', payload: {}, created_at: '2026-01-01T00:00:00Z' },
    ];
    const client = makeActivityListClient(rows);
    const result = await listAssistantActivity(client, { assistantId: 'a1' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('act1');
    expect(result[0].activity_type).toBe('job_started');
  });

  it('returns empty array when data is null', async () => {
    const client = makeActivityListClient(null);
    const result = await listAssistantActivity(client, {});
    expect(result).toEqual([]);
  });

  it('throws when query returns an error', async () => {
    const client = makeActivityListClient(null, { message: 'query failed' });
    await expect(listAssistantActivity(client, { assistantId: 'a1' })).rejects.toThrow(
      'listAssistantActivity: query failed',
    );
  });
});

// ---------------------------------------------------------------------------
// listAssistantStatuses
// ---------------------------------------------------------------------------

function makeSelectClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        order: async () => ({ data: rows, error }),
      }),
    }),
  } as never;
}

describe('listAssistantStatuses', () => {
  it('returns rows from assistant_status', async () => {
    const rows = [
      { assistant_id: 'a1', state: 'idle', current_activity: null, updated_at: '2026-01-01T00:00:00Z' },
      { assistant_id: 'a2', state: 'working', current_activity: 'Generating script', updated_at: '2026-01-01T00:01:00Z' },
    ];
    const client = makeSelectClient(rows);
    const result = await listAssistantStatuses(client);
    expect(result).toHaveLength(2);
    expect(result[0].state).toBe('idle');
    expect(result[1].state).toBe('working');
  });

  it('returns empty array when data is null', async () => {
    const client = makeSelectClient(null);
    const result = await listAssistantStatuses(client);
    expect(result).toEqual([]);
  });

  it('throws when select returns an error', async () => {
    const client = makeSelectClient(null, { message: 'db error' });
    await expect(listAssistantStatuses(client)).rejects.toThrow('listAssistantStatuses: db error');
  });
});

// ---------------------------------------------------------------------------
// getAssistantSettings
// ---------------------------------------------------------------------------

function makeMaybeSingleClient(row: Record<string, unknown> | null, error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error }),
        }),
      }),
    }),
  } as never;
}

describe('getAssistantSettings', () => {
  it('returns settings row when found', async () => {
    const row = { assistant_id: 'a1', settings: { theme: 'dark' }, updated_at: '2026-01-01T00:00:00Z' };
    const client = makeMaybeSingleClient(row);
    const result = await getAssistantSettings(client, 'a1');
    expect(result).not.toBeNull();
    expect(result?.settings).toEqual({ theme: 'dark' });
  });

  it('returns null when no row found', async () => {
    const client = makeMaybeSingleClient(null);
    const result = await getAssistantSettings(client, 'missing');
    expect(result).toBeNull();
  });

  it('throws when query returns an error', async () => {
    const client = makeMaybeSingleClient(null, { message: 'settings error' });
    await expect(getAssistantSettings(client, 'a1')).rejects.toThrow(
      'getAssistantSettings: settings error',
    );
  });
});

// ---------------------------------------------------------------------------
// updateAssistantSettings
// ---------------------------------------------------------------------------

function makeUpsertSelectSingleClient(row: Record<string, unknown> | null, error: unknown = null) {
  return {
    from: () => ({
      upsert: () => ({
        select: () => ({
          single: async () => ({ data: row, error }),
        }),
      }),
    }),
  } as never;
}

describe('updateAssistantSettings', () => {
  it('returns upserted settings row', async () => {
    const row = { assistant_id: 'a1', settings: { theme: 'light' }, updated_at: '2026-01-01T00:00:00Z' };
    const client = makeUpsertSelectSingleClient(row);
    const result = await updateAssistantSettings(client, 'a1', { theme: 'light' });
    expect(result.assistant_id).toBe('a1');
    expect(result.settings).toEqual({ theme: 'light' });
  });

  it('throws when upsert returns an error', async () => {
    const client = makeUpsertSelectSingleClient(null, { message: 'upsert failed' });
    await expect(updateAssistantSettings(client, 'a1', {})).rejects.toThrow(
      'updateAssistantSettings: upsert failed',
    );
  });
});

// ---------------------------------------------------------------------------
// deleteAssistantMemory
// ---------------------------------------------------------------------------

function makeDeleteClient(error: unknown = null) {
  return {
    from: () => ({
      delete: () => ({
        eq: async () => ({ error }),
      }),
    }),
  } as never;
}

describe('deleteAssistantMemory', () => {
  it('resolves when delete succeeds', async () => {
    const client = makeDeleteClient(null);
    await expect(deleteAssistantMemory(client, 'mem-1')).resolves.toBeUndefined();
  });

  it('throws when delete returns an error', async () => {
    const client = makeDeleteClient({ message: 'delete failed' });
    await expect(deleteAssistantMemory(client, 'mem-1')).rejects.toThrow(
      'deleteAssistantMemory: delete failed',
    );
  });
});
