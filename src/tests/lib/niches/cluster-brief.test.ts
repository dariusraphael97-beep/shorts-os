import { describe, it, expect } from "vitest";
import { clusterToBrief } from "@/lib/niches/cluster-brief";

const cluster = {
  id: "c1", canonical_topic: "ai productivity tools", format_label: "ai_voiceover_facts",
  audience_signal: "professionals", example_video_ids: ["v1", "v2"], production_fit: "native",
};

describe("clusterToBrief", () => {
  it("produces a topic_queue manual row payload from a cluster", () => {
    const b = clusterToBrief(cluster);
    expect(b.title).toContain("ai productivity tools");
    expect(b.rawPayload).toMatchObject({ clusterId: "c1", format: "ai_voiceover_facts", audience: "professionals", referenceVideoIds: ["v1", "v2"] });
    expect(b.summary).toBeTruthy();
  });
  it("rejects non-native production_fit (only native auto-generates)", () => {
    expect(() => clusterToBrief({ ...cluster, production_fit: "needs_manual_recording" })).toThrow(/native/i);
  });
});
