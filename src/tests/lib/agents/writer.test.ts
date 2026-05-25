import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({
  getClaudeModel: vi.fn(() => ({ __mock: "model" })),
}));

vi.mock("ai", () => ({
  streamText: vi.fn(),
}));

import { streamText } from "ai";
import { runWriter } from "@/lib/agents/writer";

const fakeChannel = {
  id: "ch-uuid",
  slug: "default",
  display_name: "Default",
  persona: {
    niche: "history",
    voice: "dry deadpan",
    pov: "patterns repeat",
    style_guide: "open with a year",
    forbidden: [] as string[],
  },
  default_voice_id: "x",
  default_tts_provider: "cartesia" as const,
  platform: "youtube" as const,
  external_channel_id: null,
  niche_id: null,
  is_active: true,
  max_uploads_per_day: 2,
  created_at: "",
  updated_at: "",
};

const fakeTopic = {
  id: "topic-uuid",
  niche_id: null,
  source: "reddit" as const,
  external_ref: null,
  title: "Vienna refused electricity in 1903",
  summary: "...",
  raw_payload: {},
  hookability_score: 87,
  scored_at: null,
  state: "reviewed" as const,
  created_at: "",
};

function fakeTextStream(chunks: string[]) {
  return {
    textStream: (async function* () {
      for (const c of chunks) yield c;
    })(),
  };
}

describe("runWriter", () => {
  beforeEach(() => {
    vi.mocked(streamText).mockReset();
  });

  it("yields a chunk per text delta, then yields done with assembled output", async () => {
    vi.mocked(streamText).mockReturnValue(
      fakeTextStream([
        "In 1903, the citizens of Vienna voted to refuse electric streetlights, declaring them unnatural and dangerous. ",
        "The decision was so controversial it spilled into newspaper editorials, family arguments, and even a few public protests in the streets. ",
        "Here's why this 120-year-old fight matters today, more than a century later, when we think we are past it. ",
        "It turns out that civic mistrust of any new technology follows a startlingly familiar pattern: confusion, then resistance, then begrudging acceptance over many years. ",
        "And we're living through it again, right now, with the artificial intelligence wave, only this time the resistance comes wrapped in policy white papers. ",
        "Watch closely, because the citizens of 1903 Vienna eventually got their streetlights — and we will get our AI tools too.",
      ]) as any
    );

    const events: any[] = [];
    for await (const ev of runWriter({
      job: { id: "j1" } as any,
      topic: fakeTopic as any,
      channel: fakeChannel as any,
      previousOutputs: {
        strategist: {
          dispatch_directive: "Lean into 1903.",
          format_hints: ["open with a year"],
          selected_channel_id: "ch-uuid",
          rationale: "x x x x x x x x x x x x x x x x x x x x",
        },
      },
    })) {
      events.push(ev);
    }

    const chunkEvents = events.filter((e) => e.type === "chunk");
    const doneEvents = events.filter((e) => e.type === "done");

    expect(chunkEvents).toHaveLength(6);
    expect(doneEvents).toHaveLength(1);
    expect(doneEvents[0].output.script).toContain("1903");
    expect(doneEvents[0].output.word_count).toBeGreaterThan(20);
    expect(doneEvents[0].output.hook_first_3_seconds).toMatch(/^In 1903/);
  });

  it("throws via Zod if final script is too short", async () => {
    vi.mocked(streamText).mockReturnValue(fakeTextStream(["nope"]) as any);

    const gen = runWriter({
      job: { id: "j1" } as any,
      topic: fakeTopic as any,
      channel: fakeChannel as any,
      previousOutputs: {
        strategist: {
          dispatch_directive: "Lean into 1903.",
          format_hints: ["open with a year"],
          selected_channel_id: "ch-uuid",
          rationale: "x x x x x x x x x x x x x x x x x x x x",
        },
      },
    });

    await expect(async () => {
      for await (const _ev of gen) {
        /* drain */
      }
    }).rejects.toThrow();
  });

  it("skips a short numeric lead-in when extracting the hook (regression: '1943.' → next sentence)", async () => {
    // Regression: prod smoke produced "1943. British intelligence discovered…"
    // and the old hook extractor returned "1943." (5 chars), failing Zod's >=10 min.
    vi.mocked(streamText).mockReturnValue(
      fakeTextStream([
        "1943. British intelligence discovered German operatives were hiding morse code inside radio jingles. ",
        "The rhythm of a popular song's drumbeat spelled out U-boat positions. ",
        "Each generation builds a new communication system. ",
        "Each generation assumes if they can't perceive the attack, it isn't happening. ",
        "Each generation eventually discovers their guard dogs have been sitting on command the whole time.",
      ]) as any
    );

    const events: any[] = [];
    for await (const ev of runWriter({
      job: { id: "j1" } as any,
      topic: fakeTopic as any,
      channel: fakeChannel as any,
      previousOutputs: {
        strategist: {
          dispatch_directive: "Lean into 1943.",
          format_hints: ["open with a year"],
          selected_channel_id: "ch-uuid",
          rationale: "x x x x x x x x x x x x x x x x x x x x",
        },
      },
    })) {
      events.push(ev);
    }

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    expect(doneEvent.output.hook_first_3_seconds).toMatch(/British intelligence/);
    expect(doneEvent.output.hook_first_3_seconds.length).toBeGreaterThanOrEqual(10);
  });
});
