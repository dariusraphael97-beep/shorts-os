import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { recordSampleVerdict } from "@/lib/supabase/repositories/classification-samples";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  id: z.string().uuid(),
  verdict: z.enum(["correct", "wrong", "partial"]),
});

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  const supabase = getServiceClient();
  await recordSampleVerdict(supabase, { id: parsed.data.id, verdict: parsed.data.verdict, reviewedBy: "admin" });
  return NextResponse.json({ ok: true });
}
