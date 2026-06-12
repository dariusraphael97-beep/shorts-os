import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/ai/gateway", () => ({ getClaudeModel: vi.fn(() => ({ __mock: "model" })) }));
vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateObject: vi.fn() };
});
import { generateObject, NoObjectGeneratedError } from "ai";
import { runBeatPlanner } from "@/lib/agents/longform/beat-planner";
import { getStylePreset } from "@/lib/longform/style-presets";
import { EMPTY_LONGFORM_PLAYBOOK } from "@/lib/agents/longform/playbook";

function makeNoObjectErr(): NoObjectGeneratedError {
  return new NoObjectGeneratedError({
    message: "No object generated: response did not match schema.",
    response: { id: "r", timestamp: new Date(), modelId: "m" },
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokenDetails: { textTokens: 1, reasoningTokens: 0 },
    },
    finishReason: "stop",
  });
}

beforeEach(() => vi.mocked(generateObject).mockReset());

const ctx = () => ({
  styleBible: getStylePreset("cinematic-realistic"),
  playbook: EMPTY_LONGFORM_PLAYBOOK,
  chapters: [{ index: 0, title: "Reveal", narration: "A man walks on. The lights dim. Behind him, a glass ring. But it is under the sea." }],
});

describe("longform/beat-planner", () => {
  it("returns one beat per slice with an assembled, style-prefixed image prompt + SFX cues", async () => {
    // model returns exactly as many items (scene + sound) as there are beats
    vi.mocked(generateObject).mockImplementation(async (...allArgs: unknown[]) => {
      const opts = allArgs[0] as { prompt?: string };
      const n = Number(opts?.prompt?.match(/EXACTLY (\d+) items/)?.[1] ?? 1);
      return { object: { items: Array.from({ length: n }, (_, i) => ({ scene: `cinematic scene ${i}`, onScreenText: `hook ${i}`, sound: i % 2 === 0 ? "a hawk screech" : "" })) } } as never;
    });
    const out = await runBeatPlanner(ctx());
    expect(out.chapters).toHaveLength(1);
    const beats = out.chapters[0].beats;
    expect(beats.length).toBeGreaterThanOrEqual(1);
    beats.forEach((b, i) => {
      expect(b.index).toBe(i);
      expect(b.imagePrompt.startsWith(getStylePreset("cinematic-realistic").positivePrefix)).toBe(true);
      expect(b.negativePrompt).toBe(getStylePreset("cinematic-realistic").negativePrompt);
    });
    // even-index beats carry an SFX cue; empty sounds become undefined (no soundEffect key)
    expect(beats[0].soundEffect).toBe("a hawk screech");
    expect(beats[1]?.soundEffect).toBeUndefined();
    // the per-beat retention hook is threaded onto the beat and into its image prompt
    expect(beats[0].onScreenText).toBe("hook 0");
    expect(beats[0].imagePrompt).toContain('reading exactly "hook 0"');
  });

  it("falls back to the narration slice as the scene when the model fails", async () => {
    vi.mocked(generateObject).mockRejectedValueOnce(makeNoObjectErr()).mockRejectedValueOnce(makeNoObjectErr());
    const out = await runBeatPlanner(ctx());
    const beats = out.chapters[0].beats;
    expect(beats.length).toBeGreaterThanOrEqual(1);
    expect(beats[0].sceneDescription.length).toBeGreaterThan(0);
    // fallback has no retention hook, so the image prompt suppresses on-screen text
    expect(beats[0].onScreenText).toBe("");
    expect(beats[0].imagePrompt).toContain("no on-screen text");
  });

  it("repairs a scene-count mismatch by padding/truncating to the beat count", async () => {
    vi.mocked(generateObject).mockResolvedValue({ object: { items: [{ scene: "only one scene", onScreenText: "the hook", sound: "" }] } } as never);
    const out = await runBeatPlanner(ctx());
    const beats = out.chapters[0].beats;
    expect(beats.every((b) => b.sceneDescription.length > 0)).toBe(true);
  });

  it("prompts for simple literal doodle scenes (not documentary framing) for the stick-figure preset", async () => {
    let captured = "";
    vi.mocked(generateObject).mockImplementation(async (...allArgs: unknown[]) => {
      const opts = allArgs[0] as { prompt?: string };
      captured = opts?.prompt ?? "";
      const n = Number(captured.match(/EXACTLY (\d+) items/)?.[1] ?? 1);
      return { object: { items: Array.from({ length: n }, (_, i) => ({ scene: `a stick figure scene ${i}`, onScreenText: `hook ${i}`, sound: "" })) } } as never;
    });
    await runBeatPlanner({
      styleBible: getStylePreset("stick-figure-animated"),
      playbook: EMPTY_LONGFORM_PLAYBOOK,
      chapters: [{ index: 0, title: "Why we wake at 3am", narration: "You wake up at 3am. Your brain starts racing. It feels endless." }],
    });
    const p = captured.toLowerCase();
    expect(p).toMatch(/sound|sfx/); // also asks for per-beat sound design
    expect(p).toMatch(/doodle|stick.?figure/);
    expect(p).toMatch(/vary|varied|different|fresh/); // visual variety — not the same picture every time
    expect(p).toMatch(/diagram|chart|metaphor|close-?up|object/); // varied visual approaches, not just "person in a room"
    expect(p).toContain("on-screen text"); // Zenn-style words to aid comprehension
    // the prompt asks for a retention-hook onScreenText that is never an encyclopedic label
    expect(p).toContain("onscreentext");
    expect(p).toMatch(/latin names|figure numbers|encyclopedic/i);
    expect(p).toContain("collage"); // must still forbid collages
    expect(p).not.toContain("documentary");
    expect(p).toMatch(/background|setting/);
    expect(p).toContain("do not include"); // drawing-STYLE words are added automatically, not by this model
  });

  it("keeps documentary framing for the cinematic preset", async () => {
    let captured = "";
    vi.mocked(generateObject).mockImplementation(async (...allArgs: unknown[]) => {
      const opts = allArgs[0] as { prompt?: string };
      captured = opts?.prompt ?? "";
      const n = Number(captured.match(/EXACTLY (\d+) items/)?.[1] ?? 1);
      return { object: { items: Array.from({ length: n }, (_, i) => ({ scene: `cinematic scene ${i}`, onScreenText: `hook ${i}`, sound: "" })) } } as never;
    });
    await runBeatPlanner(ctx());
    expect(captured.toLowerCase()).toContain("documentary");
  });

  it("uses sparse caption guidance for additive (technical) styles", async () => {
    let captured = "";
    vi.mocked(generateObject).mockImplementation(async (...allArgs: unknown[]) => {
      const opts = allArgs[0] as { prompt?: string };
      captured = opts?.prompt ?? "";
      const n = Number(captured.match(/EXACTLY (\d+) items/)?.[1] ?? 1);
      return { object: { items: Array.from({ length: n }, (_, i) => ({ scene: `tech scene ${i}`, onScreenText: "", sound: "" })) } } as never;
    });
    await runBeatPlanner({
      styleBible: getStylePreset("technical-illustration"),
      playbook: EMPTY_LONGFORM_PLAYBOOK,
      chapters: [{ index: 0, title: "The block", narration: "The block is aluminum. The bores are sleeved. It does not flex under boost." }],
    });
    const p = captured.toLowerCase();
    expect(p).toContain("keep it clean");
    expect(p).toMatch(/only on the few beats/);
    expect(p).not.toContain("most beats should have text");
  });

  it("uses frequent caption guidance for exclusive (default) styles", async () => {
    let captured = "";
    vi.mocked(generateObject).mockImplementation(async (...allArgs: unknown[]) => {
      const opts = allArgs[0] as { prompt?: string };
      captured = opts?.prompt ?? "";
      const n = Number(captured.match(/EXACTLY (\d+) items/)?.[1] ?? 1);
      return { object: { items: Array.from({ length: n }, (_, i) => ({ scene: `scene ${i}`, onScreenText: `hook ${i}`, sound: "" })) } } as never;
    });
    await runBeatPlanner(ctx()); // cinematic-realistic = exclusive default
    const p = captured.toLowerCase();
    expect(p).toContain("most beats should have text");
  });

  it("sparse mode: prompt demands RARE all-caps captions, evidence labels, varied backgrounds, red callouts, rare SFX", async () => {
    let captured = "";
    vi.mocked(generateObject).mockImplementation(async (...allArgs: unknown[]) => {
      const opts = allArgs[0] as { prompt?: string };
      captured = opts?.prompt ?? "";
      const n = Number(captured.match(/EXACTLY (\d+) items/)?.[1] ?? 1);
      return { object: { items: Array.from({ length: n }, () => ({ scene: "a doodle", onScreenText: "", sound: "", label: "", background: "white" })) } } as never;
    });
    await runBeatPlanner({
      styleBible: getStylePreset("stick-figure-animated"), // v3 = sparse
      playbook: EMPTY_LONGFORM_PLAYBOOK,
      chapters: [{ index: 0, title: "The invention of breakfast", narration: "You eat three meals a day. Nobody asked why. The schedule is younger than the lightbulb." }],
    });
    const p = captured.toLowerCase();
    expect(p).toMatch(/rare/);                       // captions are rare
    expect(p).toMatch(/all-caps|all caps/);
    expect(p).toMatch(/at most 4 words|≤ ?4 words|4 words/);
    expect(p).toMatch(/"label"/);                    // asks for the evidence label field
    expect(p).toMatch(/lowercase/);
    expect(p).toMatch(/"background"/);               // asks for the per-beat background
    expect(p).toMatch(/vary the background|never use white for everything/);
    expect(p).toMatch(/red marker circle|red hand-drawn arrow/); // 2-4 red callouts on evidence beats
    expect(p).toMatch(/rarely|a handful/);           // SFX sparse + diegetic
    expect(p).not.toContain("most beats should have text");
  });

  it("threads label + background onto beats and into the assembled image prompt", async () => {
    vi.mocked(generateObject).mockImplementation(async (...allArgs: unknown[]) => {
      const opts = allArgs[0] as { prompt?: string };
      const n = Number(opts?.prompt?.match(/EXACTLY (\d+) items/)?.[1] ?? 1);
      return { object: { items: Array.from({ length: n }, (_, i) => ({ scene: `doodle ${i}`, onScreenText: "", sound: "", label: i === 0 ? "cookbook, 1500s." : "", background: i === 0 ? "deep navy" : "" })) } } as never;
    });
    const out = await runBeatPlanner({
      styleBible: getStylePreset("stick-figure-animated"),
      playbook: EMPTY_LONGFORM_PLAYBOOK,
      chapters: [{ index: 0, title: "Evidence", narration: "A cookbook from the fifteen hundreds lists two meals. Dinner sat in the late morning. The word breakfast appears in texts from the fourteen hundreds. Workers ate before dawn and again at midday." }],
    });
    const beats = out.chapters[0].beats;
    expect(beats[0].objectLabel).toBe("cookbook, 1500s.");
    expect(beats[0].backgroundMood).toBe("deep navy");
    expect(beats[0].imagePrompt).toContain('label reading exactly "cookbook, 1500s."');
    expect(beats[0].imagePrompt).toContain("flat solid deep navy background");
    expect(beats[1]?.objectLabel).toBeUndefined();   // empty strings do not become beat fields
    expect(beats[1]?.backgroundMood).toBeUndefined();
  });

  it("non-sparse presets keep the old prompt shape (no label/background/red-callout demands)", async () => {
    let captured = "";
    vi.mocked(generateObject).mockImplementation(async (...allArgs: unknown[]) => {
      const opts = allArgs[0] as { prompt?: string };
      captured = opts?.prompt ?? "";
      const n = Number(captured.match(/EXACTLY (\d+) items/)?.[1] ?? 1);
      return { object: { items: Array.from({ length: n }, (_, i) => ({ scene: `s ${i}`, onScreenText: "", sound: "" })) } } as never;
    });
    await runBeatPlanner(ctx()); // cinematic-realistic
    expect(captured.toLowerCase()).not.toMatch(/red marker circle/);
    expect(captured.toLowerCase()).not.toMatch(/"label"/);
  });
});
