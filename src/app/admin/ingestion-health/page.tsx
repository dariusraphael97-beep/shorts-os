import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getServiceClient } from "@/lib/supabase/server";
import { listLatestRunPerJob, listRecentRuns, type IngestionRunRow } from "@/lib/supabase/repositories/ingestion-runs";
import { freshnessFor, type FreshnessLevel } from "@/lib/admin/freshness";
import { TRIGGERABLE_JOBS } from "@/lib/ingestion/registry";
import { AdminSidebar } from "@/app/admin/_components/admin-sidebar";
import { TriggerButton } from "./trigger-button";

export const dynamic = "force-dynamic";

const DOT: Record<FreshnessLevel, string> = {
  green: "bg-[var(--success,#22c55e)]", amber: "bg-[var(--warning,#f59e0b)]", red: "bg-[var(--danger,#ef4444)]",
};

export default async function IngestionHealthPage() {
  const supabase = getServiceClient();
  const [latest, recent] = await Promise.all([listLatestRunPerJob(supabase), listRecentRuns(supabase, 200)]);
  const now = new Date();
  const byJob = new Map(latest.map((r) => [r.job, r]));
  const recentByJob = new Map<string, IngestionRunRow[]>();
  for (const r of recent) {
    const arr = recentByJob.get(r.job) ?? [];
    arr.push(r);
    recentByJob.set(r.job, arr);
  }

  const rows = TRIGGERABLE_JOBS.map((job) => {
    const last = byJob.get(job);
    const fresh = freshnessFor({ job, status: last?.status ?? null, startedAt: last?.started_at ?? null }, now);
    return { job, last, fresh, spark: (recentByJob.get(job) ?? []).slice(0, 12).reverse() };
  });
  const degraded = rows.filter((r) => r.fresh.level !== "green");

  return (
    <AppShell sidebar={<AdminSidebar activeHref="/admin/ingestion-health" />}>
      <PageHeader title="Ingestion Health" description="Per-source freshness, success rate, and manual re-runs." />

      <Card className="mb-8 p-6 gap-0">
        {degraded.length === 0 ? (
          <div className="flex items-center gap-3">
            <span className={`inline-block size-3 rounded-full ${DOT.green}`} />
            <span className="text-lg font-semibold text-[var(--text-primary)]">All {rows.length} sources healthy</span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className={`inline-block size-3 rounded-full ${DOT.red}`} />
            <span className="text-lg font-semibold text-[var(--text-primary)]">
              {degraded.length} of {rows.length} sources need attention
            </span>
          </div>
        )}
      </Card>

      <div className="space-y-2">
        {rows.map(({ job, last, fresh, spark }) => (
          <Card key={job} className="flex flex-row items-center gap-4 px-4 py-3 gap-y-0">
            <span className={`inline-block size-2.5 rounded-full ${DOT[fresh.level]}`} title={fresh.reason} />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-[var(--text-primary)]">{job}</div>
              <div className="text-xs text-[var(--text-secondary)]">
                {last ? `last ${new Date(last.started_at).toLocaleString()} · ${last.status} · ${last.items_ingested} items · ${last.quota_units} quota` : "never run"}
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {spark.map((r) => (
                <span key={r.id} title={r.status}
                  className={`inline-block h-4 w-1.5 rounded-sm ${r.status === "success" ? DOT.green : r.status === "partial" ? DOT.amber : r.status === "skipped" ? "bg-[var(--border-subtle)]" : DOT.red}`} />
              ))}
            </div>
            <Badge variant="outline">{fresh.level}</Badge>
            <TriggerButton job={job} />
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
