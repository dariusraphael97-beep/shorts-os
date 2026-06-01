// src/app/clips/page.tsx
//
// Plan #4 Phase 4 — Clips page. Three tabs: Inbox (auto-ingested clip_library),
// Candidates (proposed compilation_drafts awaiting approval), Rendered
// (compilation_drafts whose render_f2 job succeeded, awaiting promotion to
// your_videos).
import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageHeader } from "@/components/layout/page-header";
import { InboxTab } from "@/components/clips/inbox-tab";
import { CandidatesTab } from "@/components/clips/candidates-tab";
import { RenderedTab } from "@/components/clips/rendered-tab";
import { ClipsTabs } from "@/components/clips/clips-tabs";
import { IngestUrlInput } from "@/components/clips/ingest-url-input";

export const dynamic = "force-dynamic";

export default async function ClipsPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <PageHeader
        title="Clips"
        description="Inbox: auto-ingested clip library. Candidates: compilation drafts waiting on you. Rendered: finished renders to promote."
        actions={<IngestUrlInput />}
      />
      <ClipsTabs
        inbox={<InboxTab />}
        candidates={<CandidatesTab />}
        rendered={<RenderedTab />}
      />
    </AppShell>
  );
}
