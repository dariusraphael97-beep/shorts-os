// src/lib/render/longform-complete.ts
// Single source of truth for how a successful render_longform output maps onto the
// your_videos draft. Used by BOTH the HTTP callback (cloud path) and the local worker
// daemon (mirrored copy in scripts/render-worker/lib/longform-complete.ts — keep in sync).

export interface LongformRenderOutput {
  render_artifact_url?: string;
  duration_seconds_actual?: number;
  chapter_markers?: unknown;
}

export interface LongformDraftUpdate {
  render_artifact_url: string | null;
  duration_seconds: number | null;
  chapter_markers: Record<string, unknown> | unknown[] | null;
  status: "rendered";
  updated_at: string;
}

export function longformRenderUpdate(out: LongformRenderOutput): LongformDraftUpdate {
  return {
    render_artifact_url: out.render_artifact_url ?? null,
    duration_seconds: out.duration_seconds_actual ?? null,
    chapter_markers: (out.chapter_markers ?? null) as LongformDraftUpdate["chapter_markers"],
    status: "rendered",
    updated_at: new Date().toISOString(),
  };
}
