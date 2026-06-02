// src/lib/longform/image-prompt.ts
// Pure assembly of a final Higgsfield prompt from a per-beat scene description + the
// video's StyleBible. The Beat-planner LLM writes only the sceneDescription; this
// deterministically wraps it so every image shares one aesthetic. The fully-assembled
// prompt string is stored in the plan, so the worker consumes it directly (no mirror).

import type { StyleBible } from "@/lib/longform/style-presets";

export interface AssembleArgs {
  sceneDescription: string;
  styleBible: StyleBible;
}

export interface AssembledPrompt {
  prompt: string;
  negativePrompt: string;
}

export function assembleImagePrompt({ sceneDescription, styleBible }: AssembleArgs): AssembledPrompt {
  const scene = sceneDescription.replace(/\s+/g, " ").trim();
  const prompt = [
    styleBible.positivePrefix,
    scene,
    styleBible.framing,
    styleBible.lighting,
    styleBible.palette,
    "16:9 aspect ratio, wide landscape composition",
  ].join(". ");
  return { prompt, negativePrompt: styleBible.negativePrompt };
}
