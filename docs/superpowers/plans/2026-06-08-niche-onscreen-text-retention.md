# On-Screen Text = Per-Beat Retention Hook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make generated on-screen captions the single retention hook for each beat (a stat/claim/question tied to the narration), and stop the naturalist style from inventing encyclopedic labels (Latin names, "Fig. N").

**Architecture:** App-side only — no render-worker change, no DB migration. A new first-class `onScreenText` beat field (the hook) is produced by the beat-planner and baked into the stored `imagePrompt` by the pure `assembleImagePrompt`, which instructs the image model to render that exact caption as the only text. The naturalist preset's positive prefix drops the "field guide" cue (the actual label-suppressor, since negative prompts are NOT sent at render time).

**Tech Stack:** TypeScript, Zod, Vitest, Vercel AI SDK (`generateObject`). Image model `nano_banana_2` (strong text renderer).

**Spec:** `docs/superpowers/specs/2026-06-08-niche-onscreen-text-retention-design.md`

---

## File structure
- Modify `src/lib/longform/image-prompt.ts` — `assembleImagePrompt` gains `onScreenText`, bakes the caption/no-text instruction.
- Modify `src/tests/lib/longform/image-prompt.test.ts` — cover both branches.
- Modify `src/lib/agents/longform/types.ts` — `SceneItemsSchema` item + `BeatSchema` gain `onScreenText`.
- Modify `src/lib/agents/longform/beat-planner.ts` — prompt asks for `onScreenText`; thread it through.
- Modify `src/tests/lib/agents/longform/beat-planner.test.ts` — mocks return `onScreenText`; assert it threads.
- Modify `src/lib/longform/style-presets.ts` — naturalist positive prefix drops "field guide"; negative gains label terms.
- Create `src/tests/lib/longform/naturalist-preset.test.ts` — pin the preset strings.

---

# PHASE 1 — On-screen-text retention captions

## Task 1: `assembleImagePrompt` bakes the exact caption (or no-text)

**Files:**
- Modify: `src/lib/longform/image-prompt.ts`
- Test: `src/tests/lib/longform/image-prompt.test.ts`

- [ ] **Step 1: Write the failing tests** (ADD to the existing describe block; keep the existing tests)

```ts
  it("bakes an exact on-screen caption when one is provided", () => {
    const out = assembleImagePrompt({ sceneDescription: "a tiny wren on a branch", styleBible: bible, onScreenText: "14 grams" });
    expect(out.prompt).toContain('reading exactly "14 grams"');
    expect(out.prompt).toContain("the only text in the image");
  });

  it("instructs no text when the caption is empty or absent", () => {
    const out = assembleImagePrompt({ sceneDescription: "a misty forest at dawn", styleBible: bible });
    expect(out.prompt).toContain("no on-screen text");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/lib/longform/image-prompt.test.ts`
Expected: FAIL — `onScreenText` not accepted; the caption/no-text strings aren't in the prompt.

- [ ] **Step 3: Implement** — replace the body of `src/lib/longform/image-prompt.ts` from the `AssembleArgs` interface through the end of `assembleImagePrompt` with:

```ts
export interface AssembleArgs {
  sceneDescription: string;
  styleBible: StyleBible;
  /** The one retention-hook caption to render on-screen; "" / absent = render no text. */
  onScreenText?: string;
}

export interface AssembledPrompt {
  prompt: string;
  negativePrompt: string;
}

export function assembleImagePrompt({ sceneDescription, styleBible, onScreenText }: AssembleArgs): AssembledPrompt {
  const scene = sceneDescription.replace(/\s+/g, " ").trim();
  const caption = (onScreenText ?? "").trim();
  const textInstruction = caption
    ? `on-screen caption reading exactly "${caption}", as clean bold hand-lettered type, the only text in the image`
    : "no on-screen text, labels, or captions";
  const prompt = [
    styleBible.positivePrefix,
    scene,
    styleBible.framing,
    styleBible.lighting,
    styleBible.palette,
    textInstruction,
    "16:9 aspect ratio, wide landscape composition",
  ].join(". ");
  return { prompt, negativePrompt: styleBible.negativePrompt };
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/tests/lib/longform/image-prompt.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS (new + existing) + clean. (The existing tests pass no `onScreenText`, so they hit the "no on-screen text" branch, which doesn't affect their `toContain(scene)` / `toContain("16:9")` / `not toContain("  ")` assertions.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/longform/image-prompt.ts src/tests/lib/longform/image-prompt.test.ts
git commit -m "feat(longform): assembleImagePrompt bakes an exact on-screen caption (or no-text)"
```

---

## Task 2: Beat-planner produces `onScreenText` per beat

**Files:**
- Modify: `src/lib/agents/longform/types.ts` (`SceneItemsSchema`, `BeatSchema`)
- Modify: `src/lib/agents/longform/beat-planner.ts`
- Test: `src/tests/lib/agents/longform/beat-planner.test.ts`

Schema + code + test change together so the suite stays green (the scene schema gaining a required field would otherwise break the beat-planner test mocks).

- [ ] **Step 1: Update the schemas** in `src/lib/agents/longform/types.ts`

In `SceneItemsSchema`, add `onScreenText` to the item object (currently `z.object({ scene: z.string().min(1), sound: z.string() })`):

```ts
export const SceneItemsSchema = z.object({
  items: z.array(z.object({ scene: z.string().min(1), onScreenText: z.string(), sound: z.string() })).min(1),
});
```

In `BeatSchema`, add `onScreenText` (optional, like `soundEffect`, so old plans/fixtures still validate and the field is preserved on parse rather than stripped):

```ts
  /** The single retention-hook caption rendered on-screen for this beat ("" = no text). */
  onScreenText: z.string().optional(),
```

- [ ] **Step 2: Update the beat-planner** in `src/lib/agents/longform/beat-planner.ts`

(a) The `SceneItem` interface (line 49):

```ts
interface SceneItem { scene: string; onScreenText: string; sound: string }
```

(b) Rewrite `scenePrompt`. Remove the on-screen-text sentence from the stick-figure `guidance` branch (it moves to a shared instruction), and add a shared `onScreenText` instruction + the new return shape. Replace the whole `scenePrompt` function with:

```ts
function scenePrompt(styleBible: StyleBible, chapterTitle: string, slices: string[]): string {
  const numbered = slices.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const guidance =
    styleBible.presetId === "stick-figure-animated"
      ? `For each narration beat below, describe ONE clear, simple doodle of exactly what the narrator is
saying at that moment. Make the video VISUALLY INTERESTING and VARIED — across consecutive beats CHANGE the
composition, the camera distance, the setting and the background color, and mix the approach: a character in
a scene, a close-up of an object, a simple diagram or chart, a before/after, a map, a visual metaphor. Do
NOT keep drawing the same "stick figure standing in a plain room" — each image should feel fresh and
different from the ones around it. One clear scene, never a collage or multiple panels. Describe only WHAT is
happening (subject, action, setting) in one short plain sentence — do NOT include any drawing-style,
lighting, or quality words (those are added automatically), and do NOT put on-screen text in the scene.`
      : `For each narration beat below, describe ONE concrete, filmable VISUAL SCENE that literally
illustrates what is said at that moment (no random images, no collage). Subjects centered. Think like a
${styleBible.presetId} documentary. Describe the subject and setting only — do NOT include style/lighting/quality
words (those are added automatically) and do NOT put on-screen text in the scene. Keep each scene one vivid sentence.`;
  return `You are the Beat Planner. ${guidance}

For each beat also write ON-SCREEN TEXT ("onScreenText"): the ONE thing the viewer should absorb from that
moment — a punchy stat, a bold claim, a question, or a key phrase (≤ ~5 words), pulled from the narration so
it reinforces what is being said and drives retention. It must NEVER be an encyclopedic label — no species or
Latin names, no "Fig. N" captions, no figure numbers. Put on-screen text ONLY in this field, never inside
"scene". Most beats should have text; use "" only when a clean wordless image is clearly stronger.

Also do SOUND DESIGN: for each beat give a short "sound" — a text-to-SFX prompt for a real-world
sound that fits THAT moment (e.g. "a hawk screech", "wind rustling through trees", "wings flapping",
"a heartbeat thudding", "soft rain"). Use a sound on the beats where one clearly belongs; use an EMPTY
string "" for abstract, quiet, or diagram/text-only beats. Keep each sound a few words, concrete, single.

Chapter: "${chapterTitle}"
Return EXACTLY ${slices.length} items, in order, as JSON: { "items": [{ "scene": string, "onScreenText": string, "sound": string }] }.
Beats:
${numbered}`;
}
```

(c) In `sceneItems`, the fallback + the count-mismatch repair must include `onScreenText: ""`:

```ts
      items = slices.map((s) => ({ scene: s, onScreenText: "", sound: "" })); // fallback: slice as scene, no text/SFX
```
and
```ts
  // Repair count mismatch: pad with the slice text (no text/sound), truncate extras.
  return slices.map((slice, i) => items[i] ?? { scene: slice, onScreenText: "", sound: "" });
```

(d) In `runBeatPlanner`, thread `onScreenText` into `assembleImagePrompt` and onto the beat (the `beats = slices.map(...)` block):

```ts
    const beats = slices.map((slice, i) => {
      const { prompt, negativePrompt } = assembleImagePrompt({
        sceneDescription: items[i].scene,
        onScreenText: items[i].onScreenText,
        styleBible: ctx.styleBible,
      });
      const sound = items[i].sound?.trim();
      return {
        index: i,
        narrationSlice: slice.text,
        estDurationSeconds: slice.estDurationSeconds,
        sceneDescription: items[i].scene,
        onScreenText: items[i].onScreenText,
        imagePrompt: prompt,
        negativePrompt,
        ...(sound ? { soundEffect: sound } : {}),
      };
    });
```

- [ ] **Step 3: Update the beat-planner test** in `src/tests/lib/agents/longform/beat-planner.test.ts`

The mocked `generateObject` returns must now include `onScreenText` on every item (the schema requires it). Update each `items: Array.from(... ({ scene, sound }))` / `items: [{ scene, sound }]` mock to include `onScreenText`. Concretely:
- The first test's mock (~line 41): `({ scene: \`cinematic scene ${i}\`, onScreenText: \`hook ${i}\`, sound: i % 2 === 0 ? "a hawk screech" : "" })`.
- The count-mismatch test (~line 66): `{ object: { items: [{ scene: "only one scene", onScreenText: "the hook", sound: "" }] } }`.
- The stick-figure test (~line 78) and the other documentary mock (~line 104): add `onScreenText: \`hook ${i}\`` to each item.

Then ADD assertions to the first test (after the existing `beats` assertions) proving the caption threads through:

```ts
    expect(beats[0].onScreenText).toBe("hook 0");
    expect(beats[0].imagePrompt).toContain('reading exactly "hook 0"');
```

And in the fallback test (model fails, ~line 57-63) add:

```ts
    expect(beats[0].onScreenText).toBe("");
    expect(beats[0].imagePrompt).toContain("no on-screen text");
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/tests/lib/agents/longform/beat-planner.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS + clean.

- [ ] **Step 5: Run the full suite** (the orchestrator builds a `LongformPlan` from these beats; confirm nothing else broke)

Run: `npx vitest run 2>&1 | tail -3`
Expected: green (≈654+).

- [ ] **Step 6: Commit**

```bash
git add src/lib/agents/longform/types.ts src/lib/agents/longform/beat-planner.ts src/tests/lib/agents/longform/beat-planner.test.ts
git commit -m "feat(longform): beat-planner emits a per-beat onScreenText retention hook"
```

---

## Task 3: Naturalist preset stops inventing encyclopedic labels

**Files:**
- Modify: `src/lib/longform/style-presets.ts` (the `naturalist-illustration` entry)
- Test: `src/tests/lib/longform/naturalist-preset.test.ts`

Note: the file comment states the `negativePrompt` is NOT sent at render time, so the real suppressor is the POSITIVE change (dropping "field guide") plus Task 1's "the only text in the image" instruction. The negative terms are added for the stored-plan record / future flywheel.

- [ ] **Step 1: Write the failing test**

```ts
// src/tests/lib/longform/naturalist-preset.test.ts
import { describe, it, expect } from "vitest";
import { getStylePreset } from "@/lib/longform/style-presets";

describe("naturalist-illustration preset — no auto encyclopedic labels", () => {
  const p = getStylePreset("naturalist-illustration");
  it("drops the 'field guide' cue that makes the model add Latin labels", () => {
    expect(p.positivePrefix).not.toMatch(/field guide/i);
    expect(p.positivePrefix).toMatch(/storybook/i); // still the inked-watercolor aesthetic
  });
  it("records label-suppression terms in the negative prompt", () => {
    expect(p.negativePrompt).toMatch(/latin names/i);
    expect(p.negativePrompt).toMatch(/figure numbers/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/longform/naturalist-preset.test.ts`
Expected: FAIL — positivePrefix still contains "field guide"; negative lacks the terms.

- [ ] **Step 3: Edit the `naturalist-illustration` entry** in `src/lib/longform/style-presets.ts`

Change the last line of its `positivePrefix` from:
```ts
      "gentle ambient light, beautiful and polished, the look of a high-end illustrated field guide",
```
to:
```ts
      "gentle ambient light, beautiful and polished, the polished look of a fine hand-illustrated nature storybook plate",
```

Change its `negativePrompt` from:
```ts
    negativePrompt: `${NEG_COMMON}, doodle, stick figure, childish drawing, flat vector, cartoon, ` +
      `3d render, photograph, low effort, sketchy`,
```
to:
```ts
    negativePrompt: `${NEG_COMMON}, doodle, stick figure, childish drawing, flat vector, cartoon, ` +
      `3d render, photograph, low effort, sketchy, latin names, species labels, scientific names, ` +
      `figure numbers, multiple text labels, encyclopedic captions`,
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run src/tests/lib/longform/naturalist-preset.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/longform/style-presets.ts src/tests/lib/longform/naturalist-preset.test.ts
git commit -m "fix(longform): naturalist preset stops auto-adding Latin/encyclopedic labels"
```

---

### Phase 1 verification gate

- [ ] **Full suite + typecheck green:**

```bash
npx vitest run && npx tsc -p tsconfig.json --noEmit
```
Expected: all green; clean.

- [ ] **Live proof** (dev server `env -u ANTHROPIC_BASE_URL npm run dev` + `npm run render-worker` running):
  1. Open `/niches`, generate a niche → at the checkpoint, peek the plan (e.g. via `/api/niches/studio/[draftId]/status`) and confirm each beat now carries an `onScreenText` hook (a stat/claim/question), and the `imagePrompt` contains `reading exactly "..."`.
  2. **Approve & render spends credits — confirm with Darius first.** On completion, watch the frames: on-screen captions are retention hooks (numbers, claims, questions), with NO Latin names / "Fig. N".

---

## Notes for the implementer
- No render-worker change: `assembleImagePrompt`'s output is the stored `imagePrompt`, which the worker renders directly; `onScreenText` rides in the plan JSON (no migration).
- `onScreenText` is required in `SceneItemsSchema` (forces the LLM to produce it; a miss triggers the existing fallback) but optional in `BeatSchema` (back-compat + it's preserved on parse, not stripped).
- The real label-suppressor is the POSITIVE prompt (Task 1 "only text" + Task 3 dropping "field guide"); negative prompts are not sent at render time.
