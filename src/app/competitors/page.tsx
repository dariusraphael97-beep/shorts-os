export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageHeader } from "@/components/layout/page-header";
import { getServiceClient } from "@/lib/supabase/server";
import { listCompetitorChannels } from "@/lib/supabase/repositories/competitor-channels";
import { CompetitorsClient } from "./competitors-client";

export default async function CompetitorsPage() {
  const supabase = getServiceClient();
  const competitors = await listCompetitorChannels(supabase);

  const description =
    competitors.length > 0
      ? `Watching ${competitors.length} competitor${competitors.length !== 1 ? "s" : ""} for pattern shifts`
      : "Channels you're up against — add one to start watching for changes";

  return (
    <AppShell sidebar={<AppSidebar activeHref="/competitors" />}>
      <PageHeader title="Competitors" description={description} />
      <CompetitorsClient competitors={competitors} />
    </AppShell>
  );
}
