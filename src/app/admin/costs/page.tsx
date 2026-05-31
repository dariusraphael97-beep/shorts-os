import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { ArrowUpRight, BarChart3, Sparkles, Mail } from "lucide-react";
import { getServiceClient } from "@/lib/supabase/server";
import { listRecentRuns } from "@/lib/supabase/repositories/ingestion-runs";
import { aggregateQuotaByDay } from "@/lib/admin/costs";
import { AdminSidebar } from "@/app/admin/_components/admin-sidebar";

export const dynamic = "force-dynamic";

function num(n: number): string {
  return n.toLocaleString();
}

function fmtDay(date: string): string {
  // date is YYYY-MM-DD (UTC day). Parse explicitly to avoid TZ drift.
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

const EXTERNAL = [
  {
    name: "AI Gateway",
    icon: Sparkles,
    blurb: "Classifier + embedding token usage and spend are metered by the Vercel AI Gateway.",
    href: "https://vercel.com/dashboard",
    cta: "Open Vercel dashboard",
  },
  {
    name: "Resend",
    icon: Mail,
    blurb: "Weekly digest email sends and delivery are metered by Resend.",
    href: "https://resend.com/emails",
    cta: "Open Resend emails",
  },
] as const;

export default async function CostsPage() {
  const supabase = getServiceClient();
  const runs = await listRecentRuns(supabase, 500);
  const daily = aggregateQuotaByDay(runs);

  // "daily" is ascending; the 7 most-recent dates are the tail.
  const last7 = daily.slice(-7);
  const last7Total = last7.reduce((sum, d) => sum + d.quota, 0);

  // For the bar list, show most-recent days first (cap so the card stays scannable).
  const recentFirst = [...daily].reverse().slice(0, 30);
  const quotaMax = recentFirst.length > 0 ? Math.max(...recentFirst.map((d) => d.quota)) : 0;

  return (
    <AppShell sidebar={<AdminSidebar activeHref="/admin/costs" />}>
      <PageHeader
        title="Costs"
        description="YouTube quota we track, plus where AI Gateway + Resend usage live."
      />

      <div className="space-y-6">
        {/* YouTube quota — the one cost we actually persist */}
        <Card className="p-6 gap-0">
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <h2 className="font-heading text-base font-medium text-[var(--text-primary)]">
              YouTube API quota
            </h2>
            {daily.length > 0 && (
              <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
                {daily.length} {daily.length === 1 ? "day" : "days"} on record
              </span>
            )}
          </div>

          {daily.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-tertiary)]">
                <BarChart3 className="size-5" />
              </span>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                No ingestion runs recorded yet
              </p>
              <p className="max-w-md text-sm text-[var(--text-secondary)]">
                Once the YouTube sweep + search crons run, the quota units they spend per day
                appear here.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6 flex items-baseline gap-3">
                <span className="text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
                  {num(last7Total)}
                </span>
                <span className="text-sm text-[var(--text-secondary)]">
                  quota units · last 7 days
                </span>
              </div>

              <ul className="space-y-3">
                {recentFirst.map((d) => {
                  const pct = quotaMax > 0 ? Math.round((d.quota / quotaMax) * 100) : 0;
                  return (
                    <li key={d.date} className="flex items-center gap-4">
                      <span className="w-16 shrink-0 text-xs tabular-nums text-[var(--text-secondary)]">
                        {fmtDay(d.date)}
                      </span>
                      <div
                        className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]"
                        role="img"
                        aria-label={`${fmtDay(d.date)}: ${num(d.quota)} quota units`}
                      >
                        <span
                          className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]"
                          style={{ width: `${Math.max(pct, d.quota > 0 ? 2 : 0)}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right text-sm tabular-nums font-medium text-[var(--text-primary)]">
                        {num(d.quota)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>

        {/* Tracked externally — no fabricated numbers, just where the truth lives */}
        <div className="grid gap-6 sm:grid-cols-2">
          {EXTERNAL.map(({ name, icon: Icon, blurb, href, cta }) => (
            <Card key={name} className="p-6 gap-0">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--text-secondary)]">
                  <Icon className="size-4" />
                </span>
                <h2 className="font-heading text-base font-medium text-[var(--text-primary)]">
                  {name}
                </h2>
                <span className="ml-auto rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-tertiary)]">
                  Tracked externally
                </span>
              </div>
              <p className="text-sm text-[var(--text-secondary)]">{blurb}</p>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)] hover:underline"
              >
                {cta}
                <ArrowUpRight className="size-4" />
              </a>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
