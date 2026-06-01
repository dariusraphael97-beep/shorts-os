"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DURATION, EASE } from "@/lib/motion";

const POLL_INTERVAL_MS = 5000;

const CHECKS = [
  "Title",
  "Thumbnail",
  "Hook",
  "Pacing",
  "Description SEO",
  "Audio",
  "Visual",
] as const;

export function ReviewInProgress({ videoId }: { videoId: string }) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const res = await fetch(`/api/lab/${videoId}/review`, {
          headers: { accept: "application/json" },
        });
        if (!res.ok) return;
        const json: unknown = await res.json();
        const review =
          typeof json === "object" && json !== null && "review" in json
            ? (json as { review: unknown }).review
            : null;
        if (!cancelled && review !== null) {
          router.refresh();
        }
      } catch {
        // Network blips are non-fatal — the next tick retries.
      } finally {
        inFlightRef.current = false;
      }
    }

    const id = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [videoId, router]);

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col items-center gap-6 px-6 py-14 text-center">
        {/* Animated badge */}
        <div className="relative">
          {!prefersReducedMotion && (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-2xl bg-[var(--accent)]/15"
              animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2.4, ease: EASE.standard, repeat: Infinity }}
            />
          )}
          <motion.div
            className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]"
            animate={prefersReducedMotion ? undefined : { rotate: [0, 4, -4, 0] }}
            transition={{ duration: 4, ease: EASE.standard, repeat: Infinity }}
          >
            <ShieldCheck className="h-7 w-7" aria-hidden />
          </motion.div>
        </div>

        <div className="max-w-sm space-y-2">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Running pre-publish QA…
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            The reviewer is grading this video across a 7-point check. This usually
            takes a moment — the page will update on its own when it&apos;s done.
          </p>
        </div>

        {/* 7-point check, gently shimmering */}
        <ul className="flex flex-wrap items-center justify-center gap-2" role="list">
          {CHECKS.map((label, i) => (
            <motion.li
              key={label}
              className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)]/50 px-2.5 py-1 font-mono text-[11px] text-[var(--text-tertiary)]"
              animate={prefersReducedMotion ? undefined : { opacity: [0.45, 1, 0.45] }}
              transition={{
                duration: 1.8,
                ease: EASE.standard,
                repeat: Infinity,
                delay: i * 0.18,
              }}
            >
              {label}
            </motion.li>
          ))}
        </ul>

        <p
          className="text-[11px] text-[var(--text-tertiary)]"
          style={{ transitionDuration: `${DURATION.quick}s` }}
        >
          Checking for results every 5 seconds…
        </p>
      </CardContent>
    </Card>
  );
}
