// src/components/lab/active-run-pane.tsx
//
// Listens for the 'lab:dispatch-start' DOM event from DispatchButton,
// POSTs to /api/lab/dispatch, and reads the SSE response with a streaming
// fetch reader. Maintains a state machine of the 4 agents' progress and
// passes that down to PipelineStrip + the 4 output cards.
//
// On job_completed: triggers a router.refresh() so the RecentDraftsPane
// re-renders with the new draft at the top.
//
// On job_failed: shows a red error block + Re-dispatch button on the
// failed agent's card.
//
// NOTE: All data-fetching, SSE handling, and DispatchButton behavior is
// untouched in this file. Only presentation / layout has been elevated.

"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import type { AgentId, AgentState, StreamEvent } from "@/lib/agents/types";
import type { StrategistOutput } from "@/lib/agents/strategist";
import type { WriterOutput } from "@/lib/agents/writer";
import type { VoiceCoachOutput } from "@/lib/agents/voice-coach";
import type { DirectorOutput } from "@/lib/agents/director";
import type { ComposerOutput } from "@/lib/agents/composer";
import { AlertTriangle, CheckCircle2, RotateCw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  PipelineStrip,
  deriveChipState,
  type AgentChipState,
} from "./pipeline-strip";
import { AGENT_LABEL } from "./agent-icons";
import { StrategistCard } from "./strategist-card";
import { WriterCard } from "./writer-card";
import { VoiceCoachCard } from "./voice-coach-card";
import { DirectorCard } from "./director-card";
import { Button } from "@/components/ui/button";

type AgentSlotBase = { state: AgentState | null; durationMs?: number };
type RunState = {
  active: boolean;
  jobId: string | null;
  topicId: string | null;
  strategist: AgentSlotBase & { output: StrategistOutput | null };
  writer: AgentSlotBase & { output: WriterOutput | null; streamedText: string };
  voiceCoach: AgentSlotBase & { output: VoiceCoachOutput | null };
  director: AgentSlotBase & { output: DirectorOutput | null };
  composer: AgentSlotBase & { output: ComposerOutput | null };
  failure: { agent: AgentId; error: string } | null;
  completed: boolean;
};

const INITIAL: RunState = {
  active: false,
  jobId: null,
  topicId: null,
  strategist: { state: null, output: null },
  writer: { state: null, output: null, streamedText: "" },
  voiceCoach: { state: null, output: null },
  director: { state: null, output: null },
  composer: { state: null, output: null },
  failure: null,
  completed: false,
};

export function ActiveRunPane() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const [run, setRun] = useState<RunState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const startRun = useCallback(async (topicId: string) => {
    // Reset state, mark active.
    setRun({ ...INITIAL, active: true, topicId });
    const controller = new AbortController();
    abortRef.current = controller;

    let res: Response;
    try {
      res = await fetch("/api/lab/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId }),
        signal: controller.signal,
      });
    } catch (err) {
      setRun((r) => ({ ...r, failure: { agent: "strategist", error: String(err) }, active: false }));
      return;
    }

    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => "");
      setRun((r) => ({ ...r, failure: { agent: "strategist", error: `HTTP ${res.status}: ${txt}` }, active: false }));
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (err) {
        if (controller.signal.aborted) return;
        setRun((r) => ({ ...r, failure: { agent: "writer", error: `stream error: ${err}` }, active: false }));
        return;
      }
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      // SSE frames are delimited by "\n\n".
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const ev = parseSseFrame(frame);
        if (ev) applyEvent(setRun, ev);
        if (ev?.type === "job_completed" || ev?.type === "job_failed") {
          // Stream is about to close; trigger a draft refresh.
          router.refresh();
          setRun((r) => ({ ...r, active: false }));
        }
      }
    }
  }, [router]);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent).detail as { topicId: string } | undefined;
      if (!detail?.topicId) return;
      startRun(detail.topicId);
    }
    window.addEventListener("lab:dispatch-start", handler);
    return () => {
      window.removeEventListener("lab:dispatch-start", handler);
      abortRef.current?.abort();
    };
  }, [startRun]);

  if (!run.active && !run.completed && !run.failure) {
    return null;
  }

  const states: Record<AgentId, AgentChipState> = {
    strategist: deriveChipState(
      run.strategist.state,
      Boolean(run.strategist.output),
      run.failure?.agent === "strategist",
    ),
    writer: deriveChipState(
      run.writer.state,
      Boolean(run.writer.output),
      run.failure?.agent === "writer",
    ),
    voice_coach: deriveChipState(
      run.voiceCoach.state,
      Boolean(run.voiceCoach.output),
      run.failure?.agent === "voice_coach",
    ),
    director: deriveChipState(
      run.director.state,
      Boolean(run.director.output),
      run.failure?.agent === "director",
    ),
    composer: deriveChipState(
      run.composer.state,
      Boolean(run.composer.output),
      run.failure?.agent === "composer",
    ),
  };

  /* Derive hero border / background tint by run status */
  const heroBorderColor = run.failure
    ? "border-[var(--danger)]/50"
    : run.completed
      ? "border-[var(--success)]/40"
      : "border-[var(--accent)]/30";

  const statusLabel = run.failure
    ? "Run failed"
    : run.completed
      ? "Draft assembled"
      : "Assembling draft…";

  return (
    <motion.section
      aria-label="Active pipeline run"
      aria-live="polite"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0, 0, 0.2, 1] }}
      className={`mb-12 overflow-hidden rounded-2xl border bg-[var(--surface-overlay)] shadow-[var(--elev-2)] backdrop-blur-[var(--glass-blur)] ${heroBorderColor}`}
    >
      {/* ── Header bar ── */}
      <header className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
        {/* Live status dot */}
        <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
          {run.active && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-60" />
          )}
          <span
            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
              run.failure
                ? "bg-[var(--danger)]"
                : run.completed
                  ? "bg-[var(--success)]"
                  : "bg-[var(--accent)]"
            }`}
          />
        </span>

        <h2 className="flex-1 text-sm font-semibold text-[var(--text-primary)]">
          {statusLabel}
        </h2>

        {/* Completion badge */}
        {run.completed && !run.failure && (
          <motion.span
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--success)]/30 bg-[var(--surface-2)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--success)]"
          >
            <CheckCircle2 className="h-3 w-3" aria-hidden />
            Done
          </motion.span>
        )}

        {/* Pipeline label */}
        <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
          live pipeline
        </span>
      </header>

      {/* ── Pipeline strip ── */}
      <div className="px-5 pt-4">
        <PipelineStrip states={states} />
      </div>

      {/* ── Agent cards — 2-col on wide, 1-col on narrow ── */}
      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <StrategistCard state={states.strategist} output={run.strategist.output} />
        <WriterCard
          state={states.writer}
          streamedText={run.writer.streamedText}
          output={run.writer.output}
        />
        <VoiceCoachCard state={states.voice_coach} output={run.voiceCoach.output} />
        <DirectorCard state={states.director} output={run.director.output} />
      </div>

      {/* ── Failure banner ── */}
      <AnimatePresence>
        {run.failure && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="mx-5 mb-5 rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/5 p-4"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--danger)]">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              {AGENT_LABEL[run.failure.agent]} failed
            </p>
            <p className="mt-2 break-all font-mono text-[11px] text-[var(--text-secondary)]">
              {run.failure.error}
            </p>
            <Button
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => run.topicId && startRun(run.topicId)}
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden />
              Re-dispatch
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function parseSseFrame(frame: string): StreamEvent | null {
  const lines = frame.split("\n");
  let eventName: string | null = null;
  let dataLine: string | null = null;
  for (const line of lines) {
    if (line.startsWith("event: ")) eventName = line.slice(7).trim();
    else if (line.startsWith("data: ")) dataLine = line.slice(6);
  }
  if (!eventName || !dataLine) return null;
  try {
    const data = JSON.parse(dataLine);
    return { type: eventName, data } as StreamEvent;
  } catch {
    return null;
  }
}

/* Merge a partial update into a slot identified by slotKey.
   We use a type assertion only on the slot value itself, not on the whole RunState. */
function patchSlot<K extends "strategist" | "writer" | "voiceCoach" | "director" | "composer">(
  r: RunState,
  key: K,
  patch: Partial<RunState[K]>,
): RunState {
  return { ...r, [key]: { ...r[key], ...patch } };
}

function applyEvent(setRun: Dispatch<SetStateAction<RunState>>, ev: StreamEvent) {
  setRun((r) => {
    switch (ev.type) {
      case "job_started":
        return { ...r, jobId: ev.data.jobId, topicId: ev.data.topicId };
      case "agent_state": {
        const key = mapAgentToKey(ev.data.agent);
        return patchSlot(r, key, { state: ev.data.state } as Partial<RunState[typeof key]>);
      }
      case "agent_output": {
        const key = mapAgentToKey(ev.data.agent);
        return patchSlot(r, key, { output: ev.data.output } as Partial<RunState[typeof key]>);
      }
      case "writer_chunk":
        return {
          ...r,
          writer: { ...r.writer, streamedText: r.writer.streamedText + ev.data.text },
        };
      case "agent_done": {
        const key = mapAgentToKey(ev.data.agent);
        return patchSlot(r, key, { durationMs: ev.data.durationMs } as Partial<RunState[typeof key]>);
      }
      case "job_completed":
        return { ...r, completed: true };
      case "job_failed":
        return { ...r, failure: { agent: ev.data.agent, error: ev.data.error } };
      default:
        return r;
    }
  });
}

function mapAgentToKey(
  agent: AgentId,
): "strategist" | "writer" | "voiceCoach" | "director" | "composer" {
  switch (agent) {
    case "strategist": return "strategist";
    case "writer": return "writer";
    case "voice_coach": return "voiceCoach";
    case "director": return "director";
    case "composer": return "composer";
  }
}
