import { describe, it, expect, beforeEach } from "vitest";

describe("env loader", () => {
  beforeEach(() => {
    // Reset module cache so each test re-evaluates env
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CRON_SECRET;
  });

  it("throws if SUPABASE_URL is missing", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
    process.env.ANTHROPIC_API_KEY = "fake";
    process.env.CRON_SECRET = "fake";
    process.env.NODE_ENV = "test";
    const mod = await import(`@/lib/env?ts=${Date.now()}`);
    expect(() => mod.loadEnv()).toThrow(/SUPABASE_URL/);
  });

  it("returns typed env when all required vars present", async () => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sk";
    process.env.ANTHROPIC_API_KEY = "ak";
    process.env.CRON_SECRET = "cs";
    const mod = await import(`@/lib/env?ts=${Date.now() + 1}`);
    const env = mod.loadEnv();
    expect(env.SUPABASE_URL).toBe("https://x.supabase.co");
  });
});
