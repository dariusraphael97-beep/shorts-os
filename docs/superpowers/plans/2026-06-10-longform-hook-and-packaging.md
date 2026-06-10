# Longform Hook + Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the longform writer so it opens on the claim (not category context), builds tension across cliffhanger-chained chapters, and consumes the learned playbook; then add tool-generated titles + thumbnails — turning the 30 research learnings into pipeline changes.

**Architecture:** Phase 1 reworks the existing multi-pass writer (`writer.ts`) + its zod schemas (`types.ts`) + beat planner (`beat-planner.ts`) + length math (`duration.ts`) — all pure/LLM functions already covered by vitest, no render-worker changes required to ship. Phase 2 adds two new pipeline stages (`titler.ts`, `thumbnail.ts`), wires them through the orchestrator + ledger + DB, and adds thumbnail rendering to the render worker. Phase 3 (the retention-first L2 playbook store) is **already committed** (`233d27f`) — this plan *consumes* it, it does not rebuild it.

**Tech Stack:** TypeScript, zod, Vercel AI SDK (`generateObject`), Anthropic via `getClaudeModel`, Supabase, vitest. Repo root `/Users/darius/Downloads/shorts-os`.

**Baseline (verified 2026-06-10):** `npx tsc --noEmit` clean; `npm test` = 194 files / 723 tests green, on top of the committed Phase 3.

**Evidence base:** `docs/superpowers/research/2026-06-10-longform-mastery-findings.md` (learnings L1–L30), `..-tool-knowledge-map.md`, `..-b58-video-teardown.md`. Implements L1–L6, L12–L19 (Phase 1) and L8–L11 (Phase 2).

**Conventions:** TDD (failing test first). Run a single test file with `npx vitest run <path>`. Commit after each green task. Keep each new file one responsibility. Do NOT widen the locked visual rule (100% illustration-from-reference) or the accuracy gate.

---

## File Structure

**Phase 1 (modify):**
- `src/lib/agents/longform/types.ts` — extend `WriterHookSchema` (structured hook), `WriterOutlineSchema` (`cliffhangerOut`), `WriterOutputSchema` (carry `openLoops`/`tensionAnchor`/`cliffhangerOut`), add `BeatRoleSchema`, extend `BeatSchema`/`SceneItemsSchema`/`PlanChapterSchema`/`LongformPlanSchema`.
- `src/lib/agents/longform/hook-lint.ts` — **new**, pure `opensOnCategoryContext()` banned-opener guard.
- `src/lib/agents/longform/writer.ts` — rewrite `hookPrompt` (peak→puncture→question + promise stack + tension anchor), consume `rankedExemplars`/`winningAngleNotes`, regenerate-once on banned opener, `outlinePrompt` emits `cliffhangerOut`, `narrationPrompt` enforces but/so/therefore + pays off loops + ends on cliffhanger, thread new fields into `WriterOutput`.
- `src/lib/longform/duration.ts` — retention-first length defaults.
- `src/lib/agents/longform/beat-planner.ts` — emit `beatRole`, tighten `onScreenText` to ≤3 words/one claim, pass `tensionAnchor`.
- `src/lib/agents/longform/orchestrator.ts` + `src/lib/longform/ledger.ts` — record the new writer fields in the ledger (so L2 can learn them).

**Phase 2 (new + modify):**
- `src/lib/agents/longform/titler.ts` — **new**, `runTitler()` → 5 ranked title candidates.
- `src/lib/longform/thumbnail-spec.ts` — **new**, `buildThumbnailSpec()` → illustrated-hero prompt + ≤3-word overlay.
- `src/lib/agents/longform/types.ts` — `TitlerOutputSchema`, `ThumbnailSpecSchema`, plan fields `title`/`thumbnail`.
- `src/lib/longform/ledger.ts` — `longform_title` + `longform_thumbnail` decision rows.
- `supabase/migrations/2026XXXX_longform_title_thumbnail.sql` — `your_videos.thumbnail_url` (if absent), `generated_title`.
- `src/lib/supabase/repositories/longform.ts` — store generated title + thumbnail_url.
- `scripts/render-worker/handlers/render-longform.ts` — render the hero thumbnail (Higgsfield + `drawtext`), upload, persist `thumbnail_url`.
- `src/lib/agents/longform/orchestrator.ts` — call `runTitler` + `buildThumbnailSpec`, add to plan + ledger.

---

# PHASE 1 — Hook & Structure craft

### Task 1: Structured hook + cliffhanger schemas (`types.ts`)

**Files:**
- Modify: `src/lib/agents/longform/types.ts:46-67` (Writer schemas), `:78-110` (Beat/Scene), `:115-137` (Plan)
- Test: `src/tests/lib/agents/longform/types.test.ts`

- [ ] **Step 1: Write failing tests** — append to `src/tests/lib/agents/longform/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  WriterHookSchema, WriterOutlineSchema, WriterOutputSchema, BeatRoleSchema, BeatSchema,
} from "@/lib/agents/longform/types";

describe("structured hook schema", () => {
  it("requires the peak→puncture→question pieces + open loops + tension anchor", () => {
    const ok = WriterHookSchema.parse({
      angle: "B58 makes supercar power on a budget",
      peak: "This engine makes 800 horsepower on stock internals.",
      puncture: "Every forum says that's impossible without forged pistons.",
      question: "So how is a commuter motor surviving supercar power?",
      promiseLine: "It comes down to three things, and none are what you think.",
      openLoops: ["why BMW overbuilt it", "the real $5–10k build", "what actually breaks first"],
      tensionAnchor: "the forums who say it will grenade",
      hook: "There's an engine in used 3-series that makes 800 horsepower on stock internals...",
    });
    expect(ok.openLoops).toHaveLength(3);
    expect(() => WriterHookSchema.parse({ angle: "x", hook: "y" })).toThrow(); // old shape rejected
    expect(() => WriterHookSchema.parse({ ...ok, openLoops: ["one"] })).toThrow(); // needs ≥2 loops
  });
  it("outline chapters carry a cliffhangerOut", () => {
    expect(() =>
      WriterOutlineSchema.parse({ chapters: [{ title: "t", purpose: "p" }] }),
    ).toThrow();
    const ok = WriterOutlineSchema.parse({ chapters: [{ title: "t", purpose: "p", cliffhangerOut: "so what breaks first?" }] });
    expect(ok.chapters[0].cliffhangerOut).toContain("breaks");
  });
  it("WriterOutput carries openLoops + tensionAnchor and beats carry beatRole", () => {
    expect(BeatRoleSchema.parse("hook")).toBe("hook");
    expect(BeatSchema.parse({
      index: 0, narrationSlice: "x", estDurationSeconds: 3, sceneDescription: "s",
      imagePrompt: "p", negativePrompt: "n",
    }).beatRole).toBe("exposition"); // default
    const out = WriterOutputSchema.parse({
      angle: "a", hook: "h", estimatedWords: 10,
      chapters: [{ title: "t", purpose: "p", narration: "n" }],
    });
    expect(out.openLoops).toEqual([]);
    expect(out.tensionAnchor).toBe("");
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`BeatRoleSchema` undefined, old hook shape passes).
Run: `npx vitest run src/tests/lib/agents/longform/types.test.ts`

- [ ] **Step 3: Edit `types.ts`** — replace `WriterHookSchema` (`:46-49`) with:

```ts
export const WriterHookSchema = z.object({
  angle: z.string().min(10).max(600),
  /** The most impressive/surprising TRUE thing, stated first — must carry a number, superlative, or paradox. */
  peak: z.string().min(8).max(300),
  /** The contradiction/stakes that punctures the peak ("But everyone says..."). */
  puncture: z.string().min(8).max(300),
  /** The open-loop question the whole video answers. */
  question: z.string().min(8).max(300),
  /** One line (~0:30) restating the title-promise as a route, not the answer. */
  promiseLine: z.string().min(8).max(300),
  /** 2–4 withheld payoffs teased in the open, paid off in later chapters. */
  openLoops: z.array(z.string().min(4).max(200)).min(2).max(4),
  /** The villain/consensus the whole script argues against. */
  tensionAnchor: z.string().min(4).max(200),
  /** The assembled spoken cold-open built from peak→puncture→promise stack→question/promise line. */
  hook: z.string().min(20).max(900),
});
```

Replace `WriterOutlineSchema` (`:50-52`) chapter object with `{ title, purpose, cliffhangerOut: z.string().min(4).max(300) }`. In `WriterOutputSchema` (`:56-66`) add after `hook`: `openLoops: z.array(z.string()).default([]), tensionAnchor: z.string().default(""),` and add `cliffhangerOut: z.string().default("")` to each chapter object. Add before `BeatSchema`:

```ts
export const BeatRoleSchema = z.enum(["hook", "stakes", "reveal", "exposition", "payoff", "transition"]);
export type BeatRole = z.infer<typeof BeatRoleSchema>;
```

In `BeatSchema` (`:78-93`) add `beatRole: BeatRoleSchema.default("exposition"),`. In `SceneItemsSchema` items (`:103-109`) add `beatRole: BeatRoleSchema.default("exposition"),`. In `PlanChapterSchema` (`:115-121`) add `cliffhangerOut: z.string().default(""),`. In `LongformPlanSchema` (`:122-137`) add `openLoops: z.array(z.string()).default([]), tensionAnchor: z.string().default(""),`.

- [ ] **Step 4: Run — expect PASS** (`npx vitest run src/tests/lib/agents/longform/types.test.ts`). Then full file batch later.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(longform): structured hook + cliffhanger + beatRole schemas"`

---

### Task 2: Banned-opener lint (`hook-lint.ts`)

**Files:**
- Create: `src/lib/agents/longform/hook-lint.ts`
- Test: `src/tests/lib/agents/longform/hook-lint.test.ts`

- [ ] **Step 1: Write failing test:**

```ts
import { describe, it, expect } from "vitest";
import { opensOnCategoryContext } from "@/lib/agents/longform/hook-lint";

describe("opensOnCategoryContext", () => {
  it("flags the real B58 failure open (category context, no claim)", () => {
    expect(opensOnCategoryContext("BMW builds commuter cars, sedans, SUVs, cars meant to be leased, driven gently, and forgotten.")).toBe(true);
    expect(opensOnCategoryContext("For decades, the inline six was the heart of BMW.")).toBe(true);
    expect(opensOnCategoryContext("When you think of Toyota, you think of reliability.")).toBe(true);
  });
  it("passes a claim-first open (number/superlative/paradox)", () => {
    expect(opensOnCategoryContext("There's an engine in used 3-series that makes 800 horsepower on stock internals.")).toBe(false);
    expect(opensOnCategoryContext("This is the cheapest path to 800 wheel horsepower on Earth.")).toBe(false);
    expect(opensOnCategoryContext("Nobody was ever supposed to find out what this block could do.")).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module missing).
- [ ] **Step 3: Implement `hook-lint.ts`:**

```ts
// src/lib/agents/longform/hook-lint.ts
// Pure guard: rejects a cold-open that begins with generic CATEGORY CONTEXT instead of a claim.
// The B58 video died opening "BMW builds commuter cars..." — the #1 retention mistake (findings L1).

const BANNED_OPENER =
  /^(the\s+\w+\s+(builds?|makes?|is|are|was|were)\b|[A-Z][A-Za-z]+\s+(builds?|makes?|is known for)\b|for\s+(decades|years|generations)\b|when\s+you\s+think\s+of\b|ever\s+since\b|since\s+the\s+\w+\b)/;

/** A claim-shaped first sentence has a number, or a curiosity/superlative word. */
const HOOK_SIGNAL = /\d|\b(never|most|only|impossible|secret|nobody|everyone|fastest|cheapest|best|worst|biggest|wrong|lie|truth|supposed to)\b/i;

/** True when the hook's FIRST sentence reads as category context (Wikipedia-style) with no claim. */
export function opensOnCategoryContext(hook: string): boolean {
  const first = (hook.trim().split(/(?<=[.!?])\s/)[0] ?? "").trim();
  if (!first) return false;
  return BANNED_OPENER.test(first) && !HOOK_SIGNAL.test(first);
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(longform): banned-opener lint for category-context hooks"`

---

### Task 3: Rewrite `hookPrompt` + consume playbook + regenerate-once (`writer.ts`)

**Files:**
- Modify: `src/lib/agents/longform/writer.ts:27-53` (`hookPrompt`), `:96-103` (hook pass)
- Test: `src/tests/lib/agents/longform/writer.test.ts` (extend existing; if absent, create)

- [ ] **Step 1: Write failing tests** (mock `generateObject` as the existing writer tests do — match their mocking style; if no writer test exists, create one mirroring `beat-planner.test.ts`'s `vi.mock("ai")`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const generateObject = vi.fn();
vi.mock("ai", () => ({ generateObject: (...a: unknown[]) => generateObject(...a), NoObjectGeneratedError: class { static isInstance() { return false; } } }));
vi.mock("@/lib/ai/gateway", () => ({ getClaudeModel: () => ({}) }));
vi.mock("@/lib/agents/longform/researcher", () => ({ runResearcher: async () => ({ facts: [], uncertain: [] }), renderFactSheet: () => "" }));

import { runLongformWriter } from "@/lib/agents/longform/writer";
import { EMPTY_LONGFORM_PLAYBOOK } from "@/lib/agents/longform/playbook";

beforeEach(() => generateObject.mockReset());

it("regenerates the hook once when it opens on category context", async () => {
  const banned = { angle: "the B58 story", peak: "BMW builds commuter cars.", puncture: "But not this one.", question: "Why?", promiseLine: "Three reasons.", openLoops: ["a", "b"], tensionAnchor: "forums", hook: "BMW builds commuter cars, sedans and SUVs. But not this one." };
  const good = { ...banned, peak: "This engine makes 800 horsepower on stock internals.", hook: "This engine makes 800 horsepower on stock internals. Everyone says that's impossible." };
  generateObject
    .mockResolvedValueOnce({ object: banned })   // hook attempt 1 (banned)
    .mockResolvedValueOnce({ object: good })     // hook attempt 2 (regenerated)
    .mockResolvedValueOnce({ object: { chapters: [{ title: "t", purpose: "p", cliffhangerOut: "what's next?" }] } }) // outline
    .mockResolvedValueOnce({ object: { narration: "Some grounded narration about the engine." } }); // narration
  const out = await runLongformWriter({ topic: "B58", targetDurationSeconds: 540, playbook: EMPTY_LONGFORM_PLAYBOOK });
  expect(out.hook).toContain("800 horsepower");
  expect(out.tensionAnchor).toBe("forums");
  expect(out.openLoops.length).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Rewrite `hookPrompt` in `writer.ts`** (replace `:27-53`). Keep the existing `benchLine` block (already consumes `ctx.playbook.retention`); add exemplar + angle-note consumption and the structured instruction:

```ts
function hookPrompt(ctx: WriterRunContext, retry: boolean): string {
  const ex = ctx.playbook.writer.exemplarHooks.length
    ? `\nProven hooks for this channel (emulate their SHAPE, not their words):\n${ctx.playbook.writer.exemplarHooks.map((h) => `- ${h}`).join("\n")}`
    : "";
  const angles = ctx.playbook.writer.winningAngleNotes.length
    ? `\nAngles that retained before (lean toward these shapes):\n${ctx.playbook.writer.winningAngleNotes.map((a) => `- ${a}`).join("\n")}`
    : "";
  const bar = ctx.playbook.retention;
  const benchLine =
    bar && bar.sampleSize > 0 && bar.medianFirst30sRetention != null
      ? `\nRETENTION BAR (your single most important constraint): past winners held ${Math.round(bar.medianFirst30sRetention * 100)}% of viewers through 0:30${bar.bestFirst30sRetention != null ? ` (best: ${Math.round(bar.bestFirst30sRetention * 100)}%)` : ""}. A slow open is the #1 reason videos die. Every clause must buy the next.`
      : "";
  const retryLine = retry
    ? `\nYOUR LAST ATTEMPT OPENED ON CATEGORY CONTEXT and was REJECTED. The very first sentence must NOT describe the brand/segment generally. Lead with the number/superlative/paradox.`
    : "";
  return `PASS:HOOK
You are the Writer for a faceless longform YouTube documentary on a CAR/automotive channel.
Topic: "${ctx.topic}"

Write the cold-open HOOK (first ~12-20 seconds spoken), built from these REQUIRED pieces IN ORDER:
1. PEAK — the single most impressive/surprising TRUE thing about the subject, as the FIRST sentence. It MUST contain a specific number, a superlative, or a paradox, and MUST NOT be category context. BANNED first sentences: "[Brand] builds/makes/is known for...", "For decades...", "When you think of...", anything that could open a Wikipedia article. (e.g. "There's an engine in used 3-series that makes 800 horsepower on stock internals.")
2. PUNCTURE — immediately contradict it or raise the stakes ("But everyone says that's impossible...", a cost, a myth, a threat), and establish the TENSION ANCHOR: the villain/consensus the whole video argues against.
3. PROMISE STACK — tease 2–4 specific payoffs you will WITHHOLD (these are the openLoops) plus why the viewer should care.
4. QUESTION + PROMISE LINE — pose the open-loop QUESTION the video answers, then a PROMISE LINE (~0:30) restating it as a route WITHOUT the answer ("...and it comes down to three things").
${FORMAT_RULES}${benchLine}${ex}${angles}${retryLine}
Assemble the spoken hook ("hook") from pieces 1–4 as flowing narration — no labels, no "hey guys", no title card.
Return JSON: { "angle": string, "peak": string, "puncture": string, "question": string, "promiseLine": string, "openLoops": string[], "tensionAnchor": string, "hook": string }.`;
}
```

In `runLongformWriter` (`:102-103`) replace the hook pass with a regenerate-once guard:

```ts
import { opensOnCategoryContext } from "@/lib/agents/longform/hook-lint";
// ...
// Pass 1: angle + structured hook. Regenerate ONCE if it opens on category context (findings L1).
let hookOut = await callObject(opus, WriterHookSchema, hookPrompt(ctx, false));
if (opensOnCategoryContext(hookOut.hook)) {
  hookOut = await callObject(opus, WriterHookSchema, hookPrompt(ctx, true));
}
```

Update the final `WriterOutputSchema.parse({...})` (`:136`) to include `openLoops: hookOut.openLoops, tensionAnchor: hookOut.tensionAnchor,` and add `cliffhangerOut: ch.cliffhangerOut` to each pushed chapter (Task 4 supplies `cliffhangerOut` on outline chapters).

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(longform): claim-first peak→puncture→question hook + playbook exemplars + regen guard"`

---

### Task 4: Outline emits `cliffhangerOut`; narration enforces but/so/therefore + loops + cliffhanger (`writer.ts`)

**Files:**
- Modify: `src/lib/agents/longform/writer.ts:55-77` (`outlinePrompt`, `narrationPrompt`), `:105-133` (outline fallback + narration loop)
- Test: extend `src/tests/lib/agents/longform/writer.test.ts`

- [ ] **Step 1: Write failing test** — assert the narration prompt the writer builds contains the causal-logic + cliffhanger instructions and the tension anchor. Easiest: export the prompt builders for unit testing, or assert via the mock that the 4th `generateObject` call's `prompt` includes `"but / so / therefore"` and the chapter `cliffhangerOut`. Add:

```ts
it("narration prompt enforces causal logic, pays off a loop, ends on the cliffhanger", async () => {
  const good = { angle:"a", peak:"This makes 800hp on stock internals.", puncture:"Forums say impossible.", question:"How?", promiseLine:"Three things.", openLoops:["why BMW overbuilt it","what breaks first"], tensionAnchor:"the forums", hook:"This makes 800 horsepower on stock internals." };
  generateObject
    .mockResolvedValueOnce({ object: good })
    .mockResolvedValueOnce({ object: { chapters: [{ title:"c1", purpose:"p1", cliffhangerOut:"so what breaks first?" }] } })
    .mockResolvedValueOnce({ object: { narration: "It makes power, so the car becomes the limit." } });
  await runLongformWriter({ topic:"B58", targetDurationSeconds: 540, playbook: EMPTY_LONGFORM_PLAYBOOK });
  const narrationPrompt = generateObject.mock.calls[2][0].prompt as string;
  expect(narrationPrompt).toMatch(/but.*so.*therefore/i);
  expect(narrationPrompt).toContain("so what breaks first?");      // the chapter cliffhanger
  expect(narrationPrompt).toContain("the forums");                  // the tension anchor
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Edit `writer.ts`.** `outlinePrompt` (`:55-63`): require `cliffhangerOut` per chapter and update the return-shape line:

```
Each chapter: a short internal title, a one-line purpose, and a "cliffhangerOut" — the UNANSWERED question this chapter ends on that pulls the viewer into the next (no chapter may end resolved/flat).
...
Return JSON: { "chapters": [{ "title": string, "purpose": string, "cliffhangerOut": string }] } with exactly ${chapterCount} items.
```

Update the outline fallback (`:111-114`) to add `cliffhangerOut: i === chapterCount - 1 ? "" : "and that raises the next question..."`.

`narrationPrompt` signature → `(ctx, chapter, wordBudget, grounding, tensionAnchor, openLoops)`. Insert before the ACCURACY line:

```
STORYTELLING (critical for retention):
- Connect every beat with CONSEQUENCE or REVERSAL — "but / so / therefore / which meant / and yet / the problem was". A new fact must follow from or overturn the previous one. NEVER chain with "and then", "also", "additionally", or a list. If two adjacent sentences could be reordered without breaking the logic, rewrite.
- This whole video argues against ONE tension anchor: "${tensionAnchor}". Push against it here where natural.
- Before any spec-heavy passage, pose the question the viewer is silently asking and answer it. Pair every number with a stakes line, a comparison, or "what this means for you".
- END this chapter on its cliffhanger so the next chapter answers it: "${chapter.cliffhangerOut}".
${openLoops.length ? `- Open loops this video promised (pay one off here if this chapter is where it lands): ${openLoops.map((l) => `"${l}"`).join(", ")}.` : ""}
```

Update the narration call site (`:127`) to pass `hookOut.tensionAnchor, hookOut.openLoops`, and push `cliffhangerOut: ch.cliffhangerOut` onto each chapter object.

- [ ] **Step 4: Run — expect PASS.** Then `npx vitest run src/tests/lib/agents/longform/` (writer + types + beat-planner all green).
- [ ] **Step 5: Commit** — `git commit -am "feat(longform): cliffhanger-out chapters + but/so/therefore narration + tension anchor"`

---

### Task 5: Retention-first length defaults (`duration.ts`)

**Files:**
- Modify: `src/lib/longform/duration.ts:8-9`
- Test: `src/tests/lib/longform/duration.test.ts` (extend; create if absent)

- [ ] **Step 1: Write failing test:**

```ts
import { describe, it, expect } from "vitest";
import { clampTargetDuration, MIN_DURATION_SECONDS, MAX_DURATION_SECONDS } from "@/lib/longform/duration";
it("enforces the retention-first length band (8–12 min, default 9)", () => {
  expect(MIN_DURATION_SECONDS).toBe(480);   // mid-roll floor (findings L20/L21)
  expect(MAX_DURATION_SECONDS).toBe(720);    // cap while channel is young
  expect(clampTargetDuration(60)).toBe(480); // sub-mid-roll clamped up
  expect(clampTargetDuration(900)).toBe(720); // over-long clamped down
  expect(clampTargetDuration(540)).toBe(540); // 9:00 default passes
});
```

- [ ] **Step 2: Run — expect FAIL** (currently 180/1200).
- [ ] **Step 3: Edit `duration.ts`** — `MIN_DURATION_SECONDS = 480; MAX_DURATION_SECONDS = 720;`. Leave `WORDS_PER_SECOND`, chapter math unchanged.
- [ ] **Step 4: Verify no other test asserts the old bounds** — `npx vitest run src/tests/lib/longform/duration.test.ts` and grep tests for `1200`/`180` duration assertions; fix any that break. Note: `LongformPlanSchema` keeps `min(180).max(1200)` for back-compat with old persisted plans — do NOT tighten the persisted schema.
- [ ] **Step 5: Commit** — `git commit -am "feat(longform): retention-first length band (480–720s, default 540)"`

---

### Task 6: Beat planner emits `beatRole` + tightened on-screen text (`beat-planner.ts`)

**Files:**
- Modify: `src/lib/agents/longform/beat-planner.ts:18-58` (`scenePrompt`), `:60-113` (item type + assembly)
- Test: `src/tests/lib/agents/longform/beat-planner.test.ts`

- [ ] **Step 1: Write failing test** — assert the scene prompt asks for `beatRole` + the ≤3-word on-screen-text contract, and the assembled beats carry `beatRole`. Mock `generateObject` to return items including `beatRole`; assert `beats[i].beatRole` is threaded through.

```ts
it("emits beatRole and a tightened ≤3-word onScreenText contract", async () => {
  const prompt = (scenePromptExport)(styleBibleFixture, "c", ["800 hp on stock internals"], "");
  expect(prompt).toMatch(/beatRole/);
  expect(prompt).toMatch(/3 words|≤\s*3/);
  // and the assembled beat carries the role returned by the model (see assembly change)
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Edit `beat-planner.ts`.** Tighten the on-screen-text paragraph (`:41-45`) to:

```
For each beat also write ON-SCREEN TEXT ("onScreenText"): the SINGLE claim or number this beat lands on — ≤3 words OR one number/stat (e.g. "800 HP", "$5–10K NOT $30K", "FORGED?"). It DUPLICATES the key claim, it does not caption the sentence. NEVER an encyclopedic label (no names, no "Fig. N", no specs read out). Prefer text on TURN / REVEAL / STAT beats; leave "" on pure transition/setup beats. ACCURACY: any number MUST match the verified facts / narration — never invent a figure.
```

Add a `beatRole` instruction + return-shape: append to the prompt before "Also do SOUND DESIGN":

```
For each beat also set "beatRole": one of "hook" | "stakes" | "reveal" | "exposition" | "payoff" | "transition" — its job in the story (the opening beats are "hook"; a number/claim is "reveal" or "stakes"; a punchline is "payoff"; connective beats are "transition"; the rest "exposition").
```

Update the return-shape line (`:55`) to include `"beatRole": "hook" | "stakes" | "reveal" | "exposition" | "payoff" | "transition"`. Extend `SceneItem` (`:60`) with `beatRole: BeatRole`. In the fallback (`:77`, `:81`) default `beatRole: "exposition"`. In `runBeatPlanner` assembly (`:100-111`) add `beatRole: items[i].beatRole` to the returned beat. Export `scenePrompt` for the test (rename import usage accordingly) or add a thin exported wrapper.

- [ ] **Step 4: Run — expect PASS;** then `npx vitest run src/tests/lib/agents/longform/`.
- [ ] **Step 5: Commit** — `git commit -am "feat(longform): per-beat beatRole + ≤3-word on-screen-text contract"`

---

### Task 7: Record new writer fields in the ledger (`ledger.ts`, `orchestrator.ts`)

**Files:**
- Modify: `src/lib/longform/ledger.ts` (writer row `chosen`), `src/lib/agents/longform/orchestrator.ts` (pass fields through)
- Test: `src/tests/lib/longform/ledger.test.ts`

- [ ] **Step 1: Write failing test** — the `writer`/`longform_script` ledger row's `chosen` now includes `openLoops`, `tensionAnchor`, and `cliffhangerOuts: string[]` (so the L2 distiller can later learn which structures retained). Assert shape.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Edit `buildLongformLedgerRows`** to add `openLoops`, `tensionAnchor`, `cliffhangerOuts: plan.chapters.map(c => c.cliffhangerOut)` to the writer row's `chosen`. Ensure `orchestrator.ts` threads `openLoops`/`tensionAnchor` from `WriterOutput` into the `LongformPlan` (`LongformPlanSchema` already extended in Task 1).
- [ ] **Step 4: Run — expect PASS;** then full `npm test`.
- [ ] **Step 5: Commit** — `git commit -am "feat(longform): ledger records hook structure for L2 learning"`

---

### Task 8: Phase 1 verification gate

- [ ] Run `npx tsc --noEmit` — expect clean.
- [ ] Run `npm test` — expect all green (≥723, plus the new tests).
- [ ] **Dry-run a plan** (no render): per `longform_local_dispatch_recipe` memory, run the writer plan-only path on topic "The $5,000 Way to 800 Horsepower" with the B58 trusted facts (`reference_b58_ground_truth_facts`) and eyeball the hook — first sentence must be claim-first, ≥2 open loops, every chapter has a cliffhangerOut. Use `env -u ANTHROPIC_BASE_URL` with a real `ANTHROPIC_API_KEY`.
- [ ] Commit any fixes. **Phase 1 ships independently** (better hooks) even if Phase 2 is deferred.

---

# PHASE 2 — Title + Thumbnail generators

> Independent of Phase 1's craft work; may be executed as its own pass. Implements findings L8–L11. Both stages feed the committed L2 store (`winningTitleFormulas`, `thumbnail.winningWordCombos`).

### Task 9: Titler schema + generator (`titler.ts`, `types.ts`)

**Files:**
- Create: `src/lib/agents/longform/titler.ts`
- Modify: `src/lib/agents/longform/types.ts` (add `TitlerOutputSchema`)
- Test: `src/tests/lib/agents/longform/titler.test.ts`

- [ ] **Step 1: Add `TitlerOutputSchema` to `types.ts`:**

```ts
export const TITLE_FORMULAS = ["verdict", "contrarian", "number", "stakes", "why-failed"] as const;
export const TitleCandidateSchema = z.object({
  title: z.string().min(8).max(70),
  formula: z.enum(TITLE_FORMULAS),
  hasNumber: z.boolean(),
});
export const TitlerOutputSchema = z.object({
  candidates: z.array(TitleCandidateSchema).min(5).max(5),
  chosen: z.string().min(8).max(70),
});
export type TitlerOutput = z.infer<typeof TitlerOutputSchema>;
```

- [ ] **Step 2: Write failing test** (mock `generateObject` like writer): `runTitler` returns 5 candidates, at least one `hasNumber`, `chosen` ≤60 chars, consumes `playbook.writer.winningTitleFormulas`. Validate the prompt contains the formula library + the verified-number requirement + the "don't restate the thumbnail" rule.

```ts
it("returns 5 candidates, ≥1 with a verified number, chosen front-loaded ≤60 chars", async () => {
  generateObject.mockResolvedValueOnce({ object: { candidates: [
    { title: "The $5,000 Way to 800 Horsepower", formula: "number", hasNumber: true },
    { title: "Forged Pistons Are a Waste of Money", formula: "contrarian", hasNumber: false },
    { title: "The Truth About 800whp on a B58", formula: "verdict", hasNumber: true },
    { title: "Why Forged Internals Are a Scam", formula: "why-failed", hasNumber: false },
    { title: "800 Horsepower for Wheel Money", formula: "stakes", hasNumber: true },
  ], chosen: "The $5,000 Way to 800 Horsepower" } });
  const out = await runTitler({ topic: "B58 800whp build", angle: "budget supercar power", factSheet: { facts: [{claim:"800whp",detail:"$5-10k",}], uncertain: [] }, playbook: EMPTY_LONGFORM_PLAYBOOK });
  expect(out.candidates).toHaveLength(5);
  expect(out.candidates.some(c => c.hasNumber)).toBe(true);
  expect(out.chosen.length).toBeLessThanOrEqual(60);
});
```

- [ ] **Step 3: Implement `titler.ts`** — `runTitler(ctx: { topic; angle; factSheet: FactSheet; playbook: LongformPlaybook })`. Model `claude-sonnet-4-5`. Prompt: emit 5 candidates spanning the formula library (verdict / contrarian / number / stakes / why-failed), each ≤60 chars front-loaded for mobile; ≥1 MUST embed a number drawn from the fact sheet; pick `chosen`; "the title must NOT restate the thumbnail's words (the thumbnail shows the subject + ≤3 words)". Inject `playbook.writer.winningTitleFormulas` as proven shapes. Reuse the `callObject` retry pattern.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(longform): titler stage — 5 ranked verdict/contrarian title candidates"`

### Task 10: Thumbnail spec (`thumbnail-spec.ts`, `types.ts`)

**Files:**
- Create: `src/lib/longform/thumbnail-spec.ts`
- Modify: `src/lib/agents/longform/types.ts` (`ThumbnailSpecSchema`)
- Test: `src/tests/lib/longform/thumbnail-spec.test.ts`

- [ ] **Step 1: Add `ThumbnailSpecSchema`:**

```ts
export const ThumbnailSpecSchema = z.object({
  heroPrompt: z.string().min(10),       // illustrated hero (reuses the style bible's positivePrefix)
  overlayText: z.string().max(24),      // ≤3 words / one number; "" = no text
  bigNumber: z.string().max(8).default(""), // optional giant stat ("800HP", "$5K")
});
export type ThumbnailSpec = z.infer<typeof ThumbnailSpecSchema>;
```

- [ ] **Step 2: Write failing test** — `buildThumbnailSpec({ subject, styleBible, claim })` returns a `heroPrompt` that includes the style bible's `positivePrefix` (stays on-brand, illustration-from-reference) + a single hero subject, and an `overlayText` of ≤3 words. Pure function (no LLM) for determinism, OR one LLM call to pick the 3 words — keep pure: derive `overlayText` from the provided `claim` truncated to ≤3 words; `heroPrompt` = `${styleBible.positivePrefix}. ${subject}, single hero subject, bold high-contrast, centered, 16:9`.
- [ ] **Step 3: Implement `thumbnail-spec.ts`** (pure). Cap `overlayText` to 3 words; pull `bigNumber` if the claim contains a number token.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -am "feat(longform): thumbnail spec (illustrated hero + ≤3-word overlay)"`

### Task 11: DB — `your_videos.thumbnail_url` + generated title

**Files:**
- Create: `supabase/migrations/2026XXXXXXXXXX_longform_title_thumbnail.sql`
- Modify: `src/lib/supabase/types.ts` (regen or hand-add columns), `src/lib/supabase/repositories/longform.ts:21`

- [ ] **Step 1:** Migration: `alter table public.your_videos add column if not exists thumbnail_url text, add column if not exists generated_title text;` (check first whether `thumbnail_url` already exists — the shorts pipeline may have added it; if so, only add `generated_title`).
- [ ] **Step 2:** `createLongformDraft` — set `title: args.generatedTitle ?? args.topic` and persist `thumbnail_url` when present. Add `generatedTitle?` + `thumbnailUrl?` to its params.
- [ ] **Step 3:** Regenerate Supabase types (`npx supabase gen types` per repo convention) or hand-add the two columns to `your_videos` Row/Insert/Update in `src/lib/supabase/types.ts`.
- [ ] **Step 4:** `npx tsc --noEmit` clean. **Do NOT apply the migration to prod** — per `feedback_prod_migration_authorization`, ask Darius in-chat before `apply_migration` to prod; dev/branch only here.
- [ ] **Step 5: Commit** — `git commit -am "feat(longform): persist generated title + thumbnail_url"`

### Task 12: Wire titler + thumbnail into the orchestrator + ledger

**Files:**
- Modify: `src/lib/agents/longform/orchestrator.ts`, `src/lib/longform/ledger.ts`, `src/lib/agents/longform/deps.ts`
- Test: `src/tests/lib/agents/longform/orchestrator.test.ts`, `ledger.test.ts`

- [ ] **Step 1: Failing test** — after the writer + style picker, the orchestrator calls `runTitler` and `buildThumbnailSpec`, puts `title`/`thumbnail` on the `LongformPlan`, persists the generated title, and writes a `longform_title` ledger row (`chosen: { title, formula, candidates }`) + a `longform_thumbnail` row (`chosen: { overlayText, bigNumber }`).
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3:** Add `title`/`thumbnail` to `LongformPlanSchema`; call the two stages in `runLongformPipeline` after style pick (so the thumbnail can reuse the style bible); pass `generatedTitle`/`thumbnailSpec` into `createLongformDraft`; add the two ledger rows in `buildLongformLedgerRows`.
- [ ] **Step 4: Run — expect PASS;** full `npm test`.
- [ ] **Step 5: Commit** — `git commit -am "feat(longform): orchestrator generates title + thumbnail; ledger records both"`

### Task 13: Render the hero thumbnail (render worker)

**Files:**
- Modify: `scripts/render-worker/handlers/render-longform.ts`
- Test: worker test if present; else a focused unit test on the thumbnail-render helper extracted into `scripts/render-worker/lib/`.

- [ ] **Step 1:** Extract a `renderThumbnail({ spec, styleBible })` helper into `scripts/render-worker/lib/thumbnail.ts`: generate the hero image via the existing `generateImage` (reference-driven path when the preset is), then overlay `overlayText`/`bigNumber` with the existing `drawtext` approach (bold, high-contrast, bottom-third), output a 1280×720 JPg, upload to Blob, return the URL.
- [ ] **Step 2:** In `render-longform.ts`, after the video uploads, if `plan.thumbnail` is present, render + upload the thumbnail and write `thumbnail_url` onto `your_videos`.
- [ ] **Step 3:** Unit-test the overlay helper (word cap, number rendering) with a stubbed image generator.
- [ ] **Step 4:** `npm test` green; manual: render one thumbnail locally and eyeball (single subject, ≤3 words, readable at feed size).
- [ ] **Step 5: Commit** — `git commit -am "feat(render-worker): generate illustrated hero thumbnail with bold overlay"`

### Task 14: Phase 2 verification + handoff

- [ ] `npx tsc --noEmit` clean; `npm test` green.
- [ ] Dry-run: generate a plan for a real topic; confirm 5 title candidates (≥1 with a number), a thumbnail spec with ≤3 words, both ledger rows written.
- [ ] Leave prod migration application + the actual B58 re-render/upload for Darius (operator/credits/accounts gates: `reference_check_credits_before_render`, `feedback_prod_migration_authorization`).

---

## Self-Review

**Spec coverage:** L1 (banned opener → Task 2/3), L2 (peak→puncture→question → Task 1/3), L3 (promiseLine → Task 1/3), L4 (hook beats/title card → beatRole Task 6 + render modulation noted), L5 (cliffhanger-out → Task 1/4), L6 (beatRole pacing → Task 6; render-time Ken-Burns modulation is a follow-on noted in Task 6), L12 (but/so/therefore → Task 4), L13 (tensionAnchor → Task 1/3/4), L14 (openLoops promise stack → Task 1/3/4), L15 (anchors — partial: narration rule in Task 4; researcher comparison-anchor fetch is a noted follow-on, not in this plan), L17–L19 (on-screen text → Task 6; visual-metaphor scene rule is a small beat-planner add — fold into Task 6), L20/L21 (length → Task 5), L8–L11 (titles/thumbnails → Tasks 9–13). L16 (teaser montage) and L22–L24 (algorithm/binge/browse-tag) are **out of scope here** (topic-selection + render-sequence work) — flag as a follow-on plan.

**Placeholder scan:** prompts, schemas, and the lint are given verbatim; wiring tasks (7, 11, 12, 13) name exact files + the exact `chosen`/column shapes. Render-worker internals (Task 13) reference the existing `generateImage`/`drawtext` — the implementer must read `render-longform.ts` for their signatures.

**Type consistency:** `WriterHookSchema` fields (`peak/puncture/question/promiseLine/openLoops/tensionAnchor/hook`) are referenced identically in Tasks 1, 3, 4. `BeatRoleSchema` enum values match between `types.ts` (Task 1) and the beat-planner prompt + assembly (Task 6). `cliffhangerOut` is on the outline chapter (Task 1/4), threaded to `PlanChapterSchema` (Task 1) and the ledger (Task 7). `TitlerOutputSchema`/`ThumbnailSpecSchema` defined in Task 9/10, consumed in Task 12.

**Follow-on (separate plan):** researcher comparison-anchor fetch (L15), teaser-montage stage (L16), topic-selection browse/serve tag + binge-cluster sequencing + end-screens (L22–L24), render-time Ken-Burns modulation by `beatRole` (L6).
