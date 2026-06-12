// src/tests/render-worker/longform-complete-mirror.test.ts
import { describe, it, expect } from "vitest";
import { longformRenderUpdate as src } from "@/lib/render/longform-complete";
import { longformRenderUpdate as worker } from "../../../scripts/render-worker/lib/longform-complete";

describe("render-worker longform-complete mirror", () => {
  it("produces the same fields as the src mapping", () => {
    const out = { render_artifact_url: "https://blob/x.mp4", duration_seconds_actual: 100, chapter_markers: [{ i: 0 }] };
    const a = src(out); const b = worker(out);
    expect(b.render_artifact_url).toBe(a.render_artifact_url);
    expect(b.duration_seconds).toBe(a.duration_seconds);
    expect(b.chapter_markers).toEqual(a.chapter_markers);
    expect(b.status).toBe(a.status);
  });
});
