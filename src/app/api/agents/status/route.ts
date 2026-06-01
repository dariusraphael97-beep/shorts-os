import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import {
  listAssistants,
  listAssistantStatuses,
  listAssistantActivity,
} from "@/lib/supabase/repositories/assistants";
import type { AssistantActivity } from "@/lib/supabase/repositories/assistants";
import { assembleDashboard } from "@/lib/agents/dashboard/load";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const supabase = getServiceClient();

  const [assistants, statuses, recentActivity] = await Promise.all([
    listAssistants(supabase),
    listAssistantStatuses(supabase),
    listAssistantActivity(supabase, { limit: 60 }),
  ]);

  // Group recent activity rows by assistant_id in JS.
  // Rows come ordered created_at desc from the repo; assembler truncates to 3.
  const recentByAssistant: Record<string, AssistantActivity[]> = {};
  for (const row of recentActivity) {
    const bucket = recentByAssistant[row.assistant_id];
    if (bucket) {
      bucket.push(row);
    } else {
      recentByAssistant[row.assistant_id] = [row];
    }
  }

  const cards = assembleDashboard({ assistants, statuses, recentByAssistant });

  return NextResponse.json(cards);
}
