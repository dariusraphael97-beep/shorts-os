import "server-only";
import { gateway } from "ai";
import { loadEnv } from "@/lib/env";

// Runtime-swappable model strings (Vercel AI Gateway "provider/model" form).
export const CLASSIFIER_TOPIC_MODEL = process.env.CLASSIFIER_TOPIC_MODEL ?? "anthropic/claude-haiku-4-5";
export const CLASSIFIER_FORMAT_MODEL = process.env.CLASSIFIER_FORMAT_MODEL ?? "anthropic/claude-haiku-4-5";
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "openai/text-embedding-3-small";

/** Fail loudly when the gateway key is missing (mirrors how crons assert YOUTUBE_API_KEY). */
export function assertGatewayConfigured(): void {
  const env = loadEnv();
  if (!env.AI_GATEWAY_API_KEY) {
    throw new Error("AI_GATEWAY_API_KEY not set — required for the AI Gateway classifier/embeddings");
  }
}

/** Language model handle for generateObject/generateText. */
export function getGatewayModel(modelString: string) {
  return gateway(modelString);
}

/** Text-embedding model handle for embed/embedMany. */
export function getGatewayEmbeddingModel(modelString: string) {
  return gateway.textEmbeddingModel(modelString);
}
