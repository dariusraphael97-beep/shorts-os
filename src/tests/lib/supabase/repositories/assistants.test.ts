import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  registerAssistant,
  listAssistants,
  getAssistantById,
  updateAssistantStatus,
  upsertAssistantMemory,
  listAssistantMemory,
} from '@/lib/supabase/repositories/assistants';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      upsert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      insert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }) }),
      select: () => ({
        order: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }),
        eq: () => ({
          single: async () => ({ data: rows?.[0] ?? null, error }),
          maybeSingle: async () => ({ data: rows?.[0] ?? null, error }),
          order: () => ({ then: (r: (v: { data: unknown[]; error: unknown }) => unknown) => r({ data: rows ?? [], error }) }),
        }),
      }),
    }),
  } as never;
}

describe('assistants repository', () => {
  it('registerAssistant inserts with display fields', async () => {
    const row = { id: 'niche_scout', display_name: 'Niche Scout', is_enabled: true };
    const client = makeClient([row]);
    const result = await registerAssistant(client, {
      id: 'niche_scout',
      displayName: 'Niche Scout',
      roleDescription: 'Finds and ranks niches',
      iconName: 'compass',
      accentColorVar: '--accent',
      isEnabled: true,
    });
    expect(result.id).toBe('niche_scout');
  });

  it('listAssistants returns all', async () => {
    const client = makeClient([{ id: 'a' }, { id: 'b' }]);
    const result = await listAssistants(client);
    expect(result).toHaveLength(2);
  });

  it('getAssistantById returns null on PGRST116', async () => {
    const client = makeClient(null, { code: 'PGRST116' });
    const result = await getAssistantById(client, 'missing_assistant');
    expect(result).toBeNull();
  });

  it('updateAssistantStatus persists state + activity', async () => {
    const row = { assistant_id: 'niche_scout', state: 'working', current_activity: 'Clustering' };
    const client = makeClient([row]);
    const result = await updateAssistantStatus(client, 'niche_scout', 'working', 'Clustering');
    expect(result.state).toBe('working');
  });

  it('upsertAssistantMemory writes a key-value row', async () => {
    const row = { assistant_id: 'niche_scout', memory_key: 'preferred_band', memory_value: { value: 'proven' } };
    const client = makeClient([row]);
    const result = await upsertAssistantMemory(client, {
      assistantId: 'niche_scout',
      memoryKey: 'preferred_band',
      memoryValue: { value: 'proven' },
      confidence: 0.8,
      editableByUser: true,
    });
    expect(result.memory_key).toBe('preferred_band');
  });

  it('listAssistantMemory returns array for assistant', async () => {
    const client = makeClient([{ assistant_id: 'niche_scout', memory_key: 'k1' }, { assistant_id: 'niche_scout', memory_key: 'k2' }]);
    const result = await listAssistantMemory(client, 'niche_scout');
    expect(result).toHaveLength(2);
  });
});
