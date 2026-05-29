import type { FormatLabel, AudienceSignal } from "@/lib/supabase/repositories/shorts-classifications";

export type ProductionFit = "native" | "needs_manual_recording" | "needs_manual_editing" | "manual_only";

export const FORMAT_LABELS: readonly FormatLabel[] = [
  "narrated_storytelling", "talking_head_facts", "talking_head_advice",
  "compilation_montage", "transformation_reveal", "ranking_list", "before_after",
  "tutorial_quick", "pov_skit", "screen_record_walkthrough", "ai_voiceover_facts",
  "reaction", "interview_clip", "news_recap", "product_review", "meme_format",
  "live_capture", "other",
] as const;

export const AUDIENCE_SIGNALS: readonly AudienceSignal[] = [
  "seniors", "gen_z", "millennials", "kids", "professionals", "hobbyists", "general",
] as const;

const FIT_BY_FORMAT: Record<FormatLabel, ProductionFit> = {
  ai_voiceover_facts: "native", compilation_montage: "native", ranking_list: "native",
  news_recap: "native", narrated_storytelling: "native",
  talking_head_facts: "needs_manual_recording", talking_head_advice: "needs_manual_recording",
  tutorial_quick: "needs_manual_recording", product_review: "needs_manual_recording",
  transformation_reveal: "needs_manual_editing", before_after: "needs_manual_editing",
  pov_skit: "needs_manual_editing", reaction: "needs_manual_editing",
  interview_clip: "needs_manual_editing", screen_record_walkthrough: "needs_manual_editing",
  meme_format: "needs_manual_editing", live_capture: "needs_manual_editing",
  other: "manual_only",
};

export function formatToProductionFit(format: FormatLabel): ProductionFit {
  return FIT_BY_FORMAT[format];
}

export const PRODUCTION_FIT_WEIGHT: Record<ProductionFit, number> = {
  native: 1.0, needs_manual_recording: 0.7, needs_manual_editing: 0.5, manual_only: 0.2,
};
