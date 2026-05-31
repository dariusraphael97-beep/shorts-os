export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageHeader } from "@/components/layout/page-header";
import { WhyThisNiche } from "@/components/compositions/why-this-niche";
import { DiscoveryStateBadge } from "@/components/compositions/discovery-state-badge";
import { ProductionFitBadge } from "@/components/compositions/production-fit-badge";
import { getServiceClient } from "@/lib/supabase/server";
import {
  getClusterById,
  listRelatedClusters,
} from "@/lib/supabase/repositories/niche-clusters";
import {
  getShortsObservationByVideoId,
  type ShortsObservation,
} from "@/lib/supabase/repositories/shorts-observations";
import {
  listPredictionsByCluster,
  type NichePrediction,
} from "@/lib/supabase/repositories/niche-predictions";
import { DetailActions } from "./detail-actions";

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatViews(n: number): string {
  return n.toLocaleString("en-US");
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return "—";
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "1d ago";
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 8) return `${diffWeeks}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

const VERDICT_TONE: Record<string, { label: string; className: string }> = {
  within: {
    label: "On target",
    className: "border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]",
  },
  above: {
    label: "Overshot",
    className: "border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]",
  },
  below: {
    label: "Undershot",
    className: "border-[var(--danger)]/30 bg-[var(--danger)]/10 text-[var(--danger)]",
  },
};

// ─── Section heading ────────────────────────────────────────────────────────────

function ColumnHeading({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-primary)]">
        {title}
      </h2>
      {count !== undefined && (
        <span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
          {count}
        </span>
      )}
      <div className="h-px flex-1 bg-[var(--border-subtle)]" aria-hidden />
    </div>
  );
}

// ─── Cluster video row (expandable) ─────────────────────────────────────────────

function VideoRow({ obs }: { obs: ShortsObservation }) {
  const watchUrl = `https://www.youtube.com/watch?v=${obs.video_id}`;
  const thumb = `https://i.ytimg.com/vi/${obs.video_id}/hqdefault.jpg`;
  const hasDescription = obs.description !== null && obs.description.trim().length > 0;

  return (
    <details className="group/row overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)]">
      <summary className="flex cursor-pointer list-none items-start gap-3 p-3 transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
        {/* Thumbnail → opens YouTube */}
        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="group/thumb relative aspect-video w-28 shrink-0 overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          aria-label={`Open ${obs.title} on YouTube`}
        >
          <img
            src={thumb}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover/thumb:scale-[1.04]"
            loading="lazy"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover/thumb:bg-black/20 group-hover/thumb:opacity-100">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
              <svg viewBox="0 0 12 12" fill="white" aria-hidden="true" className="h-3 w-3 translate-x-px">
                <path d="M2.5 1.5l7 4.5-7 4.5z" />
              </svg>
            </span>
          </div>
        </a>

        {/* Title + meta */}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-snug text-[var(--text-primary)]">
            {obs.title}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
            <span className="truncate" title={obs.channel_id ?? undefined}>
              {obs.channel_id ?? "unknown channel"}
            </span>
            <span className="text-[var(--border-strong)]" aria-hidden>·</span>
            <span>
              <span className="text-[var(--text-secondary)]">
                {formatViews(obs.view_count)}
              </span>{" "}
              views
            </span>
            {obs.published_at && (
              <>
                <span className="text-[var(--border-strong)]" aria-hidden>·</span>
                <span>{formatRelativeTime(obs.published_at)}</span>
              </>
            )}
          </div>
        </div>

        {/* Chevron */}
        <svg
          viewBox="0 0 12 12"
          className="mt-1 h-3 w-3 shrink-0 text-[var(--text-tertiary)] transition-transform duration-200 group-open/row:rotate-90"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          aria-hidden="true"
        >
          <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>

      {/* Expanded body: description */}
      <div className="border-t border-[var(--border-subtle)] px-3 py-3">
        {hasDescription ? (
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-[var(--text-secondary)]">
            {obs.description}
          </p>
        ) : (
          <p className="text-[13px] italic text-[var(--text-tertiary)]">
            No description available for this video.
          </p>
        )}
      </div>
    </details>
  );
}

// ─── Prediction outcome card (closed predictions) ───────────────────────────────

function PredictionOutcome({ prediction }: { prediction: NichePrediction }) {
  const verdict = prediction.accuracy_verdict
    ? VERDICT_TONE[prediction.accuracy_verdict]
    : null;

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          Closed forecast
        </p>
        {verdict && (
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ${verdict.className}`}
          >
            {verdict.label}
          </span>
        )}
      </div>
      <p className="mt-2 font-mono text-sm tabular-nums text-[var(--text-secondary)]">
        Predicted {formatViews(prediction.predicted_views_7d_lower)} –{" "}
        {formatViews(prediction.predicted_views_7d_upper)}
      </p>
      {prediction.actual_views_7d !== null && (
        <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-[var(--text-primary)]">
          {formatViews(prediction.actual_views_7d)}
          <span className="ml-1.5 text-[11px] font-normal text-[var(--text-tertiary)]">
            actual
          </span>
        </p>
      )}
    </div>
  );
}

// ─── Related niche mini-card ────────────────────────────────────────────────────

function RelatedCard({
  id,
  topic,
  formatLabel,
  channelCount,
}: {
  id: string;
  topic: string;
  formatLabel: string;
  channelCount: number;
}) {
  return (
    <Link
      href={`/niches/${id}`}
      className="group/related flex min-w-[200px] flex-col gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3 transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <p className="line-clamp-2 text-sm font-medium leading-snug text-[var(--text-primary)] group-hover/related:text-[var(--accent)]">
        {topic}
      </p>
      <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
        <span className="truncate">{formatLabel}</span>
        <span className="text-[var(--border-strong)]" aria-hidden>·</span>
        <span>
          <span className="text-[var(--text-secondary)]">{channelCount}</span> ch
        </span>
      </div>
    </Link>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default async function NicheDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getServiceClient();

  const cluster = await getClusterById(supabase, id);
  if (!cluster) notFound();

  const videoIds = cluster.example_video_ids as string[];
  const observations = (
    await Promise.all(
      videoIds.map((vid) => getShortsObservationByVideoId(supabase, vid)),
    )
  ).filter((o): o is ShortsObservation => o !== null);

  const predictions = await listPredictionsByCluster(supabase, id);
  const openPrediction = predictions.find((p) => p.closed_at === null) ?? null;
  const closedPrediction = predictions.find((p) => p.closed_at !== null) ?? null;
  const predictionBand = openPrediction
    ? {
        lower: openPrediction.predicted_views_7d_lower,
        upper: openPrediction.predicted_views_7d_upper,
      }
    : null;

  const related = await listRelatedClusters(supabase, {
    weekStart: cluster.week_start,
    canonicalTopic: cluster.canonical_topic,
    formatLabel: cluster.format_label,
    excludeId: cluster.id,
    limit: 6,
  });

  const headerDescription = `${cluster.format_label} · ${cluster.channel_count} channel${
    cluster.channel_count !== 1 ? "s" : ""
  } · week of ${cluster.week_start}`;

  return (
    <AppShell sidebar={<AppSidebar activeHref="/niches" />}>
      <PageHeader
        title={cluster.canonical_topic}
        description={headerDescription}
        breadcrumbs={
          <Link
            href="/niches"
            className="inline-flex items-center gap-1 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)]"
          >
            ← This week&apos;s niches
          </Link>
        }
        actions={
          <div className="flex items-center gap-2">
            <DiscoveryStateBadge state={cluster.discovery_state ?? "public"} />
            <ProductionFitBadge fit={cluster.production_fit ?? "manual_only"} />
          </div>
        }
      />

      {/* 40 / 35 / 25 three-column grid → single column on small screens */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1.75fr_1.25fr]">
        {/* Col 1 (40%) — Cluster videos */}
        <section aria-labelledby="cluster-videos">
          <ColumnHeading title="Cluster videos" count={observations.length} />
          {observations.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {observations.map((obs) => (
                <VideoRow key={obs.video_id} obs={obs} />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
              No example videos resolved for this cluster yet.
            </p>
          )}
        </section>

        {/* Col 2 (35%) — Why this niche */}
        <section aria-labelledby="why-this-niche">
          <ColumnHeading title="Why this niche?" />
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
            <WhyThisNiche
              signals={
                cluster.explainability_top_signals as Record<string, unknown>
              }
            />
          </div>
        </section>

        {/* Col 3 (25%) — Actions + prediction */}
        <section aria-labelledby="actions" className="flex flex-col gap-6">
          <div>
            <ColumnHeading title="Take action" />
            <DetailActions
              clusterId={cluster.id}
              canGenerate={cluster.production_fit === "native"}
              prediction={predictionBand}
            />
          </div>
          {!openPrediction && closedPrediction && (
            <div>
              <ColumnHeading title="Forecast" />
              <PredictionOutcome prediction={closedPrediction} />
            </div>
          )}
        </section>
      </div>

      {/* Related-niches strip */}
      {related.length > 0 && (
        <section aria-labelledby="related-niches" className="mt-12">
          <ColumnHeading title="Related niches" count={related.length} />
          <div className="flex gap-3 overflow-x-auto pb-2">
            {related.map((r) => (
              <RelatedCard
                key={r.id}
                id={r.id}
                topic={r.canonical_topic}
                formatLabel={r.format_label}
                channelCount={r.channel_count}
              />
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
