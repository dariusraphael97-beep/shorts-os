export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageHeader } from "@/components/layout/page-header";
import { getServiceClient } from "@/lib/supabase/server";
import {
  listDigestRankedClusters,
  getLatestWeekStart,
} from "@/lib/supabase/repositories/niche-clusters";
import { listDigestRuns } from "@/lib/supabase/repositories/digest-runs";
import { isoWeekStart } from "@/lib/niches/current-week";
import { buildEmailProps } from "@/lib/digest/build-email-props";
import { renderDigest } from "@/lib/digest/render-digest";
import { DigestPreviewClient } from "./preview-client";

export default async function DigestPreviewPage() {
  const supabase = getServiceClient();

  // Resolve the default week: current ISO week if it has digest-ranked clusters,
  // else the most recent week that does.
  const currentWeek = isoWeekStart(new Date());
  let week = currentWeek;
  let clusters = await listDigestRankedClusters(supabase, week);
  if (clusters.length === 0) {
    const latest = await getLatestWeekStart(supabase);
    if (latest) {
      week = latest;
      clusters = await listDigestRankedClusters(supabase, latest);
    }
  }

  // Week options: the resolved week + any distinct weeks from past digest runs.
  const runs = await listDigestRuns(supabase, 12);
  const weekSet = new Set<string>([week, ...runs.map((r) => r.week_start)]);
  const weeks = [...weekSet].sort((a, b) => (a < b ? 1 : -1));

  const rows = clusters.map((c) => ({
    ...c,
    production_fit: c.production_fit ?? "manual_only",
    discovery_state: c.discovery_state ?? "public",
  }));
  const { html } = await renderDigest(buildEmailProps(week, rows));

  return (
    <AppShell sidebar={<AppSidebar activeHref="/niches" />}>
      <PageHeader
        title="Digest preview"
        description="What the weekly email looks like — switch weeks, check the phone and desktop frames, resend to yourself."
        breadcrumbs={null}
      />
      <DigestPreviewClient weeks={weeks} initialWeek={week} initialHtml={html} />
    </AppShell>
  );
}
