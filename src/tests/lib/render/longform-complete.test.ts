// src/tests/lib/render/longform-complete.test.ts
import { describe, it, expect } from "vitest";
import { longformRenderUpdate } from "@/lib/render/longform-complete";

describe("longformRenderUpdate", () => {
  it("maps a successful render output to the your_videos update fields", () => {
    const upd = longformRenderUpdate({
      render_artifact_url: "https://blob/x.mp4",
      duration_seconds_actual: 185.4,
      chapter_markers: [{ index: 0, startMs: 0 }],
    });
    expect(upd.render_artifact_url).toBe("https://blob/x.mp4");
    expect(upd.duration_seconds).toBe(185.4);
    expect(upd.chapter_markers).toEqual([{ index: 0, startMs: 0 }]);
    expect(upd.status).toBe("rendered");
    expect(typeof upd.updated_at).toBe("string");
  });

  it("tolerates missing optional fields", () => {
    const upd = longformRenderUpdate({});
    expect(upd.render_artifact_url).toBeNull();
    expect(upd.duration_seconds).toBeNull();
    expect(upd.chapter_markers).toBeNull();
    expect(upd.status).toBe("rendered");
  });
});
