// src/lib/longform/estimate.ts
// Rough, honest estimate of render cost + wall time for the operator checkpoint.
// Calibrated against observed local runs (e.g. 66 nano_banana_2 frames ≈ 16 min at concurrency 2).

interface ModelProfile {
  /** Higgsfield credits per generated image. */
  creditsPerImage: number;
  /** Approx wall seconds per image (the gen step dominates). */
  secondsPerImage: number;
}

// Keys are Higgsfield model aliases (e.g. gpt_image_2 = Higgsfield's "GPT Image 2"), not provider SDK ids.
const MODEL_PROFILES: Record<string, ModelProfile> = {
  gpt_image_2: { creditsPerImage: 0.75, secondsPerImage: 10 },
  flux_2: { creditsPerImage: 1, secondsPerImage: 16 },
  seedream_v4_5: { creditsPerImage: 1, secondsPerImage: 16 },
  seedream_v5: { creditsPerImage: 1, secondsPerImage: 16 },
  nano_banana: { creditsPerImage: 2, secondsPerImage: 28 },
  nano_banana_2: { creditsPerImage: 2, secondsPerImage: 28 },
  nano_banana_2_ai_stylist: { creditsPerImage: 2, secondsPerImage: 28 },
  recraft_v4_1: { creditsPerImage: 1, secondsPerImage: 16 },
  grok_image: { creditsPerImage: 1, secondsPerImage: 16 },
  soul_v2: { creditsPerImage: 1, secondsPerImage: 16 },
};

const DEFAULT_PROFILE: ModelProfile = { creditsPerImage: 1.5, secondsPerImage: 20 };
const OVERHEAD_SECONDS = 90; // ~30s voice synth + ~30s sfx + ~30s ffmpeg mux, roughly constant.

export interface EstimateInput {
  beatCount: number;
  model: string;
  /** Higgsfield image concurrency the worker will use. Default 2 (safe for reference-driven). */
  concurrency?: number;
}

export interface RenderEstimate {
  credits: number;
  minutes: number;
}

export function estimateRender({ beatCount, model, concurrency = 2 }: EstimateInput): RenderEstimate {
  const profile = MODEL_PROFILES[model] ?? DEFAULT_PROFILE;
  // Round credits UP — an operator-facing cost estimate should never under-report.
  const credits = Math.ceil(beatCount * profile.creditsPerImage);
  const batches = Math.ceil(beatCount / Math.max(1, concurrency));
  const seconds = batches * profile.secondsPerImage + OVERHEAD_SECONDS;
  const minutes = Math.round(seconds / 60);
  return { credits, minutes };
}
