// src/app/agents/[id]/_components/settings-fields.ts
//
// Client-side field descriptors for the per-agent Settings tab. These mirror
// the server validation in `src/lib/agents/settings/schemas.ts` (B1) — keep the
// two in sync. The server is still the source of truth: anything the client
// assembles is re-validated on PUT.

export type FieldDescriptor =
  | { key: string; label: string; help?: string; kind: "model" }
  | { key: string; label: string; help?: string; kind: "ratio" } // slider 0..1, step 0.05
  | { key: string; label: string; help?: string; kind: "int"; min: number }; // integer input

// Vetted gateway model strings offered in the dropdown. An unknown stored value
// is appended at render time so it still displays.
export const MODEL_OPTIONS = [
  "anthropic/claude-sonnet-4-5",
  "anthropic/claude-haiku-4-5",
  "anthropic/claude-opus-4-1",
] as const;

export const DEFAULT_MODEL_LABEL = "Default (claude-sonnet-4-5)";

const MODEL_FIELD: FieldDescriptor = {
  key: "model",
  label: "Model",
  help: "Which model this agent reasons with.",
  kind: "model",
};

export const SETTINGS_FIELDS: Record<string, FieldDescriptor[]> = {
  niche_scout: [
    MODEL_FIELD,
    {
      key: "proven_vs_firstmover",
      label: "Proven vs. first-mover",
      help: "0 favors proven niches, 1 favors untapped first-mover bets.",
      kind: "ratio",
    },
    {
      key: "confidence_floor",
      label: "Confidence floor",
      help: "Minimum confidence before a niche is surfaced.",
      kind: "ratio",
    },
  ],
  video_reviewer: [
    MODEL_FIELD,
    {
      key: "block_threshold",
      label: "Block threshold",
      help: "Reviews scoring below this are blocked from publishing.",
      kind: "ratio",
    },
  ],
  generator: [MODEL_FIELD],
  watch_list_curator: [
    MODEL_FIELD,
    {
      key: "evict_after_zero_signal_weeks",
      label: "Evict after zero-signal weeks",
      help: "Drop a watched item after this many weeks with no signal.",
      kind: "int",
      min: 1,
    },
  ],
};

export function fieldsFor(assistantId: string): FieldDescriptor[] {
  return SETTINGS_FIELDS[assistantId] ?? [];
}
