// GET /api/mission-control/activity?assistantId=&before=&limit=
// Powers "Load more" on the Mission Control feed and per-agent Activity tabs.
import 'server-only';
import { getServiceClient } from '@/lib/supabase/server';
import { listAssistantActivity } from '@/lib/assistants/ledger';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const supabase = getServiceClient();
    const rawBefore = url.searchParams.get('before') ?? undefined;
    // Only honour `before` if it looks like an ISO timestamp — rejects arbitrary user input.
    const before = rawBefore && /^\d{4}-\d{2}-\d{2}T/.test(rawBefore) ? rawBefore : undefined;
    const result = await listAssistantActivity(supabase, {
      assistantId: url.searchParams.get('assistantId') ?? undefined,
      before,
      limit: Math.min(parseInt(url.searchParams.get('limit') ?? '30', 10) || 30, 100),
    });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'failed to list activity' },
      { status: 500 },
    );
  }
}
