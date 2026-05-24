import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import { loadEnv } from "@/lib/env";

type ClaudeModelId =
  | "claude-haiku-4-5"
  | "claude-sonnet-4-5"
  | "claude-opus-4-7";

let anthropicInstance: ReturnType<typeof createAnthropic> | null = null;

function getAnthropic() {
  if (anthropicInstance) return anthropicInstance;
  const env = loadEnv();
  anthropicInstance = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return anthropicInstance;
}

/**
 * Get a Claude model instance for use with AI SDK v6 (generateText, streamText, etc.).
 * Default model: claude-haiku-4-5 (cheap, fast — good for topic scoring and meta-analysis).
 * Bump to sonnet for script generation in Plan #3.
 */
export function getClaudeModel(id: ClaudeModelId = "claude-haiku-4-5") {
  return getAnthropic()(id);
}
