import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getServiceClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/app/admin/_components/admin-sidebar";
import {
  getLatestWeekStart,
  listDigestRankedClusters,
} from "@/lib/supabase/repositories/niche-clusters";
import { listRecentNicheActions } from "@/lib/supabase/repositories/niche-actions";
import { listClosedPredictions } from "@/lib/supabase/repositories/niche-predictions";
import {
  averageSignalContributions,
  actionCorrelation,
  predictionAccuracy,
  type ActionCounts,
} from "@/lib/admin/scoring-analysis";

export const dynamic = "force-dynamic";

const SCORE_LABELS: Record<keyof ReturnType<typeof actionCorrelation>["actedAvg"], string> = {
  first_mover_score: "First-mover",
  proven_score: "Proven",
  niche_score: "Niche",
};

function fmtSignal(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function num(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export default async function ScoringAnalysisPage() {
  const supabase = getServiceClient();

  const week = await getLatestWeekStart(supabase);
  const clusters = week ? await listDigestRankedClusters(supabase, week) : [];

  // Fold recent raw actions into per-cluster counts (aggregation in app code).
  const actions = await listRecentNicheActions(supabase);
  const actionsByCluster: Record<string, ActionCounts> = {};
  for (const a of actions) {
    const counts = (actionsByCluster[a.niche_cluster_id] ??= {
      viewed: 0,
      investigated: 0,
      generated_from: 0,
      dismissed: 0,
      hidden: 0,
    });
    counts[a.action] += 1;
  }

  const signals = averageSignalContributions(clusters);
  const signalRows = Object.entries(signals).sort((a, b) => b[1] - a[1]);
  const signalMax = signalRows.length > 0 ? Math.max(...signalRows.map(([, v]) => v)) : 0;

  const correlation = actionCorrelation(
    clusters.map((c) => ({
      id: c.id,
      first_mover_score: c.first_mover_score ?? 0,
      proven_score: c.proven_score ?? 0,
      niche_score: c.niche_score ?? 0,
    })),
    actionsByCluster,
  );
  const hasCorrelation = correlation.actedCount > 0 || correlation.negativeCount > 0;

  const closed = await listClosedPredictions(supabase);
  const accuracy = predictionAccuracy(closed);

  const scoreKeys = Object.keys(SCORE_LABELS) as Array<keyof typeof SCORE_LABELS>;
  const compMax = Math.max(
    1,
    ...scoreKeys.flatMap((k) => [correlation.actedAvg[k], correlation.negativeAvg[k]]),
  );

  return (
    <AppShell sidebar={<AdminSidebar activeHref="/admin/scoring-analysis" />}>
      <PageHeader
        title="Scoring Analysis"
        description="Which score weights produce niches you act on, and how sealed predictions are tracking."
      />

      <div className="space-y-6">
        {/* 1 — Signal contributions */}
        <Card className="p-6 gap-0">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="font-heading text-base font-medium text-[var(--text-primary)]">
              Signal contributions
            </h2>
            {week && (
              <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
                week of {week} · {clusters.length} ranked
              </span>
            )}
          </div>
          {signalRows.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              No scored clusters yet this week.
            </p>
          ) : (
            <ul className="space-y-3">
              {signalRows.map(([key, value]) => {
                const pct = signalMax > 0 ? Math.round((value / signalMax) * 100) : 0;
                return (
                  <li key={key} className="flex items-center gap-4">
                    <span className="w-40 shrink-0 truncate text-sm text-[var(--text-secondary)]">
                      {fmtSignal(key)}
                    </span>
                    <div
                      className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]"
                      role="img"
                      aria-label={`${fmtSignal(key)}: ${num(value)} average`}
                    >
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right text-sm tabular-nums font-medium text-[var(--text-primary)]">
                      {num(value)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* 2 — Acted-on vs dismissed */}
        <Card className="p-6 gap-0">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="font-heading text-base font-medium text-[var(--text-primary)]">
              Acted-on vs dismissed
            </h2>
            {hasCorrelation && (
              <span className="text-xs text-[var(--text-tertiary)]">
                <span className="text-[var(--text-secondary)]">{correlation.actedCount}</span> acted ·{" "}
                <span className="text-[var(--text-secondary)]">{correlation.negativeCount}</span> dismissed
              </span>
            )}
          </div>
          {!hasCorrelation ? (
            <p className="text-sm text-[var(--text-secondary)]">
              No niche actions logged yet — act on a few niches and weight correlation appears here.
            </p>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
                <span className="w-24 shrink-0" />
                <span className="flex flex-1 items-center justify-end gap-5">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block size-2 rounded-full bg-[var(--accent)]" />
                    Acted
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block size-2 rounded-full bg-[var(--text-tertiary)]" />
                    Dismissed
                  </span>
                </span>
              </div>
              {scoreKeys.map((k) => {
                const acted = correlation.actedAvg[k];
                const neg = correlation.negativeAvg[k];
                return (
                  <div key={k} className="flex items-center gap-4">
                    <span className="w-24 shrink-0 text-sm text-[var(--text-secondary)]">
                      {SCORE_LABELS[k]}
                    </span>
                    <div className="flex flex-1 flex-col gap-1.5">
                      <div className="flex items-center gap-3">
                        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                          <span
                            className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]"
                            style={{ width: `${Math.max((acted / compMax) * 100, acted > 0 ? 2 : 0)}%` }}
                          />
                        </div>
                        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-[var(--text-primary)]">
                          {num(acted)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                          <span
                            className="absolute inset-y-0 left-0 rounded-full bg-[var(--text-tertiary)]"
                            style={{ width: `${Math.max((neg / compMax) * 100, neg > 0 ? 2 : 0)}%` }}
                          />
                        </div>
                        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-[var(--text-secondary)]">
                          {num(neg)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* 3 — Prediction accuracy */}
        <Card className="p-6 gap-0">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="font-heading text-base font-medium text-[var(--text-primary)]">
              Prediction accuracy
            </h2>
            {accuracy && (
              <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
                {accuracy.total} closed
              </span>
            )}
          </div>
          {!accuracy ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Awaiting first closed prediction — the +7d close-loop runs once a niche-sourced video
              has posted and accrued 7 days of analytics.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {(
                [
                  { label: "Within range", count: accuracy.within, pct: accuracy.withinPct, tone: "var(--success)" },
                  { label: "Above range", count: accuracy.above, pct: accuracy.abovePct, tone: "var(--accent)" },
                  { label: "Below range", count: accuracy.below, pct: accuracy.belowPct, tone: "var(--warning)" },
                ] as const
              ).map((b) => (
                <div
                  key={b.label}
                  className="rounded-lg bg-[var(--surface-2)] p-4"
                >
                  <div className="flex items-center gap-2">
                    <span className="inline-block size-2 rounded-full" style={{ backgroundColor: b.tone }} />
                    <span className="text-xs text-[var(--text-secondary)]">{b.label}</span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
                      {b.pct}%
                    </span>
                    <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
                      {b.count} of {accuracy.total}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {accuracy && (
            <div className="mt-4 flex items-center gap-2">
              <Badge variant="outline">
                {accuracy.withinPct}% within predicted band
              </Badge>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
