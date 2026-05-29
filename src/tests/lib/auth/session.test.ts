import { describe, it, expect, beforeEach } from "vitest";
import { signSession, verifySession } from "@/lib/auth/session";

describe("HMAC session", () => {
  beforeEach(() => {
    process.env.COCKPIT_SESSION_SECRET = "test-secret-at-least-32-chars-long-xyz";
  });

  it("signs and verifies a valid cookie value", () => {
    const cookie = signSession();
    const result = verifySession(cookie);
    expect(result.valid).toBe(true);
  });

  it("rejects a tampered cookie", () => {
    const cookie = signSession();
    const tampered = cookie.slice(0, -2) + "xx";
    const result = verifySession(tampered);
    expect(result.valid).toBe(false);
  });

  it("rejects an unsigned bare value", () => {
    expect(verifySession("not-a-real-cookie").valid).toBe(false);
    expect(verifySession("").valid).toBe(false);
  });

  it("rejects a cookie older than 30 days", () => {
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const cookie = signSession(old);
    const result = verifySession(cookie);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/expired/i);
    }
  });

  it("accepts a cookie 29 days old", () => {
    const recent = Date.now() - 29 * 24 * 60 * 60 * 1000;
    const cookie = signSession(recent);
    expect(verifySession(cookie).valid).toBe(true);
  });
});
