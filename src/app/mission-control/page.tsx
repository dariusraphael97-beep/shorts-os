// The legacy cockpit reads Supabase at render time; defer to request time so the
// build doesn't try to prerender it with blank secrets (same pattern as the new surfaces).
export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopicQueuePanel } from "@/components/cockpit/topic-queue-panel";
import { TrendingPanel } from "@/components/cockpit/trending-panel";

export default function MissionControlPage() {
  return (
    <AppShell bare sidebar={<AppSidebar />}>
      <div className="h-full flex flex-col lg:flex-row">
        <div className="flex-1 min-w-0 lg:basis-3/5 lg:border-r lg:border-subtle">
          <TopicQueuePanel />
        </div>
        <div className="flex-1 min-w-0 lg:basis-2/5">
          <TrendingPanel />
        </div>
      </div>
    </AppShell>
  );
}
