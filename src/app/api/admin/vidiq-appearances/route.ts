import "server-only";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { insertVidiqAppearance } from "@/lib/supabase/repositories/vidiq-appearances";
import { FORMAT_LABELS, type FormatLabel } from "@/lib/supabase/repositories/shorts-classifications";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  canonicalTopic: z.string().min(1),
  formatLabel: z.enum(FORMAT_LABELS),
  firstSurfacedByShortsOsAt: z.string().min(1),
  firstSurfacedByVidiqAt: z.string().optional().nullable(),
  firstSurfacedBy1of10At: z.string().optional().nullable(),
  firstSurfacedByExplodingTopicsAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "bad body" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const toDate = (s: string | null | undefined) => (s ? new Date(s) : null);
  const row = await insertVidiqAppearance(supabase, {
    canonicalTopic: body.canonicalTopic,
    formatLabel: body.formatLabel as FormatLabel,
    firstSurfacedByShortsOsAt: new Date(body.firstSurfacedByShortsOsAt),
    firstSurfacedByVidiqAt: toDate(body.firstSurfacedByVidiqAt),
    firstSurfacedBy1of10At: toDate(body.firstSurfacedBy1of10At),
    firstSurfacedByExplodingTopicsAt: toDate(body.firstSurfacedByExplodingTopicsAt),
    notes: body.notes ?? null,
  });
  return Response.json({ ok: true, appearance: row }, { status: 201 });
}
