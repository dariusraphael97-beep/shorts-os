# Longform Script Fact-Grounding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the longform Writer from inventing wrong numbers (costs, hp, specs). Insert a research stage that builds a sourced fact sheet from real web results, then hard-constrain narration to it.

**Architecture:** A new `researcher` agent runs inside `runLongformWriter` between the outline pass and the narration pass. It derives factual search queries from the topic + outline, web-searches them via Serper (text `/search`), and distills a Zod-validated `FactSheet` (sourced facts + an "uncertain" list). Each chapter's narration prompt receives the fact sheet and a strict rule: use ONLY grounded numbers; if a figure isn't verified, speak qualitatively rather than invent. The fact sheet is persisted on the plan for audit. Everything is best-effort — if search/LLM fails or no key is set, the Writer still gets the hardened "don't invent precise numbers" rule and falls back to current behavior.

**Tech Stack:** TypeScript, Next.js App Router, AI SDK v6 (`generateObject`), Zod, Serper.dev API, Vitest. LLM via `getClaudeModel` from `@/lib/ai/gateway`.

---

### Task 1: Web text-search utility

**Files:**
- Create: `src/lib/research/web-search.ts`
- Test: `src/tests/lib/research/web-search.test.ts`

Mirrors `scripts/render-worker/lib/image-search.ts` (defensive, best-effort, reads `process.env.SERPER_API_KEY` directly — it is NOT in the validated env schema, that's intentional). Returns `[]` on any failure or missing key so callers never throw.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/lib/research/web-search.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { webSearch } from "@/lib/research/web-search";

describe("webSearch", () => {
  const realKey = process.env.SERPER_API_KEY;
  beforeEach(() => { process.env.SERPER_API_KEY = "test-key"; vi.restoreAllMocks(); });
  afterEach(() => { if (realKey === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = realKey; });

  it("returns parsed organic results from Serper", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ organic: [
        { title: "B58 build cost", snippet: "A 700whp B58 runs about $8k.", link: "https://x.com/a" },
        { title: "no link", snippet: "ignored if no link" },
      ] }), { status: 200 })
    );
    const out = await webSearch("B58 800whp cost");
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ title: "B58 build cost", snippet: "A 700whp B58 runs about $8k.", link: "https://x.com/a" });
  });

  it("returns [] when no API key is set", async () => {
    delete process.env.SERPER_API_KEY;
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await webSearch("anything")).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns [] on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    expect(await webSearch("anything")).toEqual([]);
  });

  it("returns [] on fetch throw / timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    expect(await webSearch("anything")).toEqual([]);
  });

  it("returns [] for an empty query without calling fetch", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect(await webSearch("   ")).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/research/web-search.test.ts`
Expected: FAIL — module `@/lib/research/web-search` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/research/web-search.ts
// Best-effort web text search for grounding longform narration in real facts.
// Mirrors the defensive style of scripts/render-worker/lib/image-search.ts: reads
// SERPER_API_KEY straight from process.env (not in the validated env schema), and
// returns [] on ANY failure so callers never have to handle errors.

export interface SearchResult {
  title: string;
  snippet: string;
  link: string;
}

// Serper.dev — POST /search with X-API-KEY → { organic: [{ title, snippet, link }] }.
export async function webSearch(query: string, num = 6): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { organic?: Array<{ title?: string; snippet?: string; link?: string }> };
    return (j.organic ?? [])
      .filter((o): o is { title: string; snippet: string; link: string } =>
        typeof o.title === "string" && typeof o.snippet === "string" && typeof o.link === "string")
      .map((o) => ({ title: o.title, snippet: o.snippet, link: o.link }));
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/lib/research/web-search.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/research/web-search.ts src/tests/lib/research/web-search.test.ts
git commit -m "feat(research): best-effort Serper text-search utility for grounding"
```

---

### Task 2: Fact-sheet schemas

**Files:**
- Modify: `src/lib/agents/longform/types.ts`
- Test: `src/tests/lib/agents/longform-factsheet.test.ts`

Add the `FactSheet` types the researcher produces and the writer/plan consume.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/lib/agents/longform-factsheet.test.ts
import { describe, it, expect } from "vitest";
import { FactSheetSchema } from "@/lib/agents/longform/types";

describe("FactSheetSchema", () => {
  it("accepts a sourced fact sheet", () => {
    const fs = FactSheetSchema.parse({
      facts: [{ claim: "Stage 1 makes ~500whp", detail: "tune+intake+downpipe, stock turbo", sourceUrl: "https://x.com/a" }],
      uncertain: ["exact ZF8 rebuild cost varies by shop"],
    });
    expect(fs.facts).toHaveLength(1);
    expect(fs.uncertain).toHaveLength(1);
  });

  it("allows a fact with no sourceUrl and defaults empty arrays", () => {
    const fs = FactSheetSchema.parse({ facts: [{ claim: "c", detail: "d" }] });
    expect(fs.facts[0].sourceUrl).toBeUndefined();
    expect(fs.uncertain).toEqual([]);
  });

  it("rejects a fact missing claim", () => {
    expect(() => FactSheetSchema.parse({ facts: [{ detail: "d" }] })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/agents/longform-factsheet.test.ts`
Expected: FAIL — `FactSheetSchema` is not exported.

- [ ] **Step 3: Add schemas to types.ts**

Add near the other writer schemas in `src/lib/agents/longform/types.ts`:

```ts
export const FactSheetItemSchema = z.object({
  claim: z.string().min(1),
  detail: z.string().min(1),
  sourceUrl: z.string().url().optional(),
});
export type FactSheetItem = z.infer<typeof FactSheetItemSchema>;

export const FactSheetSchema = z.object({
  facts: z.array(FactSheetItemSchema).default([]),
  uncertain: z.array(z.string()).default([]),
});
export type FactSheet = z.infer<typeof FactSheetSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/lib/agents/longform-factsheet.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/longform/types.ts src/tests/lib/agents/longform-factsheet.test.ts
git commit -m "feat(longform): FactSheet zod schemas"
```

---

### Task 3: Researcher agent

**Files:**
- Create: `src/lib/agents/longform/researcher.ts`
- Test: `src/tests/lib/agents/researcher.test.ts`

`runResearcher` derives queries (LLM), searches each (webSearch), then distills a sourced FactSheet (LLM). Best-effort: if no search results come back, return an empty fact sheet WITHOUT calling the extraction LLM.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/lib/agents/researcher.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({ getClaudeModel: vi.fn(() => ({ __mock: "model" })) }));
vi.mock("ai", () => ({ generateObject: vi.fn(), NoObjectGeneratedError: class { static isInstance() { return false; } } }));
vi.mock("@/lib/research/web-search", () => ({ webSearch: vi.fn() }));

import { generateObject } from "ai";
import { webSearch } from "@/lib/research/web-search";
import { runResearcher } from "@/lib/agents/longform/researcher";

const outline = [{ title: "Overbuilt", purpose: "architecture" }, { title: "Stages", purpose: "tuning costs" }];

describe("runResearcher", () => {
  beforeEach(() => { vi.mocked(generateObject).mockReset(); vi.mocked(webSearch).mockReset(); });

  it("derives queries, searches, and distills a sourced fact sheet", async () => {
    vi.mocked(generateObject)
      .mockResolvedValueOnce({ object: { queries: ["B58 stage 1 cost", "B58 800whp stock internals"] } } as any)
      .mockResolvedValueOnce({ object: { facts: [{ claim: "800whp on stock block", detail: "~$6-10k", sourceUrl: "https://x.com/a" }], uncertain: [] } } as any);
    vi.mocked(webSearch).mockResolvedValue([{ title: "t", snippet: "s", link: "https://x.com/a" }]);

    const fs = await runResearcher({ topic: "B58 800whp", outline });
    expect(vi.mocked(webSearch).mock.calls.length).toBe(2); // one per derived query
    expect(fs.facts[0].detail).toBe("~$6-10k");
  });

  it("returns an empty fact sheet (no extraction LLM call) when no search results", async () => {
    vi.mocked(generateObject).mockResolvedValueOnce({ object: { queries: ["q1"] } } as any);
    vi.mocked(webSearch).mockResolvedValue([]);
    const fs = await runResearcher({ topic: "obscure", outline });
    expect(fs).toEqual({ facts: [], uncertain: [] });
    expect(vi.mocked(generateObject).mock.calls.length).toBe(1); // only the query-derivation call
  });

  it("returns an empty fact sheet if query derivation throws", async () => {
    vi.mocked(generateObject).mockRejectedValueOnce(new Error("llm down"));
    const fs = await runResearcher({ topic: "x", outline });
    expect(fs).toEqual({ facts: [], uncertain: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/agents/researcher.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/lib/agents/researcher.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/longform/researcher.ts src/tests/lib/agents/researcher.test.ts
git commit -m "feat(longform): researcher agent builds a sourced fact sheet"
```

---

### Task 4: Wire the fact sheet into the Writer

**Files:**
- Modify: `src/lib/agents/longform/writer.ts`
- Modify: `src/lib/agents/longform/types.ts` (add `factSheet` to `WriterOutputSchema`)
- Test: `src/tests/lib/agents/writer-grounding.test.ts`

The Writer runs the researcher after the outline, injects the fact sheet into every chapter's narration prompt, and ALWAYS includes a hard "no invented numbers" rule (even when the sheet is empty). The fact sheet is returned on `WriterOutput`.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/lib/agents/writer-grounding.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({ getClaudeModel: vi.fn(() => ({ __mock: "model" })) }));
const generateObject = vi.fn();
vi.mock("ai", () => ({ generateObject: (...a: unknown[]) => generateObject(...a), NoObjectGeneratedError: class { static isInstance() { return false; } } }));
const runResearcher = vi.fn();
vi.mock("@/lib/agents/longform/researcher", async (orig) => ({ ...(await orig() as object), runResearcher: (...a: unknown[]) => runResearcher(...a) }));

import { runLongformWriter } from "@/lib/agents/longform/writer";

const playbook = { writer: { exemplarHooks: [] } } as any;

describe("runLongformWriter grounding", () => {
  beforeEach(() => { generateObject.mockReset(); runResearcher.mockReset(); });

  it("passes the fact sheet into the narration prompt and returns it on output", async () => {
    runResearcher.mockResolvedValue({ facts: [{ claim: "800whp on stock block", detail: "~$6-10k" }], uncertain: [] });
    // hook, outline(2), narration x2
    generateObject
      .mockResolvedValueOnce({ object: { angle: "a", hook: "the hook goes here and is long enough" } })
      .mockResolvedValueOnce({ object: { chapters: [{ title: "T1", purpose: "p1" }, { title: "T2", purpose: "p2" }] } })
      .mockResolvedValueOnce({ object: { narration: "grounded narration one ".repeat(10) } })
      .mockResolvedValueOnce({ object: { narration: "grounded narration two ".repeat(10) } });

    const out = await runLongformWriter({ topic: "B58 800whp", targetDurationSeconds: 510, playbook });

    // The narration calls (3rd and 4th generateObject calls) must include the fact-sheet text.
    const narrationCalls = generateObject.mock.calls.slice(2);
    for (const call of narrationCalls) {
      expect(call[0].prompt).toContain("~$6-10k");
      expect(call[0].prompt).toMatch(/do NOT (state|invent)/i);
    }
    expect(out.factSheet.facts[0].detail).toBe("~$6-10k");
  });

  it("still includes the no-invention rule when the fact sheet is empty", async () => {
    runResearcher.mockResolvedValue({ facts: [], uncertain: [] });
    generateObject
      .mockResolvedValueOnce({ object: { angle: "a", hook: "the hook goes here and is long enough" } })
      .mockResolvedValueOnce({ object: { chapters: [{ title: "T1", purpose: "p1" }] } })
      .mockResolvedValueOnce({ object: { narration: "narration text ".repeat(10) } });

    await runLongformWriter({ topic: "x", targetDurationSeconds: 300, playbook });
    const narrationCall = generateObject.mock.calls[2];
    expect(narrationCall[0].prompt).toMatch(/do NOT (state|invent)/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/agents/writer-grounding.test.ts`
Expected: FAIL — narration prompt lacks fact-sheet text / `out.factSheet` undefined.

- [ ] **Step 3: Implement the wiring**

In `src/lib/agents/longform/types.ts`, add `factSheet` to `WriterOutputSchema` (default empty so older callers/tests still parse):

```ts
// inside WriterOutputSchema object:
  factSheet: FactSheetSchema.default({ facts: [], uncertain: [] }),
```

In `src/lib/agents/longform/writer.ts`:

```ts
// add imports
import { runResearcher, renderFactSheet } from "@/lib/agents/longform/researcher";
import type { FactSheet } from "@/lib/agents/longform/types";
```

Change `narrationPrompt` to take and embed the grounding block:

```ts
function narrationPrompt(ctx: WriterRunContext, chapter: { title: string; purpose: string }, wordBudget: number, grounding: string): string {
  const groundingBlock = grounding ? `\n${grounding}\n` : "";
  return `PASS:NARRATION
You are the Writer. Topic: "${ctx.topic}". Angle is set.
Write the spoken NARRATION for this chapter only.
Chapter: "${chapter.title}" — purpose: ${chapter.purpose}
Target ~${wordBudget} words. ${FORMAT_RULES}
Do not restate the title. Flow naturally from the prior chapter and set up the next with a turn-word.
${groundingBlock}
ACCURACY (critical): Every number you state — cost, price, horsepower, torque, dimension, date, quantity — MUST match the VERIFIED FACTS above. If a number you want is not in the verified facts, do NOT invent it: speak qualitatively (omit the figure) rather than guess. Never state a precise dollar amount or spec that isn't grounded.

Return JSON: { "narration": string }.`;
}
```

In `runLongformWriter`, after the outline block (after line ~96) and before the narration loop, run the researcher and render the block; pass `grounding` into each `narrationPrompt(...)` call; thread the fact sheet into the returned output:

```ts
  // Research: ground the narration in real, sourced facts (best-effort — empty on any failure).
  const factSheet: FactSheet = await runResearcher({ topic: ctx.topic, outline });
  const grounding = renderFactSheet(factSheet);

  // ...inside the narration loop, the call becomes:
  // narration = (await callObject(opus, WriterChapterNarrationSchema, narrationPrompt(ctx, ch, perChapterBudget, grounding))).narration;

  // ...and the return becomes:
  return WriterOutputSchema.parse({ angle: hookOut.angle, hook: hookOut.hook, estimatedWords, chapters, factSheet });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/lib/agents/writer-grounding.test.ts`
Expected: PASS (2 tests). Also run the existing writer/longform suites to confirm no regressions: `npx vitest run src/tests/lib/agents src/tests/lib/longform`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/longform/writer.ts src/lib/agents/longform/types.ts src/tests/lib/agents/writer-grounding.test.ts
git commit -m "feat(longform): writer grounds narration in the fact sheet + hard no-invention rule"
```

---

### Task 5: Persist the fact sheet on the plan

**Files:**
- Modify: `src/lib/agents/longform/types.ts` (add optional `factSheet` to `LongformPlanSchema`)
- Modify: `src/lib/agents/longform/orchestrator.ts` (thread `writer.factSheet` into the assembled `LongformPlan`)
- Test: `src/tests/lib/agents/longform-plan-factsheet.test.ts`

So the fact sheet that grounded a video is auditable on the stored plan (QC: "what did this video rely on?").

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/lib/agents/longform-plan-factsheet.test.ts
import { describe, it, expect } from "vitest";
import { LongformPlanSchema } from "@/lib/agents/longform/types";

const base = {
  topic: "t", targetDurationSeconds: 300, presetId: "technical-illustration",
  styleBible: undefined as unknown, musicMood: "m", angle: "a", hook: "h",
  voice: undefined as unknown, estimatedWords: 1, captionsEnabled: false,
  chapters: [{ index: 0, title: "c", purpose: "p", narration: "n", beats: [] as unknown[] }],
};

describe("LongformPlanSchema factSheet", () => {
  it("accepts a plan WITHOUT a factSheet (back-compat)", () => {
    // NOTE: implementer must supply schema-valid styleBible/voice/beats from the existing
    // test fixtures/helpers; this assertion is about factSheet being OPTIONAL.
    expect(() => LongformPlanSchema.parse({ ...base } as any)).not.toThrow();
  });
  it("accepts and preserves a factSheet when present", () => {
    const parsed = LongformPlanSchema.parse({ ...base, factSheet: { facts: [{ claim: "c", detail: "d" }], uncertain: [] } } as any);
    expect((parsed as any).factSheet.facts).toHaveLength(1);
  });
});
```

> Implementer note: the existing test must use real schema-valid `styleBible`, `voice`, and `beats` values — reuse whatever fixture/factory the current `types`/orchestrator tests use (search `src/tests` for an existing valid `LongformPlan` fixture). The behavioral point being tested is only that `factSheet` is optional and round-trips.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/agents/longform-plan-factsheet.test.ts`
Expected: FAIL — `factSheet` stripped/rejected.

- [ ] **Step 3: Implement**

In `LongformPlanSchema` (types.ts) add:

```ts
  factSheet: FactSheetSchema.optional(),
```

In `orchestrator.ts`, where the `LongformPlan` object is assembled from the writer output (around lines 94-110), add `factSheet: writer.factSheet` to the object passed to `LongformPlanSchema.parse(...)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/lib/agents/longform-plan-factsheet.test.ts`
Expected: PASS. Then run the orchestrator suite if present: `npx vitest run src/tests/lib/agents`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/longform/types.ts src/lib/agents/longform/orchestrator.ts src/tests/lib/agents/longform-plan-factsheet.test.ts
git commit -m "feat(longform): persist the grounding fact sheet on the plan for audit"
```

---

## Post-implementation: dogfood on the B58

After all tasks pass and the full suite is green (`npx vitest run`), regenerate the B58 plan-only through the new pipeline (the existing `/api/lab/longform/dispatch` with `planOnly: true`, or a direct `runLongformPipeline` call) and inspect:
1. The produced `factSheet` — are the costs/hp grounded and sourced?
2. The Stage-2/Stage-3 narration numbers — are they now realistic (~$6-10k for 800whp on a stock block), not the invented $25-30k?

Then show Darius the fact sheet + corrected numbers for a domain gut-check before any re-render. Do NOT spend render credits — re-render is deferred to his next top-up.
