import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageHeader } from "@/components/layout/page-header";
import { getServiceClient } from "@/lib/supabase/server";
import { getYourVideoById } from "@/lib/supabase/repositories/your-videos";
import { getLatestRenderJobForVideo } from "@/lib/supabase/repositories/render-jobs";
import { deriveStudioPhase } from "@/app/api/niches/studio/[draftId]/status/route";
import { StudioCockpit } from "@/components/niches/studio/studio-cockpit";

export const dynamic = "force-dynamic";

const breadcrumbs = (
  <span>
    Niches <span className="mx-1 text-[var(--border-strong)]">/</span> Studio
  </span>
);

export default async function StudioDraftPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const { draftId } = await params;
  const supabase = getServiceClient();
  const draft = await getYourVideoById(supabase, draftId);

  if (!draft) {
    return (
      <AppShell sidebar={<AppSidebar activeHref="/niches" />}>
        <PageHeader
          title="Draft not found"
          description="That draft does not exist — it may have been discarded."
          breadcrumbs={breadcrumbs}
        />
      </AppShell>
    );
  }

  const job = await getLatestRenderJobForVideo(supabase, draftId);
  const initialPhase = deriveStudioPhase(draft, job);

  return (
    <AppShell sidebar={<AppSidebar activeHref="/niches" />}>
      <PageHeader title={draft.title} description="Generation cockpit" breadcrumbs={breadcrumbs} />
      <StudioCockpit draftId={draftId} initialPhase={initialPhase} />
    </AppShell>
  );
}
