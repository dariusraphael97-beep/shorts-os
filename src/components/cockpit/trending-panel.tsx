import { getServiceClient } from "@/lib/supabase/server";
import { listRecentObservations } from "@/lib/supabase/repositories/viral-observations";
import { TrendingClient } from "./trending-client";

export async function TrendingPanel() {
  const supabase = getServiceClient();
  const initial = await listRecentObservations(supabase, { limit: 25 });
  return <TrendingClient initial={initial} />;
}
