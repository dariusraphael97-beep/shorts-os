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
  "held-shot-with-text-animation", // single sustained b-roll with animated text overlays
] as const;

export type VisualTreatment = (typeof VISUAL_TREATMENTS)[number];

export const VISUAL_TREATMENT_DESCRIPTIONS: Record<VisualTreatment, string> = {
  "kinetic-typography": "text flying / animated, words highlighted as spoken",
  "stock-montage": "sequence of stock video clips matching script beats",
  "data-viz": "animated charts, graphs, numbers",
  "archive-collage": "old photos, newspaper clippings, grainy footage",
  "satellite-zoom": "Google-Earth-style zooms into locations",
  "split-screen": "two clips side by side, comparison-style",
  "held-shot-with-text-animation":
    "single sustained b-roll shot with animated text overlays that pulse with the captions",
};

// Real Cartesia voice UUIDs (Plan #4 Phase 2). Slot 1 is the cars-channel
// default and must NOT change without also updating channels.default_voice_id
// for dyfrx_9754. Slots 2–6 are personas the Voice Coach may pick from when
// the script's tone explicitly overrides the channel default.
export const VOICE_POOL = [
  {
    id: "630ed21c-2c5c-41cf-9d82-10a7fd668370", // Corey — Supportive Buddy (US). Cars channel default.
    provider: "cartesia",
    description: "Inviting, cheerful young adult male for casual conversation (cars channel default)",
  },
  {
    id: "87286a8d-7ea7-4235-a41a-dd9fa6630feb", // Henry — Plainspoken Guy (US)
    provider: "cartesia",
    description: "Relaxed, monotone, matter-of-fact male — deadpan delivery for skeptical/dry scripts",
  },
  {
    id: "a167e0f3-df7e-4d52-a9c3-f949145efdab", // Blake — Helpful Agent (US)
    provider: "cartesia",
    description: "Energetic adult male — punchy, TikTok-native pace for high-engagement openers",
  },
  {
    id: "5ee9feff-1265-424a-9d7f-8e4d431a12c7", // Ronald — Thinker (US)
    provider: "cartesia",
    description: "Intense, deep young adult male — dramatic weight for crash/disaster stories",
  },
  {
    id: "a5136bf9-224c-4d76-b823-52bd5efcffcc", // Jameson — Easygoing Support (US)
    provider: "cartesia",
    description: "Friendly, laid-back male — podcast-style conversational casual",
  },
  {
    id: "f9836c6e-a0bd-460e-9d3c-f7299fa60f94", // Caroline — Southern Guide (US)
    provider: "cartesia",
    description: "Wild-card: friendly, slow Southern US female — gender-flip + regional accent for distinctive overrides",
  },
] as const;

export type VoicePoolEntry = (typeof VOICE_POOL)[number];
export type VoiceId = VoicePoolEntry["id"];

// Extracted as a [string, ...string[]] for use in z.enum().
export const VOICE_POOL_IDS = VOICE_POOL.map((v) => v.id) as [VoiceId, ...VoiceId[]];

export const VOICE_PROVIDERS = ["cartesia", "elevenlabs"] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];
