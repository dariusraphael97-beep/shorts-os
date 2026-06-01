import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getServiceClient } from "@/lib/supabase/server";
import { listLatestRunPerJob } from "@/lib/supabase/repositories/ingestion-runs";
import { freshnessFor, type FreshnessLevel } from "@/lib/admin/freshness";
import { TRIGGERABLE_JOBS } from "@/lib/ingestion/registry";
import { listAssistantStatuses, type AssistantState } from "@/lib/supabase/repositories/assistants";
import { AdminSidebar } from "@/app/admin/_components/admin-sidebar";
import { aggregateHealth } from "@/lib/admin/health";
import { AssistantStatusDot } from "@/components/compositions/assistant-status-dot";

export const dynamic = "force-dynamic";

const DOT: Record<FreshnessLevel, string> = {
  green: "bg-[var(--success,#22c55e)]",
  amber: "bg-[var(--warning,#f59e0b)]",
  red:   "bg-[var(--danger,#ef4444)]",
};

const PILL_STYLES: Record<string, { card: string; dot: string; badge: string }> = {
  healthy:   { card: "border-[var(--success,#22c55e)]/40",  dot: DOT.green, badge: "text-[var(--success,#22c55e)]" },
  attention: { card: "border-[var(--warning,#f59e0b)]/40",  dot: DOT.amber, badge: "text-[var(--warning,#f59e0b)]" },
  critical:  { card: "border-[var(--danger,#ef4444)]/40",   dot: DOT.red,   badge: "text-[var(--danger,#ef4444)]"  },
};

export default async function AdminHealthPage() {
  const supabase = getServiceClient();
  const now = new Date();

  const [latest, statuses] = await Promise.all([
    listLatestRunPerJob(supabase),
    listAssistantStatuses(supabase),
  ]);

  const byJob = new Map(latest.map((r) => [r.job, r]));

  const crons = TRIGGERABLE_JOBS.map((job) => {
    const last = byJob.get(job);
    const fresh = freshnessFor(
      { job, status: last?.status ?? null, startedAt: last?.started_at ?? null },
      now,
    );
    return { job, level: fresh.level, reason: fresh.reason };
  });

  const agents = statuses.map((s) => ({
    assistantId: s.assistant_id,
    state: s.state,
    currentActivity: s.current_activity,
  }));

  const health = aggregateHealth({ crons, agents });
  const pillStyle = PILL_STYLES[health.pill.level] ?? PILL_STYLES.healthy;

  return (
    <AppShell sidebar={<AdminSidebar activeHref="/admin/health" />}>
      <PageHeader
        title="Health"
        description="Cron freshness, agent status, and overall system health."
      />

      {/* Overall pill */}
      <Card className={`mb-8 p-6 border ${pillStyle.card}`}>
        <div className="flex items-center gap-3">
          <span className={`inline-block size-3 rounded-full ${pillStyle.dot}`} />
          <span className={`text-lg font-semibold ${pillStyle.badge}`}>
            {health.pill.summary}
          </span>
          <Badge variant="outline" className="ml-auto capitalize">
            {health.pill.level}
          </Badge>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Cron freshness */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Cron Freshness
          </h2>
          <div className="space-y-2">
            {health.crons.map(({ job, level, reason }) => (
              <Card key={job} className="flex flex-row items-center gap-4 px-4 py-3">
                <span
                  className={`inline-block size-2.5 shrink-0 rounded-full ${DOT[level]}`}
                  title={reason}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[var(--text-primary)]">{job}</div>
                  <div className="text-xs text-[var(--text-secondary)]">{reason}</div>
                </div>
                <Badge variant="outline">{level}</Badge>
              </Card>
            ))}
          </div>
        </section>

        {/* Agent status */}
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Agent Status
          </h2>
          {health.agents.length === 0 ? (
            <Card className="px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
              No agents registered yet.
            </Card>
          ) : (
            <div className="space-y-2">
              {health.agents.map(({ assistantId, state, currentActivity }) => (
                <Card key={assistantId} className="flex flex-row items-center gap-4 px-4 py-3">
                  <AssistantStatusDot status={state as AssistantState} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[var(--text-primary)]">{assistantId}</div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {currentActivity ?? "Idle"}
                    </div>
                  </div>
                  <Badge variant="outline" className="capitalize">{state}</Badge>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
