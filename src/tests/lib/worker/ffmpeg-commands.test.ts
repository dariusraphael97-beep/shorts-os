import { describe, it, expect, vi } from "vitest";
import * as child from "node:child_process";

vi.mock("node:child_process");

import {
  buildNormalizeShotArgs,
  buildBaseComposeArgs,   // renamed (was buildFinalComposeArgs)
  buildCompositeArgs,     // new
} from "../../../../scripts/render-worker/lib/ffmpeg-commands.ts";

describe("buildNormalizeShotArgs", () => {
  it("scales-crops to 1080x1920 at 30fps and truncates to duration", () => {
    const argv = buildNormalizeShotArgs({
      inputPath: "/tmp/shot_1.mp4",
      durationSeconds: 5,
      outputPath: "/tmp/norm_1.mp4",
    });
    expect(argv).toContain("-y");
    expect(argv).toContain("-i");
    expect(argv).toContain("/tmp/shot_1.mp4");
    expect(argv).toContain("-t");
    expect(argv).toContain("5");
    expect(argv.join(" ")).toContain("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920");
    expect(argv.join(" ")).toContain("-r 30");
    expect(argv).toContain("/tmp/norm_1.mp4");
  });
});

describe("buildBaseComposeArgs", () => {
  it("uses concat demuxer + amix(0.25 music)", () => {
    const argv = buildBaseComposeArgs({
      concatListPath: "/tmp/list.txt",
      voicePath: "/tmp/voice.wav",
      musicPath: "/tmp/music.mp3",
      outputPath: "/tmp/base.mp4",
    });
    expect(argv).toContain("-f");
    expect(argv).toContain("concat");
    expect(argv).toContain("/tmp/list.txt");
    expect(argv.join(" ")).toContain("[2:a]volume=0.25[m]");
    expect(argv.join(" ")).toContain("[1:a][m]amix=inputs=2:duration=first[a]");
    // Subtitles filter is NO LONGER in this pass — captions moved to overlay
    expect(argv.join(" ")).not.toContain("subtitles=");
    expect(argv).toContain("/tmp/base.mp4");
  });

  it("omits music branch when musicPath is null", () => {
    const argv = buildBaseComposeArgs({
      concatListPath: "/tmp/list.txt",
      voicePath: "/tmp/voice.wav",
      musicPath: null,
      outputPath: "/tmp/base.mp4",
    });
    expect(argv.join(" ")).not.toContain("amix");
    expect(argv.join(" ")).not.toContain("volume=0.25");
  });
});

describe("buildCompositeArgs", () => {
  it("overlays the transparent overlay video onto the base video", () => {
    const argv = buildCompositeArgs({
      basePath: "/tmp/base.mp4",
      overlayPath: "/tmp/captions.mov",
      outputPath: "/tmp/out.mp4",
    });
    expect(argv).toContain("-i");
    expect(argv).toContain("/tmp/base.mp4");
    expect(argv).toContain("/tmp/captions.mov");
    expect(argv.join(" ")).toContain("[0:v][1:v]overlay=format=auto[v]");
    expect(argv).toContain("/tmp/out.mp4");
  });
});
