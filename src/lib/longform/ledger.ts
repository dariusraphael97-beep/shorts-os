// src/lib/longform/ledger.ts
// Serialize a finished LongformPlan into one decision-ledger row per agent. These are
// the feedback-flywheel foundation: keyed to the draft (your_video_id) so the
// longform_decision_outcomes view can join YouTube analytics on later.
import type { LongformPlan } from "@/lib/agents/longform/types";

export interface LedgerRow {
  agentId: "writer" | "style_picker" | "beat_planner" | "voice_coach";
  decisionType: string;
  jobId: string;
  yourVideoId: string;
  inputs: Record<string, unknown>;
  chosen: Record<string, unknown>;
  reasoning: string;
}

export function buildLongformLedgerRows(
  plan: LongformPlan,
  keys: { jobId: string; yourVideoId: string },
): LedgerRow[] {
  const allBeats = plan.chapters.flatMap((c) => c.beats);
  const avgBeatSeconds = allBeats.length
    ? allBeats.reduce((sum, b) => sum + b.estDurationSeconds, 0) / allBeats.length
    : 0;
  const base = { jobId: keys.jobId, yourVideoId: keys.yourVideoId };
  return [
    {
      ...base,
      agentId: "writer",
      decisionType: "longform_script",
      inputs: { topic: plan.topic, targetDurationSeconds: plan.targetDurationSeconds },
      chosen: {
        angle: plan.angle,
        hook: plan.hook,
        chapterTitles: plan.chapters.map((c) => c.title),
        estimatedWords: plan.estimatedWords,
      },
      reasoning: plan.angle,
    },
    {
      ...base,
      agentId: "style_picker",
      decisionType: "longform_style",
      inputs: { topic: plan.topic },
      chosen: { presetId: plan.presetId, musicMood: plan.musicMood, styleBibleAspect: plan.styleBible.aspect },
      reasoning: `preset ${plan.presetId}, mood "${plan.musicMood}"`,
    },
    {
      ...base,
      agentId: "beat_planner",
      decisionType: "longform_beats",
      inputs: { chapters: plan.chapters.length },
      chosen: { beatCount: allBeats.length, avgBeatSeconds, promptPatternTags: [plan.presetId] },
      reasoning: `${allBeats.length} beats, avg ${avgBeatSeconds.toFixed(1)}s`,
    },
    {
      ...base,
      agentId: "voice_coach",
      decisionType: "longform_voice",
      inputs: { topic: plan.topic },
      chosen: { ...plan.voice },
      reasoning: `voice ${plan.voice.voiceId} @ ${plan.voice.speed}x`,
    },
  ];
}
