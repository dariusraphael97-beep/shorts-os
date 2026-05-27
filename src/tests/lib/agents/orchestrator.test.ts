import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agents/strategist", () => ({ runStrategist: vi.fn() }));
vi.mock("@/lib/agents/writer", () => ({ runWriter: vi.fn() }));
vi.mock("@/lib/agents/voice-coach", () => ({ runVoiceCoach: vi.fn() }));
vi.mock("@/lib/agents/director", () => ({ runDirector: vi.fn() }));

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
