# Doodle-Essay Replica ("Three Meals a Day Is Invented") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `stick-figure-animated` v3 preset + pipeline upgrades (sparse captions, evidence labels, background mood, scriptOverride, voice override), then produce one original ~8.5-min doodle-essay video matching the reference (https://www.youtube.com/watch?v=st_Ah6Ykbh4) quality bar.

**Architecture:** All visual decisions stay plan-time-deterministic: the beat-planner LLM emits per-beat content fields (scene, caption, label, background, sound) and pure code (`assembleImagePrompt`) bakes them into the final Higgsfield prompt stored in the plan — the render worker needs **zero changes**. `scriptOverride` short-circuits the Writer agent with a hand-written, fact-verified script. Voice is a per-run override on the existing forced-ElevenLabs path.

**Tech Stack:** Next.js App Router + TypeScript, zod, Vitest, AI SDK (`generateObject`), Supabase, Higgsfield CLI, ElevenLabs TTS, ffmpeg render worker.

**Spec:** `docs/superpowers/specs/2026-06-12-doodle-essay-replica-design.md` (approved 2026-06-12). Production source of truth: `docs/superpowers/handoffs/2026-06-12-doodle-essay-replica-handoff.md`.

**Working context:** Tasks 0–7 are code (TDD, one commit each). Tasks 8–15 are production ops (research, bake-off, plan-only, render) — they run in the MAIN session (they need the watch skill, web search, credits, and Darius-visible artifacts), not in code subagents.

---

## Task 0: Worktree + branch + docs

The repo's current checkout is mid-niche-work on `feat/niche-dominatable-pipeline` — do NOT build there.

- [ ] **Step 0.1:** Use the superpowers:using-git-worktrees skill to create a worktree for branch `feat/doodle-essay-preset` based on `main`.
- [ ] **Step 0.2:** Copy the two docs into the worktree (they are untracked in the main checkout):

```bash
cp /Users/darius/Downloads/shorts-os/docs/superpowers/handoffs/2026-06-12-doodle-essay-replica-handoff.md <worktree>/docs/superpowers/handoffs/
cp /Users/darius/Downloads/shorts-os/docs/superpowers/specs/2026-06-12-doodle-essay-replica-design.md <worktree>/docs/superpowers/specs/
cp /Users/darius/Downloads/shorts-os/docs/superpowers/plans/2026-06-12-doodle-essay-replica.md <worktree>/docs/superpowers/plans/
mkdir -p <worktree>/docs/superpowers/handoffs <worktree>/docs/superpowers/specs <worktree>/docs/superpowers/plans  # if missing
```

- [ ] **Step 0.3:** Commit:

```bash
git add docs/superpowers/handoffs/2026-06-12-doodle-essay-replica-handoff.md docs/superpowers/specs/2026-06-12-doodle-essay-replica-design.md docs/superpowers/plans/2026-06-12-doodle-essay-replica.md
git commit -m "docs(doodle): handoff + approved spec + implementation plan for the doodle-essay replica"
```

- [ ] **Step 0.4:** Sanity: `npx vitest run src/tests/lib/longform/style-presets.test.ts` → all PASS (baseline green).

---

## Task 1: Types — `"sparse"` text mode + new beat/scene fields

**Files:**
- Modify: `src/lib/longform/style-presets.ts` (the `StyleBible` interface only, ~line 45)
- Modify: `src/lib/agents/longform/types.ts` (StyleBibleSchema, BeatSchema, SceneItemsSchema)
- Test: `src/tests/lib/agents/longform/types.test.ts`

- [ ] **Step 1.1: Write the failing test.** Append to `src/tests/lib/agents/longform/types.test.ts` (inside the existing top-level describe, or a new one if the file uses multiple):

```ts
describe("doodle-essay schema additions", () => {
  it("BeatSchema accepts optional objectLabel and backgroundMood", () => {
    const beat = {
      index: 0, narrationSlice: "n", estDurationSeconds: 2.5, sceneDescription: "s",
      imagePrompt: "ip", negativePrompt: "np",
      objectLabel: "diary, 1400s.", backgroundMood: "deep navy",
    };
    const parsed = BeatSchema.parse(beat);
    expect(parsed.objectLabel).toBe("diary, 1400s.");
    expect(parsed.backgroundMood).toBe("deep navy");
    // and both stay optional
    expect(() => BeatSchema.parse({ ...beat, objectLabel: undefined, backgroundMood: undefined })).not.toThrow();
  });

  it("SceneItemsSchema accepts label + background per item, defaulting to empty strings", () => {
    const parsed = SceneItemsSchema.parse({ items: [{ scene: "s", onScreenText: "", sound: "" }] });
    expect(parsed.items[0].label).toBe("");
    expect(parsed.items[0].background).toBe("");
    const full = SceneItemsSchema.parse({ items: [{ scene: "s", onScreenText: "HOOK", sound: "", label: "cookbook, 1500s.", background: "white" }] });
    expect(full.items[0].label).toBe("cookbook, 1500s.");
    expect(full.items[0].background).toBe("white");
  });

  it("StyleBibleSchema accepts onScreenTextMode including the new 'sparse' value", () => {
    const base = {
      presetId: "stick-figure-animated", positivePrefix: "p", negativePrompt: "n",
      lighting: "l", palette: "p", framing: "f", aspect: "16:9" as const,
      kenBurnsZoom: 0.04, targetBeatSeconds: 2.5, musicMood: "m", model: "gpt_image_2", imageParams: {},
    };
    expect(() => StyleBibleSchema.parse({ ...base, onScreenTextMode: "sparse" })).not.toThrow();
    expect(() => StyleBibleSchema.parse({ ...base, onScreenTextMode: "exclusive" })).not.toThrow();
    expect(() => StyleBibleSchema.parse(base)).not.toThrow(); // still optional
  });
});
```

Add the needed imports at the top of the test file if not present: `import { BeatSchema, SceneItemsSchema, StyleBibleSchema } from "@/lib/agents/longform/types";`

- [ ] **Step 1.2:** `npx vitest run src/tests/lib/agents/longform/types.test.ts` → FAIL (label/background/onScreenTextMode unknown or stripped — the StyleBibleSchema assertion fails because zod strips the key and the SceneItems items lack defaults).
- [ ] **Step 1.3: Implement.** In `src/lib/longform/style-presets.ts`, change the `onScreenTextMode` doc/type on the `StyleBible` interface:

```ts
  /** How on-screen text relates to the rest of the image:
   *  "exclusive" (default) — the caption is the ONLY text; everything else is suppressed.
   *  "additive" — the caption is a headline that COEXISTS with the scene's own labels / diagram
   *  text (e.g. technical diagrams whose internal text is the content).
   *  "sparse" — doodle-essay mode: captions are RARE hand-lettered ALL-CAPS punches on emphasis
   *  beats only; evidence beats may carry a small lowercase objectLabel instead. */
  onScreenTextMode?: "exclusive" | "additive" | "sparse";
```

In `src/lib/agents/longform/types.ts`:

1. Add to `StyleBibleSchema` (after `soundEffectsEnabled`):
```ts
  onScreenTextMode: z.enum(["exclusive", "additive", "sparse"]).optional(),
```
2. Add to `BeatSchema` (after `onScreenText`):
```ts
  /** Small lowercase evidence label drawn next to the subject (e.g. "diary, 1400s."); absent = none. */
  objectLabel: z.string().optional(),
  /** Flat solid background color/mood for this beat (e.g. "deep navy"); absent = preset default. */
  backgroundMood: z.string().optional(),
```
3. Extend `SceneItemsSchema` items with:
```ts
    label: z.string().default(""),
    background: z.string().default(""),
```

- [ ] **Step 1.4:** `npx vitest run src/tests/lib/agents/longform/types.test.ts` → PASS.
- [ ] **Step 1.5:** Commit: `git add -A && git commit -m "feat(doodle): sparse on-screen-text mode + objectLabel/backgroundMood beat fields (schemas)"`

---

## Task 2: image-prompt — sparse captions, evidence labels, background mood

**Files:**
- Modify: `src/lib/longform/image-prompt.ts`
- Test: `src/tests/lib/longform/image-prompt.test.ts`

- [ ] **Step 2.1: Write the failing tests.** Append inside the existing `describe` in `src/tests/lib/longform/image-prompt.test.ts`:

```ts
  // sparse mode: build the bible by overriding, so this test is independent of preset defaults
  const sparseBible = { ...getStylePreset("stick-figure-animated"), onScreenTextMode: "sparse" as const };

  it("sparse mode: caption renders as hand-lettered ALL-CAPS marker text (upper-cased)", () => {
    const out = assembleImagePrompt({ sceneDescription: "a stick figure at a kitchen table", styleBible: sparseBible, onScreenText: "every single meal" });
    expect(out.prompt).toContain('reading exactly "EVERY SINGLE MEAL"');
    expect(out.prompt.toLowerCase()).toContain("marker");
    expect(out.prompt.toLowerCase()).toContain("hand-lettered");
  });

  it("sparse mode: objectLabel renders as a small lowercase hand-written label", () => {
    const out = assembleImagePrompt({ sceneDescription: "an old leather diary on a wooden table", styleBible: sparseBible, objectLabel: "diary, 1400s." });
    expect(out.prompt).toContain('label reading exactly "diary, 1400s."');
    expect(out.prompt.toLowerCase()).toContain("lowercase");
    expect(out.prompt).not.toContain("no on-screen text"); // label IS the text — don't suppress it
  });

  it("sparse mode with neither caption nor label suppresses all text", () => {
    const out = assembleImagePrompt({ sceneDescription: "a campfire under a starfield", styleBible: sparseBible });
    expect(out.prompt).toContain("no on-screen text");
  });

  it("backgroundMood is baked into the prompt as a flat solid background", () => {
    const out = assembleImagePrompt({ sceneDescription: "a stick figure lying awake", styleBible: sparseBible, backgroundMood: "deep navy" });
    expect(out.prompt).toContain("flat solid deep navy background");
  });

  it("no backgroundMood → no background clause (other presets unaffected)", () => {
    const out = assembleImagePrompt({ sceneDescription: "a misty forest", styleBible: bible });
    expect(out.prompt).not.toContain("flat solid");
  });
```

- [ ] **Step 2.2:** `npx vitest run src/tests/lib/longform/image-prompt.test.ts` → FAIL (unknown args / missing clauses).
- [ ] **Step 2.3: Implement.** Replace the body of `src/lib/longform/image-prompt.ts` with:

```ts
import type { StyleBible } from "@/lib/longform/style-presets";

export interface AssembleArgs {
  sceneDescription: string;
  styleBible: StyleBible;
  /** The one retention-hook caption to render on-screen; "" / absent = render no text. */
  onScreenText?: string;
  /** Sparse mode: small lowercase evidence label (e.g. "diary, 1400s."); "" / absent = none. */
  objectLabel?: string;
  /** Per-beat flat solid background color/mood (e.g. "deep navy"); "" / absent = preset default. */
  backgroundMood?: string;
}

export interface AssembledPrompt {
  prompt: string;
  negativePrompt: string;
}

export function assembleImagePrompt({ sceneDescription, styleBible, onScreenText, objectLabel, backgroundMood }: AssembleArgs): AssembledPrompt {
  const scene = sceneDescription.replace(/\s+/g, " ").trim();
  const caption = (onScreenText ?? "").trim();
  const label = (objectLabel ?? "").trim();
  const bg = (backgroundMood ?? "").trim();
  const additive = styleBible.onScreenTextMode === "additive";
  const sparse = styleBible.onScreenTextMode === "sparse";

  const textParts: string[] = [];
  if (caption) {
    textParts.push(
      additive
        ? `a bold readable headline caption reading exactly "${caption}", alongside any labels the illustration itself needs`
        : sparse
          ? `a hand-lettered caption in crude ALL-CAPS marker lettering reading exactly "${caption.toUpperCase()}", drawn in the same hand as the doodle, the only large text in the image`
          : `on-screen caption reading exactly "${caption}", as clean bold hand-lettered type, the only text in the image`,
    );
  }
  if (sparse && label) {
    textParts.push(`a small lowercase hand-written label reading exactly "${label}" next to the subject`);
  }
  if (textParts.length === 0 && !additive) {
    // additive styles keep the scene's own labels/diagram text; everything else suppresses all text.
    textParts.push("no on-screen text, labels, or captions");
  }

  const prompt = [
    styleBible.positivePrefix,
    scene,
    "Depict EXACTLY ONE clear subject — never merge two different objects into a single hybrid, never invent or attach parts that don't belong; if a reference image is provided, reproduce its subject faithfully",
    styleBible.framing,
    styleBible.lighting,
    styleBible.palette,
    ...(bg ? [`a flat solid ${bg} background filling the frame`] : []),
    ...textParts,
    "16:9 aspect ratio, wide landscape composition",
  ].join(". ");
  return { prompt, negativePrompt: styleBible.negativePrompt };
}
```

- [ ] **Step 2.4:** `npx vitest run src/tests/lib/longform/image-prompt.test.ts` → PASS (all pre-existing tests too — the exclusive/additive branches are unchanged).
- [ ] **Step 2.5:** Commit: `git add -A && git commit -m "feat(doodle): assembleImagePrompt — sparse ALL-CAPS marker captions, lowercase evidence labels, per-beat flat background"`

---

## Task 3: Preset v3 — the crude felt-tip look

**Files:**
- Modify: `src/lib/longform/style-presets.ts:94-118` (the stick-figure entry)
- Test: `src/tests/lib/longform/style-presets.test.ts:43-60` (rewrite the stick-figure test)

- [ ] **Step 3.1: Rewrite the stick-figure test to the v3 spec.** Replace the whole `it("stick-figure preset encodes a CLEAN simple hand-drawn doodle ...")` block with:

```ts
  it("stick-figure preset v3 = CRUDE felt-tip doodle (wobbly marker, MS-Paint fills, sparse captions, quiet audio)", () => {
    const p = getStylePreset("stick-figure-animated");
    const pre = p.positivePrefix.toLowerCase();
    expect(pre).toMatch(/stick ?figure|stickman/);
    expect(pre).toMatch(/doodle|hand-drawn/);
    // v3: the reference (yt st_Ah6Ykbh4, dense re-watch 2026-06-12) is CRUDE felt-tip, not clean vector
    expect(pre).toMatch(/crude/);
    expect(pre).toMatch(/wobbly/);
    expect(pre).toMatch(/ms ?paint/);
    expect(pre).toMatch(/eyebrow/);            // eyebrows do the emotional acting
    expect(pre).toMatch(/no shading|no gradient/);
    expect(pre).toMatch(/crisp|legible/);      // crude drawing, crisp file
    // gpt_image_2 has no negative-prompt param, so style suppressors live in the POSITIVE prompt.
    expect(pre).toMatch(/no 3d|no realistic|no anime|no photoreal/);
    expect(pre).toMatch(/do not beautify|do not polish/); // stop the model up-rendering the doodle
    expect(pre).not.toMatch(/do not make it look good/);  // v1's over-cooked suppressor stays gone
    // scenes get a simple colored setting/background keyed per beat (not forced white).
    expect(`${p.framing} ${p.palette}`.toLowerCase()).toMatch(/background|environment|setting|scene/);
    expect(p.framing.toLowerCase()).toContain("collage"); // still forbid collages
    // subtle Ken-Burns push-in like the reference (reverted to 0 if zoompan jitters — Task 12)
    expect(p.kenBurnsZoom).toBeLessThanOrEqual(0.04);
    expect(p.targetBeatSeconds).toBeGreaterThanOrEqual(2);
    expect(p.targetBeatSeconds).toBeLessThanOrEqual(3);
    // doodle-essay text + audio behavior
    expect(p.onScreenTextMode).toBe("sparse");
    expect(p.soundEffectsEnabled).toBe(true);
    expect(p.musicMood.toLowerCase()).toMatch(/no music|ambient/);
  });
```

- [ ] **Step 3.2:** `npx vitest run src/tests/lib/longform/style-presets.test.ts` → FAIL (v2 preset has none of crude/wobbly/ms paint/sparse).
- [ ] **Step 3.3: Implement.** Replace the `"stick-figure-animated"` entry in `src/lib/longform/style-presets.ts` (keep the existing comment block above it, append one line noting v3):

```ts
  // v3 (2026-06-12): dense re-watch of the reference (yt st_Ah6Ykbh4) — the look IS crude felt-tip:
  // slightly wobbly single-weight marker outlines + flat MS-Paint fills. v2's "clean/smooth" reading
  // under-shot it. Crude drawing, crisp file. Captions are sparse hand-lettered punches (see
  // onScreenTextMode "sparse"); backgrounds are color-keyed per beat via the backgroundMood field.
  "stick-figure-animated": {
    presetId: "stick-figure-animated",
    positivePrefix:
      "a crude hand-drawn felt-tip marker doodle, slightly wobbly single-weight black marker outlines " +
      "like a quick human sketch, flat solid MS-Paint-style color fills with no shading and no gradients, " +
      "simple stick figures with round white heads, small dot eyes and big expressive eyebrows that do " +
      "all the emotional acting, simple crude props drawn in the same childlike way, one flat solid " +
      "background color, deliberately crude and childlike but clean, legible and crisp, " +
      "no photorealism, no 3D, no realistic shading, no anime, no fine rendered detail, " +
      "do not beautify or polish the drawing",
    negativePrompt: `${NEG_COMMON}, realistic shading, 3d render, cinematic lighting, photorealistic, ` +
      `anime, gradient shading, busy cluttered detail, painterly, sketchy crosshatching, ` +
      `polished vector art, smooth professional illustration`,
    lighting: "flat, no realistic shading, no gradients",
    palette: "flat saturated solid color fills over one solid background color keyed to the scene's mood",
    framing:
      "one single clear and simple scene that literally shows what is being said at this moment, " +
      "drawn in a simple setting / environment that fits the moment (e.g. a room, outdoors with a ground " +
      "line and sky, or a single clear object) on a flat solid background color when the scene has a place, " +
      "otherwise a clean plain background; one or two subjects, centered, easy to read; " +
      "never a collage, never a grid, never multiple panels",
    aspect: "16:9",
    kenBurnsZoom: 0.04, // subtle push-in like the reference; revert to 0 if zoompan jitters on line art
    targetBeatSeconds: 2.5, // Zenn's cadence: a new image every 2-3 seconds (the real "secret")
    musicMood: "no music bed, or an extremely soft contemplative ambient pad far beneath the narration",
    model: "gpt_image_2", // Task 11 bake-off vs nano_banana_2 decides; flip this line if nano wins
    imageParams: { quality: "low", resolution: "2k" },
    soundEffectsEnabled: true, // sparse diegetic only (fire, rain, night) — planner is instructed to be rare
    onScreenTextMode: "sparse",
  },
```

- [ ] **Step 3.4:** `npx vitest run src/tests/lib/longform/style-presets.test.ts src/tests/lib/longform/image-prompt.test.ts` → PASS.
- [ ] **Step 3.5:** Check the other suites that reference this preset: `npx vitest run src/tests/lib/agents/longform/style-picker-policy.test.ts src/tests/lib/agents/longform/style-picker.test.ts src/tests/lib/agents/longform/voice.test.ts src/tests/lib/agents/longform/beat-planner.test.ts` → if any assert on v2 prefix text ("clean", "smooth"), update those assertions to the v3 equivalents shown above. Expected: style-picker-policy passes untouched (it tests preset *selection*, not prefix text).
- [ ] **Step 3.6:** Commit: `git add -A && git commit -m "feat(doodle): stick-figure preset v3 — crude felt-tip look, sparse captions, ken-burns 0.04, quiet audio"`

---

## Task 4: Beat-planner — thread new fields + sparse/label/background/red-callout guidance

**Files:**
- Modify: `src/lib/agents/longform/beat-planner.ts`
- Test: `src/tests/lib/agents/longform/beat-planner.test.ts`

- [ ] **Step 4.1: Write the failing tests.** Append inside the describe in `beat-planner.test.ts` (follow the existing captured-prompt pattern exactly):

```ts
  it("sparse mode: prompt demands RARE all-caps captions, evidence labels, varied backgrounds, red callouts, rare SFX", async () => {
    let captured = "";
    vi.mocked(generateObject).mockImplementation(async (...allArgs: unknown[]) => {
      const opts = allArgs[0] as { prompt?: string };
      captured = opts?.prompt ?? "";
      const n = Number(captured.match(/EXACTLY (\d+) items/)?.[1] ?? 1);
      return { object: { items: Array.from({ length: n }, () => ({ scene: "a doodle", onScreenText: "", sound: "", label: "", background: "white" })) } } as never;
    });
    await runBeatPlanner({
      styleBible: getStylePreset("stick-figure-animated"), // v3 = sparse
      playbook: EMPTY_LONGFORM_PLAYBOOK,
      chapters: [{ index: 0, title: "The invention of breakfast", narration: "You eat three meals a day. Nobody asked why. The schedule is younger than the lightbulb." }],
    });
    const p = captured.toLowerCase();
    expect(p).toMatch(/rare/);                       // captions are rare
    expect(p).toMatch(/all-caps|all caps/);
    expect(p).toMatch(/at most 4 words|≤ ?4 words|4 words/);
    expect(p).toMatch(/"label"/);                    // asks for the evidence label field
    expect(p).toMatch(/lowercase/);
    expect(p).toMatch(/"background"/);               // asks for the per-beat background
    expect(p).toMatch(/vary the background|never use white for everything/);
    expect(p).toMatch(/red marker circle|red hand-drawn arrow/); // 2-4 red callouts on evidence beats
    expect(p).toMatch(/rarely|a handful/);           // SFX sparse + diegetic
    expect(p).not.toContain("most beats should have text");
  });

  it("threads label + background onto beats and into the assembled image prompt", async () => {
    vi.mocked(generateObject).mockImplementation(async (...allArgs: unknown[]) => {
      const opts = allArgs[0] as { prompt?: string };
      const n = Number(opts?.prompt?.match(/EXACTLY (\d+) items/)?.[1] ?? 1);
      return { object: { items: Array.from({ length: n }, (_, i) => ({ scene: `doodle ${i}`, onScreenText: "", sound: "", label: i === 0 ? "cookbook, 1500s." : "", background: i === 0 ? "deep navy" : "" })) } } as never;
    });
    const out = await runBeatPlanner({
      styleBible: getStylePreset("stick-figure-animated"),
      playbook: EMPTY_LONGFORM_PLAYBOOK,
      chapters: [{ index: 0, title: "Evidence", narration: "A cookbook from the fifteen hundreds lists two meals. Dinner sat in the late morning." }],
    });
    const beats = out.chapters[0].beats;
    expect(beats[0].objectLabel).toBe("cookbook, 1500s.");
    expect(beats[0].backgroundMood).toBe("deep navy");
    expect(beats[0].imagePrompt).toContain('label reading exactly "cookbook, 1500s."');
    expect(beats[0].imagePrompt).toContain("flat solid deep navy background");
    expect(beats[1]?.objectLabel).toBeUndefined();   // empty strings do not become beat fields
    expect(beats[1]?.backgroundMood).toBeUndefined();
  });

  it("non-sparse presets keep the old prompt shape (no label/background/red-callout demands)", async () => {
    let captured = "";
    vi.mocked(generateObject).mockImplementation(async (...allArgs: unknown[]) => {
      const opts = allArgs[0] as { prompt?: string };
      captured = opts?.prompt ?? "";
      const n = Number(captured.match(/EXACTLY (\d+) items/)?.[1] ?? 1);
      return { object: { items: Array.from({ length: n }, (_, i) => ({ scene: `s ${i}`, onScreenText: "", sound: "" })) } } as never;
    });
    await runBeatPlanner(ctx()); // cinematic-realistic
    expect(captured.toLowerCase()).not.toMatch(/red marker circle/);
    expect(captured.toLowerCase()).not.toMatch(/"label"/);
  });
```

- [ ] **Step 4.2:** `npx vitest run src/tests/lib/agents/longform/beat-planner.test.ts` → FAIL.
- [ ] **Step 4.3: Implement.** In `src/lib/agents/longform/beat-planner.ts`:

1. Update the `SceneItem` interface and both fallback literals:

```ts
interface SceneItem { scene: string; onScreenText: string; sound: string; visualKind: "photo" | "illustration"; photoQuery: string; label: string; background: string }
```
Fallback objects (both the catch fallback and the pad fallback) become:
```ts
{ scene: s, onScreenText: "", sound: "", visualKind: "illustration", photoQuery: "", label: "", background: "" }
```
(and the pad version uses `slice` instead of `s`.)

2. In `scenePrompt`, add a third `frequency` branch and the sparse extras. Replace the `frequency` const with:

```ts
  const frequency =
    styleBible.onScreenTextMode === "sparse"
      ? `Captions are RARE and load-bearing: leave onScreenText "" on the vast majority of beats. Add one ONLY on a true emphasis beat (roughly 1 beat in 8) — the single line the viewer must remember — as an ALL-CAPS punch of at most 4 words.`
      : styleBible.onScreenTextMode === "additive"
        ? `Keep it clean: leave onScreenText "" on most beats — add a short hook ONLY on the few beats where a key stat or turning point really lands.`
        : `Most beats should have text; use "" only when a clean wordless image is clearly stronger.`;
```

3. After the SOUND DESIGN paragraph in the returned template, make the SFX rarity conditional. Replace the sound paragraph with:

```ts
  const soundGuidance =
    styleBible.onScreenTextMode === "sparse"
      ? `Also do SOUND DESIGN: for each beat give a short "sound" — a text-to-SFX prompt — but use sounds RARELY (a handful across the whole video) and ONLY where a real diegetic sound exists in the scene (a fire crackling, rain, night crickets, a factory bell, a street). Use an EMPTY string "" everywhere else; this video is quiet and contemplative.`
      : `Also do SOUND DESIGN: for each beat give a short "sound" — a text-to-SFX prompt for a real-world
sound that fits THAT moment (e.g. "a hawk screech", "wind rustling through trees", "wings flapping",
"a heartbeat thudding", "soft rain"). Use a sound on the beats where one clearly belongs; use an EMPTY
string "" for abstract, quiet, or diagram/text-only beats. Keep each sound a few words, concrete, single.`;
```

4. Add a sparse-extras block (computed before the return):

```ts
  const sparseExtras =
    styleBible.onScreenTextMode === "sparse"
      ? `
For each beat also give:
- "label": a small lowercase object label for EVIDENCE beats only — a dated artifact, document, or exhibit (e.g. "diary, 1400s." or "cookbook, 1500s."). Use "" on every other beat.
- "background": the ONE flat solid background color for this beat, keyed to its mood — "white" for diagram/fact beats, "deep navy" for night or contemplation, "warm orange and pale blue" for sunrise/warmth, "dark navy" for a night bedroom, "earthy brown and green" for outdoors/nature/the past — plus scene-appropriate variants (e.g. "warm kitchen yellow", "factory grey"). VARY THE BACKGROUND across the video; never use white for everything.
On 2 to 4 of the evidence beats (and ONLY there), include in the "scene" a crude red marker circle scrawled around the key object, or a crude red hand-drawn arrow pointing at it.`
      : `
Set "label" to "" and "background" to "" on every item (not used for this style).`;
```

5. Update the returned template to use the pieces and the new JSON shape:

```ts
  return `You are the Beat Planner. ${guidance}

For each beat also write ON-SCREEN TEXT ("onScreenText"): the ONE thing the viewer should absorb from that
moment — a punchy stat, a bold claim, a question, or a key phrase (≤ ~5 words), pulled from the narration so
it reinforces what is being said and drives retention. It must NEVER be an encyclopedic label — no species or
Latin names, no "Fig. N" captions, no figure numbers. Put on-screen text ONLY in this field, never inside
"scene". ${frequency} ACCURACY: if onScreenText states any number (cost, price, hp, spec, date), it MUST match the verified facts / narration — NEVER invent a figure for a caption; when unsure use a qualitative phrase or leave it "".

${soundGuidance}

For each beat also decide VISUAL SOURCE. Set "visualKind" to "photo" when the beat depicts a CONCRETE real-world subject that a real stock photograph would show accurately (a specific engine, a car part, a named car, a tool, a place) — and give a precise "photoQuery" to find that photo (e.g. "BMW B58 engine bare block on engine stand"). Set "visualKind" to "illustration" (and photoQuery "") when the beat is an abstract idea, a comparison, a metaphor, a diagram/chart, or a composite that no single real photo captures. Prefer "photo" for concrete hardware; prefer "illustration" for concepts.
${sparseExtras}
${groundingBlock}
Chapter: "${chapterTitle}"
Return EXACTLY ${slices.length} items, in order, as JSON: { "items": [{ "scene": string, "onScreenText": string, "label": string, "background": string, "sound": string, "visualKind": "photo" | "illustration", "photoQuery": string }] }.
Beats:
${numbered}`;
```

NOTE for the stick-figure preset: it always uses `visualKind: "illustration"` in practice (the doodle look never wants stock photos) — in the sparse `guidance` branch (the existing stick-figure `guidance` string), append one sentence: `Always set "visualKind" to "illustration" and "photoQuery" to "" — this style never uses real photos.`

6. In `runBeatPlanner`, thread the fields:

```ts
    const beats = slices.map((slice, i) => {
      const label = items[i].label?.trim() ?? "";
      const background = items[i].background?.trim() ?? "";
      const { prompt, negativePrompt } = assembleImagePrompt({
        sceneDescription: items[i].scene,
        onScreenText: items[i].onScreenText,
        objectLabel: label,
        backgroundMood: background,
        styleBible: ctx.styleBible,
      });
      const sound = items[i].sound?.trim();
      return {
        index: i,
        narrationSlice: slice.text,
        estDurationSeconds: slice.estDurationSeconds,
        sceneDescription: items[i].scene,
        onScreenText: items[i].onScreenText,
        visualKind: items[i].visualKind,
        photoQuery: items[i].photoQuery,
        imagePrompt: prompt,
        negativePrompt,
        ...(sound ? { soundEffect: sound } : {}),
        ...(label ? { objectLabel: label } : {}),
        ...(background ? { backgroundMood: background } : {}),
      };
    });
```

- [ ] **Step 4.4:** `npx vitest run src/tests/lib/agents/longform/beat-planner.test.ts` → PASS (including all pre-existing tests — the cinematic/additive branches emit the same text as before).
- [ ] **Step 4.5:** Commit: `git add -A && git commit -m "feat(doodle): beat-planner sparse mode — rare ALL-CAPS captions, evidence labels, color-keyed backgrounds, red callouts, rare SFX"`

---

## Task 5: Orchestrator — `scriptOverride` + `voiceId` override

**Files:**
- Modify: `src/lib/agents/longform/types.ts` (add `ScriptOverrideSchema`)
- Modify: `src/lib/agents/longform/orchestrator.ts`
- Test: `src/tests/lib/agents/longform/orchestrator.test.ts`

- [ ] **Step 5.1: Write the failing tests.** Append inside the describe in `orchestrator.test.ts`:

```ts
  it("scriptOverride skips the Writer and persists the provided narration + trustedFacts as the fact sheet", async () => {
    const d = deps();
    const events = await collect(runLongformPipeline({
      topic: "the invention of three meals a day", targetDurationSeconds: 540, channelId: "ch1",
      presetId: "stick-figure-animated",
      scriptOverride: {
        angle: "the meal schedule is an invention",
        hook: "You eat three meals a day. Nobody asked why.",
        chapters: [{ title: "Cold open", purpose: "hook", narration: "You eat three meals a day. Nobody ever asked why. The schedule is younger than the lightbulb." }],
      },
      trustedFacts: ["Kellogg's Corn Flakes launched in 1898"],
    }, d));
    expect(d.runWriter).not.toHaveBeenCalled();
    expect(d.createDraft).toHaveBeenCalledWith(expect.objectContaining({
      plan: expect.objectContaining({
        hook: "You eat three meals a day. Nobody asked why.",
        factSheet: expect.objectContaining({ facts: [expect.objectContaining({ claim: "Kellogg's Corn Flakes launched in 1898" })] }),
        chapters: [expect.objectContaining({ narration: expect.stringContaining("younger than the lightbulb") })],
      }),
    }));
    expect(events.map((e) => e.type)).toContain("job_completed");
  });

  it("voiceId override replaces the default narrator", async () => {
    const d = deps();
    await collect(runLongformPipeline({ topic: "t", targetDurationSeconds: 540, channelId: "ch1", voiceId: "american-voice-123" }, d));
    expect(d.createDraft).toHaveBeenCalledWith(expect.objectContaining({
      plan: expect.objectContaining({ voice: expect.objectContaining({ provider: "elevenlabs", voiceId: "american-voice-123" }) }),
    }));
  });

  it("without voiceId the narrator stays the George default", async () => {
    const d = deps();
    await collect(runLongformPipeline({ topic: "t", targetDurationSeconds: 540, channelId: "ch1" }, d));
    expect(d.createDraft).toHaveBeenCalledWith(expect.objectContaining({
      plan: expect.objectContaining({ voice: expect.objectContaining({ voiceId: "JBFqnCBsd6RMkjVDRZzb" }) }),
    }));
  });
```

- [ ] **Step 5.2:** `npx vitest run src/tests/lib/agents/longform/orchestrator.test.ts` → FAIL (unknown args).
- [ ] **Step 5.3: Implement.** In `src/lib/agents/longform/types.ts`, add (near the Writer schemas):

```ts
// --- Operator-provided script (skips the Writer agent; doodle-essay etc.) ---
export const ScriptOverrideSchema = z.object({
  angle: z.string().min(1),
  hook: z.string().min(1),
  chapters: z.array(z.object({
    title: z.string().min(1).max(120),
    purpose: z.string().min(1).max(300),
    narration: z.string().min(40),
  })).min(1).max(12),
});
export type ScriptOverride = z.infer<typeof ScriptOverrideSchema>;
```

In `src/lib/agents/longform/orchestrator.ts`:

1. Import: `import { LongformPlanSchema, type LongformPlan, type ScriptOverride, type WriterOutput } from "@/lib/agents/longform/types";`
2. Extend `LongformPipelineArgs`:

```ts
  /** Hand-written, fact-verified script — skips the Writer agent entirely (beat planner still runs). */
  scriptOverride?: ScriptOverride;
  /** ElevenLabs voice override for this run (e.g. a calm American narrator); default = George. */
  voiceId?: string;
```

3. Add the converter above `runLongformPipeline`:

```ts
// An operator script becomes a Writer-shaped output: word count from the narration itself, and the
// operator's trustedFacts as the fact sheet (they are the verified ground truth for this run).
function scriptOverrideToWriterOutput(s: ScriptOverride, trustedFacts: string[] | undefined): WriterOutput {
  const estimatedWords = s.chapters.reduce((n, c) => n + c.narration.split(/\s+/).filter(Boolean).length, 0);
  const facts = (trustedFacts ?? []).map((f) => f.trim()).filter(Boolean).map((f) => ({ claim: f, detail: f }));
  return { angle: s.angle, hook: s.hook, estimatedWords, chapters: s.chapters, factSheet: { facts, uncertain: [] } };
}
```

4. Replace the Writer step body (keep the same yield events so the UI stream shape is unchanged):

```ts
    // 1. Writer (skipped when the operator provided the script)
    yield { type: "agent_state", data: { agent: "writer", state: "working" } };
    const writer = args.scriptOverride
      ? scriptOverrideToWriterOutput(args.scriptOverride, args.trustedFacts)
      : await deps.runWriter({ topic: args.topic, targetDurationSeconds: target, playbook, trustedFacts: args.trustedFacts });
    yield { type: "agent_output", data: { agent: "writer", output: writer } };
    yield { type: "agent_done", data: { agent: "writer", durationMs: 0 } };
```

5. Replace the voice line:

```ts
    const voice = { ...picked, provider: "elevenlabs", voiceId: args.voiceId?.trim() || ELEVENLABS_NARRATOR_VOICE_ID };
```

- [ ] **Step 5.4:** `npx vitest run src/tests/lib/agents/longform/orchestrator.test.ts src/tests/lib/agents/longform/plan-only.test.ts` → PASS.
- [ ] **Step 5.5:** Commit: `git add -A && git commit -m "feat(doodle): scriptOverride (skip Writer with a hand-verified script) + per-run ElevenLabs voiceId override"`

---

## Task 6: Dispatch route — accept `scriptOverride` + `voiceId`

**Files:**
- Modify: `src/app/api/lab/longform/dispatch/route.ts`

No route-level test exists for this file (logic is covered by the orchestrator tests); validate by typecheck + the Task 13 live plan-only run.

- [ ] **Step 6.1: Implement.** In `route.ts`:

1. Add import: `import { ScriptOverrideSchema } from "@/lib/agents/longform/types";`
2. Extend the body type literal with `scriptOverride?: unknown; voiceId?: unknown;`
3. After the `trustedFacts` parsing block, add:

```ts
  // Hand-written script (skips the Writer). Strictly validated; a malformed override is a 400, not a silent fallback to the Writer.
  let scriptOverride;
  if (body.scriptOverride !== undefined) {
    const parsed = ScriptOverrideSchema.safeParse(body.scriptOverride);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: `invalid scriptOverride: ${parsed.error.message}` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    scriptOverride = parsed.data;
  }
  // Per-run narrator override (ElevenLabs voice id).
  const voiceId = typeof body.voiceId === "string" && body.voiceId.trim() ? body.voiceId.trim() : undefined;
```

4. Thread both into the pipeline call:

```ts
        for await (const event of runLongformPipeline(
          { topic, targetDurationSeconds, channelId, presetId, planOnly, trustedFacts, scriptOverride, voiceId },
          deps,
        )) {
```

- [ ] **Step 6.2:** Typecheck: `npx tsc -p tsconfig.json --noEmit` (or the repo's `npm run typecheck` if it exists) → no errors.
- [ ] **Step 6.3:** Commit: `git add -A && git commit -m "feat(doodle): dispatch route accepts scriptOverride + voiceId"`

---

## Task 7: Full verification gate

- [ ] **Step 7.1:** `npx vitest run` (full suite) → ALL PASS. Fix any stragglers that asserted on the v2 prefix (`grep -rn "clean\|smooth" src/tests --include="*stick*"` style hunting if needed).
- [ ] **Step 7.2:** `npx tsc -p tsconfig.json --noEmit` → clean. `npm run lint` if the repo defines it → clean.
- [ ] **Step 7.3:** Commit anything outstanding; push branch: `git push -u origin feat/doodle-essay-preset`.

---

## Task 8 (MAIN SESSION): Confirm the reference's audio by ear

The handoff's analysis was frames+captions only — the sound design must be confirmed before render settings are final.

- [ ] **Step 8.1:** Invoke the `watch` skill on https://www.youtube.com/watch?v=st_Ah6Ykbh4 **with audio analysis** — answer: (a) is there a music bed at all, and if so how loud relative to VO? (b) which SFX actually occur (fire? night ambience? page turns?) and how often? (c) VO pace check (~140–150 wpm?).
- [ ] **Step 8.2:** Record findings in `docs/superpowers/research/2026-06-12-doodle-reference-audio.md`. If findings contradict the plan's audio settings (bed off, SFX sparse diegetic, vol 0.18), adjust: `MUSIC_BED_ENABLED` stays unset unless a clear soft pad is heard; SFX cue ceiling adjusts to what's heard.

---

## Task 9 (MAIN SESSION): Fact research → trustedFacts

Every dated/numeric claim in the script must be verified BEFORE writing (accuracy gate covers captions too).

- [ ] **Step 9.1:** Web-research and verify each candidate claim (WebSearch; prefer primary/authoritative over forums): Roman eating pattern (one main meal, *cena*); medieval European two-meal pattern + typical hours; early-modern disapproval of breakfast; Industrial Revolution work schedules fixing mealtimes; Kellogg Corn Flakes date (1894 invention vs 1898/1906 commercialization — pin the defensible one); the 1920s Beech-Nut bacon-and-eggs campaign run by Edward Bernays + the "doctors survey" detail (use only what's well-sourced; soften if contested); circadian metabolism: morning vs evening insulin sensitivity, late eating overlapping melatonin onset, time-restricted-eating findings (Panda et al.). Discard or qualitative-soften anything that can't be pinned.
- [ ] **Step 9.2:** Write `docs/superpowers/research/2026-06-12-three-meals-facts.md`: each fact as `claim — detail — source URL — confidence`. Extract the high-confidence list as the `trustedFacts: string[]` for dispatch.
- [ ] **Step 9.3:** Commit both research docs.

---

## Task 10 (MAIN SESSION): Write the original script

- [ ] **Step 10.1:** Write ~1,200–1,350 words of narration in 7 chapters (the arc from the spec: cold-open hook → thesis of loss → dated evidence stack → warm reconstruction → mechanism → reframe → quiet close). Constraints: present-tense "you" cold open with a huge-timescale stat, open loop held until the mechanism, short cause→effect sentences in the science chapter, no CTA, every number from the verified facts file. Save as `docs/superpowers/research/2026-06-12-three-meals-script.md` with the chapter titles/purposes (this becomes the `scriptOverride` JSON).
- [ ] **Step 10.2:** Self-check: word count in range (`wc -w`); read-aloud pace ≈ 8.3–9.4 min at 144 wpm; every dated claim traceable to the facts file; zero sentences borrowed from the reference's narration.
- [ ] **Step 10.3:** Commit.

---

## Task 11 (MAIN SESSION): Credits check + image-model bake-off

- [ ] **Step 11.1:** `higgsfield account status` → record balance. Need: bake-off ~11cr + full render ~155cr (gpt_image_2 @ 0.75 × ~205) or ~410cr (nano_banana_2 @ 2). Check ElevenLabs quota too (the ~1,300-word TTS + a few SFX). If balance can't cover the chosen path, STOP and tell Darius before spending anything.
- [ ] **Step 11.2:** Build 4 probe prompts using the real pipeline (so the test is honest): run `assembleImagePrompt` via `npx tsx` with the v3 preset for: (a) emphasis beat — stick figure at a kitchen table, caption "EVERY SINGLE MEAL", warm kitchen yellow background; (b) evidence beat — an old cookbook with label "cookbook, 1500s.", a crude red marker circle around the date, white background; (c) night contemplation — figure lying awake, deep navy, no text; (d) sunrise scene, warm orange and pale blue, no text.
- [ ] **Step 11.3:** Generate each on BOTH `gpt_image_2` (quality low, 2k) and `nano_banana_2` (2k) via the Higgsfield CLI (invocation syntax: see `scripts/render-worker/lib/higgsfield.ts`). ~11cr total.
- [ ] **Step 11.4:** Judge against the reference stills: crude-wobbly fidelity (does it resist beautifying?), ALL-CAPS lettering legibility, lowercase label rendering, red-callout rendering, background-color obedience. Pick the model; if nano wins, flip `model`/`imageParams` in the preset (one-line change + commit). Also note whether gpt_image_2 `quality: "low"` is crisp enough at 1080p — if mushy, try `quality: "medium"` on the same probes before deciding.
- [ ] **Step 11.5:** Save the probe images + a one-paragraph verdict into `docs/superpowers/research/2026-06-12-doodle-bakeoff/` and commit.

---

## Task 12 (MAIN SESSION): Ken-Burns jitter smoke test

- [ ] **Step 12.1:** Using the best bake-off PNG, build a 3s 30fps clip with the EXACT zoompan filter the worker uses (`src/lib/longform/ken-burns.ts:40`, zoom 0.04) via ffmpeg, e.g. generate the filter string with `npx tsx -e` importing `buildKenBurns*` from `ken-burns.ts`, then `ffmpeg -loop 1 -i probe.png -vf "<filter>" -t 3 -r 30 kb-test.mp4`.
- [ ] **Step 12.2:** Watch it. Smooth → keep `kenBurnsZoom: 0.04`. Jitter/shimmer on the line art → set preset back to `kenBurnsZoom: 0` (static holds are an acceptable reference match), update the one preset line + commit either way with the verdict in the message.

---

## Task 13 (MAIN SESSION): Plan-only run (FREE) + plan QC

- [ ] **Step 13.1:** Start the dev server from the worktree. GOTCHAS (from memory): run with `env -u ANTHROPIC_BASE_URL`, real `ANTHROPIC_API_KEY` + Supabase SERVICE_ROLE in env (Vercel "Sensitive" vars don't pull), and mind the Turbopack worktree-root quirk.
- [ ] **Step 13.2:** POST `/api/lab/longform/dispatch` with: `topic: "Three meals a day is invented — the lost history of how humans ate"`, `targetDurationSeconds: 540`, `presetId: "stick-figure-animated"`, `planOnly: true`, `scriptOverride: <from Task 10>`, `trustedFacts: <from Task 9>`, `voiceId: <Task 14 pick if already made, else omit>`.
- [ ] **Step 13.3:** Pull the persisted plan (the `longform_plan` JSON on the new `your_videos` row) and QC it:
  - beat count 190–220; mean estDurationSeconds ≈ 2.3–2.8s; est total ≈ 500–570s
  - captions on ~8–15% of beats, all ≤4 words, ALL-CAPS after assembly
  - `objectLabel` only on evidence beats; ≥2 and ≤4 scenes containing a red circle/arrow
  - `backgroundMood` present on most beats with ≥4 distinct moods across the video (not all white)
  - SFX cues ≤ ~8 total, all diegetic; `visualKind` = illustration everywhere
  - narration slices match the script verbatim
- [ ] **Step 13.4:** If any check fails → adjust the Task 4 planner guidance text (it's prompt-tuning, cheap), re-run plan-only, repeat until green. Commit any guidance changes.

---

## Task 14 (MAIN SESSION): Voice audition

- [ ] **Step 14.1:** `GET https://api.elevenlabs.io/v1/voices` (header `xi-api-key`) → shortlist 3–4 calm warm-neutral AMERICAN male narration voices (exclude George `JBFqnCBsd6RMkjVDRZzb`).
- [ ] **Step 14.2:** Synthesize the script's cold-open paragraph with each (model `eleven_multilingual_v2`, stability ~0.5, even pace) → mp3 samples.
- [ ] **Step 14.3:** Compare each against the reference's narrator (Task 8 findings): even level, no upspeak, mid pitch, ~140–150 wpm. Send the samples to Darius (SendUserFile) with a recommendation; **proceed with the recommendation** unless he objects before the Task 15 render gate (per his standing autonomous-execution preference). Record the chosen `voiceId`.

---

## Task 15 (MAIN SESSION): Render, frame-watch, QC, deliver

- [ ] **Step 15.1:** Credits re-check (`higgsfield account status` + ElevenLabs quota) against the chosen model's full cost. Insufficient → STOP, tell Darius.
- [ ] **Step 15.2:** Kick the real run: re-POST the Task 13 dispatch body with `planOnly: false` and the chosen `voiceId` (a fresh plan from the same scriptOverride is deterministic enough; the plan QC criteria from 13.3 are re-checked on the new row before the worker picks it up — if the new plan regresses, fix before rendering). Then run the render worker per `longform_local_dispatch_recipe` memory (`npm run render-worker` from the worktree). Budget wall-clock generously: ~205 images plus a per-beat ffmpeg tail that `estimateRender` undercounts.
- [ ] **Step 15.3:** WATCH the output end-to-end (every frame — a credit-out render "succeeds" with blanks): no blank/black frames, no wrong-style frames, captions legible, backgrounds varied, audio normalized and continuous, 1920×1080@~30fps, duration ~8.3–9.4 min.
- [ ] **Step 15.4:** Side-by-side vs the reference on the handoff §5 checklist (crude look, color keys, cadence, sparse caps + red callouts, hard cuts + subtle push-in, calm American VO, quiet sound, crisp export, original script, emotional close). Fix-and-rerender only what fails.
- [ ] **Step 15.5:** Deliver the file to Darius (SendUserFile) with the QC checklist results, then use superpowers:finishing-a-development-branch for the code branch (PR to main).

---

## Self-review (done at write time)

- **Spec coverage:** A→Task 3, B→Tasks 1/2/4, C→Tasks 1/2/4, D→Tasks 5/14, E→Tasks 5/6/9/10, F→Task 8, G→Tasks 3/12; bake-off→11, plan-only→13, render+QC→15. ✔
- **Placeholders:** none — every code step has the code; ops steps have commands or exact file targets. ✔
- **Type consistency:** `objectLabel`/`backgroundMood` (beat), `label`/`background` (scene items), `onScreenTextMode: "sparse"`, `ScriptOverride`/`scriptOverride`, `voiceId` used identically across Tasks 1–6. ✔
