import "server-only";
import { streamText, type ModelMessage } from "ai";
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
  });
}
