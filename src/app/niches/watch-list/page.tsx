export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageHeader } from "@/components/layout/page-header";
import { getServiceClient } from "@/lib/supabase/server";
import { listActiveWatchedChannels } from "@/lib/supabase/repositories/watched-channels";
import { WatchListClient } from "./watch-list-client";

export default async function WatchListPage() {
  const supabase = getServiceClient();
  const channels = await listActiveWatchedChannels(supabase, 1000);

  const description =
    channels.length > 0
      ? `Tracking ${channels.length} channel${channels.length !== 1 ? "s" : ""} — subscriber growth, cadence & outlier rate`
      : "Channels you're tracking for breakout signal — add your first one";

  return (
    <AppShell sidebar={<AppSidebar activeHref="/niches/watch-list" />}>
      <PageHeader title="Watch-list" description={description} />
      <WatchListClient channels={channels} />
    </AppShell>
  );
}
