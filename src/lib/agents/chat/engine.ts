import "server-only";
import { streamText, stepCountIs, type ModelMessage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGatewayModel } from "@/lib/ai/models";
import { getSystemPrompt } from "./system-prompts";
import { getToolsForAssistant } from "./tools";

interface BuildChatStreamParams {
  supabase: SupabaseClient;
  assistantId: string;
  messages: ModelMessage[];
}

/**
 * Build a streamText result for the given assistant + message history.
 * Callers (e.g. the API route) are responsible for converting the result
 * to a streaming HTTP response — do NOT call .toUIMessageStreamResponse() here.
 */
export function buildChatStream({ supabase, assistantId, messages }: BuildChatStreamParams) {
  return streamText({
    model: getGatewayModel(process.env.CHAT_MODEL ?? "anthropic/claude-sonnet-4-5"),
    system: getSystemPrompt(assistantId),
    messages,
    tools: getToolsForAssistant(supabase, assistantId),
    // AI SDK v6 defaults to stepCountIs(1) — a single step. Allow the model a few
    // tool-call rounds so it can synthesize a text answer AFTER calling read tools.
    stopWhen: stepCountIs(8),
  });
}
