// src/lib/supabase/repositories/assistant-chat.ts
//
// Threads + messages for the per-agent chat (tables from 20260528000004).
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatThread {
  id: string;
  assistant_id: string;
  started_at: string;
  last_message_at: string;
  title: string | null;
}

export interface ChatMessage {
  id: string;
  thread_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
}

export async function createChatThread(
  supabase: SupabaseClient,
  params: { assistantId: string; title: string | null },
): Promise<ChatThread> {
  const { data, error } = await supabase
    .from('assistant_chat_threads')
    .insert({ assistant_id: params.assistantId, title: params.title })
    .select()
    .single();
  if (error) throw new Error(`createChatThread: ${error.message}`);
  return data as ChatThread;
}

export async function listChatThreads(
  supabase: SupabaseClient,
  assistantId: string,
  limit: number,
): Promise<ChatThread[]> {
  const { data, error } = await supabase
    .from('assistant_chat_threads')
    .select()
    .eq('assistant_id', assistantId)
    .order('last_message_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listChatThreads: ${error.message}`);
  return (data ?? []) as ChatThread[];
}

// Two-step (insert + thread bump), not transactional: if the bump fails the
// message row already exists, so callers must not naively retry without dedup.
export async function appendChatMessage(
  supabase: SupabaseClient,
  params: { threadId: string; role: ChatRole; content: string },
): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from('assistant_chat_messages')
    .insert({ thread_id: params.threadId, role: params.role, content: params.content })
    .select()
    .single();
  if (error) throw new Error(`appendChatMessage: ${error.message}`);
  const { error: bumpError } = await supabase
    .from('assistant_chat_threads')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', params.threadId);
  if (bumpError) throw new Error(`appendChatMessage (thread bump): ${bumpError.message}`);
  return data as ChatMessage;
}

export async function listChatMessages(
  supabase: SupabaseClient,
  threadId: string,
): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('assistant_chat_messages')
    .select()
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    // Hard cap: chat tab renders a single thread; 200 messages is far beyond expected single-user thread length.
    .limit(200);
  if (error) throw new Error(`listChatMessages: ${error.message}`);
  return (data ?? []) as ChatMessage[];
}
