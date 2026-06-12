# Hybrid Photo / Faithful-Illustration Visuals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Make beat visuals accurate. Use a real, vision-vetted web photo when a beat depicts a concrete real-world subject; otherwise generate a strictly-faithful illustration that depicts exactly one subject (no merging an engine into a car). Captions overlay on photo beats (they can't bake text).

**Architecture:** The beat-planner tags each beat `visualKind: "photo" | "illustration"` and emits a `photoQuery`. The local render worker, for `photo` beats, searches image candidates, vision-vets them (Claude Haiku) for "real, clean, single-subject, full-frame-usable", and uses the best one directly (Ken-Burns auto-cover-crops it) with the caption drawn on via ffmpeg `drawtext`; if none pass, it falls back to a faithful illustration. Illustration beats generate as today (caption baked). A faithfulness clause is added to the baked image prompt so even generated frames stop merging/inventing parts.

**Tech Stack:** TypeScript, Zod, AI SDK v6 (`@ai-sdk/anthropic` already in the worker), Serper images, ffmpeg (`drawtext`, Montserrat from `@fontsource/montserrat`), Vitest. NOTE: worker files live in `scripts/render-worker/` (separate package; cannot import `src/*`).

---

### Task V1: Beat-planner tags visualKind + photoQuery

**Files:** Modify `src/lib/agents/longform/types.ts` (`SceneItemsSchema` items + `BeatSchema`), `src/lib/agents/longform/beat-planner.ts` (prompt + thread into beat). Test: `src/tests/lib/agents/beat-planner-visualkind.test.ts`.

Add to each scene item and beat: `visualKind: z.enum(["photo","illustration"])` and `photoQuery: z.string()` (default "" for illustration). The `scenePrompt` instructs: decide per beat whether a real stock PHOTO would depict the moment accurately — a concrete real-world object/place/thing (an engine, a part, a specific car, a gas pump) → `"photo"` + a precise `photoQuery` (e.g. "BMW B58 engine bare block on stand"); an abstract idea, comparison, metaphor, diagram, or composite that no single photo captures → `"illustration"` + photoQuery "". Repair/default to `"illustration"` + "" on any missing field. The image prompt assembly is unchanged (illustration beats still bake captions); `visualKind`/`photoQuery` ride on the beat for the worker.

TDD: test asserts the scene prompt asks for visualKind+photoQuery, and that beats carry them through (mock `generateObject` to return items with visualKind/photoQuery; assert `runBeatPlanner` output beats include them). Run `npx vitest run` + `npx tsc --noEmit`. Commit.

---

### Task V2: Worker photo candidate search + Claude-vision vetting

**Files:** Modify `scripts/render-worker/lib/image-search.ts` (add `searchImageCandidates(query, num): Promise<string[]>` returning up to `num` Serper image URLs; keep `searchImageUrl`). Modify `scripts/render-worker/lib/claude-vision.ts` (add `vetPhoto({imagePath, subject}): Promise<{usable: boolean; reason: string}>` — Claude Haiku vision, prompt: "Is this a REAL photograph (not a render/illustration/collage/screenshot/watermarked-stock-thumbnail) that clearly shows {subject} as a single, centered, full-frame subject usable as a 16:9 video background? Reject diagrams, logos, low-res thumbnails, irrelevant images. JSON {usable: boolean, reason: string}"). Create `scripts/render-worker/lib/find-photo.ts`: `findUsablePhoto({query, subject, workDir, beatKey, maxCandidates=4}): Promise<string|null>` — search candidates, download each (reuse `downloadToFile`), `vetPhoto` each, return the first usable local path or null. Best-effort: returns null on any failure / no key. Tests mock fetch + the vision call.

TDD, run vitest + tsc, commit.

---

### Task V3: Hybrid routing + caption overlay in the render handler

**Files:** Modify `scripts/render-worker/lib/ffmpeg-longform.ts` (add `overlayCaption({videoPath, caption, outputPath})` — ffmpeg `drawtext` with a bundled Montserrat bold font file resolved from `@fontsource/montserrat`, white text + dark semi-opaque box/shadow for legibility, positioned to match the baked-caption placement; if caption is empty, just copy). Modify `scripts/render-worker/handlers/render-longform.ts`:
- In the per-beat image phase, branch: if `beat.visualKind === "photo"`, call `findUsablePhoto({ query: beat.photoQuery || beat.sceneDescription, subject: beat.photoQuery || beat.sceneDescription, workDir, beatKey })`. If it returns a path → record the beat as a PHOTO (store path + flag). If null → fall back to `generateImage` (faithful). If `visualKind !== "photo"` → `generateImage` as today.
- In the per-beat clip phase, run `renderKenBurnsClip` as today (it cover-crops any photo automatically). THEN, for PHOTO beats with a non-empty `onScreenText`, run `overlayCaption` on the Ken-Burns clip (since photos have no baked caption). Illustration beats keep their baked caption (no overlay).
- Keep the existing failed-frame reuse / gradient fallback for the generation path.

This task is integration-heavy; verify via a dogfood render (see below) rather than a pure unit test, but add a focused unit test for `overlayCaption` (asserts it builds a drawtext command containing the caption text and the font path; mock `runFfmpeg`). Run vitest + tsc, commit.

---

### Task V4: Faithfulness clause in the baked image prompt

**Files:** Modify `src/lib/longform/image-prompt.ts` (`assembleImagePrompt`). Test: extend `src/tests/lib/longform/image-prompt.test.ts`.

Add a single faithfulness clause to every assembled prompt (after the scene, before framing): `"Depict EXACTLY ONE clear subject — never merge two different objects into a single hybrid, never invent or attach parts that don't belong; if a reference image is provided, reproduce its subject faithfully."` Keep it short. TDD: assert the assembled prompt contains "EXACTLY ONE" and "faithfully". Run vitest + tsc. Commit.

---

## Post-implementation dogfood

Restart the render worker (to load worker changes). Regenerate the definitive B58 plan-only (full topic + trusted facts) so beats carry `visualKind`/`photoQuery`. Then (at Darius's top-up) render and inspect: photo beats should be real photos with overlaid captions; illustration beats faithful; no engine-in-chassis. Do NOT spend render credits until Darius confirms the top-up.
