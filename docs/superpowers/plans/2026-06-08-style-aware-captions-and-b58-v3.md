# Style-Aware Captions + B58 v3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make on-screen captions style-aware (technical diagrams keep their own text + a sparse headline hook; naturalist keeps "only text"), then generate an ~8.5-min B58 v3 for Darius's real car channel.

**Architecture:** Add an `onScreenTextMode` ("exclusive" default | "additive") to the StyleBible; `assembleImagePrompt` and the beat-planner's caption-frequency guidance both key off it. `technical-illustration` becomes `additive` (caption coexists with diagram text; captions only on a few key beats). No worker change, no DB migration. Then a generation run dispatches the longer B58 via the Lab.

**Tech Stack:** TypeScript, Zod, Vitest, Vercel AI SDK. Image model `nano_banana_2`.

**Spec:** `docs/superpowers/specs/2026-06-08-style-aware-captions-and-b58-v3-design.md`

---

## File structure
- Modify `src/lib/longform/style-presets.ts` — `StyleBible.onScreenTextMode`; `technical-illustration` → `additive` + style-consistency touch.
- Modify `src/lib/longform/image-prompt.ts` — `assembleImagePrompt` mode-aware.
- Modify `src/tests/lib/longform/image-prompt.test.ts` — cover additive + the preset mode.
- Modify `src/lib/agents/longform/beat-planner.ts` — caption-frequency guidance keys off the mode.
- Modify `src/tests/lib/agents/longform/beat-planner.test.ts` — cover sparse-vs-frequent guidance.

---

# PHASE 1 — Style-aware captions, then generate the B58 v3

## Task 1: `onScreenTextMode` + mode-aware `assembleImagePrompt`

**Files:**
- Modify: `src/lib/longform/style-presets.ts`
- Modify: `src/lib/longform/image-prompt.ts`
- Test: `src/tests/lib/longform/image-prompt.test.ts`

- [ ] **Step 1: Add the field + set the preset** in `src/lib/longform/style-presets.ts`

In the `StyleBible` interface, add (after `soundEffectsEnabled?: boolean;`):
```ts
  /** How on-screen text relates to the rest of the image:
   *  "exclusive" (default) — the caption is the ONLY text; everything else is suppressed.
   *  "additive" — the caption is a headline that COEXISTS with the scene's own labels / diagram
   *  text (e.g. technical diagrams whose internal text is the content). */
  onScreenTextMode?: "exclusive" | "additive";
```

In the `technical-illustration` preset entry: (a) append the style-consistency touch to the END of its `positivePrefix` (change `"NOT photorealistic, an illustration"` to the version below), and (b) add the mode after `soundEffectsEnabled: false,`:
```ts
      "NOT a busy diagram, NOT text-heavy, NOT photorealistic, an illustration in a consistent fine " +
      "hand-inked line-art style, not cel-shaded, not flat cartoon",
```
```ts
    soundEffectsEnabled: false, // engine sounds can't be made authentic via text-to-SFX — don't bother
    onScreenTextMode: "additive", // technical diagrams keep their own text; the caption is an added headline
```

- [ ] **Step 2: Write the failing tests** — ADD to `src/tests/lib/longform/image-prompt.test.ts` (the describe already imports `getStylePreset`):
```ts
  it("additive mode: the caption coexists with the scene's own labels (not 'only text')", () => {
    const tech = getStylePreset("technical-illustration");
    const out = assembleImagePrompt({ sceneDescription: "a labeled dyno chart", styleBible: tech, onScreenText: "550 hp wall" });
    expect(out.prompt).toContain('reading exactly "550 hp wall"');
    expect(out.prompt).toContain("alongside any labels");
    expect(out.prompt).not.toContain("the only text in the image");
  });

  it("additive mode with no caption adds no text instruction (diagram text stands)", () => {
    const tech = getStylePreset("technical-illustration");
    const out = assembleImagePrompt({ sceneDescription: "an invoice with line items", styleBible: tech });
    expect(out.prompt).not.toContain("no on-screen text");
    expect(out.prompt).not.toContain("reading exactly");
  });

  it("technical-illustration is additive; naturalist defaults to exclusive", () => {
    expect(getStylePreset("technical-illustration").onScreenTextMode).toBe("additive");
    expect(getStylePreset("naturalist-illustration").onScreenTextMode).toBeUndefined();
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/tests/lib/longform/image-prompt.test.ts`
Expected: the new additive tests FAIL (assembleImagePrompt still emits "only text" for technical).

- [ ] **Step 4: Make `assembleImagePrompt` mode-aware** — replace the body of `assembleImagePrompt` in `src/lib/longform/image-prompt.ts` with:
```ts
export function assembleImagePrompt({ sceneDescription, styleBible, onScreenText }: AssembleArgs): AssembledPrompt {
  const scene = sceneDescription.replace(/\s+/g, " ").trim();
  const caption = (onScreenText ?? "").trim();
  const additive = styleBible.onScreenTextMode === "additive";
  let textInstruction: string | null;
  if (caption) {
    textInstruction = additive
      ? `a bold readable headline caption reading exactly "${caption}", alongside any labels the illustration itself needs`
      : `on-screen caption reading exactly "${caption}", as clean bold hand-lettered type, the only text in the image`;
  } else {
    // additive styles keep the scene's own labels/diagram text; exclusive styles suppress all text.
    textInstruction = additive ? null : "no on-screen text, labels, or captions";
  }
  const prompt = [
    styleBible.positivePrefix,
    scene,
    styleBible.framing,
    styleBible.lighting,
    styleBible.palette,
    ...(textInstruction ? [textInstruction] : []),
    "16:9 aspect ratio, wide landscape composition",
  ].join(". ");
  return { prompt, negativePrompt: styleBible.negativePrompt };
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/tests/lib/longform/image-prompt.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS + clean. The existing exclusive tests use `cinematic-realistic` / `editorial-graphic` (no mode → exclusive), so "only text" / "no text" still hold.

- [ ] **Step 6: Commit**

```bash
git add src/lib/longform/style-presets.ts src/lib/longform/image-prompt.ts src/tests/lib/longform/image-prompt.test.ts
git commit -m "feat(longform): style-aware captions — additive mode keeps diagram text (technical-illustration)"
```

---

## Task 2: Caption frequency keys off the mode (beat-planner)

**Files:**
- Modify: `src/lib/agents/longform/beat-planner.ts`
- Test: `src/tests/lib/agents/longform/beat-planner.test.ts`

- [ ] **Step 1: Write the failing tests** — ADD to `src/tests/lib/agents/longform/beat-planner.test.ts` (mirror the existing prompt-capture pattern):
```ts
  it("uses sparse caption guidance for additive (technical) styles", async () => {
    let captured = "";
    vi.mocked(generateObject).mockImplementation(async (...allArgs: unknown[]) => {
      const opts = allArgs[0] as { prompt?: string };
      captured = opts?.prompt ?? "";
      const n = Number(captured.match(/EXACTLY (\d+) items/)?.[1] ?? 1);
      return { object: { items: Array.from({ length: n }, (_, i) => ({ scene: `tech scene ${i}`, onScreenText: "", sound: "" })) } } as never;
    });
    await runBeatPlanner({
      styleBible: getStylePreset("technical-illustration"),
      playbook: EMPTY_LONGFORM_PLAYBOOK,
      chapters: [{ index: 0, title: "The block", narration: "The block is aluminum. The bores are sleeved. It does not flex under boost." }],
    });
    const p = captured.toLowerCase();
    expect(p).toContain("keep it clean");
    expect(p).toMatch(/only on the few beats/);
    expect(p).not.toContain("most beats should have text");
  });

  it("uses frequent caption guidance for exclusive (default) styles", async () => {
    let captured = "";
    vi.mocked(generateObject).mockImplementation(async (...allArgs: unknown[]) => {
      const opts = allArgs[0] as { prompt?: string };
      captured = opts?.prompt ?? "";
      const n = Number(captured.match(/EXACTLY (\d+) items/)?.[1] ?? 1);
      return { object: { items: Array.from({ length: n }, (_, i) => ({ scene: `scene ${i}`, onScreenText: `hook ${i}`, sound: "" })) } } as never;
    });
    await runBeatPlanner(ctx()); // cinematic-realistic = exclusive default
    const p = captured.toLowerCase();
    expect(p).toContain("most beats should have text");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/lib/agents/longform/beat-planner.test.ts`
Expected: the additive test FAILS (the prompt always says "Most beats should have text").

- [ ] **Step 3: Make the frequency guidance mode-aware** in `src/lib/agents/longform/beat-planner.ts`

Inside `scenePrompt`, before the `return`, compute the frequency clause:
```ts
  const frequency =
    styleBible.onScreenTextMode === "additive"
      ? `Keep it clean: leave onScreenText "" on most beats — add a short hook ONLY on the few beats where a key stat or turning point really lands.`
      : `Most beats should have text; use "" only when a clean wordless image is clearly stronger.`;
```

Then in the returned template, replace the last sentence of the ON-SCREEN TEXT paragraph — change:
```
Put on-screen text ONLY in this field, never inside "scene". Most beats should have text; use "" only when a clean wordless image is clearly stronger.
```
to:
```
Put on-screen text ONLY in this field, never inside "scene". ${frequency}
```
(Leave the rest of that paragraph — "the ONE thing the viewer should absorb… never an encyclopedic label…" — unchanged.)

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/tests/lib/agents/longform/beat-planner.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS + clean. (The pre-existing prompt-capture tests don't assert on the old sentence, so they still pass.)

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run 2>&1 | tail -3`
Expected: green (≈660+).

- [ ] **Step 6: Commit**

```bash
git add src/lib/agents/longform/beat-planner.ts src/tests/lib/agents/longform/beat-planner.test.ts
git commit -m "feat(longform): beat-planner caption frequency keys off onScreenTextMode (sparse for additive)"
```

---

### Phase 1 verification gate

- [ ] **Full suite + typecheck green:**

```bash
npx vitest run && npx tsc -p tsconfig.json --noEmit
```
Expected: all green; clean.

- [ ] **Generate the B58 v3** (operating the pipeline — controller runs this; dev server + `npm run render-worker` running). POST `/api/niches/.../` is NOT the path — use the **Lab dispatch** `POST /api/lab/longform/dispatch` with body:
  - `topic`: *"Why the BMW B58 is the best inline-six ever made, and how to build one to 800 horsepower — its closed-deck block, integrated exhaust manifold, forged internals and overbuilt design; the full 800hp build path (tune + intake + downpipe, then a bigger single turbo + port injection + fueling, then forged internals); AND what becomes the limiting factor beyond 800hp: the ZF 8-speed transmission, fuelling and E85, the driveline, and cooling — the real reliability ceiling."*
  - `presetId`: `"technical-illustration"`
  - `targetDurationSeconds`: `510`
  - `channelId`: the default channel id (fetch via the same default-channel lookup the niches flow uses).
  This runs `planOnly`-off? NO — the Lab dispatch enqueues a render. Confirm whether to plan-then-render or dispatch straight to render; **either way the render spends real Higgsfield + ElevenLabs credits — STOP and confirm with Darius before firing the render.**
- [ ] On completion, download + watch the result: **~8–9 min**, clean technical illustrations with the **dyno/invoice diagrams intact** (their own text preserved), a **few sharp hooks** on key beats (not on every beat), the **beyond-800hp** content present, and the **crankshaft style nit** improved.

---

## Notes for the implementer
- No render-worker change, no migration: `assembleImagePrompt` output is the stored `imagePrompt`; `onScreenTextMode` lives only on the in-memory StyleBible/plan.
- `onScreenTextMode` is OPTIONAL and defaults to exclusive — naturalist + every existing preset/test behave exactly as before.
- Task 3 (generate the B58) is a pipeline RUN, not a code task — the controller drives the Lab dispatch + render and confirms credits with Darius first.
