export type RetryOptions = {
  attempts: number;
  baseDelayMs?: number;
};

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const { attempts, baseDelayMs = 500 } = opts;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}

export function scraperLog<T extends Record<string, unknown>>(
  scraper: string,
  extra: T = {} as T,
): { scraper: string; at: string } & T {
  return {
    scraper,
    at: new Date().toISOString(),
    ...extra,
  };
}

export function assertCronAuth(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (auth !== expected) {
    throw new Response("Unauthorized", { status: 401 });
  }
}

/**
 * Serialize an unknown thrown value into a useful string.
 *
 * Plain objects (e.g. Supabase PostgrestError) coerce via String() to
 * "[object Object]", which is useless for debugging in production logs.
 * This helper extracts a message + code + details when present and falls
 * back to JSON.stringify so the response body is always actionable.
 */
export function serializeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const obj = e as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    if (typeof obj.message === "string") {
      const parts = [obj.message];
      if (obj.code) parts.push(`code=${String(obj.code)}`);
      if (obj.details) parts.push(`details=${String(obj.details)}`);
      if (obj.hint) parts.push(`hint=${String(obj.hint)}`);
      return parts.join(" | ");
    }
    try {
      return JSON.stringify(e);
    } catch {
      return Object.prototype.toString.call(e);
    }
  }
  return String(e);
}
