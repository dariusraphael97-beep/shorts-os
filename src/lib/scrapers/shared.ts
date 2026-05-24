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

export function scraperLog(scraper: string, extra: Record<string, unknown> = {}) {
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
