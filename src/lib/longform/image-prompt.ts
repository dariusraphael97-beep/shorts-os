// src/lib/longform/image-prompt.ts
// Pure assembly of a final Higgsfield prompt from a per-beat scene description + the
// video's StyleBible. The Beat-planner LLM writes only the sceneDescription; this
// deterministically wraps it so every image shares one aesthetic. The fully-assembled
// prompt string is stored in the plan, so the worker consumes it directly (no mirror).

import type { StyleBible } from "@/lib/longform/style-presets";

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
