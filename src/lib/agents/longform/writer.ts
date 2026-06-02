// src/lib/agents/longform/writer.ts
import { generateObject, NoObjectGeneratedError } from "ai";
import { getClaudeModel } from "@/lib/ai/gateway";
import { deriveChapterCount, estimateWordBudget } from "@/lib/longform/duration";
import {
  WriterHookSchema, WriterOutlineSchema, WriterChapterNarrationSchema,
  WriterOutputSchema, type WriterOutput,
} from "@/lib/agents/longform/types";
import type { LongformPlaybook } from "@/lib/agents/longform/playbook";

export interface WriterRunContext {
  topic: string;
  targetDurationSeconds: number;
  playbook: LongformPlaybook;
}

const FORMAT_RULES = `FORMAT (match a top-tier faceless documentary channel like Fern/Blackfiles):
- AUTHORITATIVE, MEASURED narration. Short, clipped sentences and fragments — one idea per line.
- Build suspense with deliberate, reveal-withholding turns ("but they're not...", fact-then-twist).
- Transition with turn-words ("So why...", "Here's the thing...", "So where do you go...") — never chapter cards.
- NO "hey guys", no channel intro, no on-screen-text assumptions. Write only what is spoken.`;

function hookPrompt(ctx: WriterRunContext): string {
  const ex = ctx.playbook.writer.exemplarHooks.length
    ? `\nProven hooks for this channel (emulate their shape, not their words):\n${ctx.playbook.writer.exemplarHooks.map((h) => `- ${h}`).join("\n")}`
    : "";
  return `PASS:HOOK
You are the Writer for a faceless longform YouTube documentary.
Topic: "${ctx.topic}"

Pick ONE sharp ANGLE, then write a cold-open HOOK (the first ~10-15 seconds of narration).
The hook must: open ON the story (a specific time/place anchor OR a bold curiosity claim), drip-reveal
in short clauses, and pose 1-2 rhetorical questions that frame the whole video's curiosity gap.
${FORMAT_RULES}${ex}

Return JSON: { "angle": string, "hook": string }.`;
}

function outlinePrompt(ctx: WriterRunContext, chapterCount: number): string {
  return `PASS:OUTLINE
You are the Writer. Topic: "${ctx.topic}".
Produce exactly ${chapterCount} chapters forming ONE continuous narrative arc (invisible to the viewer —
no on-screen titles). Each chapter: a short internal title + a one-line purpose.
${FORMAT_RULES}

Return JSON: { "chapters": [{ "title": string, "purpose": string }] } with exactly ${chapterCount} items.`;
}

function narrationPrompt(ctx: WriterRunContext, chapter: { title: string; purpose: string }, wordBudget: number): string {
  return `PASS:NARRATION
You are the Writer. Topic: "${ctx.topic}". Angle is set.
Write the spoken NARRATION for this chapter only.
Chapter: "${chapter.title}" — purpose: ${chapter.purpose}
Target ~${wordBudget} words. ${FORMAT_RULES}
Do not restate the title. Flow naturally from the prior chapter and set up the next with a turn-word.

Return JSON: { "narration": string }.`;
}

async function callObject<T>(model: ReturnType<typeof getClaudeModel>, schema: import("zod").ZodType<T>, prompt: string): Promise<T> {
  const run = async (): Promise<T> => {
    const result = await generateObject({ model, schema, prompt });
    return schema.parse(result.object);
  };
  try {
    return await run();
  } catch (err) {
    if (!NoObjectGeneratedError.isInstance(err)) throw err;
    return await run();
  }
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export async function runLongformWriter(ctx: WriterRunContext): Promise<WriterOutput> {
  const opus = getClaudeModel("claude-opus-4-7");
  const sonnet = getClaudeModel("claude-sonnet-4-5");
  const chapterCount = deriveChapterCount(ctx.targetDurationSeconds);
  const wordBudget = estimateWordBudget(ctx.targetDurationSeconds);

  // Pass 1: angle + hook.
  const hookOut = await callObject(opus, WriterHookSchema, hookPrompt(ctx));

  // Pass 2: outline (fallback to generic chapter scaffold if it keeps failing).
  let outline: { title: string; purpose: string }[];
  try {
    outline = (await callObject(sonnet, WriterOutlineSchema, outlinePrompt(ctx, chapterCount))).chapters;
  } catch (err) {
    if (!NoObjectGeneratedError.isInstance(err)) throw err;
    outline = Array.from({ length: chapterCount }, (_, i) => ({
      title: `Part ${i + 1}`,
      purpose: i === 0 ? "establish the hook and the stakes" : i === chapterCount - 1 ? "resolve and land the payoff" : "develop the argument with a new reveal",
    }));
  }

  // Pass 3: narration per chapter.
  const perChapterBudget = Math.max(40, Math.round(wordBudget / outline.length));
  const chapters = [];
  for (const ch of outline) {
    let narration: string;
    try {
      narration = (await callObject(opus, WriterChapterNarrationSchema, narrationPrompt(ctx, ch, perChapterBudget))).narration;
    } catch (err) {
      if (!NoObjectGeneratedError.isInstance(err)) throw err;
      narration = `${ch.purpose}. ${ctx.topic}.`; // safe non-empty fallback so render never hard-fails
    }
    chapters.push({ title: ch.title, purpose: ch.purpose, narration });
  }

  const estimatedWords = chapters.reduce((sum, c) => sum + countWords(c.narration), 0) + countWords(hookOut.hook);
  return WriterOutputSchema.parse({ angle: hookOut.angle, hook: hookOut.hook, estimatedWords, chapters });
}
