import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({ getClaudeModel: vi.fn(() => ({ __mock: "model" })) }));
const generateObject = vi.fn();
vi.mock("ai", () => ({ generateObject: (...a: unknown[]) => generateObject(...a), NoObjectGeneratedError: class { static isInstance() { return false; } } }));

import { runBeatPlanner } from "@/lib/agents/longform/beat-planner";
import { getStylePreset } from "@/lib/longform/style-presets";

const playbook = { writer: { exemplarHooks: [] } } as any;

describe("runBeatPlanner caption grounding", () => {
  beforeEach(() => generateObject.mockReset());

  it("injects the grounding block and a caption no-invention rule into the scene prompt", async () => {
    generateObject.mockResolvedValue({ object: { items: [{ scene: "s", onScreenText: "", sound: "" }] } });
    await runBeatPlanner({
      styleBible: getStylePreset("technical-illustration"),
      playbook,
      chapters: [{ index: 0, title: "C1", narration: "A short narration sentence here for one beat." }],
      grounding: "VERIFIED FACTS:\n- 800whp on stock internals: ~$5-10k",
    });
    const prompt = generateObject.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("~$5-10k");
    expect(prompt).toMatch(/never invent|must match the verified/i);
  });

  it("works (no grounding block) when grounding is omitted", async () => {
    generateObject.mockResolvedValue({ object: { items: [{ scene: "s", onScreenText: "", sound: "" }] } });
    const out = await runBeatPlanner({
      styleBible: getStylePreset("technical-illustration"),
      playbook,
      chapters: [{ index: 0, title: "C1", narration: "A short narration sentence here for one beat." }],
    });
    expect(out.chapters[0].beats.length).toBeGreaterThan(0);
  });
});
