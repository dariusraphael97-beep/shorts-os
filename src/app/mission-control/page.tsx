export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageHeader } from "@/components/layout/page-header";
import { getServiceClient } from "@/lib/supabase/server";
import { listAssistants, type Assistant } from "@/lib/supabase/repositories/assistants";
import { getLiveDashboard } from "@/lib/assistants/ledger";
import { ASSISTANT_DEFS, ASSISTANT_ORDER } from "@/lib/assistants/registry";
import { AgentGrid, type AgentCardData } from "@/components/mission-control/agent-grid";
import { ActivityFeed } from "@/components/mission-control/activity-feed";
import { AutoRefresh } from "@/components/mission-control/auto-refresh";
import { HealthPill, type HealthAttention } from "@/components/mission-control/health-pill";

const FEED_PAGE_SIZE = 30;

export default async function MissionControlPage() {
  const supabase = getServiceClient();

  let assistants: Assistant[] = [];
  try {
    assistants = await listAssistants(supabase);
  } catch {
    // un-migrated env: registry fallbacks below cover display copy
  }
  const { statuses, feed } = await getLiveDashboard(supabase);
  const byId = new Map(assistants.map((a) => [a.id, a]));

  const cards: AgentCardData[] = ASSISTANT_ORDER.map((id) => {
    const def = ASSISTANT_DEFS[id];
    const row = byId.get(id);
    const live = statuses[id];
    // Phase-3 placeholder OR operator-disabled via Settings → non-clickable card.
    const disabled = def.comingInPhase !== undefined || row?.is_enabled === false;
    return {
      id,
      name: row?.display_name ?? def.fallbackName,
      role: row?.role_description ?? def.fallbackRole,
      iconName: row?.icon_name ?? def.fallbackIcon,
      status: live.state,
      activitySummary: live.currentActivity ?? "No runs recorded yet",
      overdue: live.overdue,
      recentActivity: live.recentActivity.map((e) => ({ id: e.id, summary: e.summary, at: e.at })),
      disabled,
      comingInPhase: def.comingInPhase,
    };
  });

  const attention: HealthAttention[] = cards
    .filter((c) => !c.disabled && (c.status === "errored" || c.overdue))
    .map((c) => ({ id: c.id, name: c.name, reason: c.status === "errored" ? "errored" : "overdue" }));

  const nameById = Object.fromEntries(cards.map((c) => [c.id, c.name]));
  const firstPage = feed.slice(0, FEED_PAGE_SIZE);
  const nextBefore = feed.length > FEED_PAGE_SIZE ? firstPage[firstPage.length - 1].at : null;

  return (
    <AppShell sidebar={<AppSidebar activeHref="/mission-control" />}>
      <AutoRefresh intervalMs={15000} />
      <PageHeader
        title="Mission Control"
        description="Live status across every agent, derived from real run ledgers."
        actions={<HealthPill attention={attention} />}
      />
      <AgentGrid cards={cards} />
      <section className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          Recent activity
        </h2>
        <ActivityFeed initialEvents={firstPage} initialNextBefore={nextBefore} nameById={nameById} />
      </section>
    </AppShell>
  );
}
