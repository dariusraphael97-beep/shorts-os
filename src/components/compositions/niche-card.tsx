"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { DiscoveryStateBadge } from "@/components/compositions/discovery-state-badge";
import { ProductionFitBadge } from "@/components/compositions/production-fit-badge";
import { ProvenBandBadge } from "@/components/compositions/proven-band-badge";
import { OutlierBadge } from "@/components/compositions/outlier-badge";
import { VelocitySparkline } from "@/components/compositions/velocity-sparkline";
import { WhyThisNiche } from "@/components/compositions/why-this-niche";
import { HoverLift, Tappable } from "@/components/motion";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface NicheCardProps {
  // — existing (unchanged) —
  title: string;
  summary?: string;
  velocityValues: number[];
  velocityLabel?: string;
  outlierMultiplier?: number;
  discoveryState: string;
  productionFit: string;
  provenBand?: string;
  onOpen?: () => void;

  // — new additions —
  /** Up to 3 YouTube video IDs used as example thumbnails */
  exampleThumbnails?: string[];
  /** Stat row data */
  stats?: {
    channelCount: number;
    avgVelocity24h: number | null;
    firstSeenAt: string | null;
    productionFit: string;
  };
  /** Raw `explainability_top_signals` jsonb from Sub-phase D scorer */
  explainability?: Record<string, unknown>;
  /** Whether the "Generate now" CTA is enabled */
  canGenerate?: boolean;
  onInvestigate?: () => void;
  onGenerate?: () => void;
  onDismiss?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "1d ago";
    if (diffDays < 30) return `${diffDays}d ago`;
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 8) return `${diffWeeks}w ago`;
    const diffMonths = Math.floor(diffDays / 30);
    return `${diffMonths}mo ago`;
  } catch {
    return "—";
  }
}

function StatSeparator() {
  return (
    <span className="select-none text-[var(--border-strong)]" aria-hidden>·</span>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ThumbnailStripProps {
  ids: string[];
}

function ThumbnailStrip({ ids }: ThumbnailStripProps) {
  const shown = ids.slice(0, 3);
  if (shown.length === 0) return null;

  return (
    <div className="flex gap-1.5 px-4">
      {shown.map((id) => (
        <a
          key={id}
          href={`https://www.youtube.com/watch?v=${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group/thumb relative overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          onClick={(e) => e.stopPropagation()}
          style={{ flex: "1 1 0", minWidth: 0 }}
          aria-label={`Example video ${id}`}
        >
          {/* Aspect ratio container — 16:9 */}
          <div className="relative aspect-video w-full">
            <img
              src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full rounded-md object-cover transition-transform duration-200 ease-out group-hover/thumb:scale-[1.04]"
              loading="lazy"
            />
            {/* Subtle dark scrim on hover */}
            <div className="absolute inset-0 rounded-md bg-black/0 transition-colors duration-200 group-hover/thumb:bg-black/20" />
            {/* Play icon */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover/thumb:opacity-100">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
                {/* Triangle SVG — no emoji, no icon lib dep */}
                <svg
                  viewBox="0 0 12 12"
                  fill="white"
                  aria-hidden="true"
                  className="h-3 w-3 translate-x-px"
                >
                  <path d="M2.5 1.5l7 4.5-7 4.5z" />
                </svg>
              </span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

interface StatRowProps {
  stats: NonNullable<NicheCardProps["stats"]>;
}

function StatRow({ stats }: StatRowProps) {
  const velocity =
    stats.avgVelocity24h !== null
      ? stats.avgVelocity24h.toFixed(1)
      : "—";
  const firstSeen = stats.firstSeenAt
    ? formatRelativeTime(stats.firstSeenAt)
    : "—";

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 font-mono text-[11px] tabular-nums text-[var(--text-tertiary)]">
      <span>
        <span className="text-[var(--text-secondary)]">{stats.channelCount}</span>{" "}
        ch
      </span>
      <StatSeparator />
      <span>
        <span className="text-[var(--text-secondary)]">{velocity}</span>/d
      </span>
      <StatSeparator />
      <span>{firstSeen}</span>
      <StatSeparator />
      {/* Reuse existing badge inline */}
      <ProductionFitBadge fit={stats.productionFit} />
    </div>
  );
}

interface WhyCollapsibleProps {
  explainability: Record<string, unknown>;
}

function WhyCollapsible({ explainability }: WhyCollapsibleProps) {
  return (
    <details
      className="group/why px-4"
      onClick={(e) => e.stopPropagation()}
    >
      <summary
        className={cn(
          "flex cursor-pointer select-none list-none items-center gap-1",
          "font-mono text-[11px] tracking-wide text-[var(--text-tertiary)]",
          "transition-colors duration-150 hover:text-[var(--text-secondary)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
          "rounded-sm"
        )}
      >
        {/* Custom chevron — rotates on open */}
        <svg
          viewBox="0 0 12 12"
          className="h-3 w-3 shrink-0 transition-transform duration-200 group-open/why:rotate-90"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          aria-hidden="true"
        >
          <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Why this niche?
      </summary>

      {/* Expandable content */}
      <div className="mt-2 overflow-hidden">
        <WhyThisNiche signals={explainability} />
      </div>
    </details>
  );
}

interface CardCTAsProps {
  canGenerate?: boolean;
  onInvestigate?: () => void;
  onGenerate?: () => void;
  onDismiss?: () => void;
}

function CardCTAs({
  canGenerate = false,
  onInvestigate,
  onGenerate,
  onDismiss,
}: CardCTAsProps) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className="flex items-center gap-1.5 px-4 py-2"
      onClick={stop}
    >
      {onInvestigate && (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onInvestigate();
          }}
          className="h-7 gap-1 px-2.5 text-[11px] font-medium"
        >
          Investigate
        </Button>
      )}

      {onGenerate && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              {/* Wrapper needed because disabled button won't fire tooltip events */}
              <span className="inline-flex">
                <Button
                  variant="default"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onGenerate();
                  }}
                  disabled={!canGenerate}
                  className="h-7 gap-1 px-2.5 text-[11px] font-medium"
                  aria-label={
                    canGenerate
                      ? "Generate a video for this niche"
                      : "Generate now — add to queue first to enable"
                  }
                >
                  Generate now
                </Button>
              </span>
            </TooltipTrigger>
            {!canGenerate && (
              <TooltipContent side="top">
                Add to watch-list to unlock generation
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )}

      {onDismiss && (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="ml-auto h-7 gap-1 px-2.5 text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[var(--danger)]"
        >
          Dismiss
        </Button>
      )}
    </div>
  );
}

// ─── CardInner ────────────────────────────────────────────────────────────────

function CardInner({
  title,
  summary,
  velocityValues,
  velocityLabel,
  outlierMultiplier,
  discoveryState,
  productionFit,
  provenBand,
  exampleThumbnails,
  stats,
  explainability,
  canGenerate,
  onInvestigate,
  onGenerate,
  onDismiss,
  interactive,
}: Omit<NicheCardProps, "onOpen"> & { interactive: boolean }) {
  const hasFooterCTAs = onInvestigate || onGenerate || onDismiss;

  return (
    <Card className={cn("transition-colors", interactive && "cursor-pointer")}>
      {/* Top row: title + ProvenBandBadge */}
      <CardHeader className="flex-row items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-lg font-semibold leading-snug text-[var(--text-primary)]">
          {title}
        </p>
        {provenBand !== undefined && (
          <span className="shrink-0">
            <ProvenBandBadge band={provenBand} />
          </span>
        )}
      </CardHeader>

      {/* Summary (2-line clamp) */}
      {summary !== undefined && (
        <CardContent className="-mt-2">
          <p className="line-clamp-2 text-sm text-[var(--text-secondary)]">
            {summary}
          </p>
        </CardContent>
      )}

      {/* Pills row */}
      <CardContent className={cn(summary === undefined && "-mt-2")}>
        <div className="flex flex-wrap items-center gap-2">
          <DiscoveryStateBadge state={discoveryState} />
          <ProductionFitBadge fit={productionFit} />
          {outlierMultiplier !== undefined && (
            <OutlierBadge multiplier={outlierMultiplier} />
          )}
        </div>
      </CardContent>

      {/* Example thumbnails — only when provided */}
      {exampleThumbnails !== undefined && exampleThumbnails.length > 0 && (
        <ThumbnailStrip ids={exampleThumbnails} />
      )}

      {/* Stat row — only when provided */}
      {stats !== undefined && (
        <CardContent className="-mt-1">
          <StatRow stats={stats} />
        </CardContent>
      )}

      {/* Why this niche? collapsible — only when explainability is provided */}
      {explainability !== undefined && (
        <CardContent className="-mt-1">
          <WhyCollapsible explainability={explainability} />
        </CardContent>
      )}

      {/* Bottom: sparkline + velocity label */}
      <CardFooter className={cn("border-t bg-transparent", hasFooterCTAs && "flex-col items-stretch gap-0 p-0")}>
        {hasFooterCTAs ? (
          <>
            {/* Sparkline row */}
            <div className="flex w-full items-center justify-between gap-3 px-4 py-3">
              <VelocitySparkline
                values={velocityValues}
                width={96}
                height={24}
                showArea
              />
              {velocityLabel !== undefined && (
                <span className="shrink-0 font-mono text-xs text-[var(--text-tertiary)]">
                  {velocityLabel}
                </span>
              )}
            </div>

            {/* Divider */}
            <div className="mx-4 h-px bg-[var(--border-subtle)]" aria-hidden />

            {/* CTA row */}
            <CardCTAs
              canGenerate={canGenerate}
              onInvestigate={onInvestigate}
              onGenerate={onGenerate}
              onDismiss={onDismiss}
            />
          </>
        ) : (
          <div className="flex w-full items-center justify-between gap-3">
            <VelocitySparkline
              values={velocityValues}
              width={96}
              height={24}
              showArea
            />
            {velocityLabel !== undefined && (
              <span className="shrink-0 font-mono text-xs text-[var(--text-tertiary)]">
                {velocityLabel}
              </span>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}

// ─── NicheCard (public) ───────────────────────────────────────────────────────

export function NicheCard(props: NicheCardProps) {
  const { onOpen } = props;

  if (onOpen) {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen();
      }
    };

    return (
      <HoverLift>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
        >
          <Tappable onClick={onOpen}>
            <CardInner {...props} interactive />
          </Tappable>
        </div>
      </HoverLift>
    );
  }

  return (
    <HoverLift>
      <CardInner {...props} interactive={false} />
    </HoverLift>
  );
}
