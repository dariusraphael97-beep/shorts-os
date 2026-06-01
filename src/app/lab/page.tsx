// src/app/lab/page.tsx
//
// The Lab — Plan #3.
// Three panes:
//   1. ActiveRunPane (client) — live pipeline view, only mounts during a run.
//      When a run is live this is the hero; it renders nothing when idle.
//   2. ReadyToDispatchPane (server) — reviewed topics with Dispatch buttons.
//      Leads the content when idle — it is the next action.
//   3. RecentDraftsPane (server) — last 10 your_videos drafts.

import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageHeader } from "@/components/layout/page-header";
import { ReadyToDispatchPane } from "@/components/lab/ready-to-dispatch-pane";
import { ActiveRunPane } from "@/components/lab/active-run-pane";
import { RecentDraftsPane } from "@/components/lab/recent-drafts-pane";

export const dynamic = "force-dynamic";

export default async function LabPage() {
  return (
    <AppShell bare sidebar={<AppSidebar activeHref="/lab" />}>
      <div className="mx-auto max-w-[1080px] px-8 py-8">
        <PageHeader
          title="The Lab"
          description="Dispatch a reviewed topic and watch the four agents assemble a video draft."
        />

        {/* Active run — hero when live, renders nothing when idle.
            Lives above the queue so it's the first thing you see during a run. */}
        <ActiveRunPane />

        {/* Queue + history — the "what's next" content when idle */}
        <div className="space-y-12">
          <ReadyToDispatchPane />
          <RecentDraftsPane />
        </div>
      </div>
    </AppShell>
  );
}
