import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1),
  AI_GATEWAY_API_KEY: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1),

  // External API keys — optional at load time; scrapers fail loudly if missing
  YOUTUBE_API_KEY: z.string().min(1).optional(),
  REDDIT_CLIENT_ID: z.string().min(1).optional(),
  REDDIT_CLIENT_SECRET: z.string().min(1).optional(),
  REDDIT_USER_AGENT: z.string().min(1).optional(),
  TIKAPI_KEY: z.string().min(1).optional(),

  // Cockpit auth (Plan #2)
  COCKPIT_PASSWORD: z.string().min(20),
  COCKPIT_SESSION_SECRET: z.string().min(32),

  // Cockpit browser client (Plan #2) — mirrors SUPABASE_URL / SUPABASE_ANON_KEY for browser bundle
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),

  // Phase 3 — Reddit clip ingest knobs (defaults applied below; never required to set)
  STAGE_1_SCORE_THRESHOLD: z.coerce.number().int().min(0).max(100).default(60),
  REDDIT_INGEST_CADENCE_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),

  // Phase 4 — yt-dlp cookies (base64-encoded Netscape cookies.txt) for IP-block unblock
  YTDLP_COOKIES_B64: z.string().optional(),

  // Plan #5 Sub-phase E — weekly digest email (optional; digest-send skips+logs when unset)
  RESEND_API_KEY: z.string().min(1).optional(),
  DIGEST_RECIPIENT: z.string().email().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = result.data;
  return cached;
}

export function resetEnvCacheForTests() {
  cached = null;
}
