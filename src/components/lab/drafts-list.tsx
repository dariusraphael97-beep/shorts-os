// src/components/lab/drafts-list.tsx
//
// Client list container that orchestrates the staggered entrance for the
// client-side draft rows (Draft / Rendered / Scheduled). It only provides
// motion orchestration + the card chrome; the row components own all
// behavior. Posted rows are server components and render via PostedList.

"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { DURATION, EASE } from "@/lib/motion";

export function DraftsList({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.ul
      initial={prefersReducedMotion ? false : "initial"}
      animate="animate"
      variants={{
        animate: {
          transition: { staggerChildren: 0.04, delayChildren: 0.02 },
        },
      }}
      transition={{ duration: DURATION.smooth, ease: EASE.entry }}
      className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] shadow-[var(--elev-1)]"
    >
      {children}
    </motion.ul>
  );
}
