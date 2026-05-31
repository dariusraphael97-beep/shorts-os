// src/app/clips/page.tsx
//
// Plan #4 Phase 4 — Clips page. Three tabs: Inbox (auto-ingested clip_library),
// Candidates (proposed compilation_drafts awaiting approval), Rendered
// (compilation_drafts whose render_f2 job succeeded, awaiting promotion to
// your_videos).
import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { InboxTab } from "@/components/clips/inbox-tab";
import { CandidatesTab } from "@/components/clips/candidates-tab";
import { RenderedTab } from "@/components/clips/rendered-tab";
import { ClipsTabs } from "@/components/clips/clips-tabs";

export const dynamic = "force-dynamic";

export default async function ClipsPage() {
  return (
    <AppShell bare sidebar={<AppSidebar />}>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">Clips</h1>
          <p className="text-text-secondary text-sm mt-1">
            Inbox: auto-ingested clip_library. Candidates: compilation drafts waiting on you.
            Rendered: finished renders to promote into your_videos.
          </p>
        </header>
        <ClipsTabs
          inbox={<InboxTab />}
          candidates={<CandidatesTab />}
          rendered={<RenderedTab />}
        />
      </div>
    </AppShell>
  );
}
