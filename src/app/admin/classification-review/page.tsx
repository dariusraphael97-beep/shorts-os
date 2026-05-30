import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getServiceClient } from "@/lib/supabase/server";
import { listUnreviewedSamples, aggregateAccuracyByFormat } from "@/lib/supabase/repositories/classification-samples";
import { AdminSidebar } from "@/app/admin/_components/admin-sidebar";
import { VerdictButtons } from "./verdict-buttons";

export const dynamic = "force-dynamic";

export default async function ClassificationReviewPage() {
  const supabase = getServiceClient();
  const [accuracy, samples] = await Promise.all([
    aggregateAccuracyByFormat(supabase),
    listUnreviewedSamples(supabase, { limit: 50 }),
  ]);
  const sorted = [...accuracy].sort((a, b) => b.total - a.total);

  return (
    <AppShell sidebar={<AdminSidebar activeHref="/admin/classification-review" />}>
      <PageHeader title="Classification Review" description="Spot-check the 5% sample and track per-format accuracy." />

      {/* Accuracy section — lead with the trust signal */}
      <Card className="mb-8 p-6 gap-0">
        <div className="mb-3 text-sm font-medium text-[var(--text-secondary)]">Accuracy by format (reviewed samples)</div>
        {sorted.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No reviewed samples yet — work the queue below.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {sorted.map((a) => {
              const pct = a.total > 0 ? Math.round((a.correct / a.total) * 100) : 0;
              return (
                <div key={a.format_label} className="rounded-lg border border-[var(--border-subtle)] p-3">
                  <div className="text-xs text-[var(--text-secondary)]">{a.format_label}</div>
                  <div className="text-2xl font-semibold text-[var(--text-primary)]">{pct}%</div>
                  <div className="text-xs text-[var(--text-tertiary)]">{a.correct}/{a.total} correct · {a.partial} partial</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Unreviewed queue */}
      <h2 className="mb-3 text-sm font-medium text-[var(--text-secondary)]">Unreviewed samples ({samples.length})</h2>
      <div className="space-y-3">
        {samples.length === 0 ? (
          <Card className="p-6 gap-0"><p className="text-sm text-[var(--text-secondary)]">Queue empty — no samples awaiting review.</p></Card>
        ) : samples.map((s) => {
          const labels = s.chosen_labels as { topic_label?: string; format_label?: string; audience_signal?: string; confidence?: number };
          return (
            <Card key={s.id} className="p-4 gap-0">
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="outline">{labels.format_label ?? "?"}</Badge>
                <span className="text-sm font-medium text-[var(--text-primary)]">{labels.topic_label ?? "?"}</span>
                <span className="text-xs text-[var(--text-tertiary)]">conf {labels.confidence ?? "?"} · {labels.audience_signal ?? "?"}</span>
              </div>
              <details className="mb-3">
                <summary className="cursor-pointer text-xs text-[var(--text-secondary)]">Model response</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-[var(--surface-overlay)] p-2 text-xs">{s.response_full}</pre>
              </details>
              <VerdictButtons id={s.id} />
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
