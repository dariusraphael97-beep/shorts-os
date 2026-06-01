import { NextResponse } from "next/server";
import { serializeError } from "@/lib/scrapers/shared";
import { getServiceClient } from "@/lib/supabase/server";
import {
  getAssistantById,
  listAssistantActivity,
} from "@/lib/supabase/repositories/assistants";

export const dynamic = "force-dynamic";

// GET /api/agents/[id]/activity
//
// Query (all optional):
//   ?type=<activity_type>  — filter to a single activity type
//   ?offset=<n>            — pagination offset (default 0)
//
// Returns the 50 most recent activity rows for this agent (created_at desc).
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = getServiceClient();

  const assistant = await getAssistantById(supabase, id);
  if (!assistant) {
    return NextResponse.json({ ok: false, error: "assistant_not_found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const activityType = url.searchParams.get("type") ?? undefined;
  const offsetParamRaw = url.searchParams.get("offset");
  const offset = offsetParamRaw ? Number.parseInt(offsetParamRaw, 10) : 0;

  try {
    const activity = await listAssistantActivity(supabase, {
      assistantId: id,
      activityType,
      limit: 50,
      offset: Number.isFinite(offset) && offset >= 0 ? offset : 0,
    });
    return NextResponse.json({ ok: true, activity });
  } catch (e) {
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
