import { describe, it, expect, beforeEach } from "vitest";
import { loadEnv, resetEnvCacheForTests } from "@/lib/env";

describe("env loader", () => {
  beforeEach(() => {
    resetEnvCacheForTests();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CRON_SECRET;
  });

  it("throws if SUPABASE_URL is missing", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
    process.env.ANTHROPIC_API_KEY = "fake";
    process.env.CRON_SECRET = "fake";
    expect(() => loadEnv()).toThrow(/SUPABASE_URL/);
  });

  it("returns typed env when all required vars present", () => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sk";
    process.env.ANTHROPIC_API_KEY = "ak";
    process.env.CRON_SECRET = "cs";
    const env = loadEnv();
    expect(env.SUPABASE_URL).toBe("https://x.supabase.co");
  });
});
