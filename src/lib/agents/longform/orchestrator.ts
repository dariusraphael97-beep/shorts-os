import "server-only";
import type { StreamEvent } from "@/lib/agents/types";
import { LongformPlanSchema, type LongformPlan, type ScriptOverride, type WriterOutput } from "@/lib/agents/longform/types";
import { clampTargetDuration } from "@/lib/longform/duration";
import { buildLongformLedgerRows, type LedgerRow } from "@/lib/longform/ledger";
import { EMPTY_LONGFORM_PLAYBOOK, type LongformPlaybook } from "@/lib/agents/longform/playbook";
import { runLongformWriter } from "@/lib/agents/longform/writer";
import { runStylePicker, type StylePickerResult } from "@/lib/agents/longform/style-picker";
import { runBeatPlanner } from "@/lib/agents/longform/beat-planner";
import { renderFactSheet } from "@/lib/agents/longform/researcher";
import { pickLongformVoice } from "@/lib/agents/voice-coach";
import { getStylePreset, type PresetId } from "@/lib/longform/style-presets";

// ElevenLabs "George — Warm, Captivating Storyteller" (british male). The natural longform narrator.
const ELEVENLABS_NARRATOR_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

export interface LongformPipelineArgs {
  topic: string;
  targetDurationSeconds: number;
  channelId: string;
  /** When set, the operator forced this preset in the UI — skip the style-picker LLM and lock it. */
  presetId?: PresetId;
  /** When true, persist the draft + plan but do NOT enqueue a render job (operator checkpoint). */
  planOnly?: boolean;
  /** The niche cluster this video was generated from, for outcome measurement + regenerate. */
  sourceNicheClusterId?: string;
  /** Operator/expert ground-truth facts threaded to the writer → researcher; they override web sources. */
  trustedFacts?: string[];
  /** Hand-written, fact-verified script — skips the Writer agent entirely (beat planner still runs). */
  scriptOverride?: ScriptOverride;
  /** ElevenLabs voice override for this run (e.g. a calm American narrator); default = George. */
  voiceId?: string;
}

/** The single planOnly decision — extracted so it is testable in isolation. */
export function shouldEnqueueRender(args: { planOnly?: boolean }): boolean {
  return !args.planOnly;
}

// Resolve a forced preset into a StylePickerResult without calling the LLM.
function forcedStyle(presetId: PresetId): StylePickerResult {
  const styleBible = getStylePreset(presetId);
  return { presetId, musicMood: styleBible.musicMood, rationale: "operator-selected preset", styleBible };
}

// All side-effecting deps are injected so the orchestrator is unit-testable with no network/DB.
export interface LongformPipelineDeps {
  runWriter: typeof runLongformWriter;
  runStylePicker: typeof runStylePicker;
  runBeatPlanner: typeof runBeatPlanner;
  pickVoice: typeof pickLongformVoice;
  createJob: (args: { channelId: string }) => Promise<{ id: string }>;
  createDraft: (args: { channelId: string; topic: string; targetDurationSeconds: number; presetId: string; plan: LongformPlan; description: string | null; sourceNicheClusterId?: string | null }) => Promise<{ id: string }>;
  recordLedger: (rows: LedgerRow[]) => Promise<void>;
  enqueueRender: (args: { yourVideoId: string }) => Promise<{ id: string }>;
  finishJob: (jobId: string) => Promise<void>;
  failJob: (jobId: string, error: string) => Promise<void>;
  /**
   * L2 learning store: distill the playbook from this channel's posted-video outcomes (retention-first).
   * Optional + always back-compatible — omitted (tests) or any read failure ⇒ EMPTY_LONGFORM_PLAYBOOK.
   */
  loadPlaybook?: (args: { channelId: string }) => Promise<LongformPlaybook>;
}

// An operator script becomes a Writer-shaped output: word count from the narration itself, and the
// operator's trustedFacts as the fact sheet (they are the verified ground truth for this run).
function scriptOverrideToWriterOutput(s: ScriptOverride, trustedFacts: string[] | undefined): WriterOutput {
  const estimatedWords = s.chapters.reduce((n, c) => n + c.narration.split(/\s+/).filter(Boolean).length, 0);
  const facts = (trustedFacts ?? []).map((f) => f.trim()).filter(Boolean).map((f) => ({ claim: f, detail: f }));
  return { angle: s.angle, hook: s.hook, estimatedWords, chapters: s.chapters, factSheet: { facts, uncertain: [] } };
}

export async function* runLongformPipeline(args: LongformPipelineArgs, deps: LongformPipelineDeps): AsyncGenerator<StreamEvent> {
  const target = clampTargetDuration(args.targetDurationSeconds);
  const job = await deps.createJob({ channelId: args.channelId });
  yield { type: "job_started", data: { jobId: job.id, topicId: args.topic, channelId: args.channelId, startedAt: new Date().toISOString() } };
  // L2: load the channel's learned playbook (retention-first). Falls back to EMPTY in L1 / cold start.
  const playbook = deps.loadPlaybook ? await deps.loadPlaybook({ channelId: args.channelId }) : EMPTY_LONGFORM_PLAYBOOK;

  try {
    // 1. Writer (skipped when the operator provided the script)
    yield { type: "agent_state", data: { agent: "writer", state: "working" } };
    const writer = args.scriptOverride
      ? scriptOverrideToWriterOutput(args.scriptOverride, args.trustedFacts)
      : await deps.runWriter({ topic: args.topic, targetDurationSeconds: target, playbook, trustedFacts: args.trustedFacts });
    yield { type: "agent_output", data: { agent: "writer", output: writer } };
    yield { type: "agent_done", data: { agent: "writer", durationMs: 0 } };

    // 2. Style-picker (skipped when the operator forced a preset in the UI)
    yield { type: "agent_state", data: { agent: "style_picker", state: "working" } };
    const style: StylePickerResult = args.presetId
      ? forcedStyle(args.presetId)
      : await deps.runStylePicker({ topic: args.topic, angle: writer.angle, playbook });
    yield { type: "agent_output", data: { agent: "style_picker", output: style } };
    yield { type: "agent_done", data: { agent: "style_picker", durationMs: 0 } };

    // 3. Beat-planner
    yield { type: "agent_state", data: { agent: "beat_planner", state: "working" } };
    const beatPlan = await deps.runBeatPlanner({
      styleBible: style.styleBible,
      playbook,
      chapters: writer.chapters.map((c, i) => ({ index: i, title: c.title, narration: c.narration })),
      grounding: renderFactSheet(writer.factSheet),
    });
    yield { type: "agent_output", data: { agent: "beat_planner", output: { beatCount: beatPlan.chapters.flatMap((c) => c.beats).length } } };
    yield { type: "agent_done", data: { agent: "beat_planner", durationMs: 0 } };

    // 4. Voice
    yield { type: "agent_state", data: { agent: "voice_coach", state: "working" } };
    // Longform narrator = ElevenLabs "George" (warm British storyteller) — far more natural than
    // Cartesia TTS. Keep the voice-coach pick for pacing/rationale, but force the provider+voice.
    // Per-run voiceId override (e.g. a calm American narrator) replaces the George default.
    const picked = await deps.pickVoice({ topic: args.topic, narrationSample: writer.hook, playbook, presetId: style.presetId });
    const voice = { ...picked, provider: "elevenlabs", voiceId: args.voiceId?.trim() || ELEVENLABS_NARRATOR_VOICE_ID };
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
      factSheet: writer.factSheet,
    });

    const draft = await deps.createDraft({ channelId: args.channelId, topic: args.topic, targetDurationSeconds: target, presetId: style.presetId, plan, description: null, sourceNicheClusterId: args.sourceNicheClusterId ?? null });
    await deps.recordLedger(buildLongformLedgerRows(plan, { jobId: job.id, yourVideoId: draft.id }));
    if (shouldEnqueueRender(args)) {
      await deps.enqueueRender({ yourVideoId: draft.id });
    }
    await deps.finishJob(job.id);
    yield { type: "job_completed", data: { videoId: draft.id } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.failJob(job.id, message);
    yield { type: "job_failed", data: { agent: "writer", error: message } };
  }
}
