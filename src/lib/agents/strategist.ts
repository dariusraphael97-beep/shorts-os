// src/lib/agents/strategist.ts
//
// The Strategist agent: receives a topic + channel, picks the dispatch angle,
// and produces 1-2 sentences of direction for the Writer. Uses Claude Haiku
// because this is synthesis, not creative writing.

import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { getClaudeModel } from "@/lib/ai/gateway";
import type { Channel } from "@/lib/supabase/repositories/channels";
import type { QueuedTopic } from "@/lib/supabase/repositories/topic-queue";
import type { Job } from "@/lib/supabase/repositories/jobs";

export const StrategistOutputSchema = z.object({
  dispatch_directive: z.string().min(20).max(400),
  format_hints: z.array(z.string()).min(1).max(5),
  selected_channel_id: z.string().uuid(),
  rationale: z.string().min(20).max(600),
});
export type StrategistOutput = z.infer<typeof StrategistOutputSchema>;

export type StrategistRunContext = {
  job: Job;
  topic: QueuedTopic;
  channel: Channel;
  previousOutputs: Record<string, never>;
};

export async function runStrategist(ctx: StrategistRunContext): Promise<StrategistOutput> {
  const prompt = buildPrompt(ctx);
  const result = await generateObject({
    model: getClaudeModel("claude-haiku-4-5"),
    schema: StrategistOutputSchema,
    prompt,
  });
  return StrategistOutputSchema.parse(result.object);
}

function buildPrompt(ctx: StrategistRunContext): string {
  return `You are The Strategist, dispatching a video topic to The Writer.

Channel:
  display_name: ${ctx.channel.display_name}
  id: ${ctx.channel.id}
  persona: ${JSON.stringify(ctx.channel.persona)}

Topic:
  title: ${ctx.topic.title}
  summary: ${(ctx.topic.summary ?? "").slice(0, 1500)}
  hookability_score: ${ctx.topic.hookability_score ?? "(unscored)"}
  source: ${ctx.topic.source}

Pick the angle that best fits the channel persona AND maximizes hookability.

Output:
- dispatch_directive: 1-2 sentences telling the Writer how to approach this topic.
- format_hints: 1-5 concrete writing constraints (e.g., "open with a year", "single surprising claim").
- selected_channel_id: ${ctx.channel.id}
- rationale: explain your choice in 1-3 sentences.`;
}
