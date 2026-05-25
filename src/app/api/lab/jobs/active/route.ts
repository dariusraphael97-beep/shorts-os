// src/app/api/lab/jobs/active/route.ts
//
// GET /api/lab/jobs/active
//   Returns the current running produce_video job if any, or { activeJob: null }.
//   Used by DispatchButton to disable itself across tabs while a run is live.

import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import { getActiveProduceVideoJob } from "@/lib/supabase/repositories/jobs";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const supabase = getServiceClient();
    const activeJob = await getActiveProduceVideoJob(supabase);
    return Response.json({ activeJob });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "failed to check active job" },
      { status: 500 },
    );
  }
}
