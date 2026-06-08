"use client";

import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";

export interface BestNichePreview {
  clusterId: string;
  title: string;
  reason: string;
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyHero() {
  return (
    <div className="mb-8 flex items-center gap-3 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-2)]/40 px-6 py-5">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-tertiary)]"
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M5 3v4M3 5h4M6 17v4M4 19h4" />
          <path d="M13 4l2.5 6.5L22 13l-6.5 2.5L13 22l-2.5-6.5L4 13l6.5-2.5L13 4z" />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">
          No dominatable niche to auto-generate yet
        </p>
        <p className="text-xs text-[var(--text-secondary)]">
          Seed or ingest niches first, then your top pick will land here.
        </p>
      </div>
    </div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

export function GenerateBestNiche({ pick }: { pick: BestNichePreview | null }) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  if (!pick) {
    return <EmptyHero />;
  }

  const handleGenerate = () => {
    router.push(`/niches/studio?cluster=${pick.clusterId}`);
  };

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="group/hero relative mb-8 overflow-hidden rounded-2xl border border-[var(--accent)]/30 bg-[var(--surface-1)] px-6 py-6 sm:px-7 sm:py-7"
    >
      {/* Accent glow — decorative, behind content */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[var(--accent)]/10 blur-3xl transition-opacity duration-500 group-hover/hero:bg-[var(--accent)]/[0.16]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--accent)]/[0.06] via-transparent to-transparent"
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0">
          {/* Eyebrow with dominatable affordance */}
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-muted)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]">
              <span
                className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
                aria-hidden
              />
              Tool&apos;s top pick
            </span>
            <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              Dominatable
            </span>
          </div>

          {/* The pick — the hero element of the page */}
          <h2 className="truncate text-xl font-semibold leading-tight text-[var(--text-primary)] sm:text-2xl">
            {pick.title}
          </h2>
          <p className="mt-1.5 max-w-prose text-sm text-[var(--text-secondary)]">
            {pick.reason}
          </p>
        </div>

        <Button
          size="lg"
          onClick={handleGenerate}
          className="shrink-0 self-start px-4 text-sm font-semibold shadow-sm sm:self-auto"
          aria-label={`Generate my best niche: ${pick.title}`}
        >
          {/* Spark icon */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden
          >
            <path d="M5 3v4M3 5h4M6 17v4M4 19h4" />
            <path d="M13 4l2.5 6.5L22 13l-6.5 2.5L13 22l-2.5-6.5L4 13l6.5-2.5L13 4z" />
          </svg>
          Generate my best niche
        </Button>
      </div>
    </motion.div>
  );
}
