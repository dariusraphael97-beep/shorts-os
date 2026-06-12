// src/lib/agents/longform/beat-planner.ts
import { generateObject, NoObjectGeneratedError } from "ai";
import { getClaudeModel } from "@/lib/ai/gateway";
import { splitNarrationIntoBeats } from "@/lib/longform/beats";
import { assembleImagePrompt } from "@/lib/longform/image-prompt";
import { WORDS_PER_SECOND } from "@/lib/longform/duration";
import { SceneItemsSchema, type BeatPlannerOutput } from "@/lib/agents/longform/types";
import type { StyleBible } from "@/lib/longform/style-presets";
import type { LongformPlaybook } from "@/lib/agents/longform/playbook";

export interface BeatPlannerRunContext {
  styleBible: StyleBible;
  playbook: LongformPlaybook;
  chapters: { index: number; title: string; narration: string }[];
  grounding?: string;
}

function scenePrompt(styleBible: StyleBible, chapterTitle: string, slices: string[], grounding: string): string {
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
lighting, or quality words (those are added automatically), and do NOT put on-screen text in the scene.
Always set "visualKind" to "illustration" and "photoQuery" to "" — this style never uses real photos.`
      : `For each narration beat below, describe ONE concrete, filmable VISUAL SCENE that literally
illustrates what is said at that moment (no random images, no collage). Subjects centered. Think like a
${styleBible.presetId} documentary. Describe the subject and setting only — do NOT include style/lighting/quality
words (those are added automatically) and do NOT put on-screen text in the scene. Keep each scene one vivid sentence.`;
  const frequency =
    styleBible.onScreenTextMode === "sparse"
      ? `Captions are RARE and load-bearing: leave onScreenText "" on the vast majority of beats. Add one ONLY on a true emphasis beat (roughly 1 beat in 8) — the single line the viewer must remember — as an ALL-CAPS punch of at most 4 words.`
      : styleBible.onScreenTextMode === "additive"
        ? `Keep it clean: leave onScreenText "" on most beats — add a short hook ONLY on the few beats where a key stat or turning point really lands.`
        : `Most beats should have text; use "" only when a clean wordless image is clearly stronger.`;
  const soundDesign =
    styleBible.onScreenTextMode === "sparse"
      ? `Also do SOUND DESIGN: for each beat give a short "sound" — a text-to-SFX prompt — but use sounds RARELY (a handful across the whole video) and ONLY where a real diegetic sound exists in the scene (a fire crackling, rain, night crickets, a factory bell, a street). Use an EMPTY string "" everywhere else; this video is quiet and contemplative.`
      : `Also do SOUND DESIGN: for each beat give a short "sound" — a text-to-SFX prompt for a real-world
sound that fits THAT moment (e.g. "a hawk screech", "wind rustling through trees", "wings flapping",
"a heartbeat thudding", "soft rain"). Use a sound on the beats where one clearly belongs; use an EMPTY
string "" for abstract, quiet, or diagram/text-only beats. Keep each sound a few words, concrete, single.`;
  const sparseExtras =
    styleBible.onScreenTextMode === "sparse"
      ? `
For each beat also give:
- "label": a small lowercase object label for EVIDENCE beats only — a dated artifact, document, or exhibit (e.g. "diary, 1400s." or "cookbook, 1500s."). Use "" on every other beat.
- "background": the ONE flat solid background color for this beat, keyed to its mood — "white" for diagram/fact beats, "deep navy" for night or contemplation, "warm orange and pale blue" for sunrise/warmth, "dark navy" for a night bedroom, "earthy brown and green" for outdoors/nature/the past — plus scene-appropriate variants (e.g. "warm kitchen yellow", "factory grey"). VARY THE BACKGROUND across the video; never use white for everything.
On 2 to 4 of the evidence beats (and ONLY there), include in the "scene" a crude red marker circle scrawled around the key object, or a crude red hand-drawn arrow pointing at it.`
      : ``;
  const isSparse = styleBible.onScreenTextMode === "sparse";
  const jsonShape = isSparse
    ? `{ "items": [{ "scene": string, "onScreenText": string, "label": string, "background": string, "sound": string, "visualKind": "photo" | "illustration", "photoQuery": string }] }`
    : `{ "items": [{ "scene": string, "onScreenText": string, "sound": string, "visualKind": "photo" | "illustration", "photoQuery": string }] }`;
  const groundingBlock = grounding ? `\n${grounding}\n` : "";
  return `You are the Beat Planner. ${guidance}

For each beat also write ON-SCREEN TEXT ("onScreenText"): the ONE thing the viewer should absorb from that
moment — a punchy stat, a bold claim, a question, or a key phrase (≤ ~5 words), pulled from the narration so
it reinforces what is being said and drives retention. It must NEVER be an encyclopedic label — no species or
Latin names, no "Fig. N" captions, no figure numbers. Put on-screen text ONLY in this field, never inside
"scene". ${frequency} ACCURACY: if onScreenText states any number (cost, price, hp, spec, date), it MUST match the verified facts / narration — NEVER invent a figure for a caption; when unsure use a qualitative phrase or leave it "".

${soundDesign}

For each beat also decide VISUAL SOURCE. Set "visualKind" to "photo" when the beat depicts a CONCRETE real-world subject that a real stock photograph would show accurately (a specific engine, a car part, a named car, a tool, a place) — and give a precise "photoQuery" to find that photo (e.g. "BMW B58 engine bare block on engine stand"). Set "visualKind" to "illustration" (and photoQuery "") when the beat is an abstract idea, a comparison, a metaphor, a diagram/chart, or a composite that no single real photo captures. Prefer "photo" for concrete hardware; prefer "illustration" for concepts.
${sparseExtras}
${groundingBlock}
Chapter: "${chapterTitle}"
Return EXACTLY ${slices.length} items, in order, as JSON: ${jsonShape}.
Beats:
${numbered}`;
}

interface SceneItem { scene: string; onScreenText: string; sound: string; visualKind: "photo" | "illustration"; photoQuery: string; label: string; background: string }

async function sceneItems(styleBible: StyleBible, chapterTitle: string, slices: string[], grounding: string): Promise<SceneItem[]> {
  const prompt = scenePrompt(styleBible, chapterTitle, slices, grounding);
  const run = async () => {
    const result = await generateObject({ model: getClaudeModel("claude-sonnet-4-5"), schema: SceneItemsSchema, prompt });
    return SceneItemsSchema.parse(result.object).items;
  };
  let items: SceneItem[];
  try {
    items = await run();
  } catch (err) {
    if (!NoObjectGeneratedError.isInstance(err)) throw err;
    try {
      items = await run();
    } catch (retryErr) {
      if (!NoObjectGeneratedError.isInstance(retryErr)) throw retryErr;
      items = slices.map((s) => ({ scene: s, onScreenText: "", sound: "", visualKind: "illustration", photoQuery: "", label: "", background: "" })); // fallback: slice as scene, no SFX
    }
  }
  // Repair count mismatch: pad with the slice text (no on-screen text, no sound), truncate extras.
  return slices.map((slice, i) => items[i] ?? { scene: slice, onScreenText: "", sound: "", visualKind: "illustration", photoQuery: "", label: "", background: "" });
}

export async function runBeatPlanner(ctx: BeatPlannerRunContext): Promise<BeatPlannerOutput> {
  const chapters = [];
  for (const ch of ctx.chapters) {
    const slices = splitNarrationIntoBeats(ch.narration, {
      targetBeatSeconds: ctx.styleBible.targetBeatSeconds,
      wordsPerSecond: WORDS_PER_SECOND,
    });
    const sliceTexts = slices.map((s) => s.text);
    const items = await sceneItems(ctx.styleBible, ch.title, sliceTexts, ctx.grounding ?? "");
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
    chapters.push({ chapterIndex: ch.index, beats });
  }
  return { chapters };
}
