"use client";

import React from "react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SignalRow {
  key: string;
  label: string;
  value: number;
  weight: number;
  available: boolean;
}

// ─── Label map ────────────────────────────────────────────────────────────────

const SIGNAL_LABELS: Record<string, string> = {
  provenScore: "Proven",
  firstMoverScore: "First-mover",
  saturationInverse: "Low saturation",
  productionFitWeight: "Production fit",
  discoveryStateWeight: "Pre-public edge",
  outlierDensity: "Outlier density",
};

function signalLabel(key: string): string {
  return SIGNAL_LABELS[key] ?? key;
}

// ─── Pure helper (tested in vitest) ──────────────────────────────────────────

/**
 * Converts a raw `explainability_top_signals` blob into a sorted list of
 * display rows.
 *
 * Sort order: available rows first (by weight desc), unavailable rows after
 * (also by weight desc). Returns [] when contributions is absent or empty.
 */
export function formatSignals(signals: Record<string, unknown>): SignalRow[] {
  const raw = signals.contributions;
  if (
    raw === undefined ||
    raw === null ||
    typeof raw !== "object" ||
    Array.isArray(raw)
  ) {
    return [];
  }

  const contrib = raw as Record<
    string,
    { value: number; weight: number; available: boolean }
  >;

  const keys = Object.keys(contrib);
  if (keys.length === 0) return [];

  const rows: SignalRow[] = keys.map((key) => {
    const { value, weight, available } = contrib[key];
    return {
      key,
      label: signalLabel(key),
      value: value ?? 0,
      weight: weight ?? 0,
      available: available ?? false,
    };
  });

  return rows.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return b.weight - a.weight;
  });
}

// ─── WhyThisNiche component ───────────────────────────────────────────────────

interface WhyThisNicheProps {
  signals: Record<string, unknown>;
}

/**
 * Renders an explanatory breakdown of the signals that drove a niche's score.
 * Designed for use inside a collapsible section of NicheCard.
 *
 * Design direction: refined data-ink — thin monospaced bars, micro-typography,
 * available rows in full brightness, unavailable rows muted + annotated.
 */
export function WhyThisNiche({ signals }: WhyThisNicheProps) {
  const rows = formatSignals(signals);
  const nicheAgeDays =
    typeof signals.nicheAgeDays === "number" ? signals.nicheAgeDays : null;
  const viewsToSubs =
    typeof signals.viewsToSubsRatio === "number" ? signals.viewsToSubsRatio : null;

  if (rows.length === 0 && nicheAgeDays === null && viewsToSubs === null) {
    return (
      <p className="py-2 text-xs text-[var(--text-tertiary)]">
        No signal data available yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-1">
      {rows.length > 0 && (
        <ol className="flex flex-col gap-1.5" aria-label="Score signals">
          {rows.map((row) => (
            <SignalBarRow key={row.key} row={row} />
          ))}
        </ol>
      )}

      {viewsToSubs !== null && viewsToSubs >= 2 && (
        <p className="font-mono text-[10px] tracking-wide text-[var(--text-tertiary)]">
          Views run ~{viewsToSubs >= 10 ? Math.round(viewsToSubs) : viewsToSubs.toFixed(1)}× subscribers (algorithm-driven)
        </p>
      )}

      {nicheAgeDays !== null && (
        <p className="font-mono text-[10px] tracking-wide text-[var(--text-tertiary)]">
          Niche age: {nicheAgeDays}d
        </p>
      )}
    </div>
  );
}

// ─── SignalBarRow (internal) ──────────────────────────────────────────────────

interface SignalBarRowProps {
  row: SignalRow;
}

function SignalBarRow({ row }: SignalBarRowProps) {
  // contribution = value * weight, as a 0-1 fraction of the maximum possible
  // (max possible contribution = weight * 1.0, so bar fill = value clamped)
  const fillPct = Math.round(Math.min(Math.max(row.value, 0), 1) * 100);
  const weightPct = Math.round(row.weight * 100);

  return (
    <li
      className={cn(
        "grid items-center gap-x-2",
        "grid-cols-[96px_1fr_28px]",
        !row.available && "opacity-40"
      )}
    >
      {/* Label */}
      <span
        className={cn(
          "truncate font-mono text-[10px] tracking-wide",
          row.available
            ? "text-[var(--text-secondary)]"
            : "text-[var(--text-tertiary)]"
        )}
        title={row.label}
      >
        {row.label}
        {!row.available && (
          <span className="ml-1 text-[9px] opacity-60">(n/a)</span>
        )}
      </span>

      {/* Bar track */}
      <div
        className="relative h-[3px] overflow-hidden rounded-full bg-[var(--border-subtle)]"
        role="presentation"
        aria-hidden="true"
      >
        {/* Weight capacity indicator (ghost bar) */}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--border-strong)]"
          style={{ width: `${weightPct}%` }}
        />
        {/* Actual value fill */}
        {row.available && (
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${fillPct * (weightPct / 100)}%`,
              background: "var(--accent)",
              opacity: 0.85,
            }}
          />
        )}
      </div>

      {/* Numeric value */}
      <span
        className="text-right font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]"
        aria-label={`${row.label} score: ${fillPct}%`}
      >
        {fillPct}%
      </span>
    </li>
  );
}
