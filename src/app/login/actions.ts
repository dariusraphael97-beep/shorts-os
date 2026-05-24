"use server";

import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signSession, COCKPIT_COOKIE_NAME, COCKPIT_COOKIE_MAX_AGE_SECONDS } from "@/lib/auth/session";

export async function loginAction(formData: FormData): Promise<void> {
  const submitted = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  const expected = process.env.COCKPIT_PASSWORD;
  if (!expected) {
    const loginUrl = `/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent("Server misconfigured: COCKPIT_PASSWORD not set")}`;
    redirect(loginUrl);
    return; // unreachable; satisfies control-flow narrowing
  }
  // Constant-time compare to avoid timing attacks
  let mismatch = submitted.length !== expected.length ? 1 : 0;
  const len = Math.min(submitted.length, expected.length);
  for (let i = 0; i < len; i++) {
    mismatch |= expected.charCodeAt(i) ^ submitted.charCodeAt(i);
  }
  if (mismatch !== 0) {
    const loginUrl = `/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent("Incorrect password")}`;
    redirect(loginUrl);
  }

  const cookieStore = await cookies();
  cookieStore.set(COCKPIT_COOKIE_NAME, signSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COCKPIT_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  redirect(next.startsWith("/") ? next : "/");
}
