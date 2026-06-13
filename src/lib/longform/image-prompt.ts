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
