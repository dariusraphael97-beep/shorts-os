"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Sparkles, X } from "lucide-react";
import { fadeRise } from "@/lib/motion";

/**
 * Welcome banner shown once after the onboarding wizard lands the operator on
 * Mission Control (?onboarded=1). Client-only so it can be dismissed without a
 * navigation; the URL param is harmless if it lingers.
 */
export function OnboardedCallout() {
  const prefersReducedMotion = useReducedMotion();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

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
      role="status"
      className="relative flex items-start gap-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--accent)]/40 bg-[var(--accent-muted)] px-4 py-3"
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)] text-[var(--accent-foreground)]">
        <Sparkles className="h-4 w-4" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--text-primary)]">
          You&apos;re all set
        </p>
        <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
          Your first niche scan is running — a ranked shortlist arrives by Monday&apos;s digest.
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] outline-none transition-colors hover:bg-[var(--accent)]/15 hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <X className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </motion.div>
  );
}
