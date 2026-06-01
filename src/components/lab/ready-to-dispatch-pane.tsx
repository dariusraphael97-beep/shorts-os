// src/components/lab/ready-to-dispatch-pane.tsx
//
// Server component. Loads reviewed topics from the DB at request time
// and renders a premium queue card per topic with a DispatchButton.
// The actual SSE stream lifecycle is owned by DispatchButton (client).

import type React from "react";
import Link from "next/link";
import { Rocket, Sparkles } from "lucide-react";
import { getServiceClient } from "@/lib/supabase/server";
import { listReviewedTopics, type QueuedTopic } from "@/lib/supabase/repositories/topic-queue";
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
        <>
          <ul className="space-y-3">
            {topics.map((t, i) => (
              <li
                key={t.id}
                className="queue-card-enter"
                style={{ "--enter-delay": `${i * 55}ms` } as React.CSSProperties}
              >
                <QueueCard topic={t} />
              </li>
            ))}
          </ul>

          {/* Stagger entrance + reduced-motion guard */}
          <style>{`
            .queue-card-enter {
              animation: queue-card-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
              animation-delay: var(--enter-delay, 0ms);
            }
            @keyframes queue-card-in {
              from { opacity: 0; transform: translateY(8px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            @media (prefers-reduced-motion: reduce) {
              .queue-card-enter { animation: none; }
            }
          `}</style>
        </>
      )}
    </section>
  );
}

// ─── Queue card ──────────────────────────────────────────────────────────────

function QueueCard({ topic: t }: { topic: QueuedTopic }) {
  return (
    <article className="group relative flex items-start gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 shadow-[var(--elev-1)] transition-all duration-200 ease-out hover:-translate-y-px hover:border-[var(--border-strong)] hover:shadow-[var(--elev-2)]">
      {/* Left: hookability score tile */}
      <HookabilityScore score={t.hookability_score} />

      {/* Centre: content */}
      <div className="min-w-0 flex-1">
        {/* Source + format chip row */}
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
            {t.source}
          </span>
        </div>

        {/* Primary: topic title */}
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--text-primary)]">
          {t.title}
        </p>

        {/* Summary peek */}
        {t.summary && (
          <p className="mt-1.5 line-clamp-1 text-sm text-[var(--text-secondary)]">
            {t.summary}
          </p>
        )}
      </div>

      {/* Right: Dispatch CTA */}
      <div className="shrink-0 self-center">
        <DispatchButton topicId={t.id} />
      </div>
    </article>
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

// ─── Hookability score chip ──────────────────────────────────────────────────

function HookabilityScore({ score }: { score: number | null }) {
  const display = score ?? null;

  /* Colour the score by band: ≥8 accent, ≥6 warning, else tertiary */
  const scoreColor =
    display === null
      ? "text-[var(--text-tertiary)]"
      : display >= 8
        ? "text-[var(--accent)]"
        : display >= 6
          ? "text-[var(--warning)]"
          : "text-[var(--text-secondary)]";

  return (
    <div
      className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)]"
      title={`Hookability score: ${display ?? "unscored"}`}
    >
      <span className={`font-mono text-base font-bold leading-none tabular-nums ${scoreColor}`}>
        {display ?? "—"}
      </span>
      <span className="mt-0.5 text-[9px] uppercase tracking-wider text-[var(--text-tertiary)]">
        hook
      </span>
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-5 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-1)]/40 px-8 py-16 text-center">
      {/* Decorative icon tile */}
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] shadow-[var(--elev-1)]">
        <Rocket className="h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
      </div>

      <div className="space-y-1">
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          Nothing queued
        </p>
        <p className="mx-auto max-w-xs text-sm text-[var(--text-secondary)]">
          Reviewed topics appear here, ready to send through the pipeline.
          Generate topics from a niche to get started.
        </p>
      </div>

      <Button render={<Link href="/niches" />} variant="outline" size="sm" className="gap-1.5">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        Browse niches
      </Button>
    </div>
  );
}
