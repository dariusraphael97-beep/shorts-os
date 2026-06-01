import { describe, it, expect, vi, beforeEach } from "vitest";

// loadEnv validates the whole env schema (not available in the test runner), so
// mock it and drive AI_GATEWAY_API_KEY directly. VERCEL_OIDC_TOKEN is read from
// process.env (Vercel injects it on deployments when OIDC is enabled).
const loadEnv = vi.fn();
vi.mock("@/lib/env", () => ({ loadEnv: () => loadEnv() }));

import { assertGatewayConfigured } from "@/lib/ai/models";

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.VERCEL_OIDC_TOKEN;
});

describe("assertGatewayConfigured", () => {
  it("passes when AI_GATEWAY_API_KEY is set", () => {
    loadEnv.mockReturnValue({ AI_GATEWAY_API_KEY: "gw-key" });
    expect(() => assertGatewayConfigured()).not.toThrow();
  });

  it("passes via Vercel OIDC (VERCEL_OIDC_TOKEN) with NO explicit key", () => {
    loadEnv.mockReturnValue({ AI_GATEWAY_API_KEY: undefined });
    process.env.VERCEL_OIDC_TOKEN = "oidc.jwt.token";
    expect(() => assertGatewayConfigured()).not.toThrow();
  });

  it("throws only when neither a key nor OIDC is available", () => {
    loadEnv.mockReturnValue({ AI_GATEWAY_API_KEY: undefined });
    expect(() => assertGatewayConfigured()).toThrow(/AI Gateway not configured/);
  });
});
