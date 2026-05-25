import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { updateTopicState } from "@/lib/supabase/repositories/topic-queue";

const bodySchema = z.object({
  state: z.enum(["reviewed", "rejected"]),
  reason: z.string().min(1).max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let parsed;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Invalid body" },
      { status: 400 },
    );
  }
  try {
    const supabase = getServiceClient();
    await updateTopicState(supabase, id, parsed.state, parsed.reason ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
