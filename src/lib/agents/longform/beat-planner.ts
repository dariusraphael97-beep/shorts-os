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
      ? `Captions are RARE and load-bearing: leave onScreenText "" on the vast majority of beats. Add one ONLY on a true emphasis beat (roughly 1 beat in 7 — every chapter has a few) — the single line the viewer must remember — as an ALL-CAPS punch of AT MOST 4 WORDS. Count the words: if it needs 5+, cut it down (e.g. "OLD HOURS", never "YOUR METABOLISM KEEPS OLD HOURS"); a caption over 4 words will be discarded.`
      : styleBible.onScreenTextMode === "additive"
        ? `Keep it clean: leave onScreenText "" on most beats — add a short hook ONLY on the few beats where a key stat or turning point really lands.`
        : `Most beats should have text; use "" only when a clean wordless image is clearly stronger.`;
  const soundDesign =
    styleBible.onScreenTextMode === "sparse"
      ? `Also do SOUND DESIGN: for each beat give a short "sound" — a text-to-SFX prompt — but this video is nearly silent: AT MOST ONE beat in THIS chapter may carry a sound, and ZERO is the norm (the finished video keeps only ~4 cues total). Use one ONLY where a real diegetic sound is the heart of the scene (a fire crackling, night crickets, a factory bell). Use an EMPTY string "" everywhere else; this video is quiet and contemplative.`
      : `Also do SOUND DESIGN: for each beat give a short "sound" — a text-to-SFX prompt for a real-world
sound that fits THAT moment (e.g. "a hawk screech", "wind rustling through trees", "wings flapping",
"a heartbeat thudding", "soft rain"). Use a sound on the beats where one clearly belongs; use an EMPTY
string "" for abstract, quiet, or diagram/text-only beats. Keep each sound a few words, concrete, single.`;
  const sparseExtras =
    styleBible.onScreenTextMode === "sparse"
      ? `\nFor each beat also give:
- "label": a small lowercase object label for EVIDENCE beats only — a dated artifact, document, or exhibit (e.g. "diary, 1400s." or "cookbook, 1500s."). Use "" on every other beat.
- "background": the ONE flat solid background color for this beat, keyed to its mood — "white" for diagram/fact beats, "deep navy" for night or contemplation, "warm orange and pale blue" for sunrise/warmth, "dark navy" for a night bedroom, "earthy brown and green" for outdoors/nature/the past — plus scene-appropriate variants (e.g. "warm kitchen yellow", "factory grey"). VARY THE BACKGROUND across the video; never use white for everything.
A crude red marker circle (or red hand-drawn arrow) is this video's signature evidence device: if THIS chapter presents a dated document or artifact as evidence (a manuscript, a dated ad, a journal — usually the beat that gets a "label"), put a red callout on the single strongest such beat by writing it into that beat's "scene" (e.g. "a crude red marker circle scrawled around the date"). AT MOST ONE beat of THIS chapter — and NONE if the chapter has no dated-evidence beat.`
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

${isSparse
    ? `Set "visualKind" to "illustration" and "photoQuery" to "" on EVERY beat — this style never uses real photos.`
    : `For each beat also decide VISUAL SOURCE. Set "visualKind" to "photo" when the beat depicts a CONCRETE real-world subject that a real stock photograph would show accurately (a specific engine, a car part, a named car, a tool, a place) — and give a precise "photoQuery" to find that photo (e.g. "BMW B58 engine bare block on engine stand"). Set "visualKind" to "illustration" (and photoQuery "") when the beat is an abstract idea, a comparison, a metaphor, a diagram/chart, or a composite that no single real photo captures. Prefer "photo" for concrete hardware; prefer "illustration" for concepts.`}${sparseExtras}
${groundingBlock}
Chapter: "${chapterTitle}"
Return EXACTLY ${slices.length} items, in order, as JSON: ${jsonShape}.
Beats:
${numbered}`;
}

interface SceneItem { scene: string; onScreenText: string; sound: string; visualKind: "photo" | "illustration"; photoQuery: string; label: string; background: string }

// Red callouts are the sparse style's signature evidence device — more than ~4 across the
// video dilutes it. The prompt budgets per chapter (max one); code enforces the global cap
// because per-chapter LLM calls can't see each other (run #4 measured 5/7 chapters complying).
const MAX_RED_CALLOUTS = 4;
const RED_CALLOUT_RE = /red[^,.;]*(circle|arrow|marker)|(circle|arrow|marker)[^,.;]*red/i;

/** Remove the red-callout clause from a scene that exceeded the video-wide budget. */
function stripRedCallout(scene: string): string {
  const clauses = scene.split(/([,;]|(?<=[.!?])\s+)/);
  const kept = clauses.filter((c, i) => i % 2 === 1 || !RED_CALLOUT_RE.test(c));
  const cleaned = kept
    .join("")
    .replace(/\s*[,;]\s*(?=[,;.!?]|$)/g, "") // dangling separators left by dropped clauses
    .replace(/^\s*[,;]\s*/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (cleaned && !RED_CALLOUT_RE.test(cleaned)) return cleaned;
  // The callout is woven through every clause — fall back to deleting just the red phrasing.
  return scene.replace(/(?:crude\s+|hand-drawn\s+)*red\s+(?:marker\s+|hand-drawn\s+)?(?:circle|arrow|marker)?/gi, "").replace(/\s{2,}/g, " ").trim() || scene;
}

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
  let redCalloutsUsed = 0; // video-wide, across chapters (first-come within chapter order)
  for (const ch of ctx.chapters) {
    const slices = splitNarrationIntoBeats(ch.narration, {
      targetBeatSeconds: ctx.styleBible.targetBeatSeconds,
      wordsPerSecond: ctx.styleBible.wordsPerSecond ?? WORDS_PER_SECOND,
    });
    const sliceTexts = slices.map((s) => s.text);
    const items = await sceneItems(ctx.styleBible, ch.title, sliceTexts, ctx.grounding ?? "");
    // label/background are sparse-mode contracts; never trust them from non-sparse calls
    // (the schema accepts them in all modes, so a hallucinated value would otherwise leak).
    const sparse = ctx.styleBible.onScreenTextMode === "sparse";
    const beats = slices.map((slice, i) => {
      const label = sparse ? items[i].label?.trim() ?? "" : "";
      const background = sparse ? items[i].background?.trim() ?? "" : "";
      // Sparse contract guards (deterministic — the prompt asks, code enforces):
      // a caption over 4 words is dropped, and photos never happen in sparse styles.
      const rawCaption = items[i].onScreenText ?? "";
      const caption = sparse && rawCaption.trim().split(/\s+/).filter(Boolean).length > 4 ? "" : rawCaption;
      let scene = items[i].scene;
      if (sparse && RED_CALLOUT_RE.test(scene)) {
        if (redCalloutsUsed >= MAX_RED_CALLOUTS) scene = stripRedCallout(scene);
        else redCalloutsUsed++;
      }
      const { prompt, negativePrompt } = assembleImagePrompt({
        sceneDescription: scene,
        onScreenText: caption,
        objectLabel: label,
        backgroundMood: background,
        styleBible: ctx.styleBible,
      });
      const sound = items[i].sound?.trim();
      return {
        index: i,
        narrationSlice: slice.text,
        estDurationSeconds: slice.estDurationSeconds,
        sceneDescription: scene,
        onScreenText: caption,
        visualKind: sparse ? ("illustration" as const) : items[i].visualKind,
        photoQuery: sparse ? "" : items[i].photoQuery,
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
