"use client";

import React, { useEffect, useRef, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NicheCard } from "@/components/compositions/niche-card";
import { useGeneratePipeline, type GenerateState } from "@/components/niches/use-generate-pipeline";
import { GenerationProgress } from "@/components/niches/generation-progress";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NicheCardData {
  id: string;
  title: string;
  format: string;
  velocityValues: number[];
  exampleThumbnails?: string[];
  stats?: {
    channelCount: number;
    avgVelocity24h: number | null;
    firstSeenAt: string | null;
    productionFit: string;
  };
  discoveryState: string;
  productionFit: string;
  explainability?: Record<string, unknown>;
  canGenerate?: boolean;
}

interface NichesFeedProps {
  proven: NicheCardData[];
  unproven: NicheCardData[];
}

// ─── Action helper ────────────────────────────────────────────────────────────

async function post(action: string, nicheClusterId: string): Promise<void> {
  await fetch("/api/niches/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nicheClusterId, action }),
  });
}

// ─── BandLabel ────────────────────────────────────────────────────────────────

interface BandLabelProps {
  title: string;
  count: number;
  badge?: React.ReactNode;
}

function BandLabel({ title, count, badge }: BandLabelProps) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="flex items-center gap-2 min-w-0">
        <h2 className="text-sm font-semibold tracking-wide uppercase text-[var(--text-primary)] leading-none">
          {title}
        </h2>
        {badge}
      </div>
      <span className="font-mono text-[11px] tabular-nums text-[var(--text-tertiary)] shrink-0">
        {count}
      </span>
      {/* Hairline rule */}
      <div className="flex-1 h-px bg-[var(--border-subtle)]" aria-hidden />
    </div>
  );
}

// ─── UnprovenPill ─────────────────────────────────────────────────────────────

function UnprovenPill() {
  return (
    <span
      className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider text-amber-500 uppercase"
      aria-label="Unproven — high first-mover potential, no proven track record yet"
    >
      unproven
    </span>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-raised)]/40 px-8 py-16 text-center">
      {/* Decorative icon */}
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6 text-[var(--text-tertiary)]"
          aria-hidden
        >
          <path d="M12 3v1m0 16v1M4.22 4.22l.7.7m12.16 12.16.7.7M3 12h1m16 0h1M4.22 19.78l.7-.7M18.36 5.64l.7-.7" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">
          No niches this week
        </p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          The Monday cluster run hasn&apos;t produced any results yet.
          <br />
          Check back after the next scheduled run.
        </p>
      </div>
    </div>
  );
}

// ─── CardGrid ─────────────────────────────────────────────────────────────────

interface CardGridProps {
  items: NicheCardData[];
  dismissedIds: Set<string>;
  focusedId: string | null;
  cardRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onOpen: (id: string) => void;
  onInvestigate: (id: string) => void;
  onGenerate: (id: string) => void;
  onDismiss: (id: string) => void;
  genState: GenerateState;
  /** Stagger offset for CSS animation-delay */
  baseDelay?: number;
}

function CardGrid({
  items,
  dismissedIds,
  focusedId,
  cardRefs,
  onOpen,
  onInvestigate,
  onGenerate,
  onDismiss,
  genState,
  baseDelay = 0,
}: CardGridProps) {
  const visible = items.filter((c) => !dismissedIds.has(c.id));
  if (visible.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map((cluster, idx) => (
        <div
          key={cluster.id}
          ref={(el) => {
            if (el) cardRefs.current.set(cluster.id, el);
            else cardRefs.current.delete(cluster.id);
          }}
          className="niche-card-enter"
          style={
            {
              "--enter-delay": `${(baseDelay + idx) * 60}ms`,
            } as React.CSSProperties
          }
          data-card-id={cluster.id}
          data-focused={focusedId === cluster.id ? "true" : undefined}
        >
          <NicheCard
            title={cluster.title}
            velocityValues={cluster.velocityValues}
            discoveryState={cluster.discoveryState}
            productionFit={cluster.productionFit}
            exampleThumbnails={cluster.exampleThumbnails}
            stats={cluster.stats}
            explainability={cluster.explainability}
            canGenerate={cluster.canGenerate}
            onOpen={() => onOpen(cluster.id)}
            onInvestigate={() => onInvestigate(cluster.id)}
            onGenerate={() => onGenerate(cluster.id)}
            onDismiss={() => onDismiss(cluster.id)}
          />
          <GenerationProgress state={genState} clusterId={cluster.id} />
        </div>
      ))}
    </div>
  );
}

// ─── NichesFeed ───────────────────────────────────────────────────────────────

export function NichesFeed({ proven, unproven }: NichesFeedProps) {
  const router = useRouter();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const hasFiredViewedRef = useRef(false);
  const gen = useGeneratePipeline();

  // Fire "viewed" once per mount for all visible cards
  useEffect(() => {
    if (hasFiredViewedRef.current) return;
    hasFiredViewedRef.current = true;
    const ids = [...proven, ...unproven].map((c) => c.id);
    ids.forEach((id) => {
      post("viewed", id).catch(() => {
        // silently ignore — analytics best-effort
      });
    });
  }, [proven, unproven]);

  const handleOpen = useCallback(
    (id: string) => {
      post("investigated", id).catch(() => {});
      router.push(`/niches/${id}`);
    },
    [router],
  );

  const handleInvestigate = useCallback(
    (id: string) => {
      post("investigated", id).catch(() => {});
      router.push(`/niches/${id}`);
    },
    [router],
  );

  const handleGenerate = useCallback(
    (id: string) => {
      void gen.start(id);
    },
    [gen],
  );

  const handleDismiss = useCallback((id: string) => {
    post("dismissed", id).catch(() => {});
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    toast("Niche dismissed", {
      action: {
        label: "Undo",
        onClick: () => {
          setDismissedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
      },
    });
  }, []);

  // Keyboard navigation: j/k move focus, Enter opens, x dismisses, g generates
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      // Don't intercept when user is typing
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      const visibleIds = [...proven, ...unproven]
        .filter((c) => !dismissedIds.has(c.id))
        .map((c) => c.id);

      if (visibleIds.length === 0) return;

      const currentIdx = focusedId ? visibleIds.indexOf(focusedId) : -1;

      switch (e.key) {
        case "j": {
          e.preventDefault();
          const nextId =
            currentIdx < visibleIds.length - 1
              ? visibleIds[currentIdx + 1]
              : visibleIds[0];
          setFocusedId(nextId);
          cardRefs.current.get(nextId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          // Move DOM focus to the card's inner role=button
          const el = cardRefs.current.get(nextId)?.querySelector('[role="button"]') as HTMLElement | null;
          el?.focus();
          break;
        }
        case "k": {
          e.preventDefault();
          const prevId =
            currentIdx > 0
              ? visibleIds[currentIdx - 1]
              : visibleIds[visibleIds.length - 1];
          setFocusedId(prevId);
          cardRefs.current.get(prevId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          const el = cardRefs.current.get(prevId)?.querySelector('[role="button"]') as HTMLElement | null;
          el?.focus();
          break;
        }
        case "Enter": {
          if (focusedId) {
            e.preventDefault();
            handleOpen(focusedId);
          }
          break;
        }
        case "x": {
          if (focusedId) {
            e.preventDefault();
            // Move focus to next before dismissing
            const nextIdx = currentIdx < visibleIds.length - 1 ? currentIdx + 1 : currentIdx - 1;
            const nextId = nextIdx >= 0 ? visibleIds[nextIdx] : null;
            handleDismiss(focusedId);
            if (nextId && nextId !== focusedId) {
              setFocusedId(nextId);
              setTimeout(() => {
                const el = cardRefs.current.get(nextId)?.querySelector('[role="button"]') as HTMLElement | null;
                el?.focus();
              }, 50);
            } else {
              setFocusedId(null);
            }
          }
          break;
        }
        case "g": {
          if (focusedId) {
            const cluster = [...proven, ...unproven].find((c) => c.id === focusedId);
            if (cluster?.canGenerate) {
              e.preventDefault();
              handleGenerate(focusedId);
            }
          }
          break;
        }
      }
    };

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [focusedId, proven, unproven, dismissedIds, handleOpen, handleDismiss, handleGenerate]);

  // Track which card has focus from mouse/keyboard clicks
  const handleFocusCapture = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    const cardEl = (e.target as HTMLElement).closest("[data-card-id]") as HTMLElement | null;
    if (cardEl) {
      setFocusedId(cardEl.dataset.cardId ?? null);
    }
  }, []);

  const provenVisible = proven.filter((c) => !dismissedIds.has(c.id));
  const unprovenVisible = unproven.filter((c) => !dismissedIds.has(c.id));
  const isEmpty = provenVisible.length === 0 && unprovenVisible.length === 0;

  if (isEmpty) {
    return <EmptyState />;
  }

  return (
    <>
      {/* Keyboard shortcut hint — visually quiet, helpful on first visit */}
      <div
        className="mb-6 flex items-center gap-1.5 font-mono text-[11px] text-[var(--text-tertiary)]"
        aria-label="Keyboard shortcuts: j/k to navigate, Enter to open, x to dismiss, g to generate"
      >
        <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[10px]">j</kbd>
        <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[10px]">k</kbd>
        <span className="text-[var(--border-strong)]">navigate</span>
        <span className="mx-1 text-[var(--border-strong)]">·</span>
        <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[10px]">↵</kbd>
        <span className="text-[var(--border-strong)]">open</span>
        <span className="mx-1 text-[var(--border-strong)]">·</span>
        <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[10px]">x</kbd>
        <span className="text-[var(--border-strong)]">dismiss</span>
        <span className="mx-1 text-[var(--border-strong)]">·</span>
        <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[10px]">g</kbd>
        <span className="text-[var(--border-strong)]">generate</span>
      </div>

      <div onFocusCapture={handleFocusCapture}>
        {/* Band 1: Proven + trending */}
        {provenVisible.length > 0 && (
          <section aria-labelledby="band-proven" className="mb-10">
            <BandLabel
              title="Proven + trending"
              count={provenVisible.length}
            />
            <CardGrid
              items={proven}
              dismissedIds={dismissedIds}
              focusedId={focusedId}
              cardRefs={cardRefs}
              onOpen={handleOpen}
              onInvestigate={handleInvestigate}
              onGenerate={handleGenerate}
              onDismiss={handleDismiss}
              genState={gen.state}
              baseDelay={0}
            />
          </section>
        )}

        {/* Band 2: Trending, unproven */}
        {unprovenVisible.length > 0 && (
          <section aria-labelledby="band-unproven" className="mb-10">
            <BandLabel
              title="Trending, unproven"
              count={unprovenVisible.length}
              badge={<UnprovenPill />}
            />
            <CardGrid
              items={unproven}
              dismissedIds={dismissedIds}
              focusedId={focusedId}
              cardRefs={cardRefs}
              onOpen={handleOpen}
              onInvestigate={handleInvestigate}
              onGenerate={handleGenerate}
              onDismiss={handleDismiss}
              genState={gen.state}
              baseDelay={proven.length}
            />
          </section>
        )}
      </div>

      {/* Stagger entrance animation */}
      <style>{`
        .niche-card-enter {
          animation: niche-card-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
          animation-delay: var(--enter-delay, 0ms);
        }
        @keyframes niche-card-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .niche-card-enter {
            animation: none;
          }
        }
        [data-focused="true"] > * {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
          border-radius: 0.75rem;
        }
      `}</style>
    </>
  );
}
