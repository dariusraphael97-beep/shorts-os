// PATCH /api/agents/[id]/settings  { isEnabled?, chatModel? }
import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { setAssistantEnabled, updateAssistantSettings } from '@/lib/supabase/repositories/assistants';
import { CHAT_MODELS, isAssistantId, type ChatModel } from '@/lib/assistants/registry';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  if (!isAssistantId(id)) return Response.json({ error: 'unknown assistant' }, { status: 404 });
  try {
    const body = (await req.json()) as { isEnabled?: boolean; chatModel?: string };
    const supabase = getServiceClient();
    if (typeof body.isEnabled === 'boolean') {
      await setAssistantEnabled(supabase, id, body.isEnabled);
    }
    if (body.chatModel !== undefined) {
      if (!(CHAT_MODELS as readonly string[]).includes(body.chatModel)) {
        return Response.json({ error: `chatModel must be one of ${CHAT_MODELS.join(', ')}` }, { status: 400 });
      }
      await updateAssistantSettings(supabase, id, { chat_model: body.chatModel as ChatModel });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'failed to update settings' }, { status: 500 });
  }
}
