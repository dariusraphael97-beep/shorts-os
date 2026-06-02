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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AgentId, AgentState, StreamEvent } from "@/lib/agents/types";
import type { StrategistOutput } from "@/lib/agents/strategist";
import type { WriterOutput } from "@/lib/agents/writer";
import type { VoiceCoachOutput } from "@/lib/agents/voice-coach";
import type { DirectorOutput } from "@/lib/agents/director";
import type { ComposerOutput } from "@/lib/agents/composer";
import {
  PipelineStrip,
  deriveChipState,
  type AgentChipState,
} from "./pipeline-strip";
import { StrategistCard } from "./strategist-card";
import { WriterCard } from "./writer-card";
import { VoiceCoachCard } from "./voice-coach-card";
import { DirectorCard } from "./director-card";

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
    style_picker: "idle",
    beat_planner: "idle",
  };

  return (
    <section className="space-y-4">
      <PipelineStrip states={states} />
      <div className="space-y-3">
        <StrategistCard state={states.strategist} output={run.strategist.output} />
        <WriterCard
          state={states.writer}
          streamedText={run.writer.streamedText}
          output={run.writer.output}
        />
        <VoiceCoachCard state={states.voice_coach} output={run.voiceCoach.output} />
        <DirectorCard state={states.director} output={run.director.output} />
      </div>

      {run.failure && (
        <div className="rounded-lg border border-accent-red/60 bg-accent-red/5 p-4">
          <p className="text-sm text-accent-red font-medium">
            ✗ {run.failure.agent} failed
          </p>
          <p className="text-xs font-mono text-text-secondary mt-1">{run.failure.error}</p>
          <button
            className="mt-3 px-3 py-1.5 rounded bg-accent-electric text-app text-xs font-medium hover:opacity-90"
            onClick={() => run.topicId && startRun(run.topicId)}
          >
            Re-dispatch
          </button>
        </div>
      )}
    </section>
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

function applyEvent(setRun: React.Dispatch<React.SetStateAction<RunState>>, ev: StreamEvent) {
  setRun((r) => {
    switch (ev.type) {
      case "job_started":
        return { ...r, jobId: ev.data.jobId, topicId: ev.data.topicId };
      case "agent_state": {
        const slotKey = mapAgentToKey(ev.data.agent);
        if (!slotKey) return r;
        return { ...r, [slotKey]: { ...(r as any)[slotKey], state: ev.data.state } } as RunState;
      }
      case "agent_output": {
        const slotKey = mapAgentToKey(ev.data.agent);
        if (!slotKey) return r;
        return { ...r, [slotKey]: { ...(r as any)[slotKey], output: ev.data.output } } as RunState;
      }
      case "writer_chunk":
        return {
          ...r,
          writer: { ...r.writer, streamedText: r.writer.streamedText + ev.data.text },
        };
      case "agent_done": {
        const slotKey = mapAgentToKey(ev.data.agent);
        if (!slotKey) return r;
        return { ...r, [slotKey]: { ...(r as any)[slotKey], durationMs: ev.data.durationMs } } as RunState;
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
): "strategist" | "writer" | "voiceCoach" | "director" | "composer" | null {
  switch (agent) {
    case "strategist": return "strategist";
    case "writer": return "writer";
    case "voice_coach": return "voiceCoach";
    case "director": return "director";
    case "composer": return "composer";
    default: return null;
  }
}
