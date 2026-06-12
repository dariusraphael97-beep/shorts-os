import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/ai/gateway", () => ({ getClaudeModel: vi.fn(() => ({ __mock: "model" })) }));
const generateObject = vi.fn();
vi.mock("ai", () => ({ generateObject: (...a: unknown[]) => generateObject(...a), NoObjectGeneratedError: class { static isInstance() { return false; } } }));
import { runBeatPlanner } from "@/lib/agents/longform/beat-planner";
import { getStylePreset } from "@/lib/longform/style-presets";
const playbook = { writer: { exemplarHooks: [] } } as any;

describe("beat-planner visualKind", () => {
  beforeEach(() => generateObject.mockReset());
  it("asks for visualKind+photoQuery and threads them onto beats", async () => {
    generateObject.mockResolvedValue({ object: { items: [
      { scene: "a B58 engine block", onScreenText: "Closed deck", sound: "", visualKind: "photo", photoQuery: "BMW B58 engine bare block" },
    ] } });
    const out = await runBeatPlanner({
      styleBible: getStylePreset("technical-illustration"),
      playbook,
      chapters: [{ index: 0, title: "C1", narration: "One short beat sentence here for the test." }],
    });
    const prompt = generateObject.mock.calls[0][0].prompt as string;
    expect(prompt).toMatch(/visualKind/);
    expect(prompt).toMatch(/photoQuery/);
    const beat0 = out.chapters[0].beats[0];
    expect(beat0.visualKind).toBe("photo");
    expect(beat0.photoQuery).toBe("BMW B58 engine bare block");
  });
});
