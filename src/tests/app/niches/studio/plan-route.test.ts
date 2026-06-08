// src/tests/app/niches/studio/plan-route.test.ts
import { describe, it, expect } from "vitest";
import { buildPlanArgs } from "@/app/api/niches/studio/plan/route";

describe("buildPlanArgs", () => {
  it("builds planOnly pipeline args from a cluster + channel + optional topic override", () => {
    const args = buildPlanArgs(
      { canonical_topic: "backyard birds ranked", production_fit: "native" },
      "channel-1",
      undefined,
    );
    expect(args).toEqual({
      topic: "backyard birds ranked",
      targetDurationSeconds: 210,
      channelId: "channel-1",
      planOnly: true,
    });
  });

  it("honors an operator topic override", () => {
    const args = buildPlanArgs(
      { canonical_topic: "backyard birds ranked", production_fit: "native" },
      "channel-1",
      "Backyard birds ranked by how terrifying they are",
    );
    expect(args.topic).toBe("Backyard birds ranked by how terrifying they are");
    expect(args.planOnly).toBe(true);
  });
});
