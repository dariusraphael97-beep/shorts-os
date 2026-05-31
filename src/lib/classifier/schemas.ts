import { z } from "zod";
import { FORMAT_LABELS, AUDIENCE_SIGNALS } from "@/lib/classifier/taxonomy";

export const TopicResultSchema = z.object({
  video_id: z.string(),
  topic_label: z.string().min(1).max(80),
  audience_signal: z.enum(AUDIENCE_SIGNALS as unknown as [string, ...string[]]),
  confidence: z.number().min(0).max(1),
});
export const TopicBatchSchema = z.object({ results: z.array(TopicResultSchema) });

export const FormatResultSchema = z.object({
  format_label: z.enum(FORMAT_LABELS as unknown as [string, ...string[]]),
  confidence: z.number().min(0).max(1),
});

export type TopicResult = z.infer<typeof TopicResultSchema>;
export type FormatResult = z.infer<typeof FormatResultSchema>;
