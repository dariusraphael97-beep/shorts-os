// src/app/api/lab/drafts/route.ts
//
// GET /api/lab/drafts
//   Returns the last 10 your_videos rows with status='draft', newest first.

import "server-only";
import { getServiceClient } from "@/lib/supabase/server";
import { listRecentDrafts } from "@/lib/supabase/repositories/your-videos";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const supabase = getServiceClient();
    const drafts = await listRecentDrafts(supabase, 10);
    return Response.json({ drafts });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "failed to list drafts" },
      { status: 500 },
    );
  }
}
