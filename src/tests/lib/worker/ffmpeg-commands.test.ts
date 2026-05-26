import { describe, it, expect, vi } from "vitest";
import * as child from "node:child_process";

vi.mock("node:child_process");

import {
  buildNormalizeShotArgs,
  buildFinalComposeArgs,
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

describe("buildFinalComposeArgs", () => {
  it("uses concat demuxer + amix(0.25 music) + subtitles filter", () => {
    const argv = buildFinalComposeArgs({
      concatListPath: "/tmp/list.txt",
      voicePath: "/tmp/voice.wav",
      musicPath: "/tmp/music.mp3",
      subtitlesPath: "/tmp/captions.srt",
      outputPath: "/tmp/out.mp4",
    });
    expect(argv).toContain("-f");
    expect(argv).toContain("concat");
    expect(argv).toContain("/tmp/list.txt");
    expect(argv.join(" ")).toContain("[2:a]volume=0.25[m]");
    expect(argv.join(" ")).toContain("[1:a][m]amix=inputs=2:duration=first[a]");
    expect(argv.join(" ")).toContain("subtitles=/tmp/captions.srt");
    expect(argv).toContain("/tmp/out.mp4");
  });

  it("omits music branch when musicPath is null", () => {
    const argv = buildFinalComposeArgs({
      concatListPath: "/tmp/list.txt",
      voicePath: "/tmp/voice.wav",
      musicPath: null,
      subtitlesPath: "/tmp/captions.srt",
      outputPath: "/tmp/out.mp4",
    });
    expect(argv.join(" ")).not.toContain("amix");
    expect(argv.join(" ")).not.toContain("volume=0.25");
  });

  it("omits subtitles filter when subtitlesPath is null", () => {
    const argv = buildFinalComposeArgs({
      concatListPath: "/tmp/list.txt",
      voicePath: "/tmp/voice.wav",
      musicPath: null,
      subtitlesPath: null,
      outputPath: "/tmp/out.mp4",
    });
    expect(argv.join(" ")).not.toContain("subtitles=");
  });
});
