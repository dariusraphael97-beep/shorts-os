// Single source of truth for the 18 format labels.
// Client-safe (no `server-only`): imported by both the server-only
// shorts-classifications repository and the client-safe taxonomy module,
// so the client format-select and server zod validation can never drift.
export const FORMAT_LABELS = [
  "narrated_storytelling", "talking_head_facts", "talking_head_advice",
  "compilation_montage", "transformation_reveal", "ranking_list", "before_after",
  "tutorial_quick", "pov_skit", "screen_record_walkthrough", "ai_voiceover_facts",
  "reaction", "interview_clip", "news_recap", "product_review", "meme_format",
  "live_capture", "other",
] as const;
export type FormatLabel = (typeof FORMAT_LABELS)[number];
