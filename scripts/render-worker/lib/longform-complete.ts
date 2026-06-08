// scripts/render-worker/lib/longform-complete.ts
// MIRROR of src/lib/render/longform-complete.ts — keep in sync (pinned by a parity test).
export interface LongformRenderOutput {
  render_artifact_url?: string;
  duration_seconds_actual?: number;
  chapter_markers?: unknown;
}

export function longformRenderUpdate(out: LongformRenderOutput) {
  return {
    render_artifact_url: out.render_artifact_url ?? null,
    duration_seconds: out.duration_seconds_actual ?? null,
    chapter_markers: (out.chapter_markers ?? null) as Record<string, unknown> | unknown[] | null,
    status: "rendered" as const,
    updated_at: new Date().toISOString(),
  };
}
