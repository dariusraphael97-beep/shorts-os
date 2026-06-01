import { NextResponse } from "next/server";
import { serializeError } from "@/lib/scrapers/shared";
import { getServiceClient } from "@/lib/supabase/server";
import {
  getAssistantById,
  listAssistantMemory,
  upsertAssistantMemory,
  deleteAssistantMemory,
} from "@/lib/supabase/repositories/assistants";

export const dynamic = "force-dynamic";

// GET /api/agents/[id]/memory
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
    const memory = await listAssistantMemory(supabase, id);
    return NextResponse.json({ ok: true, memory });
  } catch (e) {
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}

// DELETE /api/agents/[id]/memory?rowId=<memory-row-id>
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = getServiceClient();

  const assistant = await getAssistantById(supabase, id);
  if (!assistant)
    return NextResponse.json({ ok: false, error: "assistant_not_found" }, { status: 404 });

  const rowId = new URL(req.url).searchParams.get("rowId");
  if (!rowId)
    return NextResponse.json({ ok: false, error: "rowId query param is required" }, { status: 400 });

  try {
    await deleteAssistantMemory(supabase, rowId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}

// PATCH /api/agents/[id]/memory
// Body: { memoryKey: string; memoryValue: unknown; confidence?: number }
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = getServiceClient();

  const assistant = await getAssistantById(supabase, id);
  if (!assistant)
    return NextResponse.json({ ok: false, error: "assistant_not_found" }, { status: 404 });

  const body = await req.json() as { memoryKey?: unknown; memoryValue?: unknown; confidence?: unknown };
  const { memoryKey, memoryValue, confidence } = body;

  if (typeof memoryKey !== "string" || memoryKey.trim() === "")
    return NextResponse.json({ ok: false, error: "memoryKey must be a non-empty string" }, { status: 400 });

  try {
    const memory = await upsertAssistantMemory(supabase, {
      assistantId: id,
      memoryKey,
      memoryValue,
      confidence: typeof confidence === "number" ? confidence : undefined,
    });
    return NextResponse.json({ ok: true, memory });
  } catch (e) {
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
