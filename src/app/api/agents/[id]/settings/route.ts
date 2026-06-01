import { NextResponse } from "next/server";
import { serializeError } from "@/lib/scrapers/shared";
import { getServiceClient } from "@/lib/supabase/server";
import {
  getAssistantById,
  getAssistantSettings,
  updateAssistantSettings,
} from "@/lib/supabase/repositories/assistants";
import { validateSettings } from "@/lib/agents/settings/schemas";

export const dynamic = "force-dynamic";

// GET /api/agents/[id]/settings
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = getServiceClient();

  const assistant = await getAssistantById(supabase, id);
  if (!assistant)
    return NextResponse.json({ ok: false, error: "assistant_not_found" }, { status: 404 });

  try {
    const row = await getAssistantSettings(supabase, id);
    return NextResponse.json({ ok: true, settings: row?.settings ?? {} });
  } catch (e) {
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}

// PUT /api/agents/[id]/settings
// Body: settings object (validated by schema for the given assistantId)
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = getServiceClient();

  const assistant = await getAssistantById(supabase, id);
  if (!assistant)
    return NextResponse.json({ ok: false, error: "assistant_not_found" }, { status: 404 });

  const body: unknown = await req.json();
  const v = validateSettings(id, body);
  if (!v.success)
    return NextResponse.json({ ok: false, error: v.error }, { status: 400 });

  try {
    const saved = await updateAssistantSettings(supabase, id, v.data);
    return NextResponse.json({ ok: true, settings: saved.settings });
  } catch (e) {
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
