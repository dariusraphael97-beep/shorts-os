import "server-only";
import type { StreamEvent } from "@/lib/agents/types";
import { LongformPlanSchema, type LongformPlan } from "@/lib/agents/longform/types";
import { clampTargetDuration } from "@/lib/longform/duration";
import { buildLongformLedgerRows, type LedgerRow } from "@/lib/longform/ledger";
import { EMPTY_LONGFORM_PLAYBOOK } from "@/lib/agents/longform/playbook";
import { runLongformWriter } from "@/lib/agents/longform/writer";
import { runStylePicker, type StylePickerResult } from "@/lib/agents/longform/style-picker";
import { runBeatPlanner } from "@/lib/agents/longform/beat-planner";
import { pickLongformVoice } from "@/lib/agents/voice-coach";

export interface LongformPipelineArgs {
  topic: string;
  targetDurationSeconds: number;
  channelId: string;
}

// All side-effecting deps are injected so the orchestrator is unit-testable with no network/DB.
export interface LongformPipelineDeps {
  runWriter: typeof runLongformWriter;
  runStylePicker: typeof runStylePicker;
  runBeatPlanner: typeof runBeatPlanner;
  pickVoice: typeof pickLongformVoice;
  createJob: (args: { channelId: string }) => Promise<{ id: string }>;
  createDraft: (args: { channelId: string; topic: string; targetDurationSeconds: number; presetId: string; plan: LongformPlan; description: string | null }) => Promise<{ id: string }>;
  recordLedger: (rows: LedgerRow[]) => Promise<void>;
  enqueueRender: (args: { yourVideoId: string }) => Promise<{ id: string }>;
  finishJob: (jobId: string) => Promise<void>;
  failJob: (jobId: string, error: string) => Promise<void>;
}

export async function* runLongformPipeline(args: LongformPipelineArgs, deps: LongformPipelineDeps): AsyncGenerator<StreamEvent> {
  const target = clampTargetDuration(args.targetDurationSeconds);
  const job = await deps.createJob({ channelId: args.channelId });
  yield { type: "job_started", data: { jobId: job.id, topicId: args.topic, channelId: args.channelId, startedAt: new Date().toISOString() } };
  const playbook = EMPTY_LONGFORM_PLAYBOOK;

  try {
    // 1. Writer
    yield { type: "agent_state", data: { agent: "writer", state: "working" } };
    const writer = await deps.runWriter({ topic: args.topic, targetDurationSeconds: target, playbook });
    yield { type: "agent_output", data: { agent: "writer", output: writer } };
    yield { type: "agent_done", data: { agent: "writer", durationMs: 0 } };

    // 2. Style-picker
    yield { type: "agent_state", data: { agent: "style_picker", state: "working" } };
    const style: StylePickerResult = await deps.runStylePicker({ topic: args.topic, angle: writer.angle, playbook });
    yield { type: "agent_output", data: { agent: "style_picker", output: style } };
    yield { type: "agent_done", data: { agent: "style_picker", durationMs: 0 } };

    // 3. Beat-planner
    yield { type: "agent_state", data: { agent: "beat_planner", state: "working" } };
    const beatPlan = await deps.runBeatPlanner({
      styleBible: style.styleBible,
      playbook,
      chapters: writer.chapters.map((c, i) => ({ index: i, title: c.title, narration: c.narration })),
    });
    yield { type: "agent_output", data: { agent: "beat_planner", output: { beatCount: beatPlan.chapters.flatMap((c) => c.beats).length } } };
    yield { type: "agent_done", data: { agent: "beat_planner", durationMs: 0 } };

    // 4. Voice
    yield { type: "agent_state", data: { agent: "voice_coach", state: "working" } };
    const voice = await deps.pickVoice({ topic: args.topic, narrationSample: writer.hook, playbook });
    yield { type: "agent_output", data: { agent: "voice_coach", output: voice } };
    yield { type: "agent_done", data: { agent: "voice_coach", durationMs: 0 } };

    // Assemble + validate the plan.
    const plan: LongformPlan = LongformPlanSchema.parse({
      topic: args.topic,
      targetDurationSeconds: target,
      presetId: style.presetId,
      styleBible: style.styleBible,
      musicMood: style.musicMood,
      angle: writer.angle,
      hook: writer.hook,
      voice: { provider: voice.provider, voiceId: voice.voiceId, speed: voice.speed, stability: voice.stability },
      estimatedWords: writer.estimatedWords,
      captionsEnabled: false,
      chapters: writer.chapters.map((c, i) => ({
        index: i,
        title: c.title,
        purpose: c.purpose,
        narration: c.narration,
        beats: beatPlan.chapters.find((bp) => bp.chapterIndex === i)?.beats ?? [],
      })),
    });

    const draft = await deps.createDraft({ channelId: args.channelId, topic: args.topic, targetDurationSeconds: target, presetId: style.presetId, plan, description: null });
    await deps.recordLedger(buildLongformLedgerRows(plan, { jobId: job.id, yourVideoId: draft.id }));
    await deps.enqueueRender({ yourVideoId: draft.id });
    await deps.finishJob(job.id);
    yield { type: "job_completed", data: { videoId: draft.id } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.failJob(job.id, message);
    yield { type: "job_failed", data: { agent: "writer", error: message } };
  }
}
