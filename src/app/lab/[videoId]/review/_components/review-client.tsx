"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  Film,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { YourVideo } from "@/lib/supabase/repositories/your-videos";
import type {
  VideoReview,
  FeedbackAction,
} from "@/lib/supabase/repositories/video-reviews";
import { mapReviewToScorecard } from "@/lib/agents/review/verdict";
import { ReviewScorecard } from "@/components/compositions/review-scorecard";
import {
  ReviewSuggestionItem,
  type SuggestionStatus,
} from "@/components/compositions/review-suggestion-item";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tappable } from "@/components/motion";
import { fadeRise } from "@/lib/motion";

interface ReviewClientProps {
  video: YourVideo;
  review: VideoReview;
}

export function ReviewClient({ video, review }: ReviewClientProps) {
  const prefersReducedMotion = useReducedMotion();
  const [showTranscript, setShowTranscript] = useState(false);
  const [statuses, setStatuses] = useState<SuggestionStatus[]>(() =>
    review.suggestions.map(() => "open"),
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [shipAnyway, setShipAnyway] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const blocked = review.overall_verdict === "block";
  const revise = review.overall_verdict === "revise";

  async function recordFeedback(index: number, actionTaken: FeedbackAction) {
    // Optimistically reflect the decision; revert on failure.
    const next: SuggestionStatus = actionTaken === "accepted" ? "accepted" : "ignored";
    const prev = statuses[index];
    setStatuses((s) => s.map((v, i) => (i === index ? next : v)));
    try {
      const res = await fetch(`/api/lab/${video.id}/review/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoReviewId: review.id,
          suggestionIndex: index,
          actionTaken,
        }),
      });
      if (!res.ok) {
        const j: { error?: unknown } = await res.json().catch(() => ({}));
        throw new Error(
          typeof j.error === "string" ? j.error : `Request failed (${res.status})`,
        );
      }
      setActionError(null);
    } catch (e) {
      setStatuses((s) => s.map((v, i) => (i === index ? prev : v)));
      setActionError(
        `Couldn't record that decision: ${e instanceof Error ? e.message : "unknown error"}`,
      );
    }
  }

  async function schedule() {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/lab/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId: video.id }),
      });
      if (!res.ok) {
        const j: { error?: unknown } = await res.json().catch(() => ({}));
        throw new Error(
          typeof j.error === "string" ? j.error : `Schedule failed (${res.status})`,
        );
      }
      window.location.assign("/lab/drafts");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Schedule failed.");
      setBusy(false);
    }
  }

  async function confirmShipAnyway() {
    if (overrideReason.trim().length === 0) return;
    // Intentional friction gate — reason is not persisted by the schedule route.
    console.info(`[review override] ship-anyway reason for ${video.id}: ${overrideReason.trim()}`);
    await schedule();
  }

  async function reject() {
    if (!window.confirm("Reject this render? It will return to a failed state.")) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/lab/reject", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId: video.id }),
      });
      if (!res.ok) {
        const j: { error?: unknown } = await res.json().catch(() => ({}));
        throw new Error(
          typeof j.error === "string" ? j.error : `Reject failed (${res.status})`,
        );
      }
      window.location.assign("/lab/drafts");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Reject failed.");
      setBusy(false);
    }
  }

  return (
    <motion.div
      variants={prefersReducedMotion ? undefined : fadeRise}
      initial={prefersReducedMotion ? undefined : "initial"}
      animate={prefersReducedMotion ? undefined : "animate"}
      className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,420px)_1fr]"
    >
      {/* LEFT — player + transcript */}
      <section aria-label="Video preview" className="flex flex-col gap-4">
        {video.render_artifact_url ? (
          <video
            src={video.render_artifact_url}
            controls
            playsInline
            className="w-full overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-black shadow-[var(--elev-1)]"
            style={{ aspectRatio: "9 / 16" }}
          />
        ) : (
          <div
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-2)]/40 px-6 text-center shadow-[var(--elev-1)]"
            style={{ aspectRatio: "9 / 16" }}
          >
            <Film className="h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
            <p className="text-sm text-[var(--text-tertiary)]">No preview available</p>
          </div>
        )}

        {video.script && (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]">
            <Tappable>
              <button
                type="button"
                onClick={() => setShowTranscript((v) => !v)}
                aria-expanded={showTranscript}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
              >
                {showTranscript ? "Hide transcript" : "Show transcript"}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform ${showTranscript ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
            </Tappable>
            <AnimatePresence initial={false}>
              {showTranscript && (
                <motion.div
                  initial={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
                  animate={prefersReducedMotion ? undefined : { height: "auto", opacity: 1 }}
                  exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="max-h-72 overflow-y-auto border-t border-[var(--border-subtle)] px-4 py-3">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-tertiary)]">
                      {video.script}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* RIGHT — verdict, suggestions, strengths */}
      <section aria-label="Review" className="flex flex-col gap-6">
        <ReviewScorecard {...mapReviewToScorecard(review)} />

        {review.suggestions.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Suggestions
              <span className="ml-2 font-mono text-xs font-normal text-[var(--text-tertiary)]">
                {review.suggestions.length}
              </span>
            </h2>
            <div className="space-y-2">
              {review.suggestions.map((s, i) => (
                <ReviewSuggestionItem
                  key={`${s.component}-${i}`}
                  index={i}
                  text={s.suggestion_text}
                  status={statuses[i] ?? "open"}
                  onAccept={(idx) => void recordFeedback(idx, "accepted")}
                  onIgnore={(idx) => void recordFeedback(idx, "ignored")}
                />
              ))}
            </div>
          </div>
        )}

        {review.strengths.length > 0 && (
          <div className="space-y-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
              <Sparkles className="h-4 w-4 text-[var(--success)]" aria-hidden />
              What&apos;s working
            </h2>
            <ul className="space-y-2" role="list">
              {review.strengths.map((str, i) => (
                <li
                  key={`${str.component}-${i}`}
                  className="flex items-start gap-2.5 rounded-lg border border-[var(--success)]/20 bg-[color-mix(in_oklch,var(--success)_6%,transparent)] p-3"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden />
                  <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
                    {str.what_works_text}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* BOTTOM action bar — spans both columns */}
      <div className="lg:col-span-2">
        {actionError && (
          <div
            role="alert"
            className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--danger)]/30 bg-[color-mix(in_oklch,var(--danger)_8%,transparent)] px-3 py-2 text-sm text-[var(--danger)]"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">{actionError}</span>
          </div>
        )}

        <div className="flex flex-col gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 shadow-[var(--elev-1)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Tappable>
              <Button
                onClick={() => void schedule()}
                disabled={busy || blocked}
                size="default"
                className={`gap-1.5 ${
                  revise
                    ? "border-[var(--warning)]/40 bg-[color-mix(in_oklch,var(--warning)_18%,transparent)] text-[var(--warning)] hover:bg-[color-mix(in_oklch,var(--warning)_26%,transparent)]"
                    : ""
                }`}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <CalendarClock className="h-4 w-4" aria-hidden />
                )}
                {revise ? "Approve with revisions" : "Approve & Schedule"}
              </Button>
            </Tappable>

            <Tappable>
              <Button
                onClick={() => void reject()}
                disabled={busy}
                variant="destructive"
                size="default"
                className="gap-1.5"
              >
                <X className="h-4 w-4" aria-hidden />
                Reject
              </Button>
            </Tappable>
          </div>

          {blocked && (
            <Tappable>
              <Button
                onClick={() => setShipAnyway((v) => !v)}
                disabled={busy}
                variant="ghost"
                size="sm"
                className="gap-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              >
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Ship anyway
              </Button>
            </Tappable>
          )}
        </div>

        {/* Blocked override gate */}
        <AnimatePresence initial={false}>
          {blocked && shipAnyway && (
            <motion.div
              initial={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
              animate={prefersReducedMotion ? undefined : { height: "auto", opacity: 1 }}
              exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-3 rounded-xl border border-[var(--danger)]/30 bg-[color-mix(in_oklch,var(--danger)_6%,transparent)] p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      This video was blocked by review
                    </p>
                    <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                      Scheduling it anyway overrides the recommendation. Note why so the
                      decision is on the record.
                    </p>
                  </div>
                </div>
                <Textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Why are you shipping this despite the block?"
                  rows={3}
                  className="resize-none"
                />
                <div className="flex items-center gap-2">
                  <Tappable>
                    <Button
                      onClick={() => void confirmShipAnyway()}
                      disabled={busy || overrideReason.trim().length === 0}
                      variant="destructive"
                      size="sm"
                      className="gap-1.5"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Override &amp; Schedule
                    </Button>
                  </Tappable>
                  <Button
                    onClick={() => setShipAnyway(false)}
                    disabled={busy}
                    variant="ghost"
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
