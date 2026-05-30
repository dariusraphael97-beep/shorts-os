import { NextResponse } from "next/server";
import { z } from "zod";
import { loadEnv } from "@/lib/env";
import { triggerIngestion, TRIGGERABLE_JOBS } from "@/lib/ingestion/registry";
import type { IngestionJob } from "@/lib/supabase/repositories/ingestion-runs";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ job: z.enum(TRIGGERABLE_JOBS as [IngestionJob, ...IngestionJob[]]) });

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid job" }, { status: 400 });
  const env = loadEnv();
  const origin = new URL(req.url).origin;
  const result = await triggerIngestion({ job: parsed.data.job, origin, secret: env.CRON_SECRET });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
