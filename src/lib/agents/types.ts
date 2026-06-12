// src/lib/agents/types.ts
//
// Shared types used by the four agent runners and the orchestrator.
// Agent output schemas live in their respective runner files (strategist.ts,
// writer.ts, etc.) and re-export the type aliases here for downstream use.

import "server-only";

export type AgentId = "strategist" | "writer" | "voice_coach" | "director" | "composer" | "style_picker" | "beat_planner";

export type AgentState = "idle" | "thinking" | "working" | "awaiting_input";

// Wire-format events the orchestrator yields. The dispatch SSE route
// serializes these into Server-Sent Events for the browser to consume.
export type StreamEvent =
  | { type: "job_started";   data: { jobId: string; topicId: string; channelId: string; startedAt: string } }
  | { type: "agent_state";   data: { agent: AgentId; state: AgentState } }
  | { type: "agent_output";  data: { agent: AgentId; output: unknown } }
  | { type: "writer_chunk";  data: { text: string } }
  | { type: "agent_done";    data: { agent: AgentId; durationMs: number } }
  | { type: "job_completed"; data: { videoId: string } }
  | { type: "job_failed";    data: { agent: AgentId; error: string } };
