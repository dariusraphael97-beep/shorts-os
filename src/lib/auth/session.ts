import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSecret(): string {
  const secret = process.env.COCKPIT_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("COCKPIT_SESSION_SECRET must be set and at least 32 chars");
  }
  return secret;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

export function signSession(issuedAt: number = Date.now()): string {
  const tsPart = b64url(String(issuedAt));
  const hmac = createHmac("sha256", getSecret()).update(tsPart).digest();
  return `${tsPart}.${b64url(hmac)}`;
}

export type SessionVerifyResult =
  | { valid: true; issuedAt: number }
  | { valid: false; reason: string };

export function verifySession(cookie: string | undefined | null): SessionVerifyResult {
  if (!cookie) return { valid: false, reason: "missing" };
  const parts = cookie.split(".");
  if (parts.length !== 2) return { valid: false, reason: "malformed" };

  const [tsPart, sigPart] = parts;
  let expectedHmac: Buffer;
  let providedHmac: Buffer;
  try {
    expectedHmac = createHmac("sha256", getSecret()).update(tsPart).digest();
    providedHmac = Buffer.from(sigPart, "base64url");
  } catch {
    return { valid: false, reason: "decode error" };
  }
  if (expectedHmac.length !== providedHmac.length) {
    return { valid: false, reason: "signature length mismatch" };
  }
  if (!timingSafeEqual(expectedHmac, providedHmac)) {
    return { valid: false, reason: "bad signature" };
  }

  let issuedAt: number;
  try {
    issuedAt = parseInt(Buffer.from(tsPart, "base64url").toString("utf8"), 10);
  } catch {
    return { valid: false, reason: "bad timestamp encoding" };
  }
  if (!Number.isFinite(issuedAt)) {
    return { valid: false, reason: "bad timestamp" };
  }
  if (Date.now() - issuedAt > MAX_AGE_MS) {
    return { valid: false, reason: "expired" };
  }
  return { valid: true, issuedAt };
}

export const COCKPIT_COOKIE_NAME = "cockpit_session";
export const COCKPIT_COOKIE_MAX_AGE_SECONDS = Math.floor(MAX_AGE_MS / 1000);
