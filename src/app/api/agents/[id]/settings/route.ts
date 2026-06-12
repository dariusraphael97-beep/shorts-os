// PATCH /api/agents/[id]/settings  { isEnabled?, chatModel? }
import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { setAssistantEnabled, updateAssistantSettings } from '@/lib/supabase/repositories/assistants';
import { CHAT_MODELS, isAssistantId, type ChatModel } from '@/lib/assistants/registry';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!isAssistantId(id)) return Response.json({ error: 'unknown assistant' }, { status: 404 });
  try {
    const body = (await req.json()) as { isEnabled?: boolean; chatModel?: string };
    if (typeof body.isEnabled !== 'boolean' && body.chatModel === undefined) {
      return Response.json({ error: 'nothing to update' }, { status: 400 });
    }
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
