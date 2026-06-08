"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { parseSseFrame } from "@/components/niches/studio/sse";
import type { AgentId } from "@/lib/agents/types";

type StepState = "idle" | "working" | "done" | "failed";

const STEPS: { id: AgentId; label: string; hint: string }[] = [
  { id: "writer", label: "Writer", hint: "Shaping the hook and script" },
  { id: "style_picker", label: "Style picker", hint: "Choosing the visual look" },
  { id: "beat_planner", label: "Beat planner", hint: "Laying out the shot beats" },
  { id: "voice_coach", label: "Voice", hint: "Tuning the narration" },
];

export function StudioPlanningClient() {
  const router = useRouter();
  const params = useSearchParams();
  const clusterId = params.get("cluster");
  const topic = params.get("topic") ?? undefined;
  const [states, setStates] = useState<Record<string, StepState>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const started = useRef(false);

  // ── Data/effect contract (do not change): read params → POST /plan →
  //    stream-parse SSE frames split on "\n\n" → redirect on job_completed.
  //
  // Fire-and-forget by design: NO AbortController. The plan stream is short-lived
  // (<1 min) and the `started` ref guards against a double POST. Do NOT add an
  // abort-on-unmount cleanup here — React StrictMode (dev) mounts twice, so the
  // cleanup would cancel the one in-flight run while the ref blocks the retry,
  // leaving the stepper stuck on "Waiting" forever.
  useEffect(() => {
    if (started.current || !clusterId) return;
    started.current = true;
    void (async () => {
      const fail = (err: unknown) =>
        setFailure(`Plan failed (${err instanceof Error ? err.message : String(err)})`);
      let res: Response;
      try {
        res = await fetch("/api/niches/studio/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clusterId, topic }),
        });
      } catch (err) {
        fail(err);
        return;
      }
      if (!res.ok || !res.body) {
        setFailure(`Plan failed (${res.status})`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buf += decoder.decode(chunk.value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const ev = parseSseFrame(frame);
            if (!ev) continue;
            if (ev.type === "agent_state") setStates((s) => ({ ...s, [ev.data.agent]: "working" }));
            if (ev.type === "agent_done") setStates((s) => ({ ...s, [ev.data.agent]: "done" }));
            if (ev.type === "job_failed") {
              setStates((s) => ({ ...s, [ev.data.agent]: "failed" }));
              setFailure(ev.data.error);
            }
            if (ev.type === "job_completed") router.replace(`/niches/studio/${ev.data.videoId}`);
          }
        }
      } catch (err) {
        fail(err);
      }
    })();
  }, [clusterId, topic, router]);

  if (!clusterId) return <MissingClusterState />;

  const activeLabel =
    STEPS.find((s) => states[s.id] === "working")?.hint ??
    (failure ? "Something went wrong" : "Warming up the studio");

  return (
    <div className="mx-auto mt-2 max-w-xl">
      <PlanningCard
        states={states}
        failure={failure}
        activeLabel={activeLabel}
        onRetry={() => {
          // Re-run the same plan from scratch.
          window.location.reload();
        }}
      />
    </div>
  );
}

// ─── Planning card ────────────────────────────────────────────────────────────

interface PlanningCardProps {
  states: Record<string, StepState>;
  failure: string | null;
  activeLabel: string;
  onRetry: () => void;
}

function PlanningCard({ states, failure, activeLabel, onRetry }: PlanningCardProps) {
  const allDone = STEPS.every((s) => states[s.id] === "done");

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] shadow-sm">
      {/* Status line — the one prominent thing happening */}
      <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-6 py-5">
        <StatusGlyph failure={!!failure} done={allDone} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
            {failure ? "Planning stopped" : allDone ? "Handing off to the cockpit" : activeLabel}
          </p>
          <p className="mt-0.5 text-[13px] text-[var(--text-tertiary)]">
            {failure
              ? "You can retry or head back to the niche."
              : "This usually takes under a minute."}
          </p>
        </div>
      </div>

      {/* Stepper */}
      <ol className="px-6 py-5">
        {STEPS.map((step, i) => (
          <Step
            key={step.id}
            label={step.label}
            hint={step.hint}
            state={states[step.id] ?? "idle"}
            isLast={i === STEPS.length - 1}
          />
        ))}
      </ol>

      {/* Failure surface */}
      {failure && (
        <div className="border-t border-[var(--border-subtle)] px-6 py-5">
          <div className="rounded-xl border border-[var(--danger)]/25 bg-[var(--danger)]/[0.06] p-4">
            <p className="text-[13px] font-medium text-[var(--danger)]">Planning failed</p>
            <p className="mt-1 break-words font-mono text-[12px] leading-relaxed text-[var(--text-secondary)]">
              {failure}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex h-8 items-center rounded-lg border border-[var(--border-strong)] bg-[var(--surface-1)] px-3 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--accent-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step row ─────────────────────────────────────────────────────────────────

interface StepProps {
  label: string;
  hint: string;
  state: StepState;
  isLast: boolean;
}

function Step({ label, hint, state, isLast }: StepProps) {
  const active = state === "working";
  const done = state === "done";
  const failed = state === "failed";

  return (
    <li className="relative flex gap-4 pb-5 last:pb-0">
      {/* Connector rail */}
      {!isLast && (
        <span
          aria-hidden
          className={`absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px transition-colors duration-500 ${
            done ? "bg-[var(--accent)]/30" : "bg-[var(--border-subtle)]"
          }`}
        />
      )}

      <StepIndicator state={state} />

      <div className="min-w-0 pt-0.5">
        <p
          className={`text-sm font-medium transition-colors duration-300 ${
            done || active || failed
              ? "text-[var(--text-primary)]"
              : "text-[var(--text-tertiary)]"
          }`}
        >
          {label}
        </p>
        <p className="mt-0.5 text-[13px] text-[var(--text-tertiary)]">
          {failed ? "Failed" : done ? "Done" : active ? hint : "Waiting"}
        </p>
      </div>
    </li>
  );
}

// ─── Indicators ───────────────────────────────────────────────────────────────

function StepIndicator({ state }: { state: StepState }) {
  const reduce = useReducedMotion();

  if (state === "done") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-foreground)]">
        <motion.svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden
          initial={reduce ? false : { scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 28 }}
        >
          <path d="M3.5 8.5l3 3 6-6.5" />
        </motion.svg>
      </span>
    );
  }

  if (state === "failed") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--danger)]/40 bg-[var(--danger)]/10 text-[var(--danger)]">
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="h-3.5 w-3.5"
          aria-hidden
        >
          <path d="M5 5l6 6M11 5l-6 6" />
        </svg>
      </span>
    );
  }

  if (state === "working") {
    return (
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--accent)]/40 bg-[var(--accent-muted)]">
        {!reduce && (
          <motion.span
            className="absolute inset-0 rounded-full bg-[var(--accent)]/20"
            animate={{ scale: [1, 1.45], opacity: [0.5, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
            aria-hidden
          />
        )}
        <motion.span
          className="h-2 w-2 rounded-full bg-[var(--accent)]"
          animate={reduce ? undefined : { opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        />
      </span>
    );
  }

  // idle
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--border-strong)]" aria-hidden />
    </span>
  );
}

function StatusGlyph({ failure, done }: { failure: boolean; done: boolean }) {
  const reduce = useReducedMotion();

  if (failure) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 text-[var(--danger)]">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" className="h-4.5 w-4.5" aria-hidden>
          <path d="M10 6.5v4.5M10 13.5h.01" />
          <circle cx="10" cy="10" r="7" />
        </svg>
      </span>
    );
  }

  if (done) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-foreground)]">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5" aria-hidden>
          <path d="M4.5 10.5l4 4 7-8" />
        </svg>
      </span>
    );
  }

  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--accent-muted)] text-[var(--accent)]">
      <motion.span
        className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent"
        animate={reduce ? undefined : { rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
        aria-hidden
      />
    </span>
  );
}

// ─── Missing-input state ──────────────────────────────────────────────────────

function MissingClusterState() {
  return (
    <div className="mx-auto mt-2 max-w-xl">
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-1)] px-8 py-14 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-tertiary)]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
            <path d="M12 16v-4M12 8h.01" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">No niche selected</p>
          <p className="mx-auto mt-1 max-w-xs text-[13px] text-[var(--text-secondary)]">
            Open a niche and hit Generate to start planning a video here.
          </p>
        </div>
        <a
          href="/niches"
          className="inline-flex h-9 items-center rounded-lg bg-[var(--accent)] px-4 text-[13px] font-medium text-[var(--accent-foreground)] transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
        >
          Browse niches
        </a>
      </div>
    </div>
  );
}
