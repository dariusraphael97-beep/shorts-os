"use client";

/**
 * ScanFeed — live checklist shown after onboarding completes.
 *
 * Polls GET /api/onboarding/scan-status every ~2 500 ms and renders a 3-step
 * progress list plus a niches-found counter. Calls `onDone` when the user
 * clicks "See your niches →", or auto-advances a short beat after all steps
 * are terminal. Includes a slow/error fallback so the user is never stuck.
 */

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Loader2, Minus, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fadeRise } from "@/lib/motion";
import type { ScanStatus, ScanStepStatus } from "@/lib/onboarding/scan";

// ─── types ────────────────────────────────────────────────────────────────────

type StepJob = "youtube_shorts_search" | "classify_observations" | "cluster_niches";

// ─── constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2_500;
/** Hard ceiling before we surface the slow-scan fallback message. */
const SLOW_THRESHOLD_MS = 5 * 60 * 1_000; // 5 minutes
/** Auto-advance delay after all jobs reach a terminal status. */
const AUTO_ADVANCE_MS = 1_800;

const STEP_LABELS: Record<StepJob, string> = {
  youtube_shorts_search: "Searching YouTube",
  classify_observations: "Classifying topics",
  cluster_niches: "Finding niches",
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function isTerminal(s: ScanStepStatus): boolean {
  return s === "success" || s === "failed" || s === "skipped";
}

function isSlow(startedAt: number): boolean {
  return Date.now() - startedAt > SLOW_THRESHOLD_MS;
}

// ─── step-row icon ────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: ScanStepStatus }) {
  if (status === "partial") {
    return (
      <Loader2
        className="h-4 w-4 animate-spin text-[var(--accent)]"
        strokeWidth={2}
        aria-label="In progress"
      />
    );
  }
  if (status === "success") {
    return (
      <span
        aria-label="Complete"
        className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-foreground)]"
      >
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <AlertTriangle
        className="h-4 w-4 text-[var(--accent-red)]"
        strokeWidth={1.75}
        aria-label="Failed"
      />
    );
  }
  if (status === "skipped") {
    return (
      <Minus
        className="h-4 w-4 text-[var(--text-tertiary)]"
        strokeWidth={1.75}
        aria-label="Skipped"
      />
    );
  }
  // pending
  return (
    <span
      aria-label="Waiting"
      className="h-2 w-2 rounded-full bg-[var(--border-subtle)]"
    />
  );
}

// ─── step row ─────────────────────────────────────────────────────────────────

function StepRow({
  job,
  status,
  clustersFound,
}: {
  job: StepJob;
  status: ScanStepStatus;
  clustersFound: number;
}) {
  const label = STEP_LABELS[job];
  const showCount = job === "cluster_niches" && clustersFound > 0;

  return (
    <li className="flex items-center gap-3 py-2.5">
      {/* icon column — fixed width so labels stay aligned */}
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        <StepIcon status={status} />
      </span>

      {/* label */}
      <span
        className={[
          "flex-1 text-[13px] leading-none",
          isTerminal(status) || status === "partial"
            ? "text-[var(--text-primary)]"
            : "text-[var(--text-tertiary)]",
        ].join(" ")}
      >
        {label}
      </span>

      {/* live count for the cluster step */}
      {showCount && (
        <motion.span
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 rounded-full bg-[var(--accent-muted)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--accent)]"
        >
          {clustersFound} found
        </motion.span>
      )}
    </li>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export interface ScanFeedProps {
  onDone: () => void;
}

export function ScanFeed({ onDone }: ScanFeedProps) {
  const prefersReducedMotion = useReducedMotion();
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [slow, setSlow] = useState(false);

  const startedAt = useRef(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didAutoAdvance = useRef(false);

  // Determine whether the CTA should be visible. Show it as soon as we have
  // real niches, or once all steps are done, or when we hit the slow fallback.
  const hasNiches = (status?.clustersFound ?? 0) > 0;
  const allDone = status?.done === true;
  const showCta = hasNiches || allDone || slow || fetchError;

  function stopPolling() {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  useEffect(() => {
    let consecutiveErrors = 0;

    async function poll() {
      // Slow guard — checked on every tick instead of a separate timer so we
      // don't need another ref.
      if (isSlow(startedAt.current)) {
        setSlow(true);
        stopPolling();
        return;
      }

      try {
        const res = await fetch("/api/onboarding/scan-status", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ScanStatus;
        consecutiveErrors = 0;
        setFetchError(false);
        setStatus(data);

        if (data.done) {
          stopPolling();
          // Auto-advance after a short beat so the user can see the final state.
          if (!didAutoAdvance.current) {
            didAutoAdvance.current = true;
            autoAdvanceRef.current = setTimeout(() => {
              onDone();
            }, prefersReducedMotion ? 0 : AUTO_ADVANCE_MS);
          }
        }
      } catch {
        consecutiveErrors += 1;
        // Surface error fallback after 3 consecutive failures.
        if (consecutiveErrors >= 3) {
          setFetchError(true);
          stopPolling();
        }
      }
    }

    // Fire immediately, then on interval.
    void poll();
    intervalRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      stopPolling();
      if (autoAdvanceRef.current !== null) clearTimeout(autoAdvanceRef.current);
    };
    // onDone and prefersReducedMotion are stable across the component lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive the step list: if we have a live response, use it; otherwise show
  // the 3 jobs all as pending.
  const steps: { job: StepJob; status: ScanStepStatus; itemsIngested: number }[] =
    status?.steps.map((s) => ({ ...s, job: s.job as StepJob })) ?? [
      { job: "youtube_shorts_search", status: "pending", itemsIngested: 0 },
      { job: "classify_observations", status: "pending", itemsIngested: 0 },
      { job: "cluster_niches", status: "pending", itemsIngested: 0 },
    ];

  const motionProps = prefersReducedMotion
    ? {}
    : {
        variants: fadeRise,
        initial: "initial" as const,
        animate: "animate" as const,
      };

  return (
    <motion.div
      {...motionProps}
      className="flex flex-col gap-8"
      aria-live="polite"
      aria-label="First scan progress"
    >
      {/* Heading */}
      <header className="flex flex-col gap-2">
        <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
          Finding your first niches
        </h1>
        <p className="max-w-md text-[15px] leading-relaxed text-[var(--text-secondary)]">
          Running a quick scan across YouTube to surface what&apos;s trending
          for your channel right now.
        </p>
      </header>

      {/* Step checklist */}
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] shadow-[var(--elev-1)]">
        <ul
          className="divide-y divide-[var(--border-subtle)] px-4"
          role="list"
          aria-label="Scan steps"
        >
          {steps.map((step) => (
            <StepRow
              key={step.job}
              job={step.job}
              status={step.status}
              clustersFound={status?.clustersFound ?? 0}
            />
          ))}
        </ul>

        {/* Footer: niches found counter */}
        {(status?.clustersFound ?? 0) > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.25 }}
            className="border-t border-[var(--border-subtle)] bg-[var(--surface-2)] px-4 py-3"
          >
            <p className="text-[13px] text-[var(--text-secondary)]">
              <span className="font-semibold tabular-nums text-[var(--text-primary)]">
                {status!.clustersFound}
              </span>{" "}
              niche{status!.clustersFound === 1 ? "" : "s"} ready to explore
            </p>
          </motion.div>
        )}
      </div>

      {/* Slow / error fallback message */}
      {(slow || fetchError) && (
        <motion.p
          variants={prefersReducedMotion ? undefined : fadeRise}
          initial="initial"
          animate="animate"
          className="text-sm text-[var(--text-secondary)]"
          role="status"
        >
          {fetchError
            ? "Couldn't reach the server — the scan is still running in the background."
            : "Still scanning — your niches will be ready by Monday's digest."}
        </motion.p>
      )}

      {/* CTA */}
      {showCta && (
        <motion.div
          variants={prefersReducedMotion ? undefined : fadeRise}
          initial="initial"
          animate="animate"
          className="flex flex-col gap-2"
        >
          <Button
            size="lg"
            onClick={onDone}
            className="self-start px-5"
            autoFocus
          >
            See your niches
            <ArrowRight strokeWidth={1.5} />
          </Button>
          {!allDone && !slow && (
            <p className="text-xs text-[var(--text-tertiary)]">
              You can explore now — scanning continues in the background.
            </p>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
