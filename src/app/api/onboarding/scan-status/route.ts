// src/app/api/onboarding/scan-status/route.ts
import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import { listLatestRunPerJob } from "@/lib/supabase/repositories/ingestion-runs";
import { assembleScanStatus } from "@/lib/onboarding/scan";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const supabase = getServiceClient();
  const latest = await listLatestRunPerJob(supabase);
  return Response.json(assembleScanStatus(latest));
}
