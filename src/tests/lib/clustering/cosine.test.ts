import { describe, it, expect } from "vitest";
import { cosine, fuzzyMergeTopics } from "@/lib/clustering/cosine";

describe("cosine", () => {
  it("is 1 for identical, 0 for orthogonal", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("returns 0 for a zero vector (no NaN)", () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("fuzzyMergeTopics", () => {
  it("merges labels at cosine >= 0.85 to the most-frequent surface form", () => {
    const embeddings = new Map<string, number[]>([
      ["cats", [1, 0, 0]],
      ["kittens", [0.99, 0.14, 0]],
      ["finance", [0, 0, 1]],
    ]);
    const counts = new Map<string, number>([["cats", 2], ["kittens", 1], ["finance", 5]]);
    const canon = fuzzyMergeTopics(["cats", "kittens", "finance"], embeddings, counts, 0.85);
    expect(canon.get("cats")).toBe("cats");
    expect(canon.get("kittens")).toBe("cats");
    expect(canon.get("finance")).toBe("finance");
  });
});
