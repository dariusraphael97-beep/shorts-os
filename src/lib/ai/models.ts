import "server-only";
import { gateway } from "ai";
import { loadEnv } from "@/lib/env";

// Runtime-swappable model strings (Vercel AI Gateway "provider/model" form).
export const CLASSIFIER_TOPIC_MODEL = process.env.CLASSIFIER_TOPIC_MODEL ?? "anthropic/claude-haiku-4-5";
export const CLASSIFIER_FORMAT_MODEL = process.env.CLASSIFIER_FORMAT_MODEL ?? "anthropic/claude-haiku-4-5";
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "openai/text-embedding-3-small";

/**
 * Fail loudly only when the AI Gateway has NO usable credential.
 *
 * The Vercel AI Gateway (`@ai-sdk/gateway`) authenticates via either an explicit
 * `AI_GATEWAY_API_KEY` OR, when running on a Vercel deployment, automatically via
 * the injected OIDC token (`VERCEL_OIDC_TOKEN`) — no explicit key needed in prod.
 * Accept either; only throw when neither exists (e.g. local dev with no key set).
 */
export function assertGatewayConfigured(): void {
  const env = loadEnv();
  if (!env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error(
      "AI Gateway not configured: set AI_GATEWAY_API_KEY, or deploy on Vercel with OIDC enabled (VERCEL_OIDC_TOKEN).",
    );
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
