// src/lib/agents/longform/playbook.ts
// Per-agent playbook. EMPTY in L1 — every agent reads it so Phase L2 (the learning
// engine that distills these from posted-video outcomes) needs zero re-architecture.
import type { PresetId } from "@/lib/longform/style-presets";

export interface LongformPlaybook {
  writer: { exemplarHooks: string[]; winningAngleNotes: string[] };
  stylePicker: { presetWinsByGenre: Partial<Record<string, PresetId>> };
  beatPlanner: { promptPatternTags: string[]; bestBeatSeconds: number | null };
  voice: { bestVoiceIdByGenre: Partial<Record<string, string>> };
}

export const EMPTY_LONGFORM_PLAYBOOK: LongformPlaybook = {
  writer: { exemplarHooks: [], winningAngleNotes: [] },
  stylePicker: { presetWinsByGenre: {} },
  beatPlanner: { promptPatternTags: [], bestBeatSeconds: null },
  voice: { bestVoiceIdByGenre: {} },
};
