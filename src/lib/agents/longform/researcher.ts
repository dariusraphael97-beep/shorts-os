// src/lib/agents/longform/researcher.ts
// Research stage: turn a topic + outline into a sourced FactSheet so the Writer
// narrates from verified numbers instead of inventing them. Best-effort end to end:
// any failure (LLM, search, no key) yields an empty fact sheet and the Writer falls
// back to its hardened "don't invent precise numbers" rule.
import { z } from "zod";
import { generateObject } from "ai";
import { getClaudeModel } from "@/lib/ai/gateway";
import { webSearch, type SearchResult } from "@/lib/research/web-search";
import { FactSheetSchema, type FactSheet } from "@/lib/agents/longform/types";

const MAX_QUERIES = 6;
const RESULTS_PER_QUERY = 5;

const QueriesSchema = z.object({ queries: z.array(z.string().min(1)).max(MAX_QUERIES) });

export interface ResearcherContext {
  topic: string;
  outline: { title: string; purpose: string }[];
}

function queriesPrompt(ctx: ResearcherContext): string {
  const chapters = ctx.outline.map((c, i) => `${i + 1}. ${c.title} — ${c.purpose}`).join("\n");
  return `You are a fact-checking researcher for a documentary script.
Topic: "${ctx.topic}"
Chapter outline:
${chapters}

List up to ${MAX_QUERIES} focused web-search queries that would surface the SPECIFIC, checkable facts this script will rely on — real costs/prices, horsepower/performance numbers, part names, specifications, dates, failure points. Prefer queries that pin down NUMBERS the script is likely to state. Generic background queries are useless.

Return JSON: { "queries": string[] }.`;
}

function extractPrompt(ctx: ResearcherContext, results: SearchResult[]): string {
  const corpus = results.map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\n${r.link}`).join("\n\n");
  return `You are a fact-checking researcher. From the search results below, extract a FACT SHEET of verified, specific facts for a script about "${ctx.topic}".
Rules:
- Only include a fact if the snippets actually support it. Prefer concrete numbers (costs, hp, specs, dates, part names).
- For each fact give the source URL it came from.
- If the snippets DISAGREE or only give vague ranges for something the script will need, put a short note in "uncertain" instead of stating a false-precise fact.
- Do NOT invent facts that aren't in the snippets.

SEARCH RESULTS:
${corpus}

Return JSON: { "facts": [{ "claim": string, "detail": string, "sourceUrl": string }], "uncertain": string[] }.`;
}

const EMPTY: FactSheet = { facts: [], uncertain: [] };

export async function runResearcher(ctx: ResearcherContext): Promise<FactSheet> {
  const model = getClaudeModel("claude-sonnet-4-5");
  try {
    const q = await generateObject({ model, schema: QueriesSchema, prompt: queriesPrompt(ctx) });
    const queries = QueriesSchema.parse(q.object).queries.slice(0, MAX_QUERIES);
    if (queries.length === 0) return EMPTY;

    const searches = await Promise.all(queries.map((query) => webSearch(query, RESULTS_PER_QUERY)));
    const results = searches.flat();
    if (results.length === 0) return EMPTY;

    const f = await generateObject({ model, schema: FactSheetSchema, prompt: extractPrompt(ctx, results) });
    return FactSheetSchema.parse(f.object);
  } catch {
    return EMPTY;
  }
}

// Render a fact sheet into a narration-prompt grounding block. Empty sheet → "" .
export function renderFactSheet(fs: FactSheet): string {
  if (fs.facts.length === 0 && fs.uncertain.length === 0) return "";
  const facts = fs.facts.map((f) => `- ${f.claim}: ${f.detail}`).join("\n");
  const unc = fs.uncertain.length ? `\nNOT verified (do NOT state a precise figure for these):\n${fs.uncertain.map((u) => `- ${u}`).join("\n")}` : "";
  return `VERIFIED FACTS (the ONLY source of truth for any number/cost/spec):\n${facts}${unc}`;
}
