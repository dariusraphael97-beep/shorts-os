// src/app/clips/page.tsx
//
// Plan #4 Phase 3 — Clips page. Phase 3 ships Inbox tab only.
// Phase 4 will add Candidates + Rendered tabs for Format-2 compilations.
import { CockpitShell } from "@/components/cockpit/cockpit-shell";
import { InboxTab } from "@/components/clips/inbox-tab";

export const dynamic = "force-dynamic";

export default async function ClipsPage() {
  return (
    <CockpitShell>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">Clips</h1>
          <p className="text-text-secondary text-sm mt-1">
            Auto-ingested clips ready for Format-2 compilations. Block low-signal sources here.
          </p>
        </header>
        <InboxTab />
      </div>
    </CockpitShell>
  );
}
