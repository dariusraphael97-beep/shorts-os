# Shorts OS — Phase 0 + Phase 1 Implementation Plan (Foundation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working Next.js + Supabase + Vercel project with the full Memory Layer schema in place and 4 Intel Layer scrapers running on Vercel Cron, populating the database with trending and topic-candidate data. No UI yet.

**Architecture:** A Next.js 16 App Router project deployed to Vercel. Supabase Postgres holds 11 tables (Memory Layer). Four Vercel Cron jobs run the Intel Layer scrapers (YouTube Shorts trending every 6h, Reddit + Wikipedia daily, TikAPI every 6h). A topic-scorer using Claude via Vercel AI Gateway ranks candidates as they come in. A `/health` endpoint reports scraper status.

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Supabase (Postgres + Realtime), Vercel (deployment + Cron), AI SDK v6 + Vercel AI Gateway (Claude), Vitest (tests), Zod (runtime validation).

**Operator:** Darius (16, working on MacBook Air, no production infra experience). Each step is sized so Claude can execute it in 2–5 minutes.

---

## Spec Reference

This plan implements **Sections 2 (Architecture — Intel + Memory Layers only), 3 (Modules — Intel Layer only + Memory tables), 4 (Source Strategy), 5 (Tech Stack), 7 (Rollout — Phase 0 + Phase 1)** of the design spec at `docs/superpowers/specs/2026-05-24-shorts-os-design.md`.

Studio Layer (UI), agents, generation pipeline, and PC render agent are explicitly **out of scope** for this plan — they come in Plans #2–#4.

---

## File Structure (created or modified by this plan)

```
shorts-os/
├── .env.local                          # local-only secrets (gitignored)
├── .env.example                        # template (committed)
├── .gitignore
├── README.md
├── package.json
├── tsconfig.json
├── next.config.ts
├── vercel.ts                           # vercel.ts is the 2026 config standard
├── vitest.config.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx                  # minimal root layout
│   │   ├── page.tsx                    # "Hello from Shorts OS" placeholder
│   │   └── api/
│   │       ├── health/route.ts         # GET /api/health → scraper status
│   │       └── cron/
│   │           ├── youtube-trending/route.ts
│   │           ├── reddit-harvest/route.ts
│   │           ├── tiktok-trending/route.ts
│   │           ├── wikipedia-harvest/route.ts
│   │           └── performance-sync/route.ts
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── server.ts               # service-role client (server-only)
│   │   │   ├── types.ts                # generated types
│   │   │   └── repositories/           # typed db access per table
│   │   │       ├── niches.ts
│   │   │       ├── viral-observations.ts
│   │   │       ├── topic-queue.ts
│   │   │       ├── jobs.ts
│   │   │       ├── decisions.ts
│   │   │       └── agent-messages.ts
│   │   ├── clients/
│   │   │   ├── youtube.ts              # YouTube Data API wrapper
│   │   │   ├── reddit.ts               # Reddit API wrapper
│   │   │   ├── tikapi.ts               # TikAPI wrapper
│   │   │   └── wikipedia.ts            # Wikipedia API wrapper
│   │   ├── ai/
│   │   │   ├── gateway.ts              # Vercel AI Gateway config
│   │   │   └── topic-scorer.ts         # Claude-powered topic scoring
│   │   ├── scrapers/
│   │   │   ├── shared.ts               # logging, retry, error helpers
│   │   │   ├── youtube-trending.ts
│   │   │   ├── reddit-harvest.ts
│   │   │   ├── tiktok-trending.ts
│   │   │   └── wikipedia-harvest.ts
│   │   └── env.ts                      # Zod-validated env access
│   └── tests/
│       ├── fixtures/                   # JSON API response samples
│       │   ├── youtube-trending.json
│       │   ├── reddit-listing.json
│       │   ├── tikapi-trending.json
│       │   └── wikipedia-search.json
│       ├── lib/clients/
│       │   ├── youtube.test.ts
│       │   ├── reddit.test.ts
│       │   ├── tikapi.test.ts
│       │   └── wikipedia.test.ts
│       ├── lib/scrapers/
│       │   ├── youtube-trending.test.ts
│       │   ├── reddit-harvest.test.ts
│       │   ├── tiktok-trending.test.ts
│       │   └── wikipedia-harvest.test.ts
│       └── lib/ai/topic-scorer.test.ts
└── supabase/
    └── migrations/
        ├── 20260524000001_create_niches.sql
        ├── 20260524000002_create_viral_observations.sql
        ├── 20260524000003_create_patterns.sql
        ├── 20260524000004_create_topic_queue.sql
        ├── 20260524000005_create_channels.sql
        ├── 20260524000006_create_your_videos.sql
        ├── 20260524000007_create_pattern_performance.sql
        ├── 20260524000008_create_agents.sql
        ├── 20260524000009_create_agent_messages.sql
        ├── 20260524000010_create_decisions.sql
        ├── 20260524000011_create_jobs.sql
        ├── 20260524000012_enable_realtime.sql
        └── 20260524000013_seed_agents.sql
```

**File-responsibility notes:**
- `src/lib/clients/*` are thin typed wrappers over external APIs — no business logic. Easy to mock in tests.
- `src/lib/scrapers/*` orchestrate: call clients, transform results, write to repositories. This is where logic lives.
- `src/lib/supabase/repositories/*` own all DB access for one table. No raw SQL outside repositories.
- `src/app/api/cron/*/route.ts` are thin: parse cron auth header, call the right scraper, return 200/500. Almost no code.

---

## Testing Philosophy

- **TDD for logic:** scrapers (transformations, scoring, dedup), the topic-scorer, validation
- **Integration tests for clients (env-gated):** real API calls behind `INTEGRATION=1` env var, skipped by default
- **Manual smoke-test for cron endpoints:** they're thin glue; full integration test is a deployed cron run
- **No tests for boilerplate:** `next.config.ts`, page placeholder, env loading — just write + run

---

## Conventions

- TypeScript strict mode. No `any`. Use `unknown` + Zod parse at boundaries.
- ESM imports throughout. Node.js 24 LTS.
- Every Vercel Cron route validates the `Authorization` header against `process.env.CRON_SECRET` (Vercel sets this automatically when a Cron Job hits the endpoint).
- Every DB mutation goes through a repository function. Never inline SQL in scrapers or routes.
- Commits use Conventional Commits: `feat:` / `fix:` / `chore:` / `test:` / `docs:` / `refactor:`.
- Every task ends with a commit. No "I'll commit later" — frequent commits are the principle.

---

# PHASE 0: Project Setup (Days 1–3)

## Task 0.1: Initialize Next.js 16 project and git repo

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `src/app/layout.tsx`, `src/app/page.tsx`, `README.md`

- [ ] **Step 1: Scaffold Next.js**

Run from `~/Downloads/shorts-os/`:
```bash
npx create-next-app@latest . --typescript --app --no-tailwind --no-eslint --no-src-dir --import-alias "@/*"
```
When prompted "Continue with existing files," choose Yes. When asked about `src/` directory, choose No (we'll create it manually for clarity).

If the command refuses to install over the existing dir (because of the `docs/` and `.git/` you already have), instead run with `--use-npm` and answer Yes to "OK to proceed."

- [ ] **Step 2: Move app to `src/` and verify**

```bash
mkdir -p src
mv app src/app
```

Edit `next.config.ts` (or create if missing):
```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

Replace `src/app/page.tsx` with:
```tsx
export default function Home() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>Shorts OS</h1>
      <p>Foundation deployed. UI ships in Plan #2.</p>
    </main>
  );
}
```

- [ ] **Step 3: Verify dev server runs**

Run:
```bash
npm run dev
```
Expected: terminal shows `Local: http://localhost:3000`. Open it; page shows "Shorts OS — Foundation deployed."
Then `Ctrl+C` to stop.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 16 app"
```

---

## Task 0.2: Add Vitest and basic test infrastructure

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (add scripts and devDeps)
- Create: `src/tests/smoke.test.ts`

- [ ] **Step 1: Install vitest + types**

```bash
npm install --save-dev vitest @vitest/coverage-v8 @types/node
```

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: ["src/tests/fixtures/**", "**/*.config.ts"],
    },
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
```

- [ ] **Step 3: Add scripts to `package.json`**

In the `"scripts"` block add:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 4: Write smoke test**

Create `src/tests/smoke.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

describe("test infrastructure", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Verify test runs**

```bash
npm test
```
Expected: `1 test passed`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add vitest test infrastructure"
```

---

## Task 0.3: Add Zod-validated env loader

**Files:**
- Create: `src/lib/env.ts`, `src/tests/lib/env.test.ts`
- Create: `.env.example`

- [ ] **Step 1: Install Zod**

```bash
npm install zod
```

- [ ] **Step 2: Write failing test for env loader**

Create `src/tests/lib/env.test.ts`:
```typescript
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
```

- [ ] **Step 3: Run test, expect FAIL**

```bash
npm test -- src/tests/lib/env.test.ts
```
Expected: FAIL with "Cannot find module @/lib/env".

- [ ] **Step 4: Implement env loader**

Create `src/lib/env.ts`:
```typescript
import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
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
```

- [ ] **Step 5: Run test, expect PASS**

```bash
npm test -- src/tests/lib/env.test.ts
```
Expected: 2 tests passing.

- [ ] **Step 6: Create `.env.example`**

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=

# Anthropic / Vercel AI Gateway
ANTHROPIC_API_KEY=
AI_GATEWAY_API_KEY=

# Vercel Cron auth
CRON_SECRET=

# External APIs (filled in as we wire each scraper)
YOUTUBE_API_KEY=
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=shorts-os/0.1 by /u/your-reddit-username
TIKAPI_KEY=
```

Add to `.gitignore`:
```
.env.local
.env.*.local
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(env): add Zod-validated env loader"
```

---

## Task 0.4: Create Supabase project and connect

**Files:**
- Modify: `.env.local` (not committed)

- [ ] **Step 1: Create Supabase project (manual, in browser)**

1. Go to https://supabase.com/dashboard
2. Click "New project"
3. Name: `shorts-os`, region: closest to operator (likely `us-east-1`), generate a strong DB password and save it in a password manager
4. Wait ~2 min for provisioning

- [ ] **Step 2: Copy credentials to `.env.local`**

In the Supabase dashboard → Project Settings → API:
- Copy "Project URL" → `SUPABASE_URL`
- Copy "anon public" key → `SUPABASE_ANON_KEY`
- Copy "service_role" key → `SUPABASE_SERVICE_ROLE_KEY` (this is sensitive; never expose to browser)

Create `.env.local`:
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=PLACEHOLDER_FILL_TASK_0_6
CRON_SECRET=$(openssl rand -hex 32)
```

For `CRON_SECRET`, generate with: `openssl rand -hex 32` and paste the result.

- [ ] **Step 3: Install Supabase JS client**

```bash
npm install @supabase/supabase-js
```

- [ ] **Step 4: Verify connection works**

Create a throwaway test file `src/tests/smoke-supabase.test.ts` (we'll delete after):
```typescript
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "@/lib/env";

describe("supabase connection", () => {
  it("can authenticate with service role", async () => {
    const env = loadEnv();
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase.from("_nonexistent_table").select("*").limit(1);
    // Expect a "relation does not exist" error, NOT an auth error
    expect(error?.message).toMatch(/relation.*does not exist|not found/i);
  });
});
```

Run:
```bash
npm test -- src/tests/smoke-supabase.test.ts
```
Expected: test passes (we hit the API and got a "relation does not exist" error, which means auth worked).

- [ ] **Step 5: Delete the smoke test and commit**

```bash
rm src/tests/smoke-supabase.test.ts
git add -A
git commit -m "chore: install supabase-js client"
```

---

## Task 0.5: Add Supabase server-side client

**Files:**
- Create: `src/lib/supabase/server.ts`
- Create: `src/tests/lib/supabase/server.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/tests/lib/supabase/server.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { getServiceClient } from "@/lib/supabase/server";

describe("server supabase client", () => {
  it("returns a client with auth from env", () => {
    const client = getServiceClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe("function");
  });

  it("returns the same instance on repeated calls (singleton)", () => {
    const a = getServiceClient();
    const b = getServiceClient();
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- src/tests/lib/supabase/server.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement server client**

Create `src/lib/supabase/server.ts`:
```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "@/lib/env";

let client: SupabaseClient | null = null;

/**
 * Returns the service-role Supabase client. SERVER-ONLY.
 * Never import this from a Client Component or expose to the browser —
 * the service role key bypasses RLS.
 */
export function getServiceClient(): SupabaseClient {
  if (client) return client;
  const env = loadEnv();
  client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/supabase/server.test.ts
```
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(supabase): add server-side service-role client"
```

---

## Task 0.6: Wire Anthropic + Vercel AI Gateway

**Files:**
- Create: `src/lib/ai/gateway.ts`
- Create: `src/tests/lib/ai/gateway.test.ts`

- [ ] **Step 1: Install AI SDK v6 + Anthropic provider**

```bash
npm install ai @ai-sdk/anthropic
```

- [ ] **Step 2: Get Anthropic key (manual)**

1. Go to https://console.anthropic.com/
2. Create an API key, copy it
3. Paste into `.env.local` as `ANTHROPIC_API_KEY=sk-ant-...`

(Vercel AI Gateway is optional in v0.1 — we can use direct Anthropic provider for now. The Gateway becomes more useful when we add multiple providers later. For Plan #1, use direct Anthropic.)

- [ ] **Step 3: Write failing test**

Create `src/tests/lib/ai/gateway.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { getClaudeModel } from "@/lib/ai/gateway";

describe("AI gateway", () => {
  it("returns a Claude model instance", () => {
    const model = getClaudeModel("claude-haiku-4-5");
    expect(model).toBeDefined();
    expect(typeof model.modelId).toBe("string");
  });
});
```

- [ ] **Step 4: Run, expect FAIL**

```bash
npm test -- src/tests/lib/ai/gateway.test.ts
```

- [ ] **Step 5: Implement gateway**

Create `src/lib/ai/gateway.ts`:
```typescript
import { createAnthropic } from "@ai-sdk/anthropic";
import { loadEnv } from "@/lib/env";

type ClaudeModelId =
  | "claude-haiku-4-5"
  | "claude-sonnet-4-5"
  | "claude-opus-4-7";

let anthropicInstance: ReturnType<typeof createAnthropic> | null = null;

function getAnthropic() {
  if (anthropicInstance) return anthropicInstance;
  const env = loadEnv();
  anthropicInstance = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return anthropicInstance;
}

/**
 * Get a Claude model instance for use with AI SDK v6 (generateText, streamText, etc.).
 * Default model: claude-haiku-4-5 (cheap, fast — good for topic scoring and meta-analysis).
 * Bump to sonnet for script generation in Plan #3.
 */
export function getClaudeModel(id: ClaudeModelId = "claude-haiku-4-5") {
  return getAnthropic()(id);
}
```

- [ ] **Step 6: Run, expect PASS**

```bash
npm test -- src/tests/lib/ai/gateway.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ai): wire AI SDK v6 with Anthropic provider"
```

---

## Task 0.7: Add `/api/health` endpoint

**Files:**
- Create: `src/app/api/health/route.ts`

- [ ] **Step 1: Implement health route**

Create `src/app/api/health/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = getServiceClient();

  // Check Supabase is reachable
  let dbStatus: "ok" | "error" = "ok";
  let dbError: string | undefined;
  try {
    const { error } = await supabase.from("niches").select("id").limit(1);
    if (error && !error.message.match(/relation.*does not exist/i)) {
      dbStatus = "error";
      dbError = error.message;
    }
  } catch (e) {
    dbStatus = "error";
    dbError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    status: dbStatus === "ok" ? "healthy" : "degraded",
    db: { status: dbStatus, error: dbError },
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  });
}
```

- [ ] **Step 2: Verify locally**

```bash
npm run dev
```
In a new terminal:
```bash
curl http://localhost:3000/api/health
```
Expected: JSON `{ status: "healthy", db: { status: "ok" }, ... }`. The `niches` table doesn't exist yet but we suppress that specific error.

Stop the dev server with `Ctrl+C`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(api): add /api/health endpoint"
```

---

## Task 0.8: Create Vercel project and deploy "Hello World"

**Files:**
- Create: `vercel.ts`

- [ ] **Step 1: Install Vercel CLI globally**

```bash
npm i -g vercel@latest
vercel --version
```
Expected: version >= 54.x.

- [ ] **Step 2: Install @vercel/config**

```bash
npm install --save-dev @vercel/config
```

- [ ] **Step 3: Create `vercel.ts` config**

```typescript
import { type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "npm run build",
  // Cron jobs registered here; routes implemented in src/app/api/cron/*
  crons: [
    { path: "/api/cron/youtube-trending", schedule: "0 */6 * * *" },
    { path: "/api/cron/tiktok-trending", schedule: "30 */6 * * *" },
    { path: "/api/cron/reddit-harvest", schedule: "0 8 * * *" },
    { path: "/api/cron/wikipedia-harvest", schedule: "30 8 * * *" },
    { path: "/api/cron/performance-sync", schedule: "0 9 * * *" },
  ],
};

export default config;
```

- [ ] **Step 4: Link the project**

```bash
vercel link
```
Follow prompts:
- Set up and deploy? **N** (we'll link only, deploy in step 5)
- Which scope? Choose your personal account
- Link to existing project? **N**
- Project name? `shorts-os`
- Directory? `./` (default)
- Modify settings? **N**

- [ ] **Step 5: Push env vars to Vercel**

```bash
vercel env add SUPABASE_URL production
# paste value, select all envs you want
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add SUPABASE_ANON_KEY production
vercel env add ANTHROPIC_API_KEY production
vercel env add CRON_SECRET production
```
Repeat each for `preview` and `development` if you want preview deploys to work.

Faster alternative — `vercel env pull .env.local` after setting in the dashboard.

- [ ] **Step 6: Deploy**

```bash
vercel --prod
```
Expected: deploy succeeds, you get a URL like `https://shorts-os.vercel.app`.

- [ ] **Step 7: Smoke-test deployment**

```bash
curl https://shorts-os.vercel.app/api/health
```
Expected: same JSON as local test.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore(vercel): add vercel.ts config with cron schedules"
```

---

# PHASE 1: Memory Layer Schema (Migrations)

The next 11 tasks each create one Supabase migration file and one tiny test that asserts the table exists with the right columns. We use Supabase's SQL editor + a single migration runner pattern.

**Setup before Phase 1 tasks:**

- [ ] **Install Supabase CLI**

```bash
npm install --save-dev supabase
npx supabase --version
```

- [ ] **Init Supabase locally (creates `supabase/` dir if missing)**

```bash
npx supabase init
```
Answer "no" to generating VS Code workspace if asked.

- [ ] **Link CLI to your remote project**

```bash
npx supabase link --project-ref <your-project-ref>
```
(Find the project ref in your Supabase dashboard URL: `https://supabase.com/dashboard/project/<ref>`.)

When asked for DB password, paste the one you saved when creating the project.

- [ ] **Commit the supabase scaffolding**

```bash
git add supabase/ package.json package-lock.json
git commit -m "chore(supabase): init local CLI scaffolding linked to remote project"
```

---

## Task 1.1: Migration — `niches` table

**Files:**
- Create: `supabase/migrations/20260524000001_create_niches.sql`
- Create: `src/tests/lib/supabase/schema-niches.test.ts`

- [ ] **Step 1: Write migration**

Create `supabase/migrations/20260524000001_create_niches.sql`:
```sql
create extension if not exists "uuid-ossp";

create table public.niches (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  display_name text not null,
  description text,
  is_active boolean not null default true,
  subreddits text[] not null default '{}',
  youtube_search_terms text[] not null default '{}',
  tiktok_hashtags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index niches_active_idx on public.niches (is_active);

comment on table public.niches is 'Operating niches with their source feed configurations.';
```

- [ ] **Step 2: Push migration to remote**

```bash
npx supabase db push
```
Expected: migration applied; CLI confirms `20260524000001_create_niches.sql` ran.

- [ ] **Step 3: Write schema test**

Create `src/tests/lib/supabase/schema-niches.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { getServiceClient } from "@/lib/supabase/server";

describe("niches table", () => {
  it("can insert and read a niche", async () => {
    const supabase = getServiceClient();
    const slug = `test-niche-${Date.now()}`;

    const { data: inserted, error: insertErr } = await supabase
      .from("niches")
      .insert({ slug, display_name: "Test Niche" })
      .select()
      .single();
    expect(insertErr).toBeNull();
    expect(inserted?.slug).toBe(slug);

    // Cleanup
    await supabase.from("niches").delete().eq("id", inserted!.id);
  });
});
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npm test -- src/tests/lib/supabase/schema-niches.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): create niches table"
```

---

## Task 1.2: Migration — `viral_observations` table

**Files:**
- Create: `supabase/migrations/20260524000002_create_viral_observations.sql`
- Create: `src/tests/lib/supabase/schema-viral-observations.test.ts`

- [ ] **Step 1: Write migration**

```sql
create table public.viral_observations (
  id uuid primary key default uuid_generate_v4(),
  niche_id uuid references public.niches(id) on delete set null,
  source text not null check (source in ('youtube', 'tiktok', 'reddit', 'instagram')),
  external_id text not null,
  url text not null,
  title text,
  channel_name text,
  channel_id text,
  views bigint,
  likes bigint,
  comments bigint,
  duration_seconds int,
  observed_at timestamptz not null default now(),
  views_at_observation bigint,
  hook_text text,
  hook_seconds_estimate numeric,
  raw_payload jsonb not null,
  unique (source, external_id, observed_at)
);

create index viral_obs_niche_observed_idx on public.viral_observations (niche_id, observed_at desc);
create index viral_obs_source_idx on public.viral_observations (source);

comment on table public.viral_observations is 'Every viral short the Trending Radar has scraped, with snapshots over time.';
```

- [ ] **Step 2: Push**

```bash
npx supabase db push
```

- [ ] **Step 3: Schema test**

Create `src/tests/lib/supabase/schema-viral-observations.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { getServiceClient } from "@/lib/supabase/server";

describe("viral_observations table", () => {
  it("can insert with required fields", async () => {
    const supabase = getServiceClient();
    const externalId = `test-${Date.now()}`;
    const { data, error } = await supabase
      .from("viral_observations")
      .insert({
        source: "youtube",
        external_id: externalId,
        url: "https://youtube.com/shorts/test",
        raw_payload: { test: true },
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.external_id).toBe(externalId);
    await supabase.from("viral_observations").delete().eq("id", data!.id);
  });

  it("rejects invalid source", async () => {
    const supabase = getServiceClient();
    const { error } = await supabase
      .from("viral_observations")
      .insert({
        source: "facebook",
        external_id: "x",
        url: "https://x",
        raw_payload: {},
      });
    expect(error?.message).toMatch(/check constraint|violates/i);
  });
});
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/supabase/schema-viral-observations.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): create viral_observations table"
```

---

## Task 1.3: Migration — `patterns` table

**Files:**
- Create: `supabase/migrations/20260524000003_create_patterns.sql`
- Create: `src/tests/lib/supabase/schema-patterns.test.ts`

- [ ] **Step 1: Write migration**

```sql
create table public.patterns (
  id uuid primary key default uuid_generate_v4(),
  niche_id uuid references public.niches(id) on delete cascade,
  kind text not null check (kind in ('hook', 'length', 'b_roll_cadence', 'caption_style', 'audio_type', 'title_format')),
  value jsonb not null,
  example_observation_ids uuid[] not null default '{}',
  win_count int not null default 0,
  total_count int not null default 0,
  win_rate_pct numeric generated always as (case when total_count > 0 then (win_count::numeric / total_count) * 100 else 0 end) stored,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (niche_id, kind, value)
);

create index patterns_niche_kind_idx on public.patterns (niche_id, kind);
create index patterns_winrate_idx on public.patterns (win_rate_pct desc);

comment on table public.patterns is 'Aggregated winning patterns per niche, updated by the Pattern Loop.';
```

- [ ] **Step 2: Push**

```bash
npx supabase db push
```

- [ ] **Step 3: Schema test**

Create `src/tests/lib/supabase/schema-patterns.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { getServiceClient } from "@/lib/supabase/server";

describe("patterns table", () => {
  it("computes win_rate_pct as a generated column", async () => {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("patterns")
      .insert({ kind: "hook", value: { type: "question" }, win_count: 7, total_count: 10 })
      .select()
      .single();
    expect(error).toBeNull();
    expect(Number(data!.win_rate_pct)).toBeCloseTo(70, 1);
    await supabase.from("patterns").delete().eq("id", data!.id);
  });
});
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/supabase/schema-patterns.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): create patterns table with computed win_rate_pct"
```

---

## Task 1.4: Migration — `topic_queue` table

**Files:**
- Create: `supabase/migrations/20260524000004_create_topic_queue.sql`
- Create: `src/tests/lib/supabase/schema-topic-queue.test.ts`

- [ ] **Step 1: Write migration**

```sql
create table public.topic_queue (
  id uuid primary key default uuid_generate_v4(),
  niche_id uuid references public.niches(id) on delete cascade,
  source text not null check (source in ('reddit', 'wikipedia', 'news', 'manual')),
  external_ref text,
  title text not null,
  summary text,
  raw_payload jsonb not null,
  hookability_score numeric,
  scored_at timestamptz,
  state text not null default 'queued' check (state in ('queued', 'reviewed', 'used', 'rejected')),
  used_for_video_id uuid,
  rejected_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index topic_queue_niche_state_idx on public.topic_queue (niche_id, state, hookability_score desc nulls last);

comment on table public.topic_queue is 'Candidate topics surfaced by Source Harvester, scored by Claude, consumed by Strategist.';
```

- [ ] **Step 2: Push**

```bash
npx supabase db push
```

- [ ] **Step 3: Schema test**

Create `src/tests/lib/supabase/schema-topic-queue.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { getServiceClient } from "@/lib/supabase/server";

describe("topic_queue table", () => {
  it("defaults state to queued", async () => {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("topic_queue")
      .insert({
        source: "reddit",
        title: "A wild test topic",
        raw_payload: { test: true },
      })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data?.state).toBe("queued");
    await supabase.from("topic_queue").delete().eq("id", data!.id);
  });
});
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/supabase/schema-topic-queue.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): create topic_queue table"
```

---

## Task 1.5: Migration — `channels` table

**Files:**
- Create: `supabase/migrations/20260524000005_create_channels.sql`

- [ ] **Step 1: Write migration**

```sql
create table public.channels (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  display_name text not null,
  platform text not null check (platform in ('youtube', 'tiktok', 'instagram')),
  external_channel_id text,
  niche_id uuid references public.niches(id),
  persona jsonb not null default '{}'::jsonb,
  default_voice_id text,
  default_tts_provider text default 'cartesia' check (default_tts_provider in ('cartesia', 'elevenlabs')),
  oauth_refresh_token_encrypted text,
  is_active boolean not null default true,
  max_uploads_per_day int not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index channels_active_platform_idx on public.channels (is_active, platform);

comment on table public.channels is 'Channels the operator publishes to. OAuth tokens encrypted at rest.';
```

- [ ] **Step 2: Push**

```bash
npx supabase db push
```

- [ ] **Step 3: Commit (no test — table is simple and is exercised by later tasks)**

```bash
git add -A
git commit -m "feat(db): create channels table"
```

---

## Task 1.6: Migration — `your_videos` table

**Files:**
- Create: `supabase/migrations/20260524000006_create_your_videos.sql`

- [ ] **Step 1: Write migration**

```sql
create table public.your_videos (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  topic_queue_id uuid references public.topic_queue(id) on delete set null,
  external_video_id text,
  url text,
  title text not null,
  description text,
  script text not null,
  voice_provider text,
  voice_id text,
  duration_seconds numeric,
  visual_treatment text,
  posted_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'rendering', 'rendered', 'posted', 'failed')),
  render_artifact_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index your_videos_channel_posted_idx on public.your_videos (channel_id, posted_at desc);
create index your_videos_status_idx on public.your_videos (status);

create table public.your_videos_analytics_snapshots (
  id uuid primary key default uuid_generate_v4(),
  video_id uuid not null references public.your_videos(id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  views bigint,
  likes bigint,
  comments bigint,
  avg_view_duration_seconds numeric,
  ctr_pct numeric,
  subscribers_gained int,
  unique (video_id, snapshot_at)
);

create index yv_analytics_video_idx on public.your_videos_analytics_snapshots (video_id, snapshot_at desc);
```

- [ ] **Step 2: Push and commit**

```bash
npx supabase db push
git add -A
git commit -m "feat(db): create your_videos + analytics_snapshots tables"
```

---

## Task 1.7: Migration — `pattern_performance` table

**Files:**
- Create: `supabase/migrations/20260524000007_create_pattern_performance.sql`

- [ ] **Step 1: Write migration**

```sql
create table public.pattern_performance (
  id uuid primary key default uuid_generate_v4(),
  pattern_id uuid not null references public.patterns(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  videos_using_pattern int not null default 0,
  avg_retention_pct numeric,
  avg_views bigint,
  avg_ctr_pct numeric,
  computed_at timestamptz not null default now(),
  unique (pattern_id, channel_id)
);
```

- [ ] **Step 2: Push and commit**

```bash
npx supabase db push
git add -A
git commit -m "feat(db): create pattern_performance table"
```

---

## Task 1.8: Migration — `agents` table (no seeding yet)

**Files:**
- Create: `supabase/migrations/20260524000008_create_agents.sql`

- [ ] **Step 1: Write migration**

```sql
create table public.agents (
  id text primary key,  -- 'strategist', 'scout', 'archivist', 'writer', 'director', 'voice_coach', 'analyst'
  display_name text not null,
  emoji text,
  description text not null,
  prompt_template text not null,
  prompt_version int not null default 1,
  model_id text not null default 'claude-haiku-4-5',
  is_active boolean not null default true,
  total_decisions int not null default 0,
  total_wins int not null default 0,
  current_state text not null default 'idle' check (current_state in ('idle', 'thinking', 'working', 'awaiting_input')),
  current_task text,
  updated_at timestamptz not null default now()
);

create table public.agent_prompt_versions (
  id uuid primary key default uuid_generate_v4(),
  agent_id text not null references public.agents(id) on delete cascade,
  version int not null,
  prompt_template text not null,
  changelog text,
  created_at timestamptz not null default now(),
  unique (agent_id, version)
);
```

- [ ] **Step 2: Push and commit**

```bash
npx supabase db push
git add -A
git commit -m "feat(db): create agents + agent_prompt_versions tables"
```

---

## Task 1.9: Migration — `agent_messages` table

**Files:**
- Create: `supabase/migrations/20260524000009_create_agent_messages.sql`

- [ ] **Step 1: Write migration**

```sql
create table public.agent_messages (
  id uuid primary key default uuid_generate_v4(),
  from_agent text references public.agents(id),
  to_agent text references public.agents(id),
  job_id uuid,
  intent text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index agent_msg_job_idx on public.agent_messages (job_id, created_at);
create index agent_msg_recent_idx on public.agent_messages (created_at desc);
```

- [ ] **Step 2: Push and commit**

```bash
npx supabase db push
git add -A
git commit -m "feat(db): create agent_messages table"
```

---

## Task 1.10: Migration — `decisions` table

**Files:**
- Create: `supabase/migrations/20260524000010_create_decisions.sql`

- [ ] **Step 1: Write migration**

```sql
create table public.decisions (
  id uuid primary key default uuid_generate_v4(),
  agent_id text references public.agents(id),
  job_id uuid,
  decision_type text not null,
  inputs jsonb not null,
  alternatives jsonb not null default '[]'::jsonb,
  chosen jsonb not null,
  scores jsonb,
  reasoning text,
  outcome jsonb,
  outcome_recorded_at timestamptz,
  created_at timestamptz not null default now()
);

create index decisions_agent_recent_idx on public.decisions (agent_id, created_at desc);
create index decisions_job_idx on public.decisions (job_id);
```

- [ ] **Step 2: Push and commit**

```bash
npx supabase db push
git add -A
git commit -m "feat(db): create decisions table"
```

---

## Task 1.11: Migration — `jobs` table

**Files:**
- Create: `supabase/migrations/20260524000011_create_jobs.sql`

- [ ] **Step 1: Write migration**

```sql
create table public.jobs (
  id uuid primary key default uuid_generate_v4(),
  kind text not null check (kind in ('scrape', 'score_topics', 'produce_video', 'analyze_performance')),
  channel_id uuid references public.channels(id),
  topic_queue_id uuid references public.topic_queue(id),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  current_step text,
  current_agent text references public.agents(id),
  progress_pct int default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index jobs_status_idx on public.jobs (status, created_at desc);
create index jobs_kind_idx on public.jobs (kind);
```

- [ ] **Step 2: Push and commit**

```bash
npx supabase db push
git add -A
git commit -m "feat(db): create jobs table"
```

---

## Task 1.12: Enable Supabase Realtime on live tables

**Files:**
- Create: `supabase/migrations/20260524000012_enable_realtime.sql`

- [ ] **Step 1: Write migration**

```sql
-- Enable Realtime publication for tables the cockpit will subscribe to
alter publication supabase_realtime add table public.agent_messages;
alter publication supabase_realtime add table public.decisions;
alter publication supabase_realtime add table public.jobs;
alter publication supabase_realtime add table public.viral_observations;
alter publication supabase_realtime add table public.topic_queue;
alter publication supabase_realtime add table public.agents;
```

- [ ] **Step 2: Push and commit**

```bash
npx supabase db push
git add -A
git commit -m "feat(db): enable Realtime on live tables"
```

---

## Task 1.13: Seed `agents` table with v1 prompt templates

**Files:**
- Create: `supabase/migrations/20260524000013_seed_agents.sql`

- [ ] **Step 1: Write seed migration**

```sql
insert into public.agents (id, display_name, emoji, description, prompt_template) values
('strategist', 'The Strategist', '🧭',
 'Conductor. Plans daily work, dispatches tasks, enforces format variation and upload-cadence caps.',
 $$You are The Strategist, the coordinator of a 7-agent system that produces faceless YouTube Shorts.

Your responsibilities:
1. Receive operator goals (e.g., "produce 3 videos today for channel X")
2. Query specialists: Scout (trend health), Archivist (topic candidates), Analyst (recent performance)
3. Pick topics that satisfy: niche fit, hook-ability score, AND format variation across recent uploads
4. Dispatch each chosen topic through Writer -> Director -> Voice Coach
5. Enforce hard cap: maximum 2 uploads per channel per day
6. Enforce format variation: do not let consecutive uploads share intro structure, caption style, OR pacing

Hard rule from YouTube July 2026 policy: channels shipping templated outputs get demonetized. Variation is survival, not preference.

When responding, output structured JSON describing your plan and dispatches.$$),

('scout', 'The Scout', '🔭',
 'Trend intelligence. Watches niches for growth/decay and emerging viral patterns.',
 $$You are The Scout. You analyze Trending Radar data to identify:
- Which niches are growing vs plateauing (using views/24h aggregates)
- Which hook patterns are emerging this week vs last week
- Which competitor channels are gaining velocity

Output structured findings the Strategist can act on. Be specific with numbers.$$),

('archivist', 'The Archivist', '📚',
 'Source content discovery. Catalogs hook-able topics from Reddit, Wikipedia, news.',
 $$You are The Archivist. For each candidate topic from Source Harvester, score:
- hookability (0-100): how strong is the curiosity gap?
- novelty (0-100): how fresh vs already-covered?
- visual_richness (0-100): can b-roll plausibly illustrate this?

Reject topics with hookability < 60 unless novelty > 85.$$),

('writer', 'The Writer', '✍️',
 'Hook-first script writing with persona/POV.',
 $$You are The Writer. Produce a 45-60 second faceless YouTube Short script with:
- A hook in the first 3 seconds (question, surprising claim, or specific number/year)
- Transformative commentary (your POV/persona), NOT Wikipedia-style summary
- Concrete scenes the Director can match to b-roll (1 visual change per 3-5 seconds)
- A satisfying close that earns the view-through

You will be given a persona parameter for the channel. Stay in that voice.$$),

('director', 'The Director', '🎬',
 'B-roll, music, and visual composition. Rotates visual treatments for format variation.',
 $$You are The Director. For each script:
1. Pick ONE visual treatment from the rotation (the Strategist tells you which is up next)
2. Match each script segment to 1-3 b-roll clips, preferring Storyblocks over Pexels for evergreen topics
3. When no stock clip fits, request Flux-generated stills (local) or Kling-generated short clips (budget-capped)
4. Pick music that fits energy, never overpowers voiceover (-18 to -22 LUFS bed)

Output a structured shot list.$$),

('voice_coach', 'The Voice Coach', '🎙️',
 'Voice selection and TTS settings (Cartesia primary, ElevenLabs fallback).',
 $$You are The Voice Coach. Pick the voice provider, voice ID, speed, and stability for this script based on:
- Channel persona (set in channel config)
- Script tone (urgency, sincerity, humor)
- Cost: prefer Cartesia Sonic-3 unless quality fallback is needed

Output the TTS request parameters.$$),

('analyst', 'The Analyst', '📊',
 'Performance analysis and personalization. Surfaces what is working per channel.',
 $$You are The Analyst. Daily, ingest Performance Sync data and report:
- Which patterns correlate with high retention this week
- Which voice / length / hook combos outperform baseline
- Whether the channel is hitting format-variation diversity targets
- Recommended adjustments for the Writer and Director

Output a structured weekly summary plus per-video deltas.$$);

-- Mirror initial prompts into version history
insert into public.agent_prompt_versions (agent_id, version, prompt_template, changelog)
select id, prompt_version, prompt_template, 'Initial v1 prompt' from public.agents;
```

- [ ] **Step 2: Push**

```bash
npx supabase db push
```

- [ ] **Step 3: Verify seed worked**

In a one-off script or Supabase SQL editor, run:
```sql
select id, display_name, current_state, length(prompt_template) as prompt_chars from agents;
```
Expected: 7 rows, all `current_state = 'idle'`, prompt_template > 200 chars each.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(db): seed 7 agents with v1 prompt templates"
```

---

# PHASE 1: Intel Layer Scrapers

## Task 2.1: Shared scraper utilities

**Files:**
- Create: `src/lib/scrapers/shared.ts`
- Create: `src/tests/lib/scrapers/shared.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { withRetry, scraperLog } from "@/lib/scrapers/shared";

describe("withRetry", () => {
  it("returns the value on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { attempts: 3 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure up to attempts", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue("eventually");
    const result = await withRetry(fn, { attempts: 3, baseDelayMs: 1 });
    expect(result).toBe("eventually");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("nope"));
    await expect(withRetry(fn, { attempts: 2, baseDelayMs: 1 })).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("scraperLog", () => {
  it("returns structured log object", () => {
    const log = scraperLog("youtube-trending", { items: 5 });
    expect(log.scraper).toBe("youtube-trending");
    expect(log.items).toBe(5);
    expect(log.at).toBeDefined();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- src/tests/lib/scrapers/shared.test.ts
```

- [ ] **Step 3: Implement**

Create `src/lib/scrapers/shared.ts`:
```typescript
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
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/scrapers/shared.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(scrapers): add shared retry + auth + logging utilities"
```

---

## Task 2.2: YouTube Data API client

**Files:**
- Create: `src/lib/clients/youtube.ts`
- Create: `src/tests/lib/clients/youtube.test.ts`
- Create: `src/tests/fixtures/youtube-trending.json`

- [ ] **Step 1: Get YouTube API key (manual)**

1. https://console.cloud.google.com/
2. Create a project (or pick existing)
3. APIs & Services → Enable APIs → search "YouTube Data API v3" → Enable
4. APIs & Services → Credentials → Create Credentials → API key
5. Copy key, add to `.env.local` as `YOUTUBE_API_KEY=AIza...`
6. Add same to Vercel: `vercel env add YOUTUBE_API_KEY`

- [ ] **Step 2: Create fixture**

Create `src/tests/fixtures/youtube-trending.json` with a minimal sample (use a real YouTube API response shape):
```json
{
  "items": [
    {
      "id": "abc123",
      "snippet": {
        "title": "Wild fact about volcanoes",
        "channelId": "UCxxx",
        "channelTitle": "FactBlast",
        "publishedAt": "2026-05-23T12:00:00Z"
      },
      "statistics": {
        "viewCount": "1820000",
        "likeCount": "98000",
        "commentCount": "1200"
      },
      "contentDetails": {
        "duration": "PT47S"
      }
    }
  ],
  "nextPageToken": null
}
```

- [ ] **Step 3: Write failing test**

Create `src/tests/lib/clients/youtube.test.ts`:
```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import fixture from "@/tests/fixtures/youtube-trending.json" with { type: "json" };
import { searchShortsByQuery, parseISODurationToSeconds } from "@/lib/clients/youtube";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseISODurationToSeconds", () => {
  it("parses PT47S as 47", () => {
    expect(parseISODurationToSeconds("PT47S")).toBe(47);
  });
  it("parses PT1M5S as 65", () => {
    expect(parseISODurationToSeconds("PT1M5S")).toBe(65);
  });
  it("parses PT0S as 0", () => {
    expect(parseISODurationToSeconds("PT0S")).toBe(0);
  });
});

describe("searchShortsByQuery", () => {
  it("transforms YouTube API response into normalized shape", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(fixture), { status: 200 }) as Response
    );

    const results = await searchShortsByQuery({
      query: "weird history",
      apiKey: "test-key",
      maxResults: 10,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      externalId: "abc123",
      title: "Wild fact about volcanoes",
      channelId: "UCxxx",
      channelName: "FactBlast",
      views: 1820000,
      likes: 98000,
      comments: 1200,
      durationSeconds: 47,
    });
  });
});
```

- [ ] **Step 4: Run, expect FAIL**

```bash
npm test -- src/tests/lib/clients/youtube.test.ts
```

- [ ] **Step 5: Implement client**

Create `src/lib/clients/youtube.ts`:
```typescript
export type YouTubeShortResult = {
  externalId: string;
  title: string;
  channelId: string;
  channelName: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  durationSeconds: number;
  url: string;
  rawPayload: unknown;
};

export function parseISODurationToSeconds(iso: string): number {
  // PT#H#M#S
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  const h = parseInt(match[1] ?? "0", 10);
  const m = parseInt(match[2] ?? "0", 10);
  const s = parseInt(match[3] ?? "0", 10);
  return h * 3600 + m * 60 + s;
}

export type SearchShortsParams = {
  query: string;
  apiKey: string;
  maxResults?: number;
};

/**
 * Search YouTube Shorts by query, returning normalized results.
 * Two API calls: search.list (for IDs) + videos.list (for stats + duration).
 */
export async function searchShortsByQuery(
  params: SearchShortsParams
): Promise<YouTubeShortResult[]> {
  const { query, apiKey, maxResults = 25 } = params;

  // Step 1: search for video IDs
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("videoDuration", "short");
  searchUrl.searchParams.set("maxResults", String(maxResults));
  searchUrl.searchParams.set("key", apiKey);

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    throw new Error(`YouTube search failed: ${searchRes.status} ${await searchRes.text()}`);
  }
  const searchJson = (await searchRes.json()) as {
    items: Array<{ id: { videoId: string } }>;
  };
  const ids = searchJson.items?.map((i) => i.id.videoId).filter(Boolean) ?? [];
  if (ids.length === 0) return [];

  // Step 2: fetch stats + duration
  const videosUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  videosUrl.searchParams.set("part", "snippet,statistics,contentDetails");
  videosUrl.searchParams.set("id", ids.join(","));
  videosUrl.searchParams.set("key", apiKey);

  const videosRes = await fetch(videosUrl.toString());
  if (!videosRes.ok) {
    throw new Error(`YouTube videos failed: ${videosRes.status}`);
  }
  const videosJson = (await videosRes.json()) as {
    items: Array<{
      id: string;
      snippet: { title: string; channelId: string; channelTitle: string; publishedAt: string };
      statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
      contentDetails: { duration: string };
    }>;
  };

  return videosJson.items.map((item) => ({
    externalId: item.id,
    title: item.snippet.title,
    channelId: item.snippet.channelId,
    channelName: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    views: parseInt(item.statistics.viewCount ?? "0", 10),
    likes: parseInt(item.statistics.likeCount ?? "0", 10),
    comments: parseInt(item.statistics.commentCount ?? "0", 10),
    durationSeconds: parseISODurationToSeconds(item.contentDetails.duration),
    url: `https://www.youtube.com/shorts/${item.id}`,
    rawPayload: item,
  }));
}
```

**Note:** The test mocks `fetch` and provides a pre-merged fixture. The two-call implementation in real code uses two fetches; the test mocks both with the same fixture. To keep the test simple, the fixture's items already match the `videos.list` response shape. The test only verifies the transformation logic; integration is verified in the smoke test.

Adjust the test to mock `fetch` twice if needed:
```typescript
const fetchMock = vi.spyOn(global, "fetch")
  .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: { videoId: "abc123" } }] }), { status: 200 }) as Response)
  .mockResolvedValueOnce(new Response(JSON.stringify(fixture), { status: 200 }) as Response);
```

- [ ] **Step 6: Re-run test, expect PASS**

```bash
npm test -- src/tests/lib/clients/youtube.test.ts
```
If failing because the test only mocks one fetch call, update the test to mock both as shown above.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(clients): add YouTube Data API client with duration parsing"
```

---

## Task 2.3: YouTube Shorts Trending scraper + cron route

**Files:**
- Create: `src/lib/scrapers/youtube-trending.ts`
- Create: `src/tests/lib/scrapers/youtube-trending.test.ts`
- Create: `src/app/api/cron/youtube-trending/route.ts`

- [ ] **Step 1: Write failing test for scraper logic**

Create `src/tests/lib/scrapers/youtube-trending.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { runYouTubeTrendingScrape } from "@/lib/scrapers/youtube-trending";

const mockClient = {
  searchShortsByQuery: vi.fn(),
};

const mockRepo = {
  getActiveNiches: vi.fn(),
  recordViralObservations: vi.fn(),
};

describe("runYouTubeTrendingScrape", () => {
  it("scrapes each active niche's search terms and writes observations", async () => {
    mockRepo.getActiveNiches.mockResolvedValue([
      { id: "n1", slug: "wikipedia-til", youtube_search_terms: ["weird history", "wild fact"] },
    ]);
    mockClient.searchShortsByQuery
      .mockResolvedValueOnce([{ externalId: "v1", views: 1000, title: "x", url: "u", rawPayload: {} }])
      .mockResolvedValueOnce([{ externalId: "v2", views: 2000, title: "y", url: "u", rawPayload: {} }]);
    mockRepo.recordViralObservations.mockResolvedValue({ inserted: 2 });

    const result = await runYouTubeTrendingScrape({
      client: mockClient as any,
      repo: mockRepo as any,
      apiKey: "test",
    });

    expect(mockClient.searchShortsByQuery).toHaveBeenCalledTimes(2);
    expect(mockRepo.recordViralObservations).toHaveBeenCalledOnce();
    expect(result.totalObserved).toBe(2);
    expect(result.nichesProcessed).toBe(1);
  });

  it("returns gracefully when no niches active", async () => {
    mockRepo.getActiveNiches.mockResolvedValue([]);
    const result = await runYouTubeTrendingScrape({
      client: mockClient as any,
      repo: mockRepo as any,
      apiKey: "test",
    });
    expect(result.totalObserved).toBe(0);
    expect(result.nichesProcessed).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- src/tests/lib/scrapers/youtube-trending.test.ts
```

- [ ] **Step 3: Implement scraper**

Create `src/lib/scrapers/youtube-trending.ts`:
```typescript
import type { YouTubeShortResult } from "@/lib/clients/youtube";

export type YouTubeTrendingDeps = {
  client: {
    searchShortsByQuery: (params: {
      query: string;
      apiKey: string;
      maxResults?: number;
    }) => Promise<YouTubeShortResult[]>;
  };
  repo: {
    getActiveNiches: () => Promise<
      Array<{ id: string; slug: string; youtube_search_terms: string[] }>
    >;
    recordViralObservations: (
      observations: Array<{
        niche_id: string;
        source: "youtube";
        external_id: string;
        url: string;
        title: string;
        views: number;
        likes: number;
        comments: number;
        duration_seconds: number;
        channel_id: string;
        channel_name: string;
        views_at_observation: number;
        raw_payload: unknown;
      }>
    ) => Promise<{ inserted: number }>;
  };
  apiKey: string;
};

export async function runYouTubeTrendingScrape(deps: YouTubeTrendingDeps) {
  const niches = await deps.repo.getActiveNiches();
  let totalObserved = 0;

  for (const niche of niches) {
    const all: Array<Awaited<ReturnType<typeof deps.client.searchShortsByQuery>>[number]> = [];
    for (const term of niche.youtube_search_terms) {
      const items = await deps.client.searchShortsByQuery({
        query: term,
        apiKey: deps.apiKey,
        maxResults: 25,
      });
      all.push(...items);
    }

    if (all.length === 0) continue;

    const rows = all.map((it) => ({
      niche_id: niche.id,
      source: "youtube" as const,
      external_id: it.externalId,
      url: it.url,
      title: it.title,
      views: it.views,
      likes: it.likes,
      comments: it.comments,
      duration_seconds: it.durationSeconds,
      channel_id: it.channelId,
      channel_name: it.channelName,
      views_at_observation: it.views,
      raw_payload: it.rawPayload,
    }));

    const result = await deps.repo.recordViralObservations(rows);
    totalObserved += result.inserted;
  }

  return { nichesProcessed: niches.length, totalObserved };
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/scrapers/youtube-trending.test.ts
```

- [ ] **Step 5: Create the cron route**

Create `src/app/api/cron/youtube-trending/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { runYouTubeTrendingScrape } from "@/lib/scrapers/youtube-trending";
import { searchShortsByQuery } from "@/lib/clients/youtube";
import { getServiceClient } from "@/lib/supabase/server";
import { loadEnv } from "@/lib/env";
import { assertCronAuth, scraperLog } from "@/lib/scrapers/shared";

export const maxDuration = 300; // 5 min

export async function GET(req: Request) {
  try {
    assertCronAuth(req);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const env = loadEnv();
  if (!env.YOUTUBE_API_KEY) {
    return NextResponse.json({ error: "YOUTUBE_API_KEY not set" }, { status: 500 });
  }
  const supabase = getServiceClient();

  const repo = {
    getActiveNiches: async () => {
      const { data, error } = await supabase
        .from("niches")
        .select("id, slug, youtube_search_terms")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
    recordViralObservations: async (rows: any[]) => {
      const { data, error } = await supabase
        .from("viral_observations")
        .upsert(rows, { onConflict: "source,external_id,observed_at" })
        .select("id");
      if (error) throw error;
      return { inserted: data?.length ?? 0 };
    },
  };

  try {
    const result = await runYouTubeTrendingScrape({
      client: { searchShortsByQuery },
      repo,
      apiKey: env.YOUTUBE_API_KEY,
    });
    return NextResponse.json({ ok: true, ...scraperLog("youtube-trending", result) });
  } catch (e) {
    console.error("youtube-trending scrape failed", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 6: Smoke-test locally**

In a SQL editor, insert a test niche:
```sql
insert into niches (slug, display_name, is_active, youtube_search_terms)
values ('wikipedia-til', 'Wikipedia / TIL', true, array['weird history fact', 'unknown story']);
```

Run dev server, hit the cron endpoint with the right auth header:
```bash
npm run dev
# new terminal:
curl -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)" \
  http://localhost:3000/api/cron/youtube-trending
```
Expected: JSON `{ ok: true, scraper: "youtube-trending", nichesProcessed: 1, totalObserved: <number> }`. Check Supabase — `viral_observations` should have new rows.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(scrapers): add YouTube Shorts trending scraper + cron route"
```

---

## Task 2.4: Reddit API client

**Files:**
- Create: `src/lib/clients/reddit.ts`
- Create: `src/tests/lib/clients/reddit.test.ts`
- Create: `src/tests/fixtures/reddit-listing.json`

- [ ] **Step 1: Get Reddit API credentials (manual)**

1. https://www.reddit.com/prefs/apps
2. "Create another app" → script type
3. Name: `shorts-os`, redirect URI: `http://localhost:3000` (unused for script type)
4. Save `client_id` (shown under the app name) and `client_secret`
5. Add to `.env.local`:
   ```
   REDDIT_CLIENT_ID=...
   REDDIT_CLIENT_SECRET=...
   REDDIT_USER_AGENT=shorts-os/0.1 by /u/your_reddit_username
   ```
6. Push the same to Vercel via `vercel env add ...`

- [ ] **Step 2: Create fixture**

`src/tests/fixtures/reddit-listing.json`:
```json
{
  "data": {
    "children": [
      {
        "data": {
          "id": "r1",
          "title": "TIL that the Eiffel Tower can grow 6 inches in summer",
          "selftext": "Heat expands the metal...",
          "score": 12500,
          "num_comments": 320,
          "url": "https://reddit.com/r/todayilearned/comments/r1",
          "subreddit": "todayilearned",
          "created_utc": 1716508800
        }
      }
    ],
    "after": "t3_xyz"
  }
}
```

- [ ] **Step 3: Write failing test**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import fixture from "@/tests/fixtures/reddit-listing.json" with { type: "json" };
import { getTopPosts } from "@/lib/clients/reddit";

afterEach(() => vi.restoreAllMocks());

describe("getTopPosts", () => {
  it("normalizes Reddit listing to flat objects", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "fake-token", expires_in: 3600 }), { status: 200 }) as Response)
      .mockResolvedValueOnce(new Response(JSON.stringify(fixture), { status: 200 }) as Response);

    const posts = await getTopPosts({
      subreddit: "todayilearned",
      timeframe: "day",
      limit: 25,
      clientId: "cid",
      clientSecret: "csec",
      userAgent: "ua",
    });

    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      externalId: "r1",
      title: expect.stringContaining("Eiffel Tower"),
      score: 12500,
      numComments: 320,
      subreddit: "todayilearned",
    });
  });
});
```

- [ ] **Step 4: Run, expect FAIL**

```bash
npm test -- src/tests/lib/clients/reddit.test.ts
```

- [ ] **Step 5: Implement**

Create `src/lib/clients/reddit.ts`:
```typescript
export type RedditPost = {
  externalId: string;
  title: string;
  selftext: string;
  score: number;
  numComments: number;
  url: string;
  subreddit: string;
  createdUtc: number;
  rawPayload: unknown;
};

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(clientId: string, clientSecret: string, userAgent: string): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "User-Agent": userAgent,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Reddit auth failed: ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

export type GetTopPostsParams = {
  subreddit: string;
  timeframe: "hour" | "day" | "week";
  limit: number;
  clientId: string;
  clientSecret: string;
  userAgent: string;
};

export async function getTopPosts(p: GetTopPostsParams): Promise<RedditPost[]> {
  const token = await getAccessToken(p.clientId, p.clientSecret, p.userAgent);
  const url = `https://oauth.reddit.com/r/${p.subreddit}/top?t=${p.timeframe}&limit=${p.limit}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": p.userAgent },
  });
  if (!res.ok) throw new Error(`Reddit top failed: ${res.status}`);
  const j = (await res.json()) as {
    data: { children: Array<{ data: any }> };
  };
  return j.data.children.map((c) => ({
    externalId: c.data.id,
    title: c.data.title,
    selftext: c.data.selftext ?? "",
    score: c.data.score,
    numComments: c.data.num_comments,
    url: `https://reddit.com${c.data.permalink ?? `/r/${c.data.subreddit}/comments/${c.data.id}`}`,
    subreddit: c.data.subreddit,
    createdUtc: c.data.created_utc,
    rawPayload: c.data,
  }));
}

export function _resetTokenCacheForTests() {
  tokenCache = null;
}
```

- [ ] **Step 6: Run, expect PASS**

```bash
npm test -- src/tests/lib/clients/reddit.test.ts
```
If the test fails because the token cache survives across runs, call `_resetTokenCacheForTests()` in a `beforeEach`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(clients): add Reddit OAuth + top-posts client"
```

---

## Task 2.5: Reddit Source Harvester scraper + cron route

**Files:**
- Create: `src/lib/scrapers/reddit-harvest.ts`
- Create: `src/tests/lib/scrapers/reddit-harvest.test.ts`
- Create: `src/app/api/cron/reddit-harvest/route.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { runRedditHarvest } from "@/lib/scrapers/reddit-harvest";

describe("runRedditHarvest", () => {
  it("queues topic candidates from each niche's subreddits", async () => {
    const client = { getTopPosts: vi.fn() };
    client.getTopPosts.mockResolvedValueOnce([
      { externalId: "r1", title: "TIL X", selftext: "details", score: 5000, subreddit: "todayilearned", url: "u", numComments: 10, createdUtc: 1, rawPayload: {} },
    ]);
    const repo = {
      getActiveNiches: vi.fn().mockResolvedValue([
        { id: "n1", subreddits: ["todayilearned"] },
      ]),
      queueTopicCandidates: vi.fn().mockResolvedValue({ inserted: 1 }),
    };

    const result = await runRedditHarvest({ client: client as any, repo: repo as any, credentials: { clientId: "c", clientSecret: "s", userAgent: "u" } });

    expect(client.getTopPosts).toHaveBeenCalledOnce();
    expect(repo.queueTopicCandidates).toHaveBeenCalledOnce();
    expect(result.totalQueued).toBe(1);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- src/tests/lib/scrapers/reddit-harvest.test.ts
```

- [ ] **Step 3: Implement scraper**

Create `src/lib/scrapers/reddit-harvest.ts`:
```typescript
import type { RedditPost } from "@/lib/clients/reddit";

type Deps = {
  client: { getTopPosts: (p: any) => Promise<RedditPost[]> };
  repo: {
    getActiveNiches: () => Promise<Array<{ id: string; subreddits: string[] }>>;
    queueTopicCandidates: (rows: Array<{
      niche_id: string;
      source: "reddit";
      external_ref: string;
      title: string;
      summary: string;
      raw_payload: unknown;
    }>) => Promise<{ inserted: number }>;
  };
  credentials: { clientId: string; clientSecret: string; userAgent: string };
};

export async function runRedditHarvest(deps: Deps) {
  const niches = await deps.repo.getActiveNiches();
  let totalQueued = 0;
  for (const niche of niches) {
    for (const sub of niche.subreddits) {
      const posts = await deps.client.getTopPosts({
        subreddit: sub,
        timeframe: "day",
        limit: 25,
        ...deps.credentials,
      });
      if (posts.length === 0) continue;
      const rows = posts.map((p) => ({
        niche_id: niche.id,
        source: "reddit" as const,
        external_ref: p.externalId,
        title: p.title,
        summary: p.selftext.slice(0, 1500),
        raw_payload: p.rawPayload,
      }));
      const r = await deps.repo.queueTopicCandidates(rows);
      totalQueued += r.inserted;
    }
  }
  return { nichesProcessed: niches.length, totalQueued };
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/scrapers/reddit-harvest.test.ts
```

- [ ] **Step 5: Create cron route**

Create `src/app/api/cron/reddit-harvest/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { runRedditHarvest } from "@/lib/scrapers/reddit-harvest";
import { getTopPosts } from "@/lib/clients/reddit";
import { getServiceClient } from "@/lib/supabase/server";
import { loadEnv } from "@/lib/env";
import { assertCronAuth, scraperLog } from "@/lib/scrapers/shared";

export const maxDuration = 300;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }
  const env = loadEnv();
  if (!env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET || !env.REDDIT_USER_AGENT) {
    return NextResponse.json({ error: "Reddit credentials not set" }, { status: 500 });
  }
  const supabase = getServiceClient();

  const repo = {
    getActiveNiches: async () => {
      const { data, error } = await supabase
        .from("niches").select("id, subreddits").eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
    queueTopicCandidates: async (rows: any[]) => {
      const { data, error } = await supabase
        .from("topic_queue").insert(rows).select("id");
      if (error) throw error;
      return { inserted: data?.length ?? 0 };
    },
  };

  try {
    const result = await runRedditHarvest({
      client: { getTopPosts },
      repo,
      credentials: {
        clientId: env.REDDIT_CLIENT_ID,
        clientSecret: env.REDDIT_CLIENT_SECRET,
        userAgent: env.REDDIT_USER_AGENT,
      },
    });
    return NextResponse.json({ ok: true, ...scraperLog("reddit-harvest", result) });
  } catch (e) {
    console.error("reddit-harvest failed", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
```

- [ ] **Step 6: Smoke-test locally**

```bash
npm run dev
# new terminal:
curl -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)" \
  http://localhost:3000/api/cron/reddit-harvest
```
Expected: `{ ok: true, totalQueued: <number> }`. Check Supabase `topic_queue`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(scrapers): add Reddit source harvester + cron route"
```

---

## Task 2.6: TikAPI client

**Files:**
- Create: `src/lib/clients/tikapi.ts`
- Create: `src/tests/lib/clients/tikapi.test.ts`
- Create: `src/tests/fixtures/tikapi-trending.json`

- [ ] **Step 1: Get TikAPI key**

1. https://tikapi.io/ → sign up, get API key
2. Add to `.env.local` as `TIKAPI_KEY=...`
3. Push to Vercel via `vercel env add`

- [ ] **Step 2: Create fixture**

Use a TikAPI documentation example (the exact JSON shape) saved as `src/tests/fixtures/tikapi-trending.json`. For the test we only need the minimal fields the client extracts:
```json
{
  "itemList": [
    {
      "id": "tt1",
      "desc": "wild fact about volcanoes 🌋",
      "createTime": 1716508800,
      "stats": { "playCount": 1500000, "diggCount": 80000, "commentCount": 800 },
      "music": { "title": "trending sound 1" },
      "video": { "duration": 47 },
      "author": { "uniqueId": "factblast", "id": "u1" }
    }
  ]
}
```

- [ ] **Step 3: Failing test**

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import fixture from "@/tests/fixtures/tikapi-trending.json" with { type: "json" };
import { searchTrendingByHashtag } from "@/lib/clients/tikapi";

afterEach(() => vi.restoreAllMocks());

describe("searchTrendingByHashtag", () => {
  it("normalizes TikAPI response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(fixture), { status: 200 }) as Response
    );
    const results = await searchTrendingByHashtag({ hashtag: "historyfacts", apiKey: "k" });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      externalId: "tt1",
      title: expect.stringContaining("volcanoes"),
      views: 1500000,
      durationSeconds: 47,
    });
  });
});
```

- [ ] **Step 4: Run, expect FAIL**

```bash
npm test -- src/tests/lib/clients/tikapi.test.ts
```

- [ ] **Step 5: Implement**

Create `src/lib/clients/tikapi.ts`:
```typescript
export type TikTokVideo = {
  externalId: string;
  title: string;
  channelName: string;
  channelId: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  durationSeconds: number;
  musicTitle?: string;
  url: string;
  rawPayload: unknown;
};

export async function searchTrendingByHashtag(params: {
  hashtag: string;
  apiKey: string;
  count?: number;
}): Promise<TikTokVideo[]> {
  const url = `https://api.tikapi.io/public/hashtag?hashtag=${encodeURIComponent(params.hashtag)}&count=${params.count ?? 30}`;
  const res = await fetch(url, { headers: { "X-API-KEY": params.apiKey } });
  if (!res.ok) throw new Error(`TikAPI failed: ${res.status}`);
  const j = (await res.json()) as { itemList: any[] };
  return (j.itemList ?? []).map((it) => ({
    externalId: it.id,
    title: it.desc ?? "",
    channelName: it.author?.uniqueId ?? "",
    channelId: it.author?.id ?? "",
    publishedAt: new Date((it.createTime ?? 0) * 1000).toISOString(),
    views: it.stats?.playCount ?? 0,
    likes: it.stats?.diggCount ?? 0,
    comments: it.stats?.commentCount ?? 0,
    durationSeconds: it.video?.duration ?? 0,
    musicTitle: it.music?.title,
    url: `https://www.tiktok.com/@${it.author?.uniqueId}/video/${it.id}`,
    rawPayload: it,
  }));
}
```

- [ ] **Step 6: Run, expect PASS**

```bash
npm test -- src/tests/lib/clients/tikapi.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(clients): add TikAPI hashtag trending client"
```

---

## Task 2.7: TikTok Trending scraper + cron route

**Files:**
- Create: `src/lib/scrapers/tiktok-trending.ts`
- Create: `src/tests/lib/scrapers/tiktok-trending.test.ts`
- Create: `src/app/api/cron/tiktok-trending/route.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { runTikTokTrendingScrape } from "@/lib/scrapers/tiktok-trending";

describe("runTikTokTrendingScrape", () => {
  it("scrapes each niche's hashtags", async () => {
    const client = { searchTrendingByHashtag: vi.fn() };
    client.searchTrendingByHashtag.mockResolvedValue([
      { externalId: "t1", views: 1000, title: "x", url: "u", likes: 0, comments: 0, durationSeconds: 30, channelId: "c", channelName: "n", publishedAt: "2026-05-01", rawPayload: {} },
    ]);
    const repo = {
      getActiveNiches: vi.fn().mockResolvedValue([{ id: "n1", tiktok_hashtags: ["historyfacts"] }]),
      recordViralObservations: vi.fn().mockResolvedValue({ inserted: 1 }),
    };

    const result = await runTikTokTrendingScrape({ client: client as any, repo: repo as any, apiKey: "k" });
    expect(result.totalObserved).toBe(1);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- src/tests/lib/scrapers/tiktok-trending.test.ts
```

- [ ] **Step 3: Implement scraper**

Create `src/lib/scrapers/tiktok-trending.ts`:
```typescript
import type { TikTokVideo } from "@/lib/clients/tikapi";

type Deps = {
  client: { searchTrendingByHashtag: (p: { hashtag: string; apiKey: string; count?: number }) => Promise<TikTokVideo[]> };
  repo: {
    getActiveNiches: () => Promise<Array<{ id: string; tiktok_hashtags: string[] }>>;
    recordViralObservations: (rows: any[]) => Promise<{ inserted: number }>;
  };
  apiKey: string;
};

export async function runTikTokTrendingScrape(deps: Deps) {
  const niches = await deps.repo.getActiveNiches();
  let totalObserved = 0;
  for (const niche of niches) {
    const all: TikTokVideo[] = [];
    for (const tag of niche.tiktok_hashtags) {
      const items = await deps.client.searchTrendingByHashtag({ hashtag: tag, apiKey: deps.apiKey, count: 30 });
      all.push(...items);
    }
    if (all.length === 0) continue;
    const rows = all.map((it) => ({
      niche_id: niche.id,
      source: "tiktok" as const,
      external_id: it.externalId,
      url: it.url,
      title: it.title,
      views: it.views,
      likes: it.likes,
      comments: it.comments,
      duration_seconds: it.durationSeconds,
      channel_id: it.channelId,
      channel_name: it.channelName,
      views_at_observation: it.views,
      raw_payload: it.rawPayload,
    }));
    const r = await deps.repo.recordViralObservations(rows);
    totalObserved += r.inserted;
  }
  return { nichesProcessed: niches.length, totalObserved };
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/scrapers/tiktok-trending.test.ts
```

- [ ] **Step 5: Cron route**

Create `src/app/api/cron/tiktok-trending/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { runTikTokTrendingScrape } from "@/lib/scrapers/tiktok-trending";
import { searchTrendingByHashtag } from "@/lib/clients/tikapi";
import { getServiceClient } from "@/lib/supabase/server";
import { loadEnv } from "@/lib/env";
import { assertCronAuth, scraperLog } from "@/lib/scrapers/shared";

export const maxDuration = 300;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }
  const env = loadEnv();
  if (!env.TIKAPI_KEY) return NextResponse.json({ error: "TIKAPI_KEY not set" }, { status: 500 });
  const supabase = getServiceClient();

  const repo = {
    getActiveNiches: async () => {
      const { data, error } = await supabase.from("niches").select("id, tiktok_hashtags").eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
    recordViralObservations: async (rows: any[]) => {
      const { data, error } = await supabase
        .from("viral_observations").upsert(rows, { onConflict: "source,external_id,observed_at" }).select("id");
      if (error) throw error;
      return { inserted: data?.length ?? 0 };
    },
  };

  try {
    const result = await runTikTokTrendingScrape({ client: { searchTrendingByHashtag }, repo, apiKey: env.TIKAPI_KEY });
    return NextResponse.json({ ok: true, ...scraperLog("tiktok-trending", result) });
  } catch (e) {
    console.error("tiktok-trending failed", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
```

- [ ] **Step 6: Smoke test**

```bash
curl -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)" \
  http://localhost:3000/api/cron/tiktok-trending
```

Update your test niche to include a hashtag first:
```sql
update niches set tiktok_hashtags = array['historyfacts','til'] where slug = 'wikipedia-til';
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(scrapers): add TikTok trending scraper + cron route"
```

---

## Task 2.8: Wikipedia client + Wikipedia Harvester scraper + cron route

**Files:**
- Create: `src/lib/clients/wikipedia.ts`
- Create: `src/lib/scrapers/wikipedia-harvest.ts`
- Create: `src/tests/lib/clients/wikipedia.test.ts`
- Create: `src/tests/lib/scrapers/wikipedia-harvest.test.ts`
- Create: `src/app/api/cron/wikipedia-harvest/route.ts`

- [ ] **Step 1: Failing test for client**

`src/tests/lib/clients/wikipedia.test.ts`:
```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchRandomArticles } from "@/lib/clients/wikipedia";

afterEach(() => vi.restoreAllMocks());

describe("fetchRandomArticles", () => {
  it("returns normalized articles", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        query: {
          random: [
            { id: 1, title: "Eiffel Tower" },
            { id: 2, title: "Mount Vesuvius" },
          ],
        },
      }), { status: 200 }) as Response
    );
    const articles = await fetchRandomArticles({ count: 2 });
    expect(articles).toHaveLength(2);
    expect(articles[0].title).toBe("Eiffel Tower");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
npm test -- src/tests/lib/clients/wikipedia.test.ts
```

- [ ] **Step 3: Implement client**

Create `src/lib/clients/wikipedia.ts`:
```typescript
export type WikipediaArticle = {
  pageId: number;
  title: string;
  url: string;
  extract?: string;
  rawPayload: unknown;
};

export async function fetchRandomArticles(params: { count: number }): Promise<WikipediaArticle[]> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("list", "random");
  url.searchParams.set("rnnamespace", "0");
  url.searchParams.set("rnlimit", String(params.count));
  url.searchParams.set("origin", "*");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Wikipedia random failed: ${res.status}`);
  const j = (await res.json()) as { query: { random: Array<{ id: number; title: string }> } };
  return j.query.random.map((r) => ({
    pageId: r.id,
    title: r.title,
    url: `https://en.wikipedia.org/?curid=${r.id}`,
    rawPayload: r,
  }));
}

export async function fetchArticleExtract(pageId: number): Promise<string | undefined> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("prop", "extracts");
  url.searchParams.set("exintro", "true");
  url.searchParams.set("explaintext", "true");
  url.searchParams.set("pageids", String(pageId));
  url.searchParams.set("origin", "*");
  const res = await fetch(url.toString());
  if (!res.ok) return undefined;
  const j = (await res.json()) as { query: { pages: Record<string, { extract?: string }> } };
  return j.query.pages[String(pageId)]?.extract;
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
npm test -- src/tests/lib/clients/wikipedia.test.ts
```

- [ ] **Step 5: Failing test for scraper**

`src/tests/lib/scrapers/wikipedia-harvest.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { runWikipediaHarvest } from "@/lib/scrapers/wikipedia-harvest";

describe("runWikipediaHarvest", () => {
  it("fetches random articles and queues them for active niches", async () => {
    const client = {
      fetchRandomArticles: vi.fn().mockResolvedValue([
        { pageId: 1, title: "Eiffel Tower", url: "u1", rawPayload: {} },
        { pageId: 2, title: "Vesuvius", url: "u2", rawPayload: {} },
      ]),
      fetchArticleExtract: vi.fn().mockResolvedValue("an extract"),
    };
    const repo = {
      getActiveNiches: vi.fn().mockResolvedValue([{ id: "n1" }]),
      queueTopicCandidates: vi.fn().mockResolvedValue({ inserted: 2 }),
    };
    const result = await runWikipediaHarvest({ client: client as any, repo: repo as any, perNicheCount: 2 });
    expect(result.totalQueued).toBe(2);
  });
});
```

- [ ] **Step 6: Implement scraper**

`src/lib/scrapers/wikipedia-harvest.ts`:
```typescript
type Deps = {
  client: {
    fetchRandomArticles: (p: { count: number }) => Promise<Array<{ pageId: number; title: string; url: string; rawPayload: unknown }>>;
    fetchArticleExtract: (pageId: number) => Promise<string | undefined>;
  };
  repo: {
    getActiveNiches: () => Promise<Array<{ id: string }>>;
    queueTopicCandidates: (rows: any[]) => Promise<{ inserted: number }>;
  };
  perNicheCount?: number;
};

export async function runWikipediaHarvest(deps: Deps) {
  const niches = await deps.repo.getActiveNiches();
  const perNiche = deps.perNicheCount ?? 10;
  let totalQueued = 0;

  for (const niche of niches) {
    const articles = await deps.client.fetchRandomArticles({ count: perNiche });
    if (articles.length === 0) continue;
    const extracts = await Promise.all(articles.map((a) => deps.client.fetchArticleExtract(a.pageId)));
    const rows = articles.map((a, i) => ({
      niche_id: niche.id,
      source: "wikipedia" as const,
      external_ref: String(a.pageId),
      title: a.title,
      summary: extracts[i]?.slice(0, 1500) ?? "",
      raw_payload: a.rawPayload,
    }));
    const r = await deps.repo.queueTopicCandidates(rows);
    totalQueued += r.inserted;
  }
  return { nichesProcessed: niches.length, totalQueued };
}
```

- [ ] **Step 7: Run scraper test, expect PASS**

```bash
npm test -- src/tests/lib/scrapers/wikipedia-harvest.test.ts
```

- [ ] **Step 8: Cron route**

`src/app/api/cron/wikipedia-harvest/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { runWikipediaHarvest } from "@/lib/scrapers/wikipedia-harvest";
import { fetchRandomArticles, fetchArticleExtract } from "@/lib/clients/wikipedia";
import { getServiceClient } from "@/lib/supabase/server";
import { assertCronAuth, scraperLog } from "@/lib/scrapers/shared";

export const maxDuration = 300;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }
  const supabase = getServiceClient();

  const repo = {
    getActiveNiches: async () => {
      const { data, error } = await supabase.from("niches").select("id").eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
    queueTopicCandidates: async (rows: any[]) => {
      const { data, error } = await supabase.from("topic_queue").insert(rows).select("id");
      if (error) throw error;
      return { inserted: data?.length ?? 0 };
    },
  };

  try {
    const result = await runWikipediaHarvest({
      client: { fetchRandomArticles, fetchArticleExtract },
      repo,
      perNicheCount: 10,
    });
    return NextResponse.json({ ok: true, ...scraperLog("wikipedia-harvest", result) });
  } catch (e) {
    console.error("wikipedia-harvest failed", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
```

- [ ] **Step 9: Smoke test**

```bash
curl -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)" \
  http://localhost:3000/api/cron/wikipedia-harvest
```
Expected: `topic_queue` gets ~10 new rows from Wikipedia.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(scrapers): add Wikipedia harvester + cron route"
```

---

## Task 2.9: Topic scorer (Claude-powered hookability score)

**Files:**
- Create: `src/lib/ai/topic-scorer.ts`
- Create: `src/tests/lib/ai/topic-scorer.test.ts`
- Modify: `src/app/api/cron/reddit-harvest/route.ts` and `src/app/api/cron/wikipedia-harvest/route.ts` to invoke scorer

- [ ] **Step 1: Failing test (with mocked AI SDK)**

`src/tests/lib/ai/topic-scorer.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

import { generateObject } from "ai";
import { scoreTopic } from "@/lib/ai/topic-scorer";

describe("scoreTopic", () => {
  it("returns parsed score object from generateObject", async () => {
    (generateObject as any).mockResolvedValue({
      object: { hookability: 78, novelty: 65, visual_richness: 70, reasoning: "decent" },
    });
    const result = await scoreTopic({
      title: "The Eiffel Tower grows in summer",
      summary: "Heat expands the metal...",
      modelId: "claude-haiku-4-5",
    });
    expect(result.hookability).toBe(78);
    expect(result.novelty).toBe(65);
  });
});
```

- [ ] **Step 2: Implement scorer**

`src/lib/ai/topic-scorer.ts`:
```typescript
import { generateObject } from "ai";
import { z } from "zod";
import { getClaudeModel } from "@/lib/ai/gateway";

export const TopicScoreSchema = z.object({
  hookability: z.number().min(0).max(100),
  novelty: z.number().min(0).max(100),
  visual_richness: z.number().min(0).max(100),
  reasoning: z.string(),
});
export type TopicScore = z.infer<typeof TopicScoreSchema>;

export async function scoreTopic(params: {
  title: string;
  summary: string;
  modelId?: "claude-haiku-4-5" | "claude-sonnet-4-5";
}): Promise<TopicScore> {
  const model = getClaudeModel(params.modelId ?? "claude-haiku-4-5");
  const result = await generateObject({
    model,
    schema: TopicScoreSchema,
    prompt: `You are evaluating a candidate topic for a faceless YouTube Short.

Title: ${params.title}
Summary: ${params.summary.slice(0, 1500)}

Score this topic on three dimensions (0-100):
- hookability: how strong is the curiosity gap?
- novelty: how fresh vs. already widely covered?
- visual_richness: can b-roll plausibly illustrate this?

Output JSON.`,
  });
  return result.object;
}
```

- [ ] **Step 3: Run test, expect PASS**

```bash
npm test -- src/tests/lib/ai/topic-scorer.test.ts
```

- [ ] **Step 4: Wire scorer into reddit-harvest and wikipedia-harvest cron routes**

Both routes currently insert into `topic_queue` with `hookability_score = null`. Add a follow-up loop after the insert that pulls back unscored rows and scores them. Modify both cron routes:

After the `result = await runRedditHarvest(...)` (or `runWikipediaHarvest`) call, but inside the `try` block:
```typescript
// Score newly-queued topics (cap at 20 per run to control cost)
const { data: unscored } = await supabase
  .from("topic_queue")
  .select("id, title, summary")
  .is("hookability_score", null)
  .limit(20);

const { scoreTopic } = await import("@/lib/ai/topic-scorer");
for (const t of unscored ?? []) {
  try {
    const s = await scoreTopic({ title: t.title, summary: t.summary ?? "" });
    await supabase.from("topic_queue").update({
      hookability_score: s.hookability,
      scored_at: new Date().toISOString(),
    }).eq("id", t.id);
  } catch (e) {
    console.warn("score failed for", t.id, e);
  }
}
```

- [ ] **Step 5: Smoke-test scoring**

```bash
curl -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)" \
  http://localhost:3000/api/cron/wikipedia-harvest
```
Then in Supabase SQL editor:
```sql
select title, hookability_score from topic_queue where scored_at is not null order by scored_at desc limit 10;
```
Expected: scored rows with numeric values 0–100.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ai): add Claude-powered topic scorer + wire into harvest routes"
```

---

## Task 2.10: Performance Sync scaffold (no-op when no channels)

**Files:**
- Create: `src/app/api/cron/performance-sync/route.ts`

- [ ] **Step 1: Implement scaffold**

```typescript
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { assertCronAuth, scraperLog } from "@/lib/scrapers/shared";

export const maxDuration = 300;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }
  const supabase = getServiceClient();

  const { data: channels, error } = await supabase
    .from("channels")
    .select("id, external_channel_id")
    .eq("is_active", true)
    .eq("platform", "youtube");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Plan #1 ships with no real Analytics integration — that comes in Plan #4
  // when we have channels publishing. For now, log that we ran and exit.
  return NextResponse.json({
    ok: true,
    ...scraperLog("performance-sync", { channelsFound: channels?.length ?? 0, note: "stub until Plan #4" }),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(scrapers): scaffold performance-sync cron (stub until Plan #4)"
```

---

## Task 2.11: Expand `/api/health` to report scraper liveness

**Files:**
- Modify: `src/app/api/health/route.ts`

- [ ] **Step 1: Replace health route**

```typescript
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = getServiceClient();
  const checks: Record<string, unknown> = {};

  try {
    const { count: nicheCount } = await supabase
      .from("niches").select("*", { count: "exact", head: true }).eq("is_active", true);
    checks.activeNiches = nicheCount ?? 0;
  } catch (e) {
    checks.activeNiches = { error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("viral_observations")
      .select("*", { count: "exact", head: true })
      .gte("observed_at", since);
    checks.viralObservations_last24h = count ?? 0;
  } catch (e) {
    checks.viralObservations_last24h = { error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("topic_queue")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since);
    checks.topicQueue_last24h = count ?? 0;
  } catch (e) {
    checks.topicQueue_last24h = { error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const { count } = await supabase
      .from("agents").select("*", { count: "exact", head: true });
    checks.agentsSeeded = count ?? 0;
  } catch (e) {
    checks.agentsSeeded = { error: e instanceof Error ? e.message : String(e) };
  }

  return NextResponse.json({
    status: "ok",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    checks,
  });
}
```

- [ ] **Step 2: Verify**

```bash
curl http://localhost:3000/api/health | jq
```
Expected: JSON with counts for activeNiches, viralObservations_last24h, topicQueue_last24h, agentsSeeded.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(api): expand /api/health with scraper liveness checks"
```

---

# PHASE 1: Wrap-up

## Task 3.1: Deploy to Vercel and verify cron jobs are registered

- [ ] **Step 1: Deploy**

```bash
vercel --prod
```

- [ ] **Step 2: Verify cron jobs in Vercel dashboard**

Open the Vercel project → Settings → Cron Jobs. You should see 5 entries:
- `/api/cron/youtube-trending` — `0 */6 * * *`
- `/api/cron/tiktok-trending` — `30 */6 * * *`
- `/api/cron/reddit-harvest` — `0 8 * * *`
- `/api/cron/wikipedia-harvest` — `30 8 * * *`
- `/api/cron/performance-sync` — `0 9 * * *`

If not visible, your `vercel.ts` config did not deploy — check the latest build logs.

- [ ] **Step 3: Hit each cron endpoint via production URL**

```bash
PROD_URL=https://shorts-os.vercel.app
CRON=$(vercel env pull .env.local && grep CRON_SECRET .env.local | cut -d= -f2)
for path in youtube-trending reddit-harvest tiktok-trending wikipedia-harvest performance-sync; do
  echo "=== $path ==="
  curl -s -H "Authorization: Bearer $CRON" $PROD_URL/api/cron/$path | jq
done
```
Each should return `{ ok: true, ... }`.

- [ ] **Step 4: Verify data is flowing**

```bash
curl $PROD_URL/api/health | jq
```
Expected: activeNiches ≥ 1, viralObservations_last24h > 0, topicQueue_last24h > 0, agentsSeeded = 7.

- [ ] **Step 5: Commit (no code changes — just confirms deploy works)**

```bash
git tag v0.1.0
git push --tags
```

---

## Task 3.2: Write README with setup steps

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README**

```markdown
# Shorts OS

Personal media operations system for running faceless YouTube Shorts channels.

**Status:** Phase 0 + 1 (Foundation) complete. Memory Layer + Intel scrapers live.
Next: Plan #2 (Studio cockpit UI).

## What's running

- **Supabase** holds 11 tables (Memory Layer)
- **Vercel Cron** runs 5 background scrapers:
  - YouTube Shorts trending (every 6h)
  - TikTok trending via TikAPI (every 6h)
  - Reddit harvest (daily 08:00 UTC)
  - Wikipedia harvest (daily 08:30 UTC)
  - Performance sync (daily 09:00 UTC — stub until Plan #4)
- **Claude (Haiku 4.5)** scores topic candidates for hookability
- Health endpoint: `/api/health`

## Setup (when cloning fresh)

1. `npm install`
2. Copy `.env.example` → `.env.local`, fill in all keys
3. `npx supabase link --project-ref <ref>`
4. `npx supabase db push`
5. `npm run dev` → http://localhost:3000

To create your first niche:
```sql
insert into niches (slug, display_name, is_active, youtube_search_terms, tiktok_hashtags, subreddits)
values (
  'wikipedia-til',
  'Wikipedia / TIL',
  true,
  array['weird history fact','wild story unknown'],
  array['historyfacts','til'],
  array['todayilearned','interestingasfuck','Damnthatsinteresting','nextfuckinglevel']
);
```

## Project layout

See `docs/superpowers/specs/2026-05-24-shorts-os-design.md` for the full design.

## Plans (sequential)

- Plan #1 (this) — Foundation + Memory Layer + Intel scrapers ✅
- Plan #2 — Studio cockpit UI + visualization (next)
- Plan #3 — Agent framework + generation pipeline
- Plan #4 — PC render agent + first videos live
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README for Phase 0+1 foundation"
```

---

## Task 3.3: Final acceptance — 48h soak test (operator action, not code)

- [ ] **Step 1: Wait 48 hours after deploy**

Vercel Cron will fire on schedule. Trending scrapers run every 6h (8 firings); Reddit/Wikipedia each run twice.

- [ ] **Step 2: After 48h, verify in Supabase**

In Supabase SQL editor:
```sql
-- Should have hundreds of viral_observations across the 48h window
select source, count(*) from viral_observations
where observed_at > now() - interval '48 hours'
group by source;

-- Should have ~20-40 topic candidates from Reddit/Wikipedia
select source, count(*), avg(hookability_score)::int as avg_score from topic_queue
where created_at > now() - interval '48 hours'
group by source;

-- Cron error rate
select * from agent_messages order by created_at desc limit 10;
```

- [ ] **Step 3: Check Vercel logs for any failed cron runs**

Vercel dashboard → Logs → filter by `/api/cron`. Any 500s? Investigate.

- [ ] **Step 4: If soak test passes, Plan #1 is officially shipped**

Tag the milestone:
```bash
git tag -a v0.1.0-soaked -m "Phase 0+1 verified: 48h of trending + topic data flowing"
git push --tags
```

Move to writing Plan #2.

---

## Self-Review Checklist (writing-plans)

Done as the plan was being written:

1. **Spec coverage:**
   - ✅ Section 2 Architecture (Intel + Memory layers) — Tasks 1.1–1.13 + 2.1–2.11
   - ✅ Section 3 Modules (Intel Layer modules + Memory tables) — covered
   - ✅ Section 4 Source Strategy (YouTube + Reddit + TikAPI + Wikipedia) — Tasks 2.2–2.8
   - ✅ Section 5 Tech Stack (Next.js, Supabase, Vercel Cron, AI SDK v6, vitest) — Tasks 0.1–0.8
   - ✅ Section 7 Phase 0 + Phase 1 — fully covered
   - ❌ Studio Layer, agents-as-executable, generation pipeline, PC render — explicitly deferred to Plans #2–#4

2. **Placeholder scan:** Every step has actual code or actual commands. No TBDs, no "implement appropriately."

3. **Type consistency:** Repository function names (`getActiveNiches`, `recordViralObservations`, `queueTopicCandidates`) are used consistently across scraper signatures and route handlers.

4. **External-API caveats noted:** Tasks that require manual signup (YouTube API key, Reddit app, TikAPI account, Supabase project, Vercel account) all call out the manual step with the exact link.

5. **TDD discipline:** Every logic module has a failing test before implementation. API client wrappers test the transformation logic with fixtures. Cron routes are smoke-tested manually (TDD'ing thin glue is low-ROI).
