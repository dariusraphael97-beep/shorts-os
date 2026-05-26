import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { getClaudeModel } from "@/lib/ai/gateway";

export const Stage1ScoreSchema = z.object({
  stage_1_score: z.number().int().min(0).max(100),
  reasoning: z.string().min(1).max(800),
  suggested_tags: z.array(z.string()).max(8),
});
export type Stage1Score = z.infer<typeof Stage1ScoreSchema>;

export const STAGE_1_PROMPT_VERSION = "stage1.haiku.v1" as const;

export interface Stage1Input {
  title: string;
  subreddit: string;
  author: string;
  score: number;
  numComments: number;
  nicheSlug: string;
  nicheTagVocabulary: string[];
}

export async function scoreRedditPostForClipIngest(
  input: Stage1Input,
): Promise<Stage1Score> {
  const model = getClaudeModel("claude-haiku-4-5");
  const prompt = buildPrompt(input);
  const result = await generateObject({
    model,
    schema: Stage1ScoreSchema,
    prompt,
  });
  return result.object;
}

function buildPrompt(i: Stage1Input): string {
  return [
    `You are a Stage-1 triage scorer for short-form video ingest.`,
    `Niche: ${i.nicheSlug}`,
    `Allowed tag vocabulary: ${i.nicheTagVocabulary.join(", ") || "(none provided)"}`,
    ``,
    `Reddit post:`,
    `  Title: ${i.title}`,
    `  Subreddit: r/${i.subreddit}`,
    `  Author: ${i.author}`,
    `  Score: ${i.score}`,
    `  Comments: ${i.numComments}`,
    ``,
    `Score this post 0-100 on its likely usefulness as a clip in a Format-2 compilation video for this niche.`,
    `High score (>=70): clearly contains a viral-shaped visual moment matching the niche.`,
    `Medium (40-69): plausibly contains a useful clip but unsure.`,
    `Low (<40): off-topic, low-signal, NSFW, political, fatal/graphic, or a self-text post without video.`,
    ``,
    `Return JSON with stage_1_score, reasoning (one short sentence),`,
    `and suggested_tags (subset of the allowed vocabulary; empty array if none apply).`,
  ].join("\n");
}
