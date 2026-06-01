// src/app/agents/page.tsx
//
// The Agents dashboard — Plan #5, sub-phase G.
// The ONE primary thing on this page is "what every agent is working on right
// now" (the live card grid). The health pill is secondary; the activity feed
// is tertiary. Hierarchy is intentional — do not equalize the weights.

import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageHeader } from "@/components/layout/page-header";
import { getServiceClient } from "@/lib/supabase/server";
import {
  listAssistants,
  listAssistantStatuses,
  listAssistantActivity,
} from "@/lib/supabase/repositories/assistants";
import type { AssistantActivity } from "@/lib/supabase/repositories/assistants";
import { assembleDashboard } from "@/lib/agents/dashboard/load";
import { deriveHealthPill } from "@/lib/agents/dashboard/health";
import { AgentsRefresh } from "./_components/agents-refresh";
import { ActivityFeed } from "./_components/activity-feed";
import { HealthPill } from "./_components/health-pill";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const supabase = getServiceClient();

  const [assistants, statuses, activity] = await Promise.all([
    listAssistants(supabase),
    listAssistantStatuses(supabase),
    listAssistantActivity(supabase, { limit: 60 }),
  ]);

  // Group recent activity by assistant_id (rows arrive created_at desc).
  const recentByAssistant: Record<string, AssistantActivity[]> = {};
  for (const row of activity) {
    const bucket = recentByAssistant[row.assistant_id];
    if (bucket) bucket.push(row);
    else recentByAssistant[row.assistant_id] = [row];
  }

  const vms = assembleDashboard({ assistants, statuses, recentByAssistant });

  // Health: errored = enabled agents currently in the errored state.
  // Cron freshness (stale/failed) is wired in a later task — empty for now.
  const erroredAgents = vms
    .filter((vm) => vm.isEnabled && vm.state === "errored")
    .map((vm) => vm.id);
  const health = deriveHealthPill({
    erroredAgents,
    staleCrons: [],
    failedCrons: [],
  });

  return (
    <AppShell bare sidebar={<AppSidebar activeHref="/agents" />}>
      <div className="mx-auto max-w-[1080px] px-8 py-8">
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="Agents"
            description="What every agent is working on right now."
          />
          <div className="shrink-0 pt-1">
            <HealthPill level={health.level} summary={health.summary} />
          </div>
        </div>

        {/* Primary: the live agent grid */}
        <AgentsRefresh initial={vms} />

        {/* Tertiary: the activity feed */}
        <ActivityFeed initial={activity} />
      </div>
    </AppShell>
  );
}
