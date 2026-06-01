// src/lib/agents/orchestrator.ts
//
// The pipeline driver. Calls Strategist → Writer → Voice Coach → Director
// in sequence as an async generator that yields StreamEvents. Owns all
// database writeback (jobs, agent_messages, decisions, your_videos, agents).
// The /api/lab/dispatch route wraps these yielded events into Server-Sent
// Events for the Lab UI.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentId, StreamEvent } from "./types";
import { getDefaultChannel } from "@/lib/supabase/repositories/channels";
import { getTopicById } from "@/lib/supabase/repositories/topic-queue";
import {
  createProduceVideoJob,
  getActiveProduceVideoJob,
  updateJobProgress,
  finishJobSuccess,
  finishJobFailure,
} from "@/lib/supabase/repositories/jobs";
import { updateAgentState } from "@/lib/supabase/repositories/agents";
import { reportAssistant } from "@/lib/agents/dashboard/report";
import { recordAgentMessage } from "@/lib/supabase/repositories/agent-messages";
import { recordDecision } from "@/lib/supabase/repositories/decisions";
import { createVideoDraft } from "@/lib/supabase/repositories/your-videos";
import { runStrategist, type StrategistOutput } from "./strategist";
import { runWriter, type WriterOutput } from "./writer";
import { runVoiceCoach, type VoiceCoachOutput } from "./voice-coach";
import { runDirector, type DirectorOutput } from "./director";
import { runComposer } from "./composer";
import { computeRecentMix, isFormatMixDrift } from "./format-mix";
import { createOperatorAlert } from "@/lib/supabase/repositories/operator-alerts";
import { VOICE_POOL, VISUAL_TREATMENTS } from "./constants";

export class ConcurrentRunError extends Error {
  constructor(public activeJobId: string) {
    super(`A produce_video job is already running (jobId=${activeJobId})`);
    this.name = "ConcurrentRunError";
  }
}

export async function* runPipeline(args: {
  topicId: string;
  supabase: SupabaseClient;
}): AsyncGenerator<StreamEvent> {
  const { topicId, supabase } = args;

  // 1. Concurrency check
  const existing = await getActiveProduceVideoJob(supabase);
  if (existing) throw new ConcurrentRunError(existing.id);

  // 2. Load context
  const topic = await getTopicById(supabase, topicId);
  const channel = await getDefaultChannel(supabase);

  // 3. Create the job row + emit job_started
  const job = await createProduceVideoJob(supabase, { topicId, channelId: channel.id });
  const startedAt = new Date().toISOString();
  yield {
    type: "job_started",
    data: { jobId: job.id, topicId: topic.id, channelId: channel.id, startedAt },
  };
  await reportAssistant(supabase, 'generator', 'working', `Producing draft for topic ${topic.id}`);

  const progressByAgent: Record<AgentId, number> = {
    strategist: 20,
    writer: 60,
    voice_coach: 80,
    director: 95,
    composer: 95,
  };

  let strategistOut: StrategistOutput;
  let writerOut: WriterOutput;
  let voiceCoachOut: VoiceCoachOutput;
  let directorOut: DirectorOutput;
  let currentAgent: AgentId = "strategist";

  try {
    // ────── Strategist ──────
    currentAgent = "strategist";
    yield* lifecycleBefore(supabase, "strategist", `Dispatching: ${topic.title}`);
    const stratStart = Date.now();
    strategistOut = await runStrategist({
      job,
      topic,
      channel,
      previousOutputs: {} as never,
    });
    yield { type: "agent_output", data: { agent: "strategist", output: strategistOut } };
    await recordAgentMessage(supabase, {
      jobId: job.id,
      fromAgent: "strategist",
      toAgent: "writer",
      intent: "dispatch",
      payload: strategistOut as unknown as Record<string, unknown>,
    });
    await recordDecision(supabase, {
      jobId: job.id,
      agentId: "strategist",
      decisionType: "topic_dispatch",
      inputs: { topic: { id: topic.id, title: topic.title }, channel: { id: channel.id } },
      chosen: strategistOut as unknown as Record<string, unknown>,
      reasoning: strategistOut.rationale,
    });
    yield* lifecycleAfter(supabase, job.id, "strategist", progressByAgent.strategist, Date.now() - stratStart);

    // ────── Format-mix drift check (warn-only in Phase 4) ──────
    try {
      const currentMix = await computeRecentMix(supabase, { channelId: channel.id, lookbackDays: 30 });
      if (isFormatMixDrift(currentMix, channel.target_format_mix)) {
        await createOperatorAlert(supabase, {
          channelId: channel.id,
          category: "format_mix_drift",
          severity: "warn",
          message: `Recent mix ${Math.round(currentMix.explainer * 100)}/${Math.round(currentMix.compilation * 100)} drifts from target ${Math.round(channel.target_format_mix.explainer * 100)}/${Math.round(channel.target_format_mix.compilation * 100)}.`,
          context: { current_mix: currentMix, target_mix: channel.target_format_mix },
        });
      }
    } catch {
      // drift detection is informational; never block dispatch on its failure
    }

    // ────── Branch on selected_format ──────
    if (strategistOut.selected_format === "compilation") {
      currentAgent = "composer";
      yield* lifecycleBefore(supabase, "composer", `Composing: ${topic.title}`);
      const compStart = Date.now();
      const { output: composerOut, draftId, fallbackUsed } = await runComposer({
        job,
        topic,
        channel: channel as never,
        strategist: strategistOut,
        supabase,
      });
      yield { type: "agent_output", data: { agent: "composer", output: composerOut } };
      await recordAgentMessage(supabase, {
        jobId: job.id,
        fromAgent: "strategist",
        toAgent: "composer",
        intent: "compilation_brief",
        payload: strategistOut as unknown as Record<string, unknown>,
      });
      await recordDecision(supabase, {
        jobId: job.id,
        agentId: "composer",
        decisionType: "compilation_assembly",
        inputs: { topic_id: topic.id, dispatch_directive: strategistOut.dispatch_directive },
        chosen: { ...(composerOut as unknown as Record<string, unknown>), draft_id: draftId, fallback: fallbackUsed },
        reasoning: fallbackUsed
          ? `${composerOut.rationale} [fallback: LLM validation failed twice]`
          : composerOut.rationale,
      });
      yield* lifecycleAfter(supabase, job.id, "composer", progressByAgent.composer, Date.now() - compStart);
      await finishJobSuccess(supabase, job.id);
      await reportAssistant(supabase, 'generator', 'idle', null, { activityType: 'produced_draft', summary: `Produced draft ${draftId}`, payload: { videoId: draftId } });
      yield { type: "job_completed", data: { videoId: draftId } };
      return;
    }

    // ────── Writer ──────
    currentAgent = "writer";
    yield* lifecycleBefore(supabase, "writer", `Scripting: ${topic.title}`);
    const writerStart = Date.now();
    let writerOutLocal: WriterOutput | null = null;
    for await (const ev of runWriter({
      job,
      topic,
      channel,
      previousOutputs: { strategist: strategistOut },
    })) {
      if (ev.type === "chunk") {
        yield { type: "writer_chunk", data: { text: ev.text } };
      } else {
        writerOutLocal = ev.output;
      }
    }
    if (!writerOutLocal) throw new Error("writer never yielded done event");
    writerOut = writerOutLocal;
    yield { type: "agent_output", data: { agent: "writer", output: writerOut } };
    await recordAgentMessage(supabase, {
      jobId: job.id,
      fromAgent: "writer",
      toAgent: "voice_coach",
      intent: "script",
      payload: writerOut as unknown as Record<string, unknown>,
    });
    await recordDecision(supabase, {
      jobId: job.id,
      agentId: "writer",
      decisionType: "script",
      inputs: { topic_id: topic.id, dispatch_directive: strategistOut.dispatch_directive },
      chosen: writerOut as unknown as Record<string, unknown>,
      reasoning: null,
    });
    yield* lifecycleAfter(supabase, job.id, "writer", progressByAgent.writer, Date.now() - writerStart);

    // ────── Voice Coach ──────
    currentAgent = "voice_coach";
    yield* lifecycleBefore(supabase, "voice_coach", `Picking voice for: ${topic.title}`);
    const vcStart = Date.now();
    voiceCoachOut = await runVoiceCoach({
      job,
      topic,
      channel,
      previousOutputs: { strategist: strategistOut, writer: writerOut },
    });
    yield { type: "agent_output", data: { agent: "voice_coach", output: voiceCoachOut } };
    await recordAgentMessage(supabase, {
      jobId: job.id,
      fromAgent: "voice_coach",
      toAgent: "director",
      intent: "voice_pick",
      payload: voiceCoachOut as unknown as Record<string, unknown>,
    });
    await recordDecision(supabase, {
      jobId: job.id,
      agentId: "voice_coach",
      decisionType: "voice_pick",
      inputs: { script_preview: writerOut.script.slice(0, 200), channel_persona: channel.persona },
      alternatives: VOICE_POOL as unknown as unknown[],
      chosen: voiceCoachOut as unknown as Record<string, unknown>,
      reasoning: voiceCoachOut.rationale,
    });
    yield* lifecycleAfter(supabase, job.id, "voice_coach", progressByAgent.voice_coach, Date.now() - vcStart);

    // ────── Director ──────
    currentAgent = "director";
    yield* lifecycleBefore(supabase, "director", `Directing: ${topic.title}`);
    const dirStart = Date.now();
    directorOut = await runDirector({
      job,
      topic,
      channel,
      previousOutputs: { strategist: strategistOut, writer: writerOut, voiceCoach: voiceCoachOut },
    });
    yield { type: "agent_output", data: { agent: "director", output: directorOut } };
    await recordAgentMessage(supabase, {
      jobId: job.id,
      fromAgent: "director",
      toAgent: null,
      intent: "shot_list",
      payload: directorOut as unknown as Record<string, unknown>,
    });
    await recordDecision(supabase, {
      jobId: job.id,
      agentId: "director",
      decisionType: "shot_list",
      inputs: { script_preview: writerOut.script.slice(0, 200), voice_id: voiceCoachOut.voice_id },
      alternatives: [...VISUAL_TREATMENTS],
      chosen: directorOut as unknown as Record<string, unknown>,
      reasoning: directorOut.rationale,
    });
    yield* lifecycleAfter(supabase, job.id, "director", progressByAgent.director, Date.now() - dirStart);

    // ────── Save draft + complete ──────
    const draft = await createVideoDraft(supabase, {
      channelId: channel.id,
      topicQueueId: topic.id,
      title: topic.title,
      script: writerOut.script,
      voiceProvider: voiceCoachOut.provider,
      voiceId: voiceCoachOut.voice_id,
      visualTreatment: directorOut.visual_treatment,
      durationSeconds: writerOut.estimated_duration_seconds,
      captionProps: directorOut.caption_props,
    });
    await finishJobSuccess(supabase, job.id);
    await reportAssistant(supabase, 'generator', 'idle', null, { activityType: 'produced_draft', summary: `Produced draft ${draft.id}`, payload: { videoId: draft.id } });
    yield { type: "job_completed", data: { videoId: draft.id } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await updateAgentState(supabase, currentAgent, "idle", null);
    } catch { /* ignore secondary failures */ }
    try {
      await finishJobFailure(supabase, job.id, message);
    } catch { /* ignore */ }
    await reportAssistant(supabase, 'generator', 'errored', message.slice(0, 160));
    yield { type: "job_failed", data: { agent: currentAgent, error: message } };
  }
}

async function* lifecycleBefore(
  supabase: SupabaseClient,
  agent: AgentId,
  task: string,
): AsyncGenerator<StreamEvent> {
  await updateAgentState(supabase, agent, "thinking", task);
  yield { type: "agent_state", data: { agent, state: "thinking" } };

  await updateAgentState(supabase, agent, "working", task);
  yield { type: "agent_state", data: { agent, state: "working" } };
}

async function* lifecycleAfter(
  supabase: SupabaseClient,
  jobId: string,
  agent: AgentId,
  progressPct: number,
  durationMs: number,
): AsyncGenerator<StreamEvent> {
  await updateAgentState(supabase, agent, "idle", null);
  await updateJobProgress(supabase, jobId, { currentAgent: agent, progressPct });
  yield { type: "agent_state", data: { agent, state: "idle" } };
  yield { type: "agent_done", data: { agent, durationMs } };
}
