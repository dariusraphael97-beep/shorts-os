import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { listDigestRankedClusters } from "@/lib/supabase/repositories/niche-clusters";
import { buildEmailProps } from "@/lib/digest/build-email-props";
import { renderDigest } from "@/lib/digest/render-digest";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ weekStart: z.string() });

export async function POST(req: Request): Promise<Response> {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "weekStart required" }, { status: 400 });

  const supabase = getServiceClient();
  const clusters = await listDigestRankedClusters(supabase, parsed.data.weekStart);
  const rows = clusters.map((c) => ({
    ...c,
    production_fit: c.production_fit ?? "manual_only",
    discovery_state: c.discovery_state ?? "public",
  }));
  const { html } = await renderDigest(buildEmailProps(parsed.data.weekStart, rows));
  return NextResponse.json({ ok: true, html });
}
