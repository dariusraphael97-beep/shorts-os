// src/lib/agents/writer.ts
//
// The Writer agent: streams a 45-60 second faceless YouTube Short script
// using Claude Sonnet. Returns the raw text live (so the Lab can render
// it token-by-token) and then post-processes the final text into a
// structured WriterOutput (script, hook, word_count, estimated_duration).

import "server-only";
import { streamText } from "ai";
import { z } from "zod";
import { getClaudeModel } from "@/lib/ai/gateway";
import type { Channel } from "@/lib/supabase/repositories/channels";
import type { QueuedTopic } from "@/lib/supabase/repositories/topic-queue";
import type { Job } from "@/lib/supabase/repositories/jobs";
import type { StrategistOutput } from "./strategist";

export const WriterOutputSchema = z.object({
  script: z.string().min(200).max(2500),
  hook_first_3_seconds: z.string().min(10).max(200),
  word_count: z.number().int().min(50).max(400),
  estimated_duration_seconds: z.number().min(20).max(120),
});
export type WriterOutput = z.infer<typeof WriterOutputSchema>;

export type WriterRunContext = {
  job: Job;
  topic: QueuedTopic;
  channel: Channel;
  previousOutputs: { strategist: StrategistOutput };
};

export type WriterYield =
  | { type: "chunk"; text: string }
  | { type: "done"; output: WriterOutput };

export async function* runWriter(ctx: WriterRunContext): AsyncGenerator<WriterYield> {
  const prompt = buildPrompt(ctx);
  const result = streamText({
    model: getClaudeModel("claude-sonnet-4-5"),
    prompt,
  });

  let assembled = "";
  for await (const chunk of result.textStream) {
    assembled += chunk;
    yield { type: "chunk", text: chunk };
  }

  const script = assembled.trim();
  const wordCount = countWords(script);
  const output: WriterOutput = WriterOutputSchema.parse({
    script,
    hook_first_3_seconds: extractFirstSentence(script),
    word_count: wordCount,
    estimated_duration_seconds: wordCount / 2.5,
  });
  yield { type: "done", output };
}

function buildPrompt(ctx: WriterRunContext): string {
  return `You are The Writer. Produce a 45–60 second faceless YouTube Short script.

Channel persona:
${JSON.stringify(ctx.channel.persona, null, 2)}

Strategist directive: ${ctx.previousOutputs.strategist.dispatch_directive}

Format hints:
${ctx.previousOutputs.strategist.format_hints.map((h) => `- ${h}`).join("\n")}

Topic:
  title: ${ctx.topic.title}
  summary: ${(ctx.topic.summary ?? "").slice(0, 1500)}

Rules:
- Hook in first 3 seconds (a question, a surprising claim, or a specific number/year).
- Concrete visual scenes — 1 visual change every 3-5 seconds.
- Stay in the channel persona's voice.
- A satisfying close that earns the view-through.
- Output ONLY the narration text. No scene labels, no markdown headers, no commentary, no quotes around the script.`;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function extractFirstSentence(text: string): string {
  // Walk sentence boundaries; keep extending until the candidate has enough
  // letters to be a real hook. Skips lead-ins like "1943." or "Dr." that
  // otherwise leave the hook below WriterOutputSchema's 10-char minimum.
  const MIN_LETTERS = 10;
  const re = /[.!?](?:\s|$)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const candidate = text.slice(0, match.index + 1).trim();
    const letterCount = (candidate.match(/[A-Za-z]/g) ?? []).length;
    if (letterCount >= MIN_LETTERS) return candidate;
  }
  return text.slice(0, 200).trim();
}
