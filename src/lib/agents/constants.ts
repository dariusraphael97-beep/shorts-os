// src/lib/agents/constants.ts
//
// Curated lists the Director (visual_treatment) and Voice Coach (voice_id)
// must pick from. Plan #4's render pipeline maps each treatment to a concrete
// b-roll search strategy and each voice_id to a real provider API call.

export const VISUAL_TREATMENTS = [
  "kinetic-typography", // text flying / animated, words highlighted as spoken
  "stock-montage",      // sequence of stock video clips matching script beats
  "data-viz",           // animated charts, graphs, numbers
  "archive-collage",    // old photos, newspaper clippings, grainy footage
  "satellite-zoom",     // Google-Earth-style zooms into locations
  "split-screen",       // two clips side by side, comparison-style
] as const;

export type VisualTreatment = (typeof VISUAL_TREATMENTS)[number];

export const VISUAL_TREATMENT_DESCRIPTIONS: Record<VisualTreatment, string> = {
  "kinetic-typography": "text flying / animated, words highlighted as spoken",
  "stock-montage": "sequence of stock video clips matching script beats",
  "data-viz": "animated charts, graphs, numbers",
  "archive-collage": "old photos, newspaper clippings, grainy footage",
  "satellite-zoom": "Google-Earth-style zooms into locations",
  "split-screen": "two clips side by side, comparison-style",
};

export const VOICE_POOL = [
  {
    id: "sonic-narrator-male-deadpan",
    provider: "cartesia",
    description: "Dry deadpan male, mid-pace, slightly skeptical",
  },
  {
    id: "sonic-narrator-female-warm",
    provider: "cartesia",
    description: "Warm conversational female, friendly storyteller",
  },
  {
    id: "sonic-narrator-male-urgent",
    provider: "cartesia",
    description: "Punchy urgent male, news-bulletin energy",
  },
  {
    id: "eleven-narrator-female-curious",
    provider: "elevenlabs",
    description: "Curious storytelling female, leans into mystery",
  },
  {
    id: "eleven-narrator-male-gravelly",
    provider: "elevenlabs",
    description: "Gravelly documentary male, '60 Minutes' weight",
  },
  {
    id: "eleven-narrator-female-young",
    provider: "elevenlabs",
    description: "Energetic young female, TikTok-native pace",
  },
] as const;

export type VoicePoolEntry = (typeof VOICE_POOL)[number];
export type VoiceId = VoicePoolEntry["id"];

// Extracted as a [string, ...string[]] for use in z.enum().
export const VOICE_POOL_IDS = VOICE_POOL.map((v) => v.id) as [VoiceId, ...VoiceId[]];

export const VOICE_PROVIDERS = ["cartesia", "elevenlabs"] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];
