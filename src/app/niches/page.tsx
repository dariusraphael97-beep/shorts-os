export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageHeader } from "@/components/layout/page-header";
import { getServiceClient } from "@/lib/supabase/server";
import {
  listDigestRankedClusters,
  getLatestWeekStart,
} from "@/lib/supabase/repositories/niche-clusters";
import { isoWeekStart, partitionBands } from "@/lib/niches/current-week";
import { NichesFeed, type NicheCardData } from "./niches-feed";

export default async function NichesPage() {
  const supabase = getServiceClient();

  // Resolve the week: try the current ISO week, fall back to the latest available.
  const currentWeek = isoWeekStart(new Date());
  let clusters = await listDigestRankedClusters(supabase, currentWeek);
  let resolvedWeek = currentWeek;

  if (clusters.length === 0) {
    const latest = await getLatestWeekStart(supabase);
    if (latest) {
      clusters = await listDigestRankedClusters(supabase, latest);
      resolvedWeek = latest;
    }
  }

  const { proven, unproven } = partitionBands(clusters);

  const toCardData = (cluster: (typeof clusters)[number]): NicheCardData => ({
    id: cluster.id,
    title: cluster.canonical_topic,
    format: cluster.format_label,
    velocityValues: [],
    exampleThumbnails: (cluster.example_video_ids as string[]).slice(0, 3),
    stats: {
      channelCount: cluster.channel_count,
      avgVelocity24h: cluster.avg_velocity_24h,
      firstSeenAt: cluster.first_seen_at,
      productionFit: cluster.production_fit ?? "manual_only",
    },
    discoveryState: cluster.discovery_state ?? "public",
    productionFit: cluster.production_fit ?? "manual_only",
    explainability: cluster.explainability_top_signals as Record<string, unknown>,
    canGenerate: cluster.production_fit === "native",
  });

  const headerDescription =
    clusters.length > 0
      ? `${clusters.length} cluster${clusters.length !== 1 ? "s" : ""} · week of ${resolvedWeek}`
      : "No clusters yet — the Monday run hasn't produced any this week";

  return (
    <AppShell sidebar={<AppSidebar activeHref="/niches" />}>
      <PageHeader
        title="This week's niches"
        description={headerDescription}
      />
      <NichesFeed proven={proven.map(toCardData)} unproven={unproven.map(toCardData)} />
    </AppShell>
  );
}
