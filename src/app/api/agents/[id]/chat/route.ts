// POST /api/agents/[id]/chat  { threadId?, message }
// Streams the assistant reply as text; persists both sides to assistant_chat_*.
// Response header x-thread-id carries the (possibly new) thread id.
import 'server-only';
import { streamText, stepCountIs, type ModelMessage } from 'ai';
import { getServiceClient } from '@/lib/supabase/server';
import { getClaudeModel, type ClaudeModelId } from '@/lib/ai/gateway';
import { getAssistantById, getAssistantSettings } from '@/lib/supabase/repositories/assistants';
import {
  createChatThread,
  appendChatMessage,
  listChatMessages,
} from '@/lib/supabase/repositories/assistant-chat';
import { getLiveDashboard } from '@/lib/assistants/ledger';
import { buildChatTools } from '@/lib/assistants/chat-tools';
import { buildAssistantSystemPrompt } from '@/lib/assistants/chat-prompt';
import {
  ASSISTANT_DEFS,
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL,
  isAssistantId,
} from '@/lib/assistants/registry';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  if (!isAssistantId(id)) return Response.json({ error: 'unknown assistant' }, { status: 404 });
  const def = ASSISTANT_DEFS[id];
  if (def.comingInPhase !== undefined) {
    return Response.json({ error: 'this agent ships in a later phase' }, { status: 400 });
  }

  let body: { threadId?: string; message?: string };
  try {
    body = (await req.json()) as { threadId?: string; message?: string };
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const message = body.message?.trim();
  if (!message) return Response.json({ error: 'message is required' }, { status: 400 });
  if (message.length > 8000) return Response.json({ error: 'message too long (8000 char max)' }, { status: 400 });

  try {
    const supabase = getServiceClient();

    // Thread ownership check: if caller supplied a threadId, verify it belongs to this agent.
    if (body.threadId) {
      const { data: threadRow } = await supabase
        .from('assistant_chat_threads')
        .select('assistant_id')
        .eq('id', body.threadId)
        .maybeSingle();
      if (!threadRow) return Response.json({ error: 'thread not found' }, { status: 404 });
      if (threadRow.assistant_id !== id)
        return Response.json({ error: 'thread does not belong to this agent' }, { status: 400 });
    }

    const [assistant, settings, dashboard] = await Promise.all([
      getAssistantById(supabase, id).catch(() => null),
      getAssistantSettings(supabase, id).catch(() => ({}) as Record<string, unknown>),
      getLiveDashboard(supabase),
    ]);

    // Thread: reuse or create (title = first 60 chars of the opening message).
    const threadId =
      body.threadId ??
      (await createChatThread(supabase, { assistantId: id, title: message.slice(0, 60) })).id;

    await appendChatMessage(supabase, { threadId, role: 'user', content: message });

    // DB is the source of truth for history (includes the message just saved).
    const history = await listChatMessages(supabase, threadId);
    const messages: ModelMessage[] = history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const storedModel = String(settings.chat_model ?? '');
    const modelIsValid = (CHAT_MODELS as readonly string[]).includes(storedModel);
    if (!modelIsValid && storedModel) {
      console.warn(
        `[agent-chat] unknown chat_model "${storedModel}" for agent "${id}" — falling back to "${DEFAULT_CHAT_MODEL}"`,
      );
    }
    const chatModel = modelIsValid ? (settings.chat_model as ClaudeModelId) : (DEFAULT_CHAT_MODEL as ClaudeModelId);

    const status = dashboard.statuses[id];
    const system = buildAssistantSystemPrompt({
      name: assistant?.display_name ?? def.fallbackName,
      roleDescription: assistant?.role_description ?? def.fallbackRole,
      status,
      recentEvents: dashboard.feed.filter((e) => e.assistantId === id),
    });

    const result = streamText({
      model: getClaudeModel(chatModel),
      system,
      messages,
      tools: buildChatTools(supabase, id),
      stopWhen: stepCountIs(5),
      onFinish: async ({ text }) => {
        try {
          // Tool-only turns (no prose) persist nothing by design — tool calls
          // aren't stored in v1, and the API tolerates the resulting
          // consecutive same-role messages on the next turn.
          if (text.trim()) await appendChatMessage(supabase, { threadId, role: 'assistant', content: text });
        } catch (err) {
          console.warn('[agent-chat] failed to persist assistant message:', err);
        }
      },
    });

    return result.toTextStreamResponse({ headers: { 'x-thread-id': threadId } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'chat failed' }, { status: 500 });
  }
}
