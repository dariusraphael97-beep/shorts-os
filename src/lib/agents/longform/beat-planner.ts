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
}

function scenePrompt(styleBible: StyleBible, chapterTitle: string, slices: string[]): string {
  const numbered = slices.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const guidance =
    styleBible.presetId === "stick-figure-animated"
      ? `For each narration beat below, describe ONE clear, simple doodle of exactly what the narrator is
saying at that moment. Make the video VISUALLY INTERESTING and VARIED — across consecutive beats CHANGE the
composition, the camera distance, the setting and the background color, and mix the approach: a character in
a scene, a close-up of an object, a simple diagram or chart, a before/after, a map, a visual metaphor. Do
NOT keep drawing the same "stick figure standing in a plain room" — each image should feel fresh and
different from the ones around it. One clear scene, never a collage or multiple panels. Add ON-SCREEN TEXT
the way the channel does so the viewer absorbs the point — it can be a single word, a few words, a label, a
sign, or a short phrase, whatever amount fits the moment (it does NOT have to be exactly one word). Put any
on-screen text in quotes. Describe only WHAT is happening (subject, action, setting, on-screen text) in one
short plain sentence — do NOT include any drawing-style, lighting, or quality words (those are added
automatically).`
      : `For each narration beat below, describe ONE concrete, filmable VISUAL SCENE that literally
illustrates what is said at that moment (no random images, no collage). Subjects centered. Think like a
${styleBible.presetId} documentary. Describe the subject and setting only — do NOT include style/lighting/quality
words (those are added automatically). Keep each scene one vivid sentence.`;
  return `You are the Beat Planner. ${guidance}

Also do SOUND DESIGN: for each beat give a short "sound" — a text-to-SFX prompt for a real-world
sound that fits THAT moment (e.g. "a hawk screech", "wind rustling through trees", "wings flapping",
"a heartbeat thudding", "soft rain"). Use a sound on the beats where one clearly belongs; use an EMPTY
string "" for abstract, quiet, or diagram/text-only beats. Keep each sound a few words, concrete, single.

Chapter: "${chapterTitle}"
Return EXACTLY ${slices.length} items, in order, as JSON: { "items": [{ "scene": string, "sound": string }] }.
Beats:
${numbered}`;
}

interface SceneItem { scene: string; sound: string }

async function sceneItems(styleBible: StyleBible, chapterTitle: string, slices: string[]): Promise<SceneItem[]> {
  const prompt = scenePrompt(styleBible, chapterTitle, slices);
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
      items = slices.map((s) => ({ scene: s, sound: "" })); // fallback: slice as scene, no SFX
    }
  }
  // Repair count mismatch: pad with the slice text (no sound), truncate extras.
  return slices.map((slice, i) => items[i] ?? { scene: slice, sound: "" });
}

export async function runBeatPlanner(ctx: BeatPlannerRunContext): Promise<BeatPlannerOutput> {
  const chapters = [];
  for (const ch of ctx.chapters) {
    const slices = splitNarrationIntoBeats(ch.narration, {
      targetBeatSeconds: ctx.styleBible.targetBeatSeconds,
      wordsPerSecond: WORDS_PER_SECOND,
    });
    const sliceTexts = slices.map((s) => s.text);
    const items = await sceneItems(ctx.styleBible, ch.title, sliceTexts);
    const beats = slices.map((slice, i) => {
      const { prompt, negativePrompt } = assembleImagePrompt({ sceneDescription: items[i].scene, styleBible: ctx.styleBible });
      const sound = items[i].sound?.trim();
      return {
        index: i,
        narrationSlice: slice.text,
        estDurationSeconds: slice.estDurationSeconds,
        sceneDescription: items[i].scene,
        imagePrompt: prompt,
        negativePrompt,
        ...(sound ? { soundEffect: sound } : {}),
      };
    });
    chapters.push({ chapterIndex: ch.index, beats });
  }
  return { chapters };
}
