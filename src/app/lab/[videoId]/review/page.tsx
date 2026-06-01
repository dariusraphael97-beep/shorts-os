// src/app/lab/[videoId]/review/page.tsx
//
// Pre-publish review split-view (Plan #5, sub-phase G).
//   Left  — the rendered video + transcript.
//   Right — the 7-point QA scorecard, suggestions, and strengths.
// While the reviewer is still running (no review row yet) we show an animated
// "review in progress" state that polls and refreshes when results land.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ToneBadge } from "@/components/compositions/tone-badge";
import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageHeader } from "@/components/layout/page-header";
import { getServiceClient } from "@/lib/supabase/server";
import { getYourVideoById } from "@/lib/supabase/repositories/your-videos";
import {
  getVideoReviewByVideoId,
  type OverallVerdict,
} from "@/lib/supabase/repositories/video-reviews";
import type { BadgeSpec } from "@/lib/design/badges";
import { ReviewClient } from "./_components/review-client";
import { ReviewInProgress } from "./_components/review-in-progress";

export const dynamic = "force-dynamic";

const VERDICT_BADGE: Record<OverallVerdict, BadgeSpec> = {
  ship: { label: "Ready to ship", tone: "success" },
  revise: { label: "Revise", tone: "warning" },
  block: { label: "Blocked", tone: "danger" },
};

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  const supabase = getServiceClient();

  const video = await getYourVideoById(supabase, videoId);
  if (!video) notFound();

  const review = await getVideoReviewByVideoId(supabase, videoId);

  return (
    <AppShell sidebar={<AppSidebar activeHref="/lab" />}>
      <PageHeader
        title={video.title}
        description="Pre-publish review — confirm the QA pass before this goes live."
        breadcrumbs={
          <Link
            href="/lab/drafts"
            className="inline-flex items-center gap-1 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
          >
            ← Back to drafts
          </Link>
        }
        actions={
          review ? (
            <ToneBadge spec={VERDICT_BADGE[review.overall_verdict]} />
          ) : (
            <ToneBadge spec={{ label: "Reviewing…", tone: "accent" }} />
          )
        }
      />

      {review ? (
        <ReviewClient video={video} review={review} />
      ) : (
        <ReviewInProgress videoId={videoId} />
      )}
    </AppShell>
  );
}
