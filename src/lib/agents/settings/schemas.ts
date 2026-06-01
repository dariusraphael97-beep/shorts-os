import { z } from 'zod';

const nicheScoutSchema = z.object({
  model: z.string().optional(),
  proven_vs_firstmover: z.number().min(0).max(1).optional(),
  confidence_floor: z.number().min(0).max(1).optional(),
});

const videoReviewerSchema = z.object({
  model: z.string().optional(),
  block_threshold: z.number().min(0).max(1).optional(),
});

const generatorSchema = z.object({
  model: z.string().optional(),
});

const watchListCuratorSchema = z.object({
  model: z.string().optional(),
  evict_after_zero_signal_weeks: z.number().int().positive().optional(),
});

const passthroughSchema = z.object({}).passthrough();

const SCHEMAS: Record<string, z.ZodTypeAny> = {
  niche_scout: nicheScoutSchema,
  video_reviewer: videoReviewerSchema,
  generator: generatorSchema,
  watch_list_curator: watchListCuratorSchema,
};

export function getSettingsSchema(assistantId: string): z.ZodTypeAny {
  return SCHEMAS[assistantId] ?? passthroughSchema;
}

export function validateSettings(
  assistantId: string,
  input: unknown,
): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
  const schema = getSettingsSchema(assistantId);
  const result = schema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data as Record<string, unknown> };
  }
  const issues = result.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  return { success: false, error: issues };
}
