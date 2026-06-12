// POST   /api/agents/[id]/memory  { memoryKey, memoryValue, confidence? } → upsert
// DELETE /api/agents/[id]/memory  { memoryKey } → delete
import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import {
  upsertAssistantMemory,
  deleteAssistantMemory,
} from '@/lib/supabase/repositories/assistants';
import { isAssistantId } from '@/lib/assistants/registry';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!isAssistantId(id)) return Response.json({ error: 'unknown assistant' }, { status: 404 });
  try {
    const body = (await req.json()) as { memoryKey?: string; memoryValue?: unknown; confidence?: number };
    if (!body.memoryKey || body.memoryValue === undefined) {
      return Response.json({ error: 'memoryKey and memoryValue are required' }, { status: 400 });
    }
    const supabase = getServiceClient();
    const memory = await upsertAssistantMemory(supabase, {
      assistantId: id,
      memoryKey: body.memoryKey,
      memoryValue: body.memoryValue,
      confidence: body.confidence,
      editableByUser: true,
    });
    return Response.json({ memory });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'failed to save memory' }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: Ctx): Promise<Response> {
  const { id } = await ctx.params;
  if (!isAssistantId(id)) return Response.json({ error: 'unknown assistant' }, { status: 404 });
  try {
    const body = (await req.json()) as { memoryKey?: string };
    if (!body.memoryKey) return Response.json({ error: 'memoryKey is required' }, { status: 400 });
    const supabase = getServiceClient();
    await deleteAssistantMemory(supabase, id, body.memoryKey);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'failed to delete memory' }, { status: 500 });
  }
}
