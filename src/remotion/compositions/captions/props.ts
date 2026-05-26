// src/remotion/compositions/captions/props.ts
import { z } from "zod";

export const TimedWordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});
export type TimedWord = z.infer<typeof TimedWordSchema>;

export const CaptionsPropsSchema = z.object({
  variant: z.enum(["word-by-word", "two-words-at-a-time", "rolling-line"]),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "must be #RRGGBB hex"),
  accent_word_policy: z.enum(["first-noun", "highlighted-by-director", "none"]),
  highlighted_words: z.array(z.string()).default([]),
  animation_speed: z.number().min(0.5).max(2.0).default(1.0),
  font_scale: z.number().min(0.7).max(1.5).default(1.0),
  // Runtime-only (not from the Director; filled in by the worker before render)
  words: z.array(TimedWordSchema).default([]),
  durationSeconds: z.number().default(0),
});
export type CaptionsProps = z.infer<typeof CaptionsPropsSchema>;
