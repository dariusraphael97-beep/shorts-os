// src/lib/agents/longform/beat-planner.ts
import { generateObject, NoObjectGeneratedError } from "ai";
import { getClaudeModel } from "@/lib/ai/gateway";
import { splitNarrationIntoBeats } from "@/lib/longform/beats";
import { assembleImagePrompt } from "@/lib/longform/image-prompt";
import { WORDS_PER_SECOND } from "@/lib/longform/duration";
import { SceneDescriptionsSchema, type BeatPlannerOutput } from "@/lib/agents/longform/types";
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

Chapter: "${chapterTitle}"
Return EXACTLY ${slices.length} scenes, in order, as JSON: { "scenes": string[] }.
Beats:
${numbered}`;
}

async function sceneDescriptions(styleBible: StyleBible, chapterTitle: string, slices: string[]): Promise<string[]> {
  const prompt = scenePrompt(styleBible, chapterTitle, slices);
  const run = async () => {
    const result = await generateObject({ model: getClaudeModel("claude-sonnet-4-5"), schema: SceneDescriptionsSchema, prompt });
    return SceneDescriptionsSchema.parse(result.object).scenes;
  };
  let scenes: string[];
  try {
    scenes = await run();
  } catch (err) {
    if (!NoObjectGeneratedError.isInstance(err)) throw err;
    try {
      scenes = await run();
    } catch (retryErr) {
      if (!NoObjectGeneratedError.isInstance(retryErr)) throw retryErr;
      scenes = slices.slice(); // fallback: use the narration slice itself as the scene
    }
  }
  // Repair count mismatch: pad with the slice text, truncate extras.
  return slices.map((slice, i) => scenes[i] ?? slice);
}

export async function runBeatPlanner(ctx: BeatPlannerRunContext): Promise<BeatPlannerOutput> {
  const chapters = [];
  for (const ch of ctx.chapters) {
    const slices = splitNarrationIntoBeats(ch.narration, {
      targetBeatSeconds: ctx.styleBible.targetBeatSeconds,
      wordsPerSecond: WORDS_PER_SECOND,
    });
    const sliceTexts = slices.map((s) => s.text);
    const scenes = await sceneDescriptions(ctx.styleBible, ch.title, sliceTexts);
    const beats = slices.map((slice, i) => {
      const { prompt, negativePrompt } = assembleImagePrompt({ sceneDescription: scenes[i], styleBible: ctx.styleBible });
      return {
        index: i,
        narrationSlice: slice.text,
        estDurationSeconds: slice.estDurationSeconds,
        sceneDescription: scenes[i],
        imagePrompt: prompt,
        negativePrompt,
      };
    });
    chapters.push({ chapterIndex: ch.index, beats });
  }
  return { chapters };
}
