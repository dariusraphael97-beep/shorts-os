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
  selected_format: z.enum(["explainer", "compilation"]),
  analyst_guidance_acknowledged: z.boolean(),
  forced_format_incompatible: z
    .object({ reason: z.string().min(10).max(400) })
    .optional(),
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
  const mix = ctx.channel.target_format_mix;
  const explainerPct = Math.round(mix.explainer * 100);
  const compilationPct = Math.round(mix.compilation * 100);
  return `You are The Strategist, dispatching a video topic to the production agents.

Channel:
  display_name: ${ctx.channel.display_name}
  id: ${ctx.channel.id}
  persona: ${JSON.stringify(ctx.channel.persona)}
  target_format_mix: ${explainerPct}% explainer / ${compilationPct}% compilation

Topic:
  title: ${ctx.topic.title}
  summary: ${(ctx.topic.summary ?? "").slice(0, 1500)}
  hookability_score: ${ctx.topic.hookability_score ?? "(unscored)"}
  source: ${ctx.topic.source}

FORMAT SELECTION (pick one):
- 'explainer': narrated short with a single claim or insight. Routed to Writer → Voice Coach → Director.
- 'compilation': Top-5 montage assembled from pre-ingested clips. Routed to The Composer. Requires clip_library to be populated for this channel's niche.

Pick the angle AND the format that best fits the channel persona AND maximizes hookability, while moving the channel's running mix toward the target.

If a topic clearly demands one format but the niche's clip_library is too thin for compilation, set forced_format_incompatible.reason and pick the alternative.

analyst_guidance_acknowledged: set true if you considered the format-mix target. (Real Analyst feedback wires up in Plan #5.)

Output:
- dispatch_directive: 1-2 sentences telling the downstream agent how to approach this topic.
- format_hints: 1-5 concrete writing or assembly constraints (e.g., "open with a year", "build to a payoff", "fast cuts under 6s").
- selected_channel_id: ${ctx.channel.id}
- selected_format: 'explainer' or 'compilation'
- analyst_guidance_acknowledged: boolean
- forced_format_incompatible: { reason } — only when you had to override the topic's natural format
- rationale: explain your choice in 1-3 sentences.`;
}
