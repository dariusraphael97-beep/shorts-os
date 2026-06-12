// src/lib/agents/longform/playbook.ts
// Per-agent playbook. EMPTY in L1 — every agent reads it. Phase L2 (the learning engine in
// playbook-distiller.ts + the loadLongformPlaybook repo) populates it from posted-video outcomes.
//
// RANKING PRINCIPLE (B58 post-mortem, 2026-06): the metric that predicts algorithm punishment in
// 2026 is NOT CTR but "Quality CTR" — a high click rate paired with a weak first-30s hold gets
// demoted on Browse. So every "winning" list here is ranked first-30s-retention-FIRST; CTR is only a
// tie-breaker. A high-CTR / slow-open video is explicitly NOT a teachable winner (see WINNER floor in
// playbook-distiller.ts). The retention block carries the channel's bar so agents can target it.
import type { PresetId } from "@/lib/longform/style-presets";

/**
 * One distilled exemplar carrying the retention evidence that ranked it. Ordering across exemplars is
 * ALWAYS first-30s-retention-first (then 60s, then peer-relative retention, then CTR). CTR never
 * outranks retention — a hook that merely earned clicks loses to one that held the open.
 */
export interface RankedExemplar {
  /** The reusable pattern: hook text, angle note, title formula, or thumbnail combo. */
  text: string;
  /** Audience retention through the first 30s, 0–1+ (YouTube audienceWatchRatio). PRIMARY signal. */
  first30sRetention: number | null;
  /** Audience retention through the first 60s, 0–1+. Secondary signal. */
  first60sRetention: number | null;
  /** YouTube relativeRetentionPerformance over the opening (0–1; 0.5 = median peer). Tertiary signal. */
  relativeRetentionOpening: number | null;
  /** Click-through rate %. Lowest-priority tie-breaker only — NEVER the primary key. */
  ctrPct: number | null;
  /** The your_videos.id this was distilled from, for audit + regenerate. */
  sourceVideoId: string | null;
}

/** Channel-level retention bar so every agent can target "what good looks like" — not just emulate text. */
export interface RetentionBenchmarks {
  /** Median first-30s retention across measured posted videos, 0–1+. The bar a new hook must clear. */
  medianFirst30sRetention: number | null;
  /** Median first-60s retention across measured posted videos, 0–1+. */
  medianFirst60sRetention: number | null;
  /** First-30s retention of the single best video, 0–1+ — the stretch target. */
  bestFirst30sRetention: number | null;
  /** How many posted videos carried a usable retention reading. 0 ⇒ cold start (playbook == EMPTY). */
  sampleSize: number;
}

export interface LongformPlaybook {
  writer: {
    /** Hooks of past winners, ranked retention-first. Plain strings for direct prompt injection. */
    exemplarHooks: string[];
    /** Angle notes of past winners, ranked retention-first. */
    winningAngleNotes: string[];
    /**
     * Title formulas of past winners (the raw winning titles, emulate-the-shape like hooks), ranked
     * retention-first. Populates as soon as titles are tracked on posted videos (they are today).
     */
    winningTitleFormulas: string[];
    /** Full retention evidence behind the ranked lists above — auditable, retention-first ordered. */
    rankedExemplars: RankedExemplar[];
  };
  stylePicker: { presetWinsByGenre: Partial<Record<string, PresetId>> };
  beatPlanner: { promptPatternTags: string[]; bestBeatSeconds: number | null };
  voice: { bestVoiceIdByGenre: Partial<Record<string, string>> };
  /**
   * Thumbnail word/number combos of past winners, ranked retention-first. Stays empty until thumbnail
   * text is tracked on posted videos (no thumbnail field exists yet) — wired now so L2 needs no
   * re-architecture when it does.
   */
  thumbnail: { winningWordCombos: string[]; winningNumberPatterns: string[] };
  /** The retention bar the whole playbook was ranked against. sampleSize 0 ⇒ this is the EMPTY stub. */
  retention: RetentionBenchmarks;
}

export const EMPTY_LONGFORM_PLAYBOOK: LongformPlaybook = {
  writer: { exemplarHooks: [], winningAngleNotes: [], winningTitleFormulas: [], rankedExemplars: [] },
  stylePicker: { presetWinsByGenre: {} },
  beatPlanner: { promptPatternTags: [], bestBeatSeconds: null },
  voice: { bestVoiceIdByGenre: {} },
  thumbnail: { winningWordCombos: [], winningNumberPatterns: [] },
  retention: {
    medianFirst30sRetention: null,
    medianFirst60sRetention: null,
    bestFirst30sRetention: null,
    sampleSize: 0,
  },
};
