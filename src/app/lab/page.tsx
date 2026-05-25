// src/app/lab/page.tsx
//
// The Lab — Plan #3.
// Three panes:
//   1. ReadyToDispatchPane (server) — reviewed topics with Dispatch buttons.
//   2. ActiveRunPane (client) — live pipeline view, only mounts during a run.
//   3. RecentDraftsPane (server) — last 10 your_videos drafts.

import { CockpitShell } from "@/components/cockpit/cockpit-shell";
import { ReadyToDispatchPane } from "@/components/lab/ready-to-dispatch-pane";
import { ActiveRunPane } from "@/components/lab/active-run-pane";
import { RecentDraftsPane } from "@/components/lab/recent-drafts-pane";

export const dynamic = "force-dynamic";

export default async function LabPage() {
  return (
    <CockpitShell>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">The Lab</h1>
          <p className="text-text-secondary text-sm mt-1">
            Dispatch a reviewed topic and watch the 4 agents assemble a video draft.
          </p>
        </header>

        {/* Active run lives between dispatcher + drafts; renders nothing when idle. */}
        <ActiveRunPane />

        <ReadyToDispatchPane />

        <RecentDraftsPane />
      </div>
    </CockpitShell>
  );
}
