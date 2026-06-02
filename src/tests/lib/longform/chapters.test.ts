import { describe, it, expect } from "vitest";
import { formatTimestamp, buildChapterMarkers, buildConcatList } from "@/lib/longform/chapters";

describe("longform/chapters", () => {
  it("formats seconds as H:MM:SS or M:SS", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(65)).toBe("1:05");
    expect(formatTimestamp(3725)).toBe("1:02:05");
  });

  it("computes chapter start markers from chapter durations", () => {
    const markers = buildChapterMarkers([90, 120, 100], ["Intro", "Problem", "Payoff"]);
    expect(markers).toEqual([
      { index: 0, title: "Intro", startSeconds: 0, timestamp: "0:00" },
      { index: 1, title: "Problem", startSeconds: 90, timestamp: "1:30" },
      { index: 2, title: "Payoff", startSeconds: 210, timestamp: "3:30" },
    ]);
  });

  it("builds an ffmpeg concat-demuxer list with escaped paths", () => {
    const list = buildConcatList(["/tmp/a.mp4", "/tmp/b.mp4"]);
    expect(list).toBe("file '/tmp/a.mp4'\nfile '/tmp/b.mp4'\n");
  });
});
