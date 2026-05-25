import { getServiceClient } from "@/lib/supabase/server";
import { listAgents } from "@/lib/supabase/repositories/agents";
import { TeamStatusLive } from "./team-status-live";

export async function TeamStatusSidebar() {
  const supabase = getServiceClient();
  const agents = await listAgents(supabase);
  return <TeamStatusLive initial={agents} />;
}
