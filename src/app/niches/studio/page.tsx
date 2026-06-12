import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageHeader } from "@/components/layout/page-header";
import { StudioPlanningClient } from "./studio-planning-client";

export const dynamic = "force-dynamic";

/**
 * Studio — Phase 1 planning screen.
 *
 * Reads `?cluster` / `?topic`, kicks off the planning SSE route, and on
 * completion redirects to the draft-keyed cockpit. `useSearchParams` lives in
 * the client child, which must sit under a Suspense boundary (App Router
 * requirement — a static page calling it otherwise fails the production build).
 */
export default function StudioPlanningPage() {
  return (
    <AppShell sidebar={<AppSidebar activeHref="/niches" />}>
      <PageHeader
        title="Planning your video"
        description="Drafting the script, look, and beats from this niche."
        breadcrumbs={
          <span>
            Niches <span className="mx-1 text-[var(--border-strong)]">/</span> Studio
          </span>
        }
      />
      <Suspense fallback={<PlanningFallback />}>
        <StudioPlanningClient />
      </Suspense>
    </AppShell>
  );
}

function PlanningFallback() {
  return (
    <div
      className="mx-auto mt-2 max-w-xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-8"
      aria-hidden
    >
      <div className="h-5 w-48 animate-pulse rounded bg-[var(--border-subtle)]" />
      <div className="mt-8 space-y-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-7 w-7 animate-pulse rounded-full bg-[var(--border-subtle)]" />
            <div className="h-4 w-32 animate-pulse rounded bg-[var(--border-subtle)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
