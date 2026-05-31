// src/components/lab/ready-to-dispatch-pane.tsx
//
// Server component. Loads reviewed topics from the DB at request time
// and renders a card per topic with a DispatchButton. The actual SSE
// stream lifecycle is owned by DispatchButton (client).

import Link from "next/link";
import { Rocket, Sparkles } from "lucide-react";
import { getServiceClient } from "@/lib/supabase/server";
import { listReviewedTopics } from "@/lib/supabase/repositories/topic-queue";
import { Button } from "@/components/ui/button";
import { DispatchButton } from "./dispatch-button";

export async function ReadyToDispatchPane() {
  const supabase = getServiceClient();
  const topics = await listReviewedTopics(supabase, 20);

  return (
    <section aria-labelledby="ready-heading">
      <SectionHeader
        id="ready-heading"
        title="Ready to dispatch"
        count={topics.length > 0 ? `${topics.length} reviewed` : undefined}
      />

      {topics.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid gap-3">
          {topics.map((t) => (
            <li key={t.id}>
              <article className="group relative flex items-center gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 shadow-[var(--elev-1)] transition-colors duration-[var(--duration-quick)] hover:border-[var(--border-strong)]">
                <HookabilityScore score={t.hookability_score} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium leading-snug text-[var(--text-primary)]">
                    {t.title}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                    <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
                      {t.source}
                    </span>
                    {t.summary && (
                      <span className="truncate">{t.summary}</span>
                    )}
                  </p>
                </div>
                <div className="shrink-0">
                  <DispatchButton topicId={t.id} />
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  id,
  title,
  count,
}: {
  id: string;
  title: string;
  count?: string;
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <h2
        id={id}
        className="text-sm font-semibold uppercase tracking-wide leading-none text-[var(--text-primary)]"
      >
        {title}
      </h2>
      {count && (
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
          {count}
        </span>
      )}
      <div className="h-px flex-1 bg-[var(--border-subtle)]" aria-hidden />
    </div>
  );
}

// ─── Hookability score chip ─────────────────────────────────────────────────────

function HookabilityScore({ score }: { score: number | null }) {
  const display = score ?? null;
  return (
    <div
      className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)]"
      title="Hookability score"
    >
      <span className="font-mono text-base font-semibold leading-none tabular-nums text-[var(--accent)]">
        {display ?? "—"}
      </span>
      <span className="mt-0.5 text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">
        hook
      </span>
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-1)]/40 px-8 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <Rocket className="h-5 w-5 text-[var(--text-tertiary)]" aria-hidden />
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">
          No topics ready to dispatch yet
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--text-secondary)]">
          Reviewed topics show up here, ready to send through the pipeline.
          Approve a few in the Cockpit to get started.
        </p>
      </div>
      <Button render={<Link href="/" />} variant="outline" size="sm" className="gap-1.5">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        Open the Cockpit
      </Button>
    </div>
  );
}
