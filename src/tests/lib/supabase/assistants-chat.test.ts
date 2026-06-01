import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  createChatThread,
  appendChatMessage,
  getThreadMessages,
  listChatThreads,
  touchThread,
} from '@/lib/supabase/repositories/assistants';

// ---------------------------------------------------------------------------
// createChatThread
// ---------------------------------------------------------------------------

function makeInsertSelectSingleClient(row: Record<string, unknown> | null, error: unknown = null) {
  return {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: row, error }),
        }),
      }),
    }),
  } as never;
}

describe('createChatThread', () => {
  it('returns the inserted thread row', async () => {
    const row = {
      id: 'thread-1',
      assistant_id: 'reviewer',
      started_at: '2026-01-01T00:00:00Z',
      last_message_at: '2026-01-01T00:00:00Z',
      title: null,
    };
    const client = makeInsertSelectSingleClient(row);
    const result = await createChatThread(client, { assistantId: 'reviewer' });
    expect(result.id).toBe('thread-1');
    expect(result.assistant_id).toBe('reviewer');
    expect(result.title).toBeNull();
  });

  it('returns the inserted thread row with a title', async () => {
    const row = {
      id: 'thread-2',
      assistant_id: 'reviewer',
      started_at: '2026-01-01T00:00:00Z',
      last_message_at: '2026-01-01T00:00:00Z',
      title: 'Review session',
    };
    const client = makeInsertSelectSingleClient(row);
    const result = await createChatThread(client, { assistantId: 'reviewer', title: 'Review session' });
    expect(result.title).toBe('Review session');
  });

  it('throws when insert returns an error', async () => {
    const client = makeInsertSelectSingleClient(null, { message: 'insert failed' });
    await expect(createChatThread(client, { assistantId: 'reviewer' })).rejects.toThrow(
      'createChatThread: insert failed',
    );
  });
});

// ---------------------------------------------------------------------------
// appendChatMessage
// ---------------------------------------------------------------------------

describe('appendChatMessage', () => {
  it('returns the inserted message row', async () => {
    const row = {
      id: 'msg-1',
      thread_id: 'thread-1',
      role: 'user',
      content: 'Hello!',
      created_at: '2026-01-01T00:00:00Z',
    };
    const client = makeInsertSelectSingleClient(row);
    const result = await appendChatMessage(client, {
      threadId: 'thread-1',
      role: 'user',
      content: 'Hello!',
    });
    expect(result.id).toBe('msg-1');
    expect(result.role).toBe('user');
    expect(result.content).toBe('Hello!');
  });

  it('returns an assistant message row', async () => {
    const row = {
      id: 'msg-2',
      thread_id: 'thread-1',
      role: 'assistant',
      content: 'I can help with that.',
      created_at: '2026-01-01T00:00:01Z',
    };
    const client = makeInsertSelectSingleClient(row);
    const result = await appendChatMessage(client, {
      threadId: 'thread-1',
      role: 'assistant',
      content: 'I can help with that.',
    });
    expect(result.role).toBe('assistant');
    expect(result.thread_id).toBe('thread-1');
  });

  it('throws when insert returns an error', async () => {
    const client = makeInsertSelectSingleClient(null, { message: 'constraint violation' });
    await expect(
      appendChatMessage(client, { threadId: 'thread-1', role: 'user', content: 'Hi' }),
    ).rejects.toThrow('appendChatMessage: constraint violation');
  });
});

// ---------------------------------------------------------------------------
// getThreadMessages
// ---------------------------------------------------------------------------

function makeSelectEqOrderClient(
  rows: Record<string, unknown>[] | null,
  error: unknown = null,
) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: rows, error }),
        }),
      }),
    }),
  } as never;
}

describe('getThreadMessages', () => {
  it('returns messages ordered by created_at asc', async () => {
    const rows = [
      { id: 'msg-1', thread_id: 'thread-1', role: 'user', content: 'Hello', created_at: '2026-01-01T00:00:00Z' },
      { id: 'msg-2', thread_id: 'thread-1', role: 'assistant', content: 'Hi there', created_at: '2026-01-01T00:00:01Z' },
    ];
    const client = makeSelectEqOrderClient(rows);
    const result = await getThreadMessages(client, 'thread-1');
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('user');
    expect(result[1].role).toBe('assistant');
  });

  it('returns empty array when data is null', async () => {
    const client = makeSelectEqOrderClient(null);
    const result = await getThreadMessages(client, 'thread-1');
    expect(result).toEqual([]);
  });

  it('throws when query returns an error', async () => {
    const client = makeSelectEqOrderClient(null, { message: 'db error' });
    await expect(getThreadMessages(client, 'thread-1')).rejects.toThrow(
      'getThreadMessages: db error',
    );
  });
});

// ---------------------------------------------------------------------------
// listChatThreads — same chain shape (select.eq.order)
// ---------------------------------------------------------------------------

describe('listChatThreads', () => {
  it('returns threads for the given assistant', async () => {
    const rows = [
      { id: 'thread-1', assistant_id: 'reviewer', started_at: '2026-01-01T00:00:00Z', last_message_at: '2026-01-01T01:00:00Z', title: null },
    ];
    const client = makeSelectEqOrderClient(rows);
    const result = await listChatThreads(client, 'reviewer');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('thread-1');
  });

  it('returns empty array when data is null', async () => {
    const client = makeSelectEqOrderClient(null);
    const result = await listChatThreads(client, 'reviewer');
    expect(result).toEqual([]);
  });

  it('throws when query returns an error', async () => {
    const client = makeSelectEqOrderClient(null, { message: 'threads error' });
    await expect(listChatThreads(client, 'reviewer')).rejects.toThrow(
      'listChatThreads: threads error',
    );
  });
});

// ---------------------------------------------------------------------------
// touchThread
// ---------------------------------------------------------------------------

function makeUpdateEqClient(error: unknown = null) {
  return {
    from: () => ({
      update: () => ({
        eq: async () => ({ error }),
      }),
    }),
  } as never;
}

describe('touchThread', () => {
  it('resolves when update succeeds', async () => {
    const client = makeUpdateEqClient(null);
    await expect(touchThread(client, 'thread-1')).resolves.toBeUndefined();
  });

  it('throws when update returns an error', async () => {
    const client = makeUpdateEqClient({ message: 'update failed' });
    await expect(touchThread(client, 'thread-1')).rejects.toThrow(
      'touchThread: update failed',
    );
  });
});
