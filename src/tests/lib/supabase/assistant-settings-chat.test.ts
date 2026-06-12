import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  deleteAssistantMemory,
  getAssistantSettings,
  updateAssistantSettings,
  setAssistantEnabled,
} from '@/lib/supabase/repositories/assistants';
import {
  createChatThread,
  listChatThreads,
  appendChatMessage,
  listChatMessages,
} from '@/lib/supabase/repositories/assistant-chat';

beforeEach(() => vi.clearAllMocks());

// Records calls so tests can assert what was written; resolves with `rows`.
function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const result = { data: rows?.[0] ?? null, error };
  const listResult = { data: rows ?? [], error };
  const builder: Record<string, unknown> = {};
  const chain = (method: string) => (...args: unknown[]) => {
    calls.push({ table: calls.at(-1)?.table ?? '', method, args });
    return builder;
  };
  for (const m of ['upsert', 'insert', 'update', 'delete', 'select', 'eq', 'order']) {
    builder[m] = chain(m);
  }
  builder.single = async () => result;
  builder.maybeSingle = async () => result;
  builder.limit = async () => listResult;
  // delete().eq().eq() and update().eq() resolve as thenables:
  builder.then = (resolve: (v: typeof listResult) => unknown) => resolve(listResult);
  const client = {
    from: (table: string) => {
      calls.push({ table, method: 'from', args: [] });
      return builder;
    },
  } as never;
  return { client, calls };
}

describe('assistant settings + memory', () => {
  it('getAssistantSettings returns {} when no row', async () => {
    const { client } = makeClient(null, { code: 'PGRST116' });
    expect(await getAssistantSettings(client, 'analyst')).toEqual({});
  });

  it('getAssistantSettings returns the settings jsonb', async () => {
    const { client } = makeClient([{ settings: { chat_model: 'claude-opus-4-7' } }]);
    expect(await getAssistantSettings(client, 'analyst')).toEqual({ chat_model: 'claude-opus-4-7' });
  });

  it('updateAssistantSettings merges the patch over existing settings', async () => {
    const { client, calls } = makeClient([{ settings: { chat_model: 'claude-haiku-4-5' } }]);
    await updateAssistantSettings(client, 'analyst', { chat_model: 'claude-sonnet-4-6' });
    const upsert = calls.find((c) => c.method === 'upsert');
    expect(upsert).toBeDefined();
    const payload = upsert!.args[0] as { assistant_id: string; settings: Record<string, unknown> };
    expect(payload.assistant_id).toBe('analyst');
    expect(payload.settings.chat_model).toBe('claude-sonnet-4-6');
  });

  it('setAssistantEnabled updates the flag', async () => {
    const { client, calls } = makeClient([{ id: 'analyst', is_enabled: true }]);
    await setAssistantEnabled(client, 'analyst', true);
    const update = calls.find((c) => c.method === 'update');
    expect((update!.args[0] as { is_enabled: boolean }).is_enabled).toBe(true);
  });

  it('deleteAssistantMemory deletes by assistant + key', async () => {
    const { client, calls } = makeClient([]);
    await deleteAssistantMemory(client, 'analyst', 'stale_key');
    expect(calls.some((c) => c.method === 'delete')).toBe(true);
    expect(calls.filter((c) => c.method === 'eq')).toHaveLength(2);
  });
});

describe('assistant chat repo', () => {
  it('createChatThread inserts with a title', async () => {
    const { client } = makeClient([{ id: 't1', assistant_id: 'analyst', title: 'How is the B58 doing?' }]);
    const thread = await createChatThread(client, { assistantId: 'analyst', title: 'How is the B58 doing?' });
    expect(thread.id).toBe('t1');
  });

  it('listChatThreads returns rows', async () => {
    const { client } = makeClient([{ id: 't1' }, { id: 't2' }]);
    expect(await listChatThreads(client, 'analyst', 20)).toHaveLength(2);
  });

  it('appendChatMessage inserts the message and bumps last_message_at', async () => {
    const { client, calls } = makeClient([{ id: 'm1', thread_id: 't1', role: 'user', content: 'hi' }]);
    const msg = await appendChatMessage(client, { threadId: 't1', role: 'user', content: 'hi' });
    expect(msg.id).toBe('m1');
    expect(calls.some((c) => c.method === 'update')).toBe(true); // thread bump
  });

  it('listChatMessages returns rows oldest-first', async () => {
    const { client } = makeClient([{ id: 'm1' }, { id: 'm2' }]);
    expect(await listChatMessages(client, 't1')).toHaveLength(2);
  });
});
