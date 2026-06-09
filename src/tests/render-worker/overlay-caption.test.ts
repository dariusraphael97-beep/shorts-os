// src/tests/render-worker/overlay-caption.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// overlayCaption shells out via runFfmpeg (from ./ffmpeg-commands.ts) and writes the caption
// to a textfile via node:fs/promises. Mock both so no real ffmpeg/file IO runs.
vi.mock("../../../scripts/render-worker/lib/ffmpeg-commands.ts", () => ({
  runFfmpeg: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn(),
}));

import { overlayCaption } from "../../../scripts/render-worker/lib/ffmpeg-longform";
import { runFfmpeg } from "../../../scripts/render-worker/lib/ffmpeg-commands";
import { writeFile } from "node:fs/promises";

const mockRun = vi.mocked(runFfmpeg);
const mockWrite = vi.mocked(writeFile);

// Pull the value of a flag from an ffmpeg argv array (e.g. valueOf(argv, "-vf")).
function valueOf(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

describe("render-worker overlayCaption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRun.mockResolvedValue(undefined);
    mockWrite.mockResolvedValue(undefined);
  });

  it("draws a drawtext caption from a textfile using the bundled font", async () => {
    await overlayCaption({ videoPath: "/tmp/in.mp4", caption: "Hello world", outputPath: "/tmp/out.mp4" });

    expect(mockRun).toHaveBeenCalledTimes(1);
    const argv = mockRun.mock.calls[0][0];
    const vf = valueOf(argv, "-vf");
    expect(vf).toBeDefined();
    expect(vf).toContain("drawtext");
    expect(vf).toContain("fontfile=");
    expect(vf).toContain("textfile=");
    // The font path must point at the bundled DejaVuSans-Bold.ttf.
    expect(vf).toMatch(/DejaVuSans-Bold\.ttf/);
  });

  it("writes the caption to a textfile (no text= escaping)", async () => {
    await overlayCaption({ videoPath: "/tmp/in.mp4", caption: "Hello world", outputPath: "/tmp/out.mp4" });

    expect(mockWrite).toHaveBeenCalledTimes(1);
    const [txtPath, contents] = mockWrite.mock.calls[0];
    expect(txtPath).toBe("/tmp/out.mp4.caption.txt");
    expect(contents).toBe("Hello world");
    // The drawtext filter must reference that exact textfile, not an inline text=.
    const vf = valueOf(mockRun.mock.calls[0][0], "-vf")!;
    expect(vf).toContain(`textfile='${txtPath}'`);
    // Uses textfile=, never an inline text= value (which would need fragile escaping).
    // (textfile= contains the substring "text=", so match the inline form precisely.)
    expect(vf).not.toMatch(/[:=]text=/);
  });

  it("passthrough-copies when the caption is empty (no drawtext, no textfile write)", async () => {
    await overlayCaption({ videoPath: "/tmp/in.mp4", caption: "   ", outputPath: "/tmp/out.mp4" });

    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalledTimes(1);
    const argv = mockRun.mock.calls[0][0];
    // -c copy passthrough; no -vf / drawtext.
    expect(valueOf(argv, "-c")).toBe("copy");
    expect(argv).not.toContain("-vf");
    expect(argv.join(" ")).not.toContain("drawtext");
  });
});
