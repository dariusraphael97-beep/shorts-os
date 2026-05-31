import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { recordNicheAction } from "@/lib/supabase/repositories/niche-actions";

export const dynamic = "force-dynamic";

// Use a loose UUID regex rather than z.string().uuid() — Zod v4's RFC 4122
// strict check rejects non-RFC-variant test UUIDs (e.g. all-same-digit fixtures).
// Postgres accepts any 8-4-4-4-12 hex UUID regardless of version/variant bits.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const BodySchema = z.object({
  nicheClusterId: z.string().regex(UUID_RE),
  action: z.enum(["viewed", "investigated", "generated_from", "dismissed", "hidden"]),
});

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid action" }, { status: 400 });
  const supabase = getServiceClient();
  await recordNicheAction(supabase, { nicheClusterId: parsed.data.nicheClusterId, action: parsed.data.action });
  return NextResponse.json({ ok: true });
}
