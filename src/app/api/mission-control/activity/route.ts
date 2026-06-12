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
    const result = await listAssistantActivity(supabase, {
      assistantId: url.searchParams.get('assistantId') ?? undefined,
      before: url.searchParams.get('before') ?? undefined,
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
