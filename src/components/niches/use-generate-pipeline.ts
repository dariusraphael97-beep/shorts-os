"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { GenerationResult } from "@/lib/agents/generation-status";
import type { JobStatus } from "@/lib/supabase/repositories/jobs";

type Phase = "idle" | "generating" | "done" | "error";

export interface GenerateState {
  phase: Phase;
  clusterId: string | null;
  currentAgent: string | null;
  status: JobStatus | null;
  result: GenerationResult;
}

const IDLE: GenerateState = { phase: "idle", clusterId: null, currentAgent: null, status: null, result: null };

export function useGeneratePipeline() {
  const [state, setState] = useState<GenerateState>(IDLE);
  const topicRef = useRef<string | null>(null);
  const clusterRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);
  useEffect(() => stop, [stop]);

  const poll = useCallback(async () => {
    const topicId = topicRef.current;
    const clusterId = clusterRef.current;
    if (!topicId || !clusterId) return;
    try {
      const res = await fetch(`/api/niches/${clusterId}/generation?topicId=${topicId}`);
      const body = (await res.json()) as {
        job: { status: JobStatus; currentAgent: string | null; progressPct: number | null } | null;
        result: GenerationResult;
      };
      if (!body.job) return;
      if (body.job.status === "succeeded") {
        stop();
        setState({ phase: "done", clusterId, currentAgent: body.job.currentAgent, status: "succeeded", result: body.result });
      } else if (body.job.status === "failed") {
        stop();
        setState({ phase: "error", clusterId, currentAgent: body.job.currentAgent, status: "failed", result: null });
        toast.error("Generation failed — try again");
      } else {
        setState({ phase: "generating", clusterId, currentAgent: body.job.currentAgent, status: body.job.status, result: null });
      }
    } catch { /* transient; next tick retries */ }
  }, [stop]);

  const start = useCallback(async (clusterId: string) => {
    if (state.phase === "generating") return;
    clusterRef.current = clusterId;
    setState({ phase: "generating", clusterId, currentAgent: "strategist", status: "running", result: null });
    try {
      const res = await fetch(`/api/niches/${clusterId}/generate`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; topicId?: string };
      if (res.status === 409) {
        setState(IDLE);
        toast.error("A generation is already running — finish it first");
        return;
      }
      if (!res.ok || !body.ok || !body.topicId) {
        setState({ phase: "error", clusterId, currentAgent: null, status: "failed", result: null });
        toast.error(body.error ?? `Generate failed (${res.status})`);
        return;
      }
      topicRef.current = body.topicId;
      stop();
      timerRef.current = setInterval(() => { void poll(); }, 2500);
    } catch (e) {
      setState({ phase: "error", clusterId, currentAgent: null, status: "failed", result: null });
      toast.error(e instanceof Error ? e.message : "Generate request failed");
    }
  }, [poll, state.phase, stop]);

  return { state, start };
}
