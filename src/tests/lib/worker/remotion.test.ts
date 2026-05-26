import { describe, it, expect } from "vitest";
import { buildRemotionRenderArgs } from "../../../../scripts/render-worker/lib/remotion";

describe("buildRemotionRenderArgs", () => {
  it("constructs the npx remotion render argv with composition + props", () => {
    const argv = buildRemotionRenderArgs({
      compositionId: "captions-word-by-word",
      props: { variant: "word-by-word", words: [], durationSeconds: 60 },
      outputPath: "/tmp/captions.mov",
      durationInFrames: 1800,
    });

    expect(argv).toEqual([
      "remotion",
      "render",
      "/vercel/sandbox/src/remotion/index.tsx",
      "captions-word-by-word",
      "/tmp/captions.mov",
      "--codec=prores",
      "--prores-profile=4444",
      "--pixel-format=yuva444p10le",
      "--frames=0-1799",
      `--props=${JSON.stringify({ variant: "word-by-word", words: [], durationSeconds: 60 })}`,
      "--log=warn",
    ]);
  });
});
