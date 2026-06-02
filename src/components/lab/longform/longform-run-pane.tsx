"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { StreamEvent, AgentId } from "@/lib/agents/types";
import { LongformPipelineStrip, type ChipState } from "./longform-pipeline-strip";

interface LongformDispatchDetail { topic: string; targetDurationSeconds: number; channelId: string; presetId?: string }

type RunState = {
  active: boolean;
  states: Record<AgentId, ChipState>;
  hook: string | null;
  presetId: string | null;
  beatCount: number | null;
  voiceId: string | null;
  failure: string | null;
  completed: boolean;
};

const INITIAL: RunState = {
  active: false,
  states: { strategist: "idle", writer: "idle", style_picker: "idle", beat_planner: "idle", voice_coach: "idle", director: "idle", composer: "idle" },
  hook: null, presetId: null, beatCount: null, voiceId: null, failure: null, completed: false,
};

function parseSseFrame(frame: string): StreamEvent | null {
  const lines = frame.split("\n");
  let eventName: string | null = null;
  let dataLine: string | null = null;
  for (const line of lines) {
    if (line.startsWith("event: ")) eventName = line.slice(7).trim();
    else if (line.startsWith("data: ")) dataLine = line.slice(6);
  }
  if (!eventName || !dataLine) return null;
  try { return { type: eventName, data: JSON.parse(dataLine) } as StreamEvent; } catch { return null; }
}

export function LongformRunPane() {
  const router = useRouter();
  const [run, setRun] = useState<RunState>(INITIAL);

  useEffect(() => {
    async function handler(e: Event) {
      const detail = (e as CustomEvent<LongformDispatchDetail>).detail;
      setRun({ ...INITIAL, active: true, states: { ...INITIAL.states, writer: "working" } });
      let res: Response;
      try {
        res = await fetch("/api/lab/longform/dispatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(detail) });
      } catch (err) {
        setRun((r) => ({ ...r, active: false, failure: `request failed: ${err}` }));
        return;
      }
      if (!res.ok || !res.body) { setRun((r) => ({ ...r, active: false, failure: `dispatch failed (${res.status})` })); return; }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buf += decoder.decode(chunk.value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const ev = parseSseFrame(frame);
          if (ev) applyEvent(setRun, ev);
          if (ev?.type === "job_completed") { toast.success("Longform draft ready to render"); router.refresh(); setRun((r) => ({ ...r, active: false })); }
          if (ev?.type === "job_failed") { toast.error("Generation failed"); setRun((r) => ({ ...r, active: false })); }
        }
      }
    }
    window.addEventListener("lab:longform-dispatch-start", handler as EventListener);
    return () => window.removeEventListener("lab:longform-dispatch-start", handler as EventListener);
  }, [router]);

  if (!run.active && !run.completed && !run.failure) return null;

  return (
    <section className="space-y-4 rounded-xl border border-subtle bg-surface p-5">
      <LongformPipelineStrip states={run.states} />
      <div className="grid gap-3 sm:grid-cols-2">
        <OutputCard title="Hook" value={run.hook} />
        <OutputCard title="Style" value={run.presetId} />
        <OutputCard title="Image beats" value={run.beatCount != null ? String(run.beatCount) : null} />
        <OutputCard title="Narrator" value={run.voiceId} />
      </div>
      {run.failure && <p className="text-sm text-accent-red">{run.failure}</p>}
    </section>
  );
}

function OutputCard({ title, value }: { title: string; value: string | null }) {
  return (
    <div className="rounded-lg border border-subtle bg-elevated p-3">
      <p className="text-[11px] uppercase tracking-wide text-text-muted">{title}</p>
      <p className="mt-1 text-sm text-text-primary min-h-[1.25rem]">{value ?? <span className="text-text-muted italic">…</span>}</p>
    </div>
  );
}

function applyEvent(setRun: React.Dispatch<React.SetStateAction<RunState>>, ev: StreamEvent) {
  setRun((r) => {
    switch (ev.type) {
      case "agent_state": return { ...r, states: { ...r.states, [ev.data.agent]: "working" } };
      case "agent_done": return { ...r, states: { ...r.states, [ev.data.agent]: "done" } };
      case "agent_output": {
        const out = ev.data.output as Record<string, unknown>;
        if (ev.data.agent === "writer") return { ...r, hook: typeof out.hook === "string" ? out.hook : r.hook };
        if (ev.data.agent === "style_picker") return { ...r, presetId: typeof out.presetId === "string" ? out.presetId : r.presetId };
        if (ev.data.agent === "beat_planner") return { ...r, beatCount: typeof out.beatCount === "number" ? out.beatCount : r.beatCount };
        if (ev.data.agent === "voice_coach") return { ...r, voiceId: typeof out.voiceId === "string" ? out.voiceId : r.voiceId };
        return r;
      }
      case "job_completed": return { ...r, completed: true };
      case "job_failed": return { ...r, failure: ev.data.error, states: { ...r.states, [ev.data.agent]: "failed" } };
      default: return r;
    }
  });
}
