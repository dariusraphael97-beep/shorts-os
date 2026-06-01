import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agents/strategist", () => ({ runStrategist: vi.fn() }));
vi.mock("@/lib/agents/writer", () => ({ runWriter: vi.fn() }));
vi.mock("@/lib/agents/voice-coach", () => ({ runVoiceCoach: vi.fn() }));
vi.mock("@/lib/agents/director", () => ({ runDirector: vi.fn() }));
vi.mock("@/lib/agents/composer", () => ({ runComposer: vi.fn() }));
vi.mock("@/lib/agents/format-mix", () => ({
  computeRecentMix: vi.fn(),
  isFormatMixDrift: vi.fn(),
}));
vi.mock("@/lib/supabase/repositories/operator-alerts", () => ({
  createOperatorAlert: vi.fn(),
}));

vi.mock("@/lib/supabase/repositories/channels", () => ({ getDefaultChannel: vi.fn() }));
vi.mock("@/lib/supabase/repositories/topic-queue", () => ({ getTopicById: vi.fn() }));
vi.mock("@/lib/supabase/repositories/jobs", () => ({
  createProduceVideoJob: vi.fn(),
  getActiveProduceVideoJob: vi.fn(),
  updateJobProgress: vi.fn(),
  finishJobSuccess: vi.fn(),
  finishJobFailure: vi.fn(),
}));
vi.mock("@/lib/supabase/repositories/agents", () => ({ updateAgentState: vi.fn() }));
vi.mock("@/lib/supabase/repositories/agent-messages", () => ({ recordAgentMessage: vi.fn() }));
vi.mock("@/lib/supabase/repositories/decisions", () => ({ recordDecision: vi.fn() }));
vi.mock("@/lib/supabase/repositories/your-videos", () => ({ createVideoDraft: vi.fn() }));

import { runStrategist } from "@/lib/agents/strategist";
import { runWriter } from "@/lib/agents/writer";
import { runVoiceCoach } from "@/lib/agents/voice-coach";
import { runDirector } from "@/lib/agents/director";
import { runComposer } from "@/lib/agents/composer";
import { computeRecentMix, isFormatMixDrift } from "@/lib/agents/format-mix";
import { createOperatorAlert } from "@/lib/supabase/repositories/operator-alerts";
import { getDefaultChannel } from "@/lib/supabase/repositories/channels";
import { getTopicById } from "@/lib/supabase/repositories/topic-queue";
import {
  createProduceVideoJob,
  getActiveProduceVideoJob,
  finishJobSuccess,
  finishJobFailure,
} from "@/lib/supabase/repositories/jobs";
import { updateAgentState } from "@/lib/supabase/repositories/agents";
import { recordAgentMessage } from "@/lib/supabase/repositories/agent-messages";
import { recordDecision } from "@/lib/supabase/repositories/decisions";
import { createVideoDraft } from "@/lib/supabase/repositories/your-videos";
import { runPipeline, ConcurrentRunError } from "@/lib/agents/orchestrator";
import { VOICE_POOL_IDS, VISUAL_TREATMENTS } from "@/lib/agents/constants";

const fakeChannel = {
  id: "ch-uuid",
  display_name: "Default",
  persona: { niche: "history" },
  default_voice_id: "x",
  default_tts_provider: "cartesia",
  target_format_mix: { explainer: 0.6, compilation: 0.4 },
} as any;

const fakeTopic = {
  id: "topic-uuid",
  title: "Vienna 1903",
  summary: "...",
  hookability_score: 87,
  source: "reddit",
  state: "reviewed",
} as any;

const fakeJob = { id: "job-uuid" } as any;

const fakeStrategistOut = {
  dispatch_directive: "x".repeat(40),
  format_hints: ["a"],
  selected_channel_id: "ch-uuid",
  selected_format: "explainer" as const,
  analyst_guidance_acknowledged: true,
  rationale: "x".repeat(40),
};

const fakeWriterOut = {
  script: "In 1903…" + "x ".repeat(200),
  hook_first_3_seconds: "In 1903…",
  word_count: 220,
  estimated_duration_seconds: 88,
};

const fakeVoiceCoachOut = {
  voice_id: VOICE_POOL_IDS[0],
  provider: "cartesia" as const,
  speed: 1.0,
  stability: 0.6,
  rationale: "x".repeat(40),
};

const fakeDirectorOut = {
  visual_treatment: VISUAL_TREATMENTS[0],
  music_mood: "tense",
  shot_list: [
    { segment_text: "a", broll_search_query: "x", duration_seconds: 4 },
    { segment_text: "b", broll_search_query: "x", duration_seconds: 4 },
    { segment_text: "c", broll_search_query: "x", duration_seconds: 4 },
    { segment_text: "d", broll_search_query: "x", duration_seconds: 4 },
  ],
  caption_props: {
    variant: "word-by-word" as const,
    accent_color: "#FFD23F",
    accent_word_policy: "first-noun" as const,
    highlighted_words: [],
    animation_speed: 1.0,
    font_scale: 1.0,
  },
  rationale: "x".repeat(40),
};

describe("runPipeline — success path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveProduceVideoJob).mockResolvedValue(null);
    vi.mocked(getTopicById).mockResolvedValue(fakeTopic);
    vi.mocked(getDefaultChannel).mockResolvedValue(fakeChannel);
    vi.mocked(createProduceVideoJob).mockResolvedValue(fakeJob);
    vi.mocked(runStrategist).mockResolvedValue(fakeStrategistOut);
    vi.mocked(runWriter).mockImplementation(async function* () {
      yield { type: "chunk" as const, text: "In 1903 " };
      yield { type: "chunk" as const, text: "Vienna refused. " };
      yield { type: "done" as const, output: fakeWriterOut };
    });
    vi.mocked(runVoiceCoach).mockResolvedValue(fakeVoiceCoachOut);
    vi.mocked(runDirector).mockResolvedValue(fakeDirectorOut);
    vi.mocked(createVideoDraft).mockResolvedValue({ id: "video-uuid" } as any);
    vi.mocked(computeRecentMix).mockResolvedValue({ explainer: 0.6, compilation: 0.4 });
    vi.mocked(isFormatMixDrift).mockReturnValue(false);
    vi.mocked(createOperatorAlert).mockResolvedValue({} as any);
  });

  it("emits events in the correct order", async () => {
    const events: any[] = [];
    for await (const ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      events.push(ev);
    }

    const types = events.map((e) => e.type);
    expect(types[0]).toBe("job_started");
    expect(types[types.length - 1]).toBe("job_completed");

    const stratStartIdx = types.findIndex(
      (_t, i) => events[i].type === "agent_state" && events[i].data.agent === "strategist" && events[i].data.state === "thinking",
    );
    expect(stratStartIdx).toBeGreaterThan(0);
    expect(events[stratStartIdx + 1].data).toMatchObject({ agent: "strategist", state: "working" });
    expect(events.filter((e) => e.type === "agent_output" && e.data.agent === "strategist")).toHaveLength(1);
    expect(events.filter((e) => e.type === "agent_done" && e.data.agent === "strategist")).toHaveLength(1);

    expect(events.filter((e) => e.type === "writer_chunk")).toHaveLength(2);
    expect(events.filter((e) => e.type === "agent_output" && e.data.agent === "writer")).toHaveLength(1);

    expect(events.filter((e) => e.type === "agent_output" && e.data.agent === "voice_coach")).toHaveLength(1);
    expect(events.filter((e) => e.type === "agent_output" && e.data.agent === "director")).toHaveLength(1);
  });

  it("writes agent_messages + decisions for each of 4 agents", async () => {
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }

    expect(recordAgentMessage).toHaveBeenCalledTimes(4);
    expect(recordDecision).toHaveBeenCalledTimes(4);
  });

  it("updates agent state to working then idle for each agent", async () => {
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }

    // 4 agents × {thinking, working, idle} = 12 state updates.
    expect(updateAgentState).toHaveBeenCalledTimes(12);
  });

  it("creates a your_videos draft with the assembled outputs", async () => {
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }

    expect(createVideoDraft).toHaveBeenCalledOnce();
    const args = vi.mocked(createVideoDraft).mock.calls[0][1];
    expect(args.channelId).toBe("ch-uuid");
    expect(args.topicQueueId).toBe("topic-uuid");
    expect(args.title).toBe("Vienna 1903");
    expect(args.script).toBe(fakeWriterOut.script);
    expect(args.voiceProvider).toBe("cartesia");
    expect(args.voiceId).toBe(VOICE_POOL_IDS[0]);
    expect(args.visualTreatment).toBe(VISUAL_TREATMENTS[0]);
    expect(args.durationSeconds).toBe(88);
  });

  it("calls finishJobSuccess after creating draft", async () => {
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }
    expect(finishJobSuccess).toHaveBeenCalledWith(expect.anything(), "job-uuid");
  });

  it("threads sourceNicheClusterId + scriptBrief into the explainer-branch draft", async () => {
    for await (const _ev of runPipeline({
      topicId: "topic-uuid",
      supabase: {} as any,
      sourceNicheClusterId: "cluster-9",
      scriptBrief: { topic: "Vienna", audience: "history buffs" },
    })) { /* drain */ }

    const args = vi.mocked(createVideoDraft).mock.calls[0][1];
    expect(args.sourceNicheClusterId).toBe("cluster-9");
    expect(args.scriptBrief).toEqual({ topic: "Vienna", audience: "history buffs" });
  });

  it("passes null linkage when none supplied (manual Lab dispatch)", async () => {
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) { /* drain */ }
    const args = vi.mocked(createVideoDraft).mock.calls[0][1];
    expect(args.sourceNicheClusterId ?? null).toBeNull();
    expect(args.scriptBrief ?? null).toBeNull();
  });
});

describe("runPipeline — concurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws ConcurrentRunError if an active produce_video job exists", async () => {
    vi.mocked(getActiveProduceVideoJob).mockResolvedValue({ id: "existing-job-1" } as any);

    const gen = runPipeline({ topicId: "topic-uuid", supabase: {} as any });

    await expect(async () => {
      for await (const _ev of gen) {
        /* drain */
      }
    }).rejects.toThrow(ConcurrentRunError);
  });

  it("does NOT call createProduceVideoJob when blocked by concurrency", async () => {
    vi.mocked(getActiveProduceVideoJob).mockResolvedValue({ id: "existing-job-1" } as any);

    const gen = runPipeline({ topicId: "topic-uuid", supabase: {} as any });
    try {
      for await (const _ev of gen) {
        /* drain */
      }
    } catch { /* expected */ }

    expect(createProduceVideoJob).not.toHaveBeenCalled();
  });
});

describe("runPipeline — voice coach fallback", () => {
  const fallbackVoiceCoachOut = {
    voice_id: "sonic-narrator-male-deadpan",
    provider: "cartesia" as const,
    speed: 1.0,
    stability: 0.75,
    rationale: "Fallback: Voice Coach generateObject failed twice; using channel default voice.",
    fallback: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveProduceVideoJob).mockResolvedValue(null);
    vi.mocked(getTopicById).mockResolvedValue(fakeTopic);
    vi.mocked(getDefaultChannel).mockResolvedValue(fakeChannel);
    vi.mocked(createProduceVideoJob).mockResolvedValue(fakeJob);
    vi.mocked(runStrategist).mockResolvedValue(fakeStrategistOut);
    vi.mocked(runWriter).mockImplementation(async function* () {
      yield { type: "done" as const, output: fakeWriterOut };
    });
    vi.mocked(runVoiceCoach).mockResolvedValue(fallbackVoiceCoachOut as any);
    vi.mocked(runDirector).mockResolvedValue(fakeDirectorOut);
    vi.mocked(createVideoDraft).mockResolvedValue({ id: "video-uuid" } as any);
    vi.mocked(computeRecentMix).mockResolvedValue({ explainer: 0.6, compilation: 0.4 });
    vi.mocked(isFormatMixDrift).mockReturnValue(false);
    vi.mocked(createOperatorAlert).mockResolvedValue({} as any);
  });

  it("emits agent_output + agent_done for voice_coach on fallback", async () => {
    const events: any[] = [];
    for await (const ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      events.push(ev);
    }

    const vcOutputs = events.filter((e) => e.type === "agent_output" && e.data.agent === "voice_coach");
    expect(vcOutputs).toHaveLength(1);
    expect(vcOutputs[0].data.output.fallback).toBe(true);
    expect(events.filter((e) => e.type === "agent_done" && e.data.agent === "voice_coach")).toHaveLength(1);
    expect(events[events.length - 1].type).toBe("job_completed");
  });

  it("records the voice_coach decision row with fallback indicator", async () => {
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }

    const vcCall = vi.mocked(recordDecision).mock.calls.find((c) => c[1].agentId === "voice_coach");
    expect(vcCall).toBeDefined();
    const decision = vcCall![1];
    expect((decision.chosen as any).fallback).toBe(true);
    expect(decision.reasoning).toMatch(/fallback/i);
  });

  it("still creates a your_videos draft using the fallback voice", async () => {
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }

    expect(createVideoDraft).toHaveBeenCalledOnce();
    const args = vi.mocked(createVideoDraft).mock.calls[0][1];
    expect(args.voiceId).toBe("sonic-narrator-male-deadpan");
    expect(args.voiceProvider).toBe("cartesia");
  });
});

describe("runPipeline — failure path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveProduceVideoJob).mockResolvedValue(null);
    vi.mocked(getTopicById).mockResolvedValue(fakeTopic);
    vi.mocked(getDefaultChannel).mockResolvedValue(fakeChannel);
    vi.mocked(createProduceVideoJob).mockResolvedValue(fakeJob);
    vi.mocked(runStrategist).mockResolvedValue(fakeStrategistOut);
    vi.mocked(runWriter).mockImplementation(async function* () {
      yield { type: "chunk" as const, text: "In 1903" };
      throw new Error("rate limit");
    });
    vi.mocked(computeRecentMix).mockResolvedValue({ explainer: 0.6, compilation: 0.4 });
    vi.mocked(isFormatMixDrift).mockReturnValue(false);
    vi.mocked(createOperatorAlert).mockResolvedValue({} as any);
  });

  it("emits job_failed with correct agent when Writer throws", async () => {
    const events: any[] = [];
    for await (const ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      events.push(ev);
    }

    const failed = events.find((e) => e.type === "job_failed");
    expect(failed).toBeDefined();
    expect(failed.data.agent).toBe("writer");
    expect(failed.data.error).toMatch(/rate limit/);
  });

  it("calls finishJobFailure with the error message", async () => {
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }
    expect(finishJobFailure).toHaveBeenCalledWith(expect.anything(), "job-uuid", expect.stringMatching(/rate limit/));
  });

  it("does NOT call createVideoDraft on failure", async () => {
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }
    expect(createVideoDraft).not.toHaveBeenCalled();
  });

  it("resets the failing agent to idle", async () => {
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }
    const writerCalls = vi.mocked(updateAgentState).mock.calls.filter((c) => c[1] === "writer");
    const last = writerCalls[writerCalls.length - 1];
    expect(last[2]).toBe("idle");
  });
});

describe("runPipeline — compilation branch", () => {
  const fakeComposerOut = {
    title_template: "TOP 5 STREET FAILS",
    accent_word: "FAILS",
    title_formula_id: "top_5" as const,
    reveal_pattern: "dramatic" as const,
    caption_style: "mixed" as const,
    layout_variant: "top5_sidebar" as const,
    clip_refs: [1, 2, 3, 4, 5].map((n) => ({
      clip_id: `c-${n}`,
      start_sec: 0,
      end_sec: 6,
      label: `clip ${n}`,
      order: n,
    })),
    music_track_id: "m1",
    rationale: "strong dramatic arc, music supports pacing",
  };

  const compilationStrategistOut = {
    ...fakeStrategistOut,
    selected_format: "compilation" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveProduceVideoJob).mockResolvedValue(null);
    vi.mocked(getTopicById).mockResolvedValue(fakeTopic);
    vi.mocked(getDefaultChannel).mockResolvedValue(fakeChannel);
    vi.mocked(createProduceVideoJob).mockResolvedValue(fakeJob);
    vi.mocked(runStrategist).mockResolvedValue(compilationStrategistOut);
    vi.mocked(runComposer).mockResolvedValue({
      output: fakeComposerOut,
      draftId: "draft-uuid-1",
      fallbackUsed: false,
    } as any);
    vi.mocked(computeRecentMix).mockResolvedValue({ explainer: 0.6, compilation: 0.4 });
    vi.mocked(isFormatMixDrift).mockReturnValue(false);
    vi.mocked(createOperatorAlert).mockResolvedValue({} as any);
  });

  it("routes to Composer and skips Writer / Voice Coach / Director", async () => {
    const events: any[] = [];
    for await (const ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      events.push(ev);
    }
    expect(runComposer).toHaveBeenCalledOnce();
    expect(runWriter).not.toHaveBeenCalled();
    expect(runVoiceCoach).not.toHaveBeenCalled();
    expect(runDirector).not.toHaveBeenCalled();
    expect(createVideoDraft).not.toHaveBeenCalled();

    expect(events.filter((e) => e.type === "agent_output" && e.data.agent === "composer")).toHaveLength(1);
    const completed = events.find((e) => e.type === "job_completed");
    expect(completed).toBeDefined();
    expect(completed.data.videoId).toBe("draft-uuid-1");
  });

  it("records compilation_brief agent_message + compilation_assembly decision", async () => {
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }
    const msgCall = vi.mocked(recordAgentMessage).mock.calls.find(
      (c) => c[1].intent === "compilation_brief",
    );
    expect(msgCall).toBeDefined();
    expect(msgCall![1].fromAgent).toBe("strategist");
    expect(msgCall![1].toAgent).toBe("composer");

    const decisionCall = vi.mocked(recordDecision).mock.calls.find(
      (c) => c[1].agentId === "composer",
    );
    expect(decisionCall).toBeDefined();
    expect(decisionCall![1].decisionType).toBe("compilation_assembly");
    expect((decisionCall![1].chosen as any).fallback).toBe(false);
    expect((decisionCall![1].chosen as any).draft_id).toBe("draft-uuid-1");
  });

  it("annotates the decision when Composer used the heuristic fallback", async () => {
    vi.mocked(runComposer).mockResolvedValue({
      output: fakeComposerOut,
      draftId: "draft-uuid-2",
      fallbackUsed: true,
    } as any);
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }
    const decisionCall = vi.mocked(recordDecision).mock.calls.find(
      (c) => c[1].agentId === "composer",
    );
    expect((decisionCall![1].chosen as any).fallback).toBe(true);
    expect(decisionCall![1].reasoning).toMatch(/fallback/i);
  });

  it("calls finishJobSuccess and emits agent_done for composer", async () => {
    const events: any[] = [];
    for await (const ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      events.push(ev);
    }
    expect(finishJobSuccess).toHaveBeenCalledWith(expect.anything(), "job-uuid");
    expect(events.filter((e) => e.type === "agent_done" && e.data.agent === "composer")).toHaveLength(1);
  });
});

describe("runPipeline — format-mix drift alert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveProduceVideoJob).mockResolvedValue(null);
    vi.mocked(getTopicById).mockResolvedValue(fakeTopic);
    vi.mocked(getDefaultChannel).mockResolvedValue(fakeChannel);
    vi.mocked(createProduceVideoJob).mockResolvedValue(fakeJob);
    vi.mocked(runStrategist).mockResolvedValue(fakeStrategistOut);
    vi.mocked(runWriter).mockImplementation(async function* () {
      yield { type: "done" as const, output: fakeWriterOut };
    });
    vi.mocked(runVoiceCoach).mockResolvedValue(fakeVoiceCoachOut);
    vi.mocked(runDirector).mockResolvedValue(fakeDirectorOut);
    vi.mocked(createVideoDraft).mockResolvedValue({ id: "video-uuid" } as any);
    vi.mocked(createOperatorAlert).mockResolvedValue({} as any);
  });

  it("writes a format_mix_drift operator_alert when isFormatMixDrift returns true", async () => {
    vi.mocked(computeRecentMix).mockResolvedValue({ explainer: 0.3, compilation: 0.7 });
    vi.mocked(isFormatMixDrift).mockReturnValue(true);
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }
    expect(createOperatorAlert).toHaveBeenCalledOnce();
    const args = vi.mocked(createOperatorAlert).mock.calls[0][1];
    expect(args.category).toBe("format_mix_drift");
    expect(args.severity).toBe("warn");
    expect(args.channelId).toBe("ch-uuid");
  });

  it("does NOT write an alert when no drift", async () => {
    vi.mocked(computeRecentMix).mockResolvedValue({ explainer: 0.6, compilation: 0.4 });
    vi.mocked(isFormatMixDrift).mockReturnValue(false);
    for await (const _ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      /* drain */
    }
    expect(createOperatorAlert).not.toHaveBeenCalled();
  });

  it("does NOT block dispatch if the drift check itself throws", async () => {
    vi.mocked(computeRecentMix).mockRejectedValue(new Error("supabase exploded"));
    const events: any[] = [];
    for await (const ev of runPipeline({ topicId: "topic-uuid", supabase: {} as any })) {
      events.push(ev);
    }
    // Pipeline still completes; the error swallowed.
    expect(events[events.length - 1].type).toBe("job_completed");
  });
});
