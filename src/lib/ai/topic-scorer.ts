import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { getClaudeModel } from "@/lib/ai/gateway";

export const TopicScoreSchema = z.object({
  hookability: z.number().min(0).max(100),
  novelty: z.number().min(0).max(100),
  visual_richness: z.number().min(0).max(100),
  reasoning: z.string(),
});
export type TopicScore = z.infer<typeof TopicScoreSchema>;

/**
 * Score a candidate topic for a faceless YouTube Short using Claude.
 *
 * Returns three 0-100 dimensions plus free-form reasoning:
 *   - hookability: how strong is the curiosity gap?
 *   - novelty: how fresh vs already widely covered?
 *   - visual_richness: can b-roll plausibly illustrate this?
 *
 * Default model is claude-haiku-4-5 (cheap, fast). Bump to sonnet only if
 * we find hookability scores correlating poorly with downstream performance.
 */
export async function scoreTopic(params: {
  title: string;
  summary: string;
  modelId?: "claude-haiku-4-5" | "claude-sonnet-4-5";
}): Promise<TopicScore> {
  const model = getClaudeModel(params.modelId ?? "claude-haiku-4-5");
  const result = await generateObject({
    model,
    schema: TopicScoreSchema,
    prompt: `You are evaluating a candidate topic for a faceless YouTube Short.

Title: ${params.title}
Summary: ${params.summary.slice(0, 1500)}

Score this topic on three dimensions (0-100):
- hookability: how strong is the curiosity gap?
- novelty: how fresh vs. already widely covered?
- visual_richness: can b-roll plausibly illustrate this?

Output JSON.`,
  });
  return result.object;
}
