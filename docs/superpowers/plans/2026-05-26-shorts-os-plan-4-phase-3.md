# Plan #4 Phase 3 — Reddit Clip Ingest + /clips Inbox + Stage-1 Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-populate `clip_library` from Reddit videos (filtered, deduped, Stage-1 Haiku-triaged) so Format-2 has a candidate pool by the time Phase 4 starts; surface the catalogue in a new `/clips` Inbox tab with Block-source + manual-URL controls.

**Architecture:**
- `reddit-clip-discovery` cron (every `REDDIT_INGEST_CADENCE_MINUTES`, default 30) iterates active channels' `niches.subreddits`, fetches top video posts last 24h via the existing `getTopPosts` client, dedupes against `clip_library.source_url` + `ingest_blocklist`, runs a Haiku Stage-1 triage scorer, and enqueues `render_jobs.job_type='clip_ingest'` for hits while writing `ingest_skip_log` rows for misses.
- `clip_ingest` Sandbox handler downloads the source via `yt-dlp-wrap` (npm package that fetches the standalone yt-dlp binary on first use — no Python dependency), probes with `@ffprobe-installer/ffprobe`, extracts frames at 0.5 fps (≤30s) / 0.25 fps (30–120s) capped at 60, prefers yt-dlp auto-subtitles with Groq Whisper fallback (lib already exists), calls Claude Haiku via AI SDK with `[frames + transcript + niche tag vocabulary]` → `{ description, tags }`, uploads the .mp4 + thumbnail to Vercel Blob, and POSTs the callback.
- Callback handler grows a `clip_ingest` branch: inserts a `clip_library` row on success, persists the trace string to `render_jobs.last_error` on success or failure (Phase 2 lesson #3 pattern carries through).
- `/clips/page.tsx` adds an Inbox tab listing `clip_library` (server component); client components handle the block-source modal and the manual-URL form (small `/api/clips/{block,ingest-url}` POST routes).

**Tech Stack:** TS strict, Next.js 16 App Router (Server Components by default), AI SDK v6 + `@ai-sdk/anthropic` (worker side too — add to worker package), `yt-dlp-wrap`, `@ffprobe-installer/ffprobe`, `ffmpeg-static` (already in worker), Groq Whisper (already wired), Zod, Vercel Blob, Vercel Sandbox, Vitest.

**Schema:** All required tables (`clip_library`, `ingest_blocklist`, `ingest_skip_log`) already exist in migration `20260525000002_plan_4_schema.sql`. No migration in this phase.

**Phase 2 lessons carried forward (read before writing worker code):**
1. `ffmpeg-static` ships ffmpeg only — use `@ffprobe-installer/ffprobe` (already in worker deps) via `scripts/render-worker/lib/probe.ts`.
2. Be permissive at Zod boundaries — `quality: z.string().nullable()` style — when parsing external responses.
3. Worker stdout is unreachable; accumulate a `trace: string[]` and surface it via the `RenderF1Error` pattern (callback handler persists to `render_jobs.last_error`).
4. Module-level code that throws silently kills the worker before `run.ts main()` executes — defer all sanity checks (env reads, binary existence) to first-use inside functions, not module scope.
5. `vercel env add NAME preview <branch>` needs the branch pushed first.

---

## File structure (what each new/touched file owns)

**New:**
- `src/lib/supabase/repositories/clip-library.ts` — read/insert/soft-delete clip rows.
- `src/lib/supabase/repositories/ingest-blocklist.ts` — read/check/insert blocklist rows.
- `src/lib/supabase/repositories/ingest-skip-log.ts` — append-only triage audit.
- `src/lib/ai/clip-triage.ts` — Stage-1 Haiku scorer + `decisions` row writer.
- `src/lib/scrapers/reddit-clip-discovery.ts` — pure orchestration function (deps-injected: client, repos, scorer, channels).
- `src/app/api/cron/reddit-clip-discovery/route.ts` — thin Vercel-cron handler.
- `src/app/api/clips/ingest-url/route.ts` — operator manual-drop POST.
- `src/app/api/clips/block/route.ts` — operator block-source POST.
- `src/app/clips/page.tsx` — server component with single Inbox tab (Candidates + Rendered ship in Phase 4).
- `src/components/clips/inbox-tab.tsx` — server component: clip grid + manual-URL form + filters (read-only).
- `src/components/clips/clip-card.tsx` — single tile (thumb + tags + Block button); client component because of the modal.
- `src/components/clips/block-source-modal.tsx` — radio modal (subreddit / author) + reason text + POST.
- `src/components/clips/ingest-url-input.tsx` — single text input + POST.
- `scripts/render-worker/lib/yt-dlp.ts` — wrapper: download, probe, fetch auto-subs.
- `scripts/render-worker/lib/frames.ts` — extract frames + thumbnail per duration tier.
- `scripts/render-worker/lib/claude-vision.ts` — AI SDK call with vision input.
- `scripts/render-worker/handlers/clip-ingest.ts` — full handler (replaces the stub).

**Modified:**
- `scripts/render-worker/package.json` — add `yt-dlp-wrap` + `ai` + `@ai-sdk/anthropic`.
- `scripts/render-worker/run.ts` — pass `(job, supabase)` to `runClipIngest` like `runRenderF1`.
- `src/app/api/render/complete/route.ts` — `clip_ingest` success branch inserts `clip_library`, trace persistence mirrors `render_f1`.
- `src/lib/env.ts` — optional `STAGE_1_SCORE_THRESHOLD`, `REDDIT_INGEST_CADENCE_MINUTES`.
- `src/lib/render/workers/vercel-sandbox.ts` — pass `ANTHROPIC_API_KEY` into the sandbox env (worker now calls Claude).
- `src/components/cockpit/cockpit-shell.tsx` — nav: add `/clips` link next to `/lab`.
- `vercel.ts` — add `{ path: '/api/cron/reddit-clip-discovery', schedule: '*/30 * * * *' }`.

**Tests (Vitest, `src/tests/**/*.test.ts`):**
- `src/tests/lib/scrapers/reddit-clip-discovery.test.ts`
- `src/tests/lib/ai/clip-triage.test.ts`
- `src/tests/lib/supabase/repositories/clip-library.test.ts`
- `src/tests/lib/supabase/repositories/ingest-blocklist.test.ts`
- `src/tests/api/clips/ingest-url.test.ts`
- `src/tests/api/clips/block.test.ts`

Worker code is not unit-tested (the existing pattern — Phase 2's worker libs have no Vitest coverage). Verification for worker pieces happens via the prod smoke at Task 21.

---

## Task 1: Branch + worker package deps

**Files:**
- Modify: `scripts/render-worker/package.json`

- [ ] **Step 1: Create branch off main**

```bash
git checkout main
git pull --ff-only
git checkout -b plan-4-phase-3
```

- [ ] **Step 2: Add worker deps**

Edit `scripts/render-worker/package.json` to add `yt-dlp-wrap`, `ai`, and `@ai-sdk/anthropic` to `dependencies` (match the existing semver-caret style):

```json
{
  "name": "shorts-os-render-worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "run": "node --import tsx run.ts"
  },
  "dependencies": {
    "@ai-sdk/anthropic": "^3.0.79",
    "@ffprobe-installer/ffprobe": "^2.1.2",
    "@supabase/supabase-js": "^2.106.1",
    "@vercel/blob": "^1.0.0",
    "ai": "^6.0.191",
    "ffmpeg-static": "^5.2.0",
    "fluent-ffmpeg": "^2.1.3",
    "tsx": "^4.20.0",
    "yt-dlp-wrap": "^2.3.12",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/fluent-ffmpeg": "^2.1.27",
    "@types/node": "^20.19.41",
    "typescript": "^5"
  }
}
```

- [ ] **Step 3: Install + commit**

```bash
cd scripts/render-worker && npm install && cd -
git add scripts/render-worker/package.json scripts/render-worker/package-lock.json
git commit -m "chore(worker): add yt-dlp-wrap, ai, @ai-sdk/anthropic for Phase 3 clip ingest"
```

Expected: lockfile updates; binary download for `yt-dlp-wrap` is **deferred until first runtime invocation** (it caches under `node_modules/yt-dlp-wrap/bin`), so install is fast.

If npm install fails for `yt-dlp-wrap` on macOS due to a network issue, the implementer should switch to pinning the version one minor lower or fall back to `youtube-dl-exec`. Document the swap in the commit message.

---

## Task 2: Env schema — STAGE_1 + cadence knobs

**Files:**
- Modify: `src/lib/env.ts`
- Test: `src/tests/lib/env.test.ts` (likely already exists; add a single env-default case if so, otherwise skip)

- [ ] **Step 1: Add optional fields with sane defaults**

Edit `src/lib/env.ts` — add inside `envSchema`:

```ts
  // Phase 3 — Reddit clip ingest knobs (defaults applied below; never required to set)
  STAGE_1_SCORE_THRESHOLD: z.coerce.number().int().min(0).max(100).default(60),
  REDDIT_INGEST_CADENCE_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
```

Note: `z.coerce.number()` handles the string-from-process.env case. Defaults mean missing values pass validation.

- [ ] **Step 2: Run existing tests, expect 167+ passing**

```bash
npm test
```

Expected: same baseline as Phase 2 (167 passing / 11 pre-existing env failures). No new failures.

- [ ] **Step 3: Commit**

```bash
git add src/lib/env.ts
git commit -m "feat(env): add STAGE_1_SCORE_THRESHOLD + REDDIT_INGEST_CADENCE_MINUTES with defaults"
```

---

## Task 3: clip-library repository

**Files:**
- Create: `src/lib/supabase/repositories/clip-library.ts`
- Test: `src/tests/lib/supabase/repositories/clip-library.test.ts`

- [ ] **Step 1: Write the failing test**

`src/tests/lib/supabase/repositories/clip-library.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import {
  listInboxClips,
  isSourceUrlIngested,
  insertClipLibraryRow,
  softDeleteClip,
} from "@/lib/supabase/repositories/clip-library";

function fakeBuilder(result: unknown) {
  const b: Record<string, unknown> = {};
  const chain = (fn: string) => { b[fn] = vi.fn().mockReturnValue(b); return b; };
  ["select", "eq", "order", "limit", "in", "neq", "single", "update", "insert"].forEach(chain);
  b.then = (resolve: (v: unknown) => void) => resolve(result);
  return b;
}

describe("clip-library repo", () => {
  it("listInboxClips filters out soft-deleted rows and orders by added_at desc", async () => {
    const order = vi.fn().mockReturnThis();
    const neq = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({ data: [{ id: "c1" }], error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ neq, order, limit }),
      }),
    };
    neq.mockReturnValue({ order, limit });
    order.mockReturnValue({ limit });
    const rows = await listInboxClips(supabase as never, { limit: 50 });
    expect(rows).toEqual([{ id: "c1" }]);
    expect(neq).toHaveBeenCalledWith("added_by", "deleted");
    expect(order).toHaveBeenCalledWith("added_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(50);
  });

  it("isSourceUrlIngested returns true when a matching row exists", async () => {
    const eq = vi.fn().mockReturnThis();
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "c2" }, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq, maybeSingle }),
      }),
    };
    eq.mockReturnValue({ maybeSingle });
    const seen = await isSourceUrlIngested(supabase as never, "https://reddit.com/r/cars/comments/x");
    expect(seen).toBe(true);
  });

  it("insertClipLibraryRow returns the inserted row id", async () => {
    const select = vi.fn().mockReturnThis();
    const single = vi.fn().mockResolvedValue({ data: { id: "new-id" }, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({ select, single }),
      }),
    };
    select.mockReturnValue({ single });
    const id = await insertClipLibraryRow(supabase as never, {
      source_url: "https://reddit.com/r/cars/comments/x",
      source_platform: "reddit",
      source_creator: "u/somebody",
      local_path: "https://blob.vercel.app/clip-library/abc.mp4",
      duration_seconds: 42,
      width: 1080,
      height: 1920,
      description: "Mechanic discovers thing",
      tags: ["mechanic_fail", "garage"],
      niche_id: "00000000-0000-0000-0000-000000000001",
      added_by: "reddit_ingest",
    });
    expect(id).toBe("new-id");
  });

  it("softDeleteClip sets added_by='deleted'", async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq }),
      }),
    };
    await softDeleteClip(supabase as never, "c-id");
    expect(eq).toHaveBeenCalledWith("id", "c-id");
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
npm test -- src/tests/lib/supabase/repositories/clip-library.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/lib/supabase/repositories/clip-library.ts`:

```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SourcePlatform = "youtube" | "tiktok" | "reddit" | "twitch" | "upload";
export type AddedBy = "reddit_ingest" | "manual" | "deleted";

export interface ClipLibraryRow {
  id: string;
  source_url: string;
  source_platform: SourcePlatform;
  source_creator: string | null;
  local_path: string;
  duration_seconds: number;
  width: number | null;
  height: number | null;
  description: string | null;
  tags: string[];
  niche_id: string | null;
  added_at: string;
  added_by: string;
}

export interface ClipLibraryInsert {
  source_url: string;
  source_platform: SourcePlatform;
  source_creator: string | null;
  local_path: string;
  duration_seconds: number;
  width: number | null;
  height: number | null;
  description: string | null;
  tags: string[];
  niche_id: string | null;
  added_by: AddedBy;
}

export async function listInboxClips(
  supabase: SupabaseClient,
  args: { limit: number; nicheId?: string },
): Promise<ClipLibraryRow[]> {
  let q = supabase
    .from("clip_library")
    .select("*")
    .neq("added_by", "deleted")
    .order("added_at", { ascending: false })
    .limit(args.limit);
  if (args.nicheId) q = q.eq("niche_id", args.nicheId);
  const { data, error } = await q;
  if (error) throw new Error(`listInboxClips: ${error.message}`);
  return (data ?? []) as ClipLibraryRow[];
}

export async function isSourceUrlIngested(
  supabase: SupabaseClient,
  sourceUrl: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("clip_library")
    .select("id")
    .eq("source_url", sourceUrl)
    .maybeSingle();
  if (error) throw new Error(`isSourceUrlIngested: ${error.message}`);
  return !!data;
}

export async function insertClipLibraryRow(
  supabase: SupabaseClient,
  row: ClipLibraryInsert,
): Promise<string> {
  const { data, error } = await supabase
    .from("clip_library")
    .insert(row)
    .select("id")
    .single();
  if (error) throw new Error(`insertClipLibraryRow: ${error.message}`);
  return data.id as string;
}

export async function softDeleteClip(
  supabase: SupabaseClient,
  clipId: string,
): Promise<void> {
  const { error } = await supabase
    .from("clip_library")
    .update({ added_by: "deleted" })
    .eq("id", clipId);
  if (error) throw new Error(`softDeleteClip: ${error.message}`);
}

export async function countTodayClipIngestJobs(
  supabase: SupabaseClient,
  args: { channelId: string },
): Promise<number> {
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // render_jobs doesn't carry channel_id directly; count by job_type+payload->>channel_id.
  // Reddit-discovery cron embeds channel_id into payload for exactly this lookup.
  const { count, error } = await supabase
    .from("render_jobs")
    .select("id", { count: "exact", head: true })
    .eq("job_type", "clip_ingest")
    .gte("created_at", sinceIso)
    .filter("payload->>channel_id", "eq", args.channelId);
  if (error) throw new Error(`countTodayClipIngestJobs: ${error.message}`);
  return count ?? 0;
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
npm test -- src/tests/lib/supabase/repositories/clip-library.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/repositories/clip-library.ts src/tests/lib/supabase/repositories/clip-library.test.ts
git commit -m "feat(repo): add clip-library repository with insert/list/dedupe helpers"
```

---

## Task 4: ingest-blocklist repository

**Files:**
- Create: `src/lib/supabase/repositories/ingest-blocklist.ts`
- Test: `src/tests/lib/supabase/repositories/ingest-blocklist.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import {
  loadBlocklistForPlatform,
  isBlocked,
  addBlocklistEntry,
} from "@/lib/supabase/repositories/ingest-blocklist";

describe("ingest-blocklist repo", () => {
  it("loadBlocklistForPlatform returns subreddit + author identifiers grouped", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              { identifier_type: "subreddit", identifier: "carfails" },
              { identifier_type: "author",    identifier: "spamuser" },
              { identifier_type: "subreddit", identifier: "weird_subset" },
            ],
            error: null,
          }),
        }),
      }),
    };
    const out = await loadBlocklistForPlatform(supabase as never, "reddit");
    expect(out.subreddits).toEqual(new Set(["carfails", "weird_subset"]));
    expect(out.authors).toEqual(new Set(["spamuser"]));
  });

  it("isBlocked is true when subreddit matches", () => {
    const b = { subreddits: new Set(["spam"]), authors: new Set() };
    expect(isBlocked(b, { subreddit: "spam", author: "anyone" })).toBe(true);
    expect(isBlocked(b, { subreddit: "ok", author: "anyone" })).toBe(false);
  });

  it("addBlocklistEntry inserts with the operator added_by default", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ insert }),
    };
    await addBlocklistEntry(supabase as never, {
      sourcePlatform: "reddit",
      identifierType: "subreddit",
      identifier: "noisysub",
      reason: "low signal",
    });
    expect(insert).toHaveBeenCalledWith({
      source_platform: "reddit",
      identifier_type: "subreddit",
      identifier: "noisysub",
      reason: "low signal",
      added_by: "operator",
    });
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
npm test -- src/tests/lib/supabase/repositories/ingest-blocklist.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

`src/lib/supabase/repositories/ingest-blocklist.ts`:

```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type BlocklistPlatform = "reddit" | "youtube" | "tiktok";
export type BlocklistIdentifierType = "subreddit" | "author";

export interface BlocklistRow {
  identifier_type: BlocklistIdentifierType;
  identifier: string;
}

export interface BlocklistGrouped {
  subreddits: Set<string>;
  authors: Set<string>;
}

export async function loadBlocklistForPlatform(
  supabase: SupabaseClient,
  platform: BlocklistPlatform,
): Promise<BlocklistGrouped> {
  const { data, error } = await supabase
    .from("ingest_blocklist")
    .select("identifier_type, identifier")
    .eq("source_platform", platform);
  if (error) throw new Error(`loadBlocklistForPlatform: ${error.message}`);
  const subreddits = new Set<string>();
  const authors = new Set<string>();
  for (const row of (data ?? []) as BlocklistRow[]) {
    const id = row.identifier.toLowerCase();
    if (row.identifier_type === "subreddit") subreddits.add(id);
    else if (row.identifier_type === "author") authors.add(id);
  }
  return { subreddits, authors };
}

export function isBlocked(
  b: BlocklistGrouped,
  post: { subreddit: string; author: string },
): boolean {
  return b.subreddits.has(post.subreddit.toLowerCase())
    || b.authors.has(post.author.toLowerCase());
}

export async function addBlocklistEntry(
  supabase: SupabaseClient,
  args: {
    sourcePlatform: BlocklistPlatform;
    identifierType: BlocklistIdentifierType;
    identifier: string;
    reason?: string;
  },
): Promise<void> {
  const { error } = await supabase.from("ingest_blocklist").insert({
    source_platform: args.sourcePlatform,
    identifier_type: args.identifierType,
    identifier: args.identifier,
    reason: args.reason ?? null,
    added_by: "operator",
  });
  if (error) throw new Error(`addBlocklistEntry: ${error.message}`);
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
npm test -- src/tests/lib/supabase/repositories/ingest-blocklist.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/repositories/ingest-blocklist.ts src/tests/lib/supabase/repositories/ingest-blocklist.test.ts
git commit -m "feat(repo): add ingest-blocklist repository with subreddit/author dedupe"
```

---

## Task 5: ingest-skip-log repository

**Files:**
- Create: `src/lib/supabase/repositories/ingest-skip-log.ts`

- [ ] **Step 1: Implement (test omitted — single insert, low value)**

`src/lib/supabase/repositories/ingest-skip-log.ts`:

```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function logIngestSkip(
  supabase: SupabaseClient,
  args: {
    sourcePlatform: string;
    sourceUrl: string;
    stage1Score: number;
    reasoning: string;
  },
): Promise<void> {
  const { error } = await supabase.from("ingest_skip_log").insert({
    source_platform: args.sourcePlatform,
    source_url: args.sourceUrl,
    stage_1_score: args.stage1Score,
    reasoning: args.reasoning,
  });
  if (error) throw new Error(`logIngestSkip: ${error.message}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/supabase/repositories/ingest-skip-log.ts
git commit -m "feat(repo): add ingest-skip-log append-only writer"
```

---

## Task 6: Stage-1 Haiku triage scorer

**Files:**
- Create: `src/lib/ai/clip-triage.ts`
- Test: `src/tests/lib/ai/clip-triage.test.ts`

The scorer takes Reddit post metadata and returns `{ stage_1_score: 0-100, reasoning, suggested_tags }`. Reused by both the discovery cron (skip vs. enqueue) and — later — the `decisions` table audit. We use Haiku 4.5 via the existing `getClaudeModel` helper.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({
  getClaudeModel: vi.fn(() => "mock-haiku-model"),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(async (args: { schema: unknown; prompt: string }) => {
    if (args.prompt.includes("Mechanic finds rats in air filter")) {
      return { object: { stage_1_score: 78, reasoning: "Strong visual hook", suggested_tags: ["mechanic_fail", "garage"] } };
    }
    return { object: { stage_1_score: 12, reasoning: "Generic political rant", suggested_tags: [] } };
  }),
}));

import { scoreRedditPostForClipIngest, Stage1ScoreSchema } from "@/lib/ai/clip-triage";

describe("clip-triage", () => {
  it("returns a Zod-shaped score for a strong post", async () => {
    const result = await scoreRedditPostForClipIngest({
      title: "Mechanic finds rats in air filter — couldn't believe it",
      subreddit: "JustRolledIntoTheShop",
      author: "u/wrenchhands",
      score: 8412,
      numComments: 312,
      nicheSlug: "cars",
      nicheTagVocabulary: ["mechanic_fail", "garage", "engine"],
    });
    expect(Stage1ScoreSchema.parse(result)).toEqual({
      stage_1_score: 78,
      reasoning: "Strong visual hook",
      suggested_tags: ["mechanic_fail", "garage"],
    });
  });

  it("returns a low score for off-topic posts", async () => {
    const result = await scoreRedditPostForClipIngest({
      title: "Political opinion thread (no video)",
      subreddit: "cars",
      author: "u/rant",
      score: 10,
      numComments: 200,
      nicheSlug: "cars",
      nicheTagVocabulary: ["mechanic_fail"],
    });
    expect(result.stage_1_score).toBeLessThan(60);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
npm test -- src/tests/lib/ai/clip-triage.test.ts
```

Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

`src/lib/ai/clip-triage.ts`:

```ts
import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import { getClaudeModel } from "@/lib/ai/gateway";

export const Stage1ScoreSchema = z.object({
  stage_1_score: z.number().int().min(0).max(100),
  reasoning: z.string().min(1).max(800),
  suggested_tags: z.array(z.string()).max(8),
});
export type Stage1Score = z.infer<typeof Stage1ScoreSchema>;

export const STAGE_1_PROMPT_VERSION = "stage1.haiku.v1" as const;

export interface Stage1Input {
  title: string;
  subreddit: string;
  author: string;
  score: number;
  numComments: number;
  nicheSlug: string;
  nicheTagVocabulary: string[];
}

/**
 * Stage-1 triage. Cheap (~$0.001/call) gate before paying for the
 * full clip_ingest pipeline. Returns 0-100; cron compares against
 * STAGE_1_SCORE_THRESHOLD env knob.
 */
export async function scoreRedditPostForClipIngest(
  input: Stage1Input,
): Promise<Stage1Score> {
  const model = getClaudeModel("claude-haiku-4-5");
  const prompt = buildPrompt(input);
  const result = await generateObject({
    model,
    schema: Stage1ScoreSchema,
    prompt,
  });
  return result.object;
}

function buildPrompt(i: Stage1Input): string {
  return [
    `You are a Stage-1 triage scorer for short-form video ingest.`,
    `Niche: ${i.nicheSlug}`,
    `Allowed tag vocabulary: ${i.nicheTagVocabulary.join(", ") || "(none provided)"}`,
    ``,
    `Reddit post:`,
    `  Title: ${i.title}`,
    `  Subreddit: r/${i.subreddit}`,
    `  Author: ${i.author}`,
    `  Score: ${i.score}`,
    `  Comments: ${i.numComments}`,
    ``,
    `Score this post 0-100 on its likely usefulness as a clip in a Format-2 compilation video for this niche.`,
    `High score (>=70): clearly contains a viral-shaped visual moment matching the niche.`,
    `Medium (40-69): plausibly contains a useful clip but unsure.`,
    `Low (<40): off-topic, low-signal, NSFW, political, fatal/graphic, or a self-text post without video.`,
    ``,
    `Return JSON with stage_1_score, reasoning (one short sentence),`,
    `and suggested_tags (subset of the allowed vocabulary; empty array if none apply).`,
  ].join("\n");
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
npm test -- src/tests/lib/ai/clip-triage.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/clip-triage.ts src/tests/lib/ai/clip-triage.test.ts
git commit -m "feat(ai): add Stage-1 Haiku triage scorer for Reddit clip ingest"
```

---

## Task 7: Pure-function Reddit clip discovery

**Files:**
- Create: `src/lib/scrapers/reddit-clip-discovery.ts`
- Test: `src/tests/lib/scrapers/reddit-clip-discovery.test.ts`

Deps-injected pure function (mirrors `runRedditHarvest` in `src/lib/scrapers/reddit-harvest.ts`). Inputs:
- `client.getTopPosts(subreddit, opts)` — already exists in `src/lib/clients/reddit.ts`.
- `repo` — listActiveChannelsWithNiches, isSourceUrlIngested, loadBlocklistForPlatform, countTodayClipIngestJobs, logIngestSkip, enqueueClipIngestJob.
- `scorer.score(input)` — calls the Stage-1 scorer.
- `now()` — for `created_utc` filter.
- `stage1Threshold` — defaults to `loadEnv().STAGE_1_SCORE_THRESHOLD`.

Per-channel loop checks `max_clip_ingest_per_day` cap, then per-subreddit fetches top 24h posts, filters to video posts only (`isVideo === true OR url matches a known video host pattern`), applies blocklist + dedupe + Stage-1 triage.

- [ ] **Step 1: Write the failing test**

`src/tests/lib/scrapers/reddit-clip-discovery.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { runRedditClipDiscovery } from "@/lib/scrapers/reddit-clip-discovery";
import type { RedditPost } from "@/lib/clients/reddit";

function post(overrides: Partial<RedditPost>): RedditPost {
  return {
    id: "abc", subreddit: "cars", title: "Mechanic finds rats in air filter",
    selftext: "", permalink: "/r/cars/comments/abc", url: "https://v.redd.it/xyz",
    author: "wrenchhands", score: 8000, numComments: 250, createdUtc: 1_700_000_000,
    upvoteRatio: 0.95, flair: null, isSelf: false, isVideo: true,
    ...overrides,
  };
}

describe("runRedditClipDiscovery", () => {
  it("enqueues clip_ingest for high-scoring video posts, skip-logs low scores, dedupes against blocklist + clip_library", async () => {
    const repo = {
      listActiveChannelsWithNiches: vi.fn().mockResolvedValue([
        { channelId: "ch1", nicheId: "n1", nicheSlug: "cars",
          subreddits: ["cars", "JustRolledIntoTheShop"], nicheTagVocabulary: ["mechanic_fail"],
          maxClipIngestPerDay: 10 },
      ]),
      countTodayClipIngestJobs: vi.fn().mockResolvedValue(2),
      loadBlocklistForPlatform: vi.fn().mockResolvedValue({
        subreddits: new Set(["spamsub"]), authors: new Set(["spamuser"]),
      }),
      isSourceUrlIngested: vi.fn(async (url: string) => url.includes("already")),
      logIngestSkip: vi.fn().mockResolvedValue(undefined),
      enqueueClipIngestJob: vi.fn(async () => ({ id: "job-id" })),
    };
    const client = {
      getTopPosts: vi.fn(async (sub: string) => {
        if (sub === "cars") {
          return [
            post({ id: "good", title: "Crash compilation", url: "https://v.redd.it/good" }),
            post({ id: "low",  title: "off-topic rant", url: "https://v.redd.it/low" }),
            post({ id: "dup",  title: "Already ingested", url: "https://v.redd.it/already" }),
            post({ id: "txt",  title: "Text post", url: "https://reddit.com/...", isVideo: false }),
          ];
        }
        return [];
      }),
    };
    const scorer = {
      score: vi.fn(async (i: { title: string }) =>
        i.title.includes("off-topic")
          ? { stage_1_score: 12, reasoning: "off-topic", suggested_tags: [] }
          : { stage_1_score: 81, reasoning: "viral", suggested_tags: ["mechanic_fail"] },
      ),
    };

    const result = await runRedditClipDiscovery({
      client, repo, scorer,
      stage1Threshold: 60,
      now: new Date("2026-05-26T00:00:00Z"),
    });

    expect(repo.enqueueClipIngestJob).toHaveBeenCalledTimes(1);
    expect(repo.enqueueClipIngestJob).toHaveBeenCalledWith(expect.objectContaining({
      sourceUrl: "https://v.redd.it/good",
      nicheId: "n1",
      channelId: "ch1",
    }));
    expect(repo.logIngestSkip).toHaveBeenCalledTimes(1);
    expect(result.channelsProcessed).toBe(1);
    expect(result.enqueued).toBe(1);
    expect(result.skipped).toBeGreaterThanOrEqual(2); // text + low + dup
  });

  it("respects per-channel max_clip_ingest_per_day cap", async () => {
    const repo = {
      listActiveChannelsWithNiches: vi.fn().mockResolvedValue([
        { channelId: "ch1", nicheId: "n1", nicheSlug: "cars",
          subreddits: ["cars"], nicheTagVocabulary: [], maxClipIngestPerDay: 5 },
      ]),
      countTodayClipIngestJobs: vi.fn().mockResolvedValue(5),
      loadBlocklistForPlatform: vi.fn().mockResolvedValue({ subreddits: new Set(), authors: new Set() }),
      isSourceUrlIngested: vi.fn().mockResolvedValue(false),
      logIngestSkip: vi.fn(),
      enqueueClipIngestJob: vi.fn(),
    };
    const client = { getTopPosts: vi.fn().mockResolvedValue([]) };
    const scorer = { score: vi.fn() };
    const result = await runRedditClipDiscovery({
      client, repo, scorer, stage1Threshold: 60, now: new Date(),
    });
    expect(client.getTopPosts).not.toHaveBeenCalled();
    expect(result.enqueued).toBe(0);
    expect(result.channelsAtCap).toBe(1);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
npm test -- src/tests/lib/scrapers/reddit-clip-discovery.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

`src/lib/scrapers/reddit-clip-discovery.ts`:

```ts
import type { RedditPost } from "@/lib/clients/reddit";

export interface RedditClipDiscoveryChannelRow {
  channelId: string;
  nicheId: string;
  nicheSlug: string;
  subreddits: string[];
  nicheTagVocabulary: string[];
  maxClipIngestPerDay: number;
}

export interface RedditClipDiscoveryRepo {
  listActiveChannelsWithNiches(): Promise<RedditClipDiscoveryChannelRow[]>;
  countTodayClipIngestJobs(args: { channelId: string }): Promise<number>;
  loadBlocklistForPlatform(platform: "reddit"): Promise<{
    subreddits: Set<string>; authors: Set<string>;
  }>;
  isSourceUrlIngested(sourceUrl: string): Promise<boolean>;
  logIngestSkip(args: {
    sourcePlatform: string; sourceUrl: string;
    stage1Score: number; reasoning: string;
  }): Promise<void>;
  enqueueClipIngestJob(args: {
    sourceUrl: string;
    sourceCreator: string | null;
    nicheId: string;
    channelId: string;
    postMetadata: RedditPost;
  }): Promise<{ id: string }>;
}

export interface RedditClipDiscoveryClient {
  getTopPosts(
    subreddit: string,
    opts?: { period?: "hour" | "day" | "week" | "month" | "year" | "all"; limit?: number },
  ): Promise<RedditPost[]>;
}

export interface RedditClipDiscoveryScorer {
  score(input: {
    title: string;
    subreddit: string;
    author: string;
    score: number;
    numComments: number;
    nicheSlug: string;
    nicheTagVocabulary: string[];
  }): Promise<{ stage_1_score: number; reasoning: string; suggested_tags: string[] }>;
}

export interface RedditClipDiscoveryResult {
  scraper: "reddit-clip-discovery";
  at: string;
  channelsProcessed: number;
  channelsAtCap: number;
  enqueued: number;
  skipped: number;
}

const VIDEO_URL_PATTERNS = [
  /v\.redd\.it/i,
  /youtube\.com\/shorts\//i,
  /youtu\.be\//i,
  /tiktok\.com\/@[^/]+\/video\//i,
];

function looksLikeVideo(post: RedditPost): boolean {
  if (post.isVideo) return true;
  return VIDEO_URL_PATTERNS.some((re) => re.test(post.url));
}

export async function runRedditClipDiscovery(deps: {
  client: RedditClipDiscoveryClient;
  repo: RedditClipDiscoveryRepo;
  scorer: RedditClipDiscoveryScorer;
  stage1Threshold: number;
  now: Date;
}): Promise<RedditClipDiscoveryResult> {
  const channels = await deps.repo.listActiveChannelsWithNiches();
  const blocklist = await deps.repo.loadBlocklistForPlatform("reddit");

  let enqueued = 0;
  let skipped = 0;
  let channelsAtCap = 0;

  for (const ch of channels) {
    const todayCount = await deps.repo.countTodayClipIngestJobs({ channelId: ch.channelId });
    let remaining = ch.maxClipIngestPerDay - todayCount;
    if (remaining <= 0) {
      channelsAtCap += 1;
      continue;
    }

    for (const sub of ch.subreddits) {
      if (remaining <= 0) break;
      let posts: RedditPost[];
      try {
        posts = await deps.client.getTopPosts(sub, { period: "day", limit: 25 });
      } catch (err) {
        console.warn(`reddit-clip-discovery: getTopPosts ${sub} failed:`, err);
        continue;
      }

      for (const post of posts) {
        if (remaining <= 0) break;
        if (!looksLikeVideo(post)) { skipped += 1; continue; }
        if (blocklist.subreddits.has(post.subreddit.toLowerCase())) { skipped += 1; continue; }
        if (blocklist.authors.has(post.author.toLowerCase())) { skipped += 1; continue; }
        if (await deps.repo.isSourceUrlIngested(post.url)) { skipped += 1; continue; }

        let scored: Awaited<ReturnType<RedditClipDiscoveryScorer["score"]>>;
        try {
          scored = await deps.scorer.score({
            title: post.title,
            subreddit: post.subreddit,
            author: post.author,
            score: post.score,
            numComments: post.numComments,
            nicheSlug: ch.nicheSlug,
            nicheTagVocabulary: ch.nicheTagVocabulary,
          });
        } catch (err) {
          console.warn(`reddit-clip-discovery: scorer failed for ${post.url}`, err);
          skipped += 1;
          continue;
        }

        if (scored.stage_1_score < deps.stage1Threshold) {
          await deps.repo.logIngestSkip({
            sourcePlatform: "reddit",
            sourceUrl: post.url,
            stage1Score: scored.stage_1_score,
            reasoning: scored.reasoning,
          });
          skipped += 1;
          continue;
        }

        try {
          await deps.repo.enqueueClipIngestJob({
            sourceUrl: post.url,
            sourceCreator: post.author ? `u/${post.author}` : null,
            nicheId: ch.nicheId,
            channelId: ch.channelId,
            postMetadata: post,
          });
          enqueued += 1;
          remaining -= 1;
        } catch (err) {
          // Likely a unique-violation race or transient DB error.
          console.warn(`reddit-clip-discovery: enqueue failed for ${post.url}`, err);
          skipped += 1;
        }
      }
    }
  }

  return {
    scraper: "reddit-clip-discovery",
    at: deps.now.toISOString(),
    channelsProcessed: channels.length,
    channelsAtCap,
    enqueued,
    skipped,
  };
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
npm test -- src/tests/lib/scrapers/reddit-clip-discovery.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scrapers/reddit-clip-discovery.ts src/tests/lib/scrapers/reddit-clip-discovery.test.ts
git commit -m "feat(ingest): pure-fn reddit clip discovery with Stage-1 triage + cap enforcement"
```

---

## Task 8: Reddit clip discovery cron route

**Files:**
- Create: `src/app/api/cron/reddit-clip-discovery/route.ts`

- [ ] **Step 1: Implement**

```ts
import "server-only";
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import {
  assertCronAuth,
  scraperLog,
  serializeError,
} from "@/lib/scrapers/shared";
import { getTopPosts } from "@/lib/clients/reddit";
import { runRedditClipDiscovery } from "@/lib/scrapers/reddit-clip-discovery";
import { scoreRedditPostForClipIngest } from "@/lib/ai/clip-triage";
import {
  isSourceUrlIngested,
  countTodayClipIngestJobs,
} from "@/lib/supabase/repositories/clip-library";
import { loadBlocklistForPlatform } from "@/lib/supabase/repositories/ingest-blocklist";
import { logIngestSkip } from "@/lib/supabase/repositories/ingest-skip-log";
import { enqueueRenderJob } from "@/lib/supabase/repositories/render-jobs";
import { loadEnv } from "@/lib/env";

export const maxDuration = 300;

export async function GET(req: Request) {
  try { assertCronAuth(req); }
  catch (e) { if (e instanceof Response) return e; throw e; }

  const env = loadEnv();
  const supabase = getServiceClient();

  const repo = {
    listActiveChannelsWithNiches: async () => {
      const { data, error } = await supabase
        .from("channels")
        .select(`
          id, max_clip_ingest_per_day,
          niche:niches!inner(id, slug, subreddits, tag_vocabulary)
        `)
        .eq("is_active", true)
        .not("niche_id", "is", null);
      if (error) throw error;
      return (data ?? []).map((row: {
        id: string; max_clip_ingest_per_day: number;
        niche: { id: string; slug: string; subreddits: string[]; tag_vocabulary?: string[] } |
               Array<{ id: string; slug: string; subreddits: string[]; tag_vocabulary?: string[] }>;
      }) => {
        // Supabase nested-select returns either array or object depending on FK shape.
        const niche = Array.isArray(row.niche) ? row.niche[0] : row.niche;
        return {
          channelId: row.id,
          nicheId: niche.id,
          nicheSlug: niche.slug,
          subreddits: niche.subreddits ?? [],
          nicheTagVocabulary: niche.tag_vocabulary ?? [],
          maxClipIngestPerDay: row.max_clip_ingest_per_day,
        };
      });
    },
    countTodayClipIngestJobs: (args: { channelId: string }) =>
      countTodayClipIngestJobs(supabase, args),
    loadBlocklistForPlatform: () => loadBlocklistForPlatform(supabase, "reddit"),
    isSourceUrlIngested: (url: string) => isSourceUrlIngested(supabase, url),
    logIngestSkip: (args: { sourcePlatform: string; sourceUrl: string; stage1Score: number; reasoning: string }) =>
      logIngestSkip(supabase, args),
    enqueueClipIngestJob: async (args: {
      sourceUrl: string; sourceCreator: string | null;
      nicheId: string; channelId: string; postMetadata: unknown;
    }) => {
      const row = await enqueueRenderJob(supabase, {
        jobType: "clip_ingest",
        payload: {
          source_url: args.sourceUrl,
          source_creator: args.sourceCreator,
          niche_id: args.nicheId,
          channel_id: args.channelId,
          post_metadata: args.postMetadata,
        },
      });
      return { id: row.id };
    },
  };

  try {
    const result = await runRedditClipDiscovery({
      client: { getTopPosts },
      repo,
      scorer: {
        score: (i) => scoreRedditPostForClipIngest(i),
      },
      stage1Threshold: env.STAGE_1_SCORE_THRESHOLD,
      now: new Date(),
    });
    return NextResponse.json({
      ok: true,
      ...scraperLog("reddit-clip-discovery", result),
    });
  } catch (e) {
    console.error("reddit-clip-discovery failed", e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
```

Note: the spec mentions `niches.tag_vocabulary` but the current `niches` table doesn't have that column (only `subreddits`, `youtube_search_terms`, `tiktok_hashtags`). The wiring tolerates a missing column by falling back to `[]`; if Phase 4's Composer needs strict vocabulary, a future migration adds it. Stage-1 scorer is tolerant of empty vocabulary.

- [ ] **Step 2: Run lint + typecheck**

```bash
npm run build
```

Expected: build passes. (No new tests for the route — it's a thin wrapper.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/reddit-clip-discovery/route.ts
git commit -m "feat(cron): wire reddit-clip-discovery cron handler"
```

---

## Task 9: Add cron to vercel.ts

**Files:**
- Modify: `vercel.ts`

- [ ] **Step 1: Add the cron entry**

Replace the existing placeholder comment block in `vercel.ts` (around the "Phase 3 will add" line):

```ts
    // --- Plan #4 Phase 1 (Plan #4 render pipeline) ---
    { path: '/api/cron/render-dispatcher', schedule: '* * * * *' },
    { path: '/api/cron/render-watchdog',   schedule: '*/5 * * * *' },
    // --- Plan #4 Phase 3 (Reddit clip ingest) ---
    { path: '/api/cron/reddit-clip-discovery', schedule: '*/30 * * * *' },
    // Phase 5 will add: { path: '/api/cron/scheduled-uploader', schedule: '*/15 * * * *' },
```

- [ ] **Step 2: Commit**

```bash
git add vercel.ts
git commit -m "feat(cron): register reddit-clip-discovery at */30 * * * *"
```

---

## Task 10: POST /api/clips/ingest-url

**Files:**
- Create: `src/app/api/clips/ingest-url/route.ts`
- Test: `src/tests/api/clips/ingest-url.test.ts`

Accepts a URL from the operator, looks up the cars channel's niche_id, enqueues a `clip_ingest` job with `added_by='manual'` payload tag, bypassing Stage-1.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const enqueueRenderJob = vi.fn();
const getDefaultChannel = vi.fn();

vi.mock("@/lib/supabase/repositories/render-jobs", () => ({ enqueueRenderJob }));
vi.mock("@/lib/supabase/repositories/channels", () => ({ getDefaultChannel }));
vi.mock("@/lib/supabase/server", () => ({
  getServiceClient: () => ({ /* unused — mocks intercept */ }),
}));
vi.mock("@/lib/supabase/repositories/clip-library", () => ({
  isSourceUrlIngested: vi.fn().mockResolvedValue(false),
}));

import { POST } from "@/app/api/clips/ingest-url/route";

describe("POST /api/clips/ingest-url", () => {
  beforeEach(() => {
    enqueueRenderJob.mockReset();
    getDefaultChannel.mockReset();
  });

  it("rejects malformed bodies", async () => {
    const res = await POST(new Request("http://t/", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });

  it("enqueues a clip_ingest job for a valid URL", async () => {
    getDefaultChannel.mockResolvedValue({ id: "ch1", niche_id: "n1" });
    enqueueRenderJob.mockResolvedValue({ id: "job-id" });
    const res = await POST(new Request("http://t/", {
      method: "POST",
      body: JSON.stringify({ url: "https://www.youtube.com/shorts/ABC123" }),
    }));
    expect(res.status).toBe(200);
    expect(enqueueRenderJob).toHaveBeenCalledWith(expect.anything(), {
      jobType: "clip_ingest",
      payload: expect.objectContaining({
        source_url: "https://www.youtube.com/shorts/ABC123",
        niche_id: "n1",
        channel_id: "ch1",
        added_by: "manual",
      }),
    });
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
npm test -- src/tests/api/clips/ingest-url.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import "server-only";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { enqueueRenderJob } from "@/lib/supabase/repositories/render-jobs";
import { getDefaultChannel } from "@/lib/supabase/repositories/channels";
import { isSourceUrlIngested } from "@/lib/supabase/repositories/clip-library";

const BodySchema = z.object({ url: z.string().url() });

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try { body = BodySchema.parse(await req.json()); }
  catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "invalid_body" }, { status: 400 });
  }

  const supabase = getServiceClient();
  if (await isSourceUrlIngested(supabase, body.url)) {
    return Response.json({ error: "already_ingested" }, { status: 409 });
  }

  const channel = await getDefaultChannel(supabase);
  if (!channel.niche_id) {
    return Response.json({ error: "channel_missing_niche" }, { status: 400 });
  }
  const job = await enqueueRenderJob(supabase, {
    jobType: "clip_ingest",
    payload: {
      source_url: body.url,
      source_creator: null,
      niche_id: channel.niche_id,
      channel_id: channel.id,
      added_by: "manual",
    },
  });
  return Response.json({ ok: true, jobId: job.id });
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
npm test -- src/tests/api/clips/ingest-url.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/clips/ingest-url/route.ts src/tests/api/clips/ingest-url.test.ts
git commit -m "feat(api): POST /api/clips/ingest-url for manual clip drop"
```

---

## Task 11: POST /api/clips/block

**Files:**
- Create: `src/app/api/clips/block/route.ts`
- Test: `src/tests/api/clips/block.test.ts`

Body: `{ sourcePlatform: 'reddit'|'youtube'|'tiktok', identifierType: 'subreddit'|'author', identifier: string, reason?: string, softDeleteClipId?: string }`. Inserts blocklist row; optionally soft-deletes the clip the operator was looking at.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const addBlocklistEntry = vi.fn();
const softDeleteClip = vi.fn();

vi.mock("@/lib/supabase/repositories/ingest-blocklist", () => ({ addBlocklistEntry }));
vi.mock("@/lib/supabase/repositories/clip-library", () => ({ softDeleteClip }));
vi.mock("@/lib/supabase/server", () => ({ getServiceClient: () => ({}) }));

import { POST } from "@/app/api/clips/block/route";

describe("POST /api/clips/block", () => {
  beforeEach(() => { addBlocklistEntry.mockReset(); softDeleteClip.mockReset(); });

  it("inserts the blocklist row and soft-deletes when clip id provided", async () => {
    addBlocklistEntry.mockResolvedValue(undefined);
    softDeleteClip.mockResolvedValue(undefined);
    const res = await POST(new Request("http://t/", {
      method: "POST",
      body: JSON.stringify({
        sourcePlatform: "reddit", identifierType: "subreddit",
        identifier: "noisysub", reason: "spam", softDeleteClipId: "c1",
      }),
    }));
    expect(res.status).toBe(200);
    expect(addBlocklistEntry).toHaveBeenCalled();
    expect(softDeleteClip).toHaveBeenCalledWith(expect.anything(), "c1");
  });

  it("rejects unknown identifier_type", async () => {
    const res = await POST(new Request("http://t/", {
      method: "POST",
      body: JSON.stringify({ sourcePlatform: "reddit", identifierType: "domain", identifier: "x" }),
    }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

```bash
npm test -- src/tests/api/clips/block.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import "server-only";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { addBlocklistEntry } from "@/lib/supabase/repositories/ingest-blocklist";
import { softDeleteClip } from "@/lib/supabase/repositories/clip-library";

const BodySchema = z.object({
  sourcePlatform: z.enum(["reddit", "youtube", "tiktok"]),
  identifierType: z.enum(["subreddit", "author"]),
  identifier: z.string().min(1).max(80),
  reason: z.string().max(500).optional(),
  softDeleteClipId: z.string().uuid().optional(),
});

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try { body = BodySchema.parse(await req.json()); }
  catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "invalid_body" }, { status: 400 });
  }
  const supabase = getServiceClient();
  await addBlocklistEntry(supabase, {
    sourcePlatform: body.sourcePlatform,
    identifierType: body.identifierType,
    identifier: body.identifier,
    reason: body.reason,
  });
  if (body.softDeleteClipId) {
    await softDeleteClip(supabase, body.softDeleteClipId);
  }
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Run, verify PASS**

```bash
npm test -- src/tests/api/clips/block.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/clips/block/route.ts src/tests/api/clips/block.test.ts
git commit -m "feat(api): POST /api/clips/block writes blocklist + optional soft-delete"
```

---

## Task 12: Worker — yt-dlp wrapper lib

**Files:**
- Create: `scripts/render-worker/lib/yt-dlp.ts`

`yt-dlp-wrap` downloads the standalone yt-dlp binary into `node_modules/yt-dlp-wrap/bin/yt-dlp` on first instantiation. **Critically (Phase 2 lesson #4):** instantiate the wrapper inside the function call, not at module scope. The binary download is async and any module-level await of `setBinaryPath` would crash the worker silently.

- [ ] **Step 1: Implement**

```ts
// scripts/render-worker/lib/yt-dlp.ts
//
// Thin wrapper around `yt-dlp-wrap`. The constructor is invoked lazily inside
// each function so the binary download (first-use only) cannot crash worker
// boot. yt-dlp-wrap caches the binary under node_modules/.bin after first use.
import YTDlpWrap from 'yt-dlp-wrap';
import { join } from 'node:path';
import { readFile, writeFile, access } from 'node:fs/promises';

let cachedWrap: YTDlpWrap | null = null;

async function getWrap(): Promise<YTDlpWrap> {
  if (cachedWrap) return cachedWrap;
  const binDir = join(process.cwd(), 'node_modules', 'yt-dlp-wrap', 'bin');
  const binPath = join(binDir, 'yt-dlp');
  try {
    await access(binPath);
  } catch {
    // First run: download the standalone binary. ~5-10 MB.
    await YTDlpWrap.downloadFromGithub(binPath);
  }
  cachedWrap = new YTDlpWrap(binPath);
  return cachedWrap;
}

export interface YtDlpDownloadResult {
  videoPath: string;
  autoSubtitlesText: string | null;
}

/**
 * Downloads the source video as mp4 to `outputPath` and best-effort fetches
 * auto-generated English subtitles into a parallel .vtt file. Returns the
 * parsed subtitles text (null if no subtitles available).
 */
export async function downloadVideoAndAutoSubs(args: {
  sourceUrl: string;
  outputPath: string;
}): Promise<YtDlpDownloadResult> {
  const wrap = await getWrap();
  const vttPath = args.outputPath.replace(/\.mp4$/, '') + '.en.vtt';

  // 1. Try the all-in-one path: download video + auto-subs in one invocation.
  //    If subs aren't available yt-dlp silently skips them.
  await wrap.execPromise([
    args.sourceUrl,
    '--format', 'best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '--write-auto-subs',
    '--sub-langs', 'en.*',
    '--sub-format', 'vtt',
    '--no-playlist',
    '--no-warnings',
    '--max-filesize', '200M',
    '--socket-timeout', '30',
    '-o', args.outputPath,
  ]);

  let autoSubtitlesText: string | null = null;
  try {
    const raw = await readFile(vttPath, 'utf8');
    autoSubtitlesText = vttToPlainText(raw);
    if (autoSubtitlesText.trim().length < 4) autoSubtitlesText = null;
  } catch {
    autoSubtitlesText = null;
  }

  return { videoPath: args.outputPath, autoSubtitlesText };
}

function vttToPlainText(vtt: string): string {
  // Strip WEBVTT header, cue numbers, timestamps, and inline tags.
  const lines = vtt.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith('WEBVTT')) continue;
    if (/^\d+$/.test(line.trim())) continue;
    if (line.includes('-->')) continue;
    out.push(line.replace(/<[^>]+>/g, '').trim());
  }
  return out.join(' ');
}

/** For tests / debug only. */
export function _resetForTests() {
  cachedWrap = null;
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/render-worker/lib/yt-dlp.ts
git commit -m "feat(worker): add yt-dlp wrapper with lazy binary init + auto-subs"
```

---

## Task 13: Worker — frame extraction lib

**Files:**
- Create: `scripts/render-worker/lib/frames.ts`

- [ ] **Step 1: Implement**

```ts
// scripts/render-worker/lib/frames.ts
//
// Extracts JPG frames + a single thumbnail from a local mp4. Frame budget
// per spec §3 clip_ingest: 0.5 fps if duration <=30s, 0.25 fps for 30-120s,
// hard cap at 60 frames.
import ffmpegStatic from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

function ffmpegBin(): string {
  if (!ffmpegStatic) throw new Error('ffmpeg-static binary path not available');
  return ffmpegStatic;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const cp = spawn(ffmpegBin(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    cp.stderr.on('data', (b) => { stderr += b.toString(); });
    cp.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`)),
    );
  });
}

export interface ExtractFramesArgs {
  videoPath: string;
  durationSeconds: number;
  outDir: string;
}

export interface ExtractFramesResult {
  framePaths: string[];
  thumbnailPath: string;
}

export async function extractFramesAndThumbnail(
  args: ExtractFramesArgs,
): Promise<ExtractFramesResult> {
  await mkdir(args.outDir, { recursive: true });

  const fps = args.durationSeconds <= 30 ? 0.5 : 0.25;
  const cap = 60;
  // -frames:v cap, scale to 512w to control image-token cost (per /watch skill default).
  await runFfmpeg([
    '-y',
    '-i', args.videoPath,
    '-vf', `fps=${fps},scale=512:-2`,
    '-frames:v', String(cap),
    '-q:v', '3',
    join(args.outDir, 'frame_%04d.jpg'),
  ]);

  const thumbnailPath = join(args.outDir, 'thumbnail.jpg');
  await runFfmpeg([
    '-y',
    '-ss', '1',
    '-i', args.videoPath,
    '-frames:v', '1',
    '-vf', 'scale=480:-2',
    '-q:v', '4',
    thumbnailPath,
  ]);

  const entries = await readdir(args.outDir);
  const framePaths = entries
    .filter((n) => /^frame_\d+\.jpg$/.test(n))
    .sort()
    .map((n) => join(args.outDir, n));

  return { framePaths, thumbnailPath };
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/render-worker/lib/frames.ts
git commit -m "feat(worker): add frame + thumbnail extraction lib for clip ingest"
```

---

## Task 14: Worker — Claude vision lib

**Files:**
- Create: `scripts/render-worker/lib/claude-vision.ts`

Worker uses AI SDK v6 directly. Reads `ANTHROPIC_API_KEY` from env (pass into Sandbox in Task 16).

- [ ] **Step 1: Implement**

```ts
// scripts/render-worker/lib/claude-vision.ts
//
// Calls Claude Haiku 4.5 with the extracted frames + transcript and returns
// a structured {description, tags} object constrained to the niche tag vocabulary.
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import { readFile } from 'node:fs/promises';

export const ClipDescriptionSchema = z.object({
  description: z.string().min(1).max(800),
  tags: z.array(z.string()).max(10),
});
export type ClipDescription = z.infer<typeof ClipDescriptionSchema>;

export async function describeClipFromFrames(args: {
  framePaths: string[];
  transcript: string | null;
  nicheSlug: string;
  nicheTagVocabulary: string[];
}): Promise<ClipDescription> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY must be set');
  const anthropic = createAnthropic({ apiKey });
  const model = anthropic('claude-haiku-4-5');

  const frameBuffers = await Promise.all(args.framePaths.map((p) => readFile(p)));
  const vocab = args.nicheTagVocabulary.length > 0
    ? `Choose tags from this vocabulary only: ${args.nicheTagVocabulary.join(', ')}.`
    : `Tags should be 1-3-word lowercase snake_case strings relevant to the ${args.nicheSlug} niche.`;

  const result = await generateObject({
    model,
    schema: ClipDescriptionSchema,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              `You are analyzing a short clip for a "${args.nicheSlug}" content channel.`,
              ``,
              `Frames are extracted at fixed intervals; treat them as a storyboard.`,
              args.transcript ? `Transcript:\n${args.transcript.slice(0, 4000)}` : `Transcript: (no captions/audio available)`,
              ``,
              `Produce JSON with:`,
              `- description: a one-paragraph factual summary of what happens in the clip (max 800 chars). No editorializing.`,
              `- tags: 3-6 short tags. ${vocab}`,
            ].join('\n'),
          },
          ...frameBuffers.map((buf) => ({
            type: 'image' as const,
            image: buf,
          })),
        ],
      },
    ],
  });
  return result.object;
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/render-worker/lib/claude-vision.ts
git commit -m "feat(worker): add Claude vision lib for clip description + tag generation"
```

---

## Task 15: Worker — clip_ingest handler (real impl)

**Files:**
- Replace: `scripts/render-worker/handlers/clip-ingest.ts`

Mirrors `render-f1`'s trace pattern (Phase 2 lesson #3): accumulate a trace string, throw `ClipIngestError` on failure with the trace attached so the callback handler can persist it.

- [ ] **Step 1: Implement**

```ts
// scripts/render-worker/handlers/clip-ingest.ts
//
// Phase 3: full clip_ingest handler.
//   1. yt-dlp download + auto-subs
//   2. ffprobe metadata
//   3. ffmpeg frame extraction + thumbnail
//   4. Whisper fallback transcript (only if no auto-subs)
//   5. Claude Haiku vision → {description, tags}
//   6. Blob upload (clip + thumb)
//   7. Return output for callback to insert clip_library row
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, stat, readFile } from 'node:fs/promises';
import { put } from '@vercel/blob';
import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadVideoAndAutoSubs } from '../lib/yt-dlp.ts';
import { probeDurationSeconds } from '../lib/probe.ts';
import { extractFramesAndThumbnail } from '../lib/frames.ts';
import { transcribeWavWithWordTimestamps } from '../lib/whisper.ts';
import { describeClipFromFrames } from '../lib/claude-vision.ts';

export class ClipIngestError extends Error {
  constructor(message: string, public trace: string) {
    super(message);
    this.name = 'ClipIngestError';
  }
}

interface ProbeResult {
  durationSeconds: number;
  width: number | null;
  height: number | null;
}

async function probeFull(videoPath: string): Promise<ProbeResult> {
  // Lean on duration probe + ffmpeg-style width/height parsing in one shell call.
  // For Phase 3 simplicity we only need duration here; width/height come from
  // probeWidthHeight (added inline below) using ffprobe binary directly.
  const durationSeconds = await probeDurationSeconds(videoPath);
  const { width, height } = await probeWidthHeight(videoPath);
  return { durationSeconds, width, height };
}

async function probeWidthHeight(videoPath: string): Promise<{ width: number | null; height: number | null }> {
  const ffprobeMod = await import('@ffprobe-installer/ffprobe');
  const { spawn } = await import('node:child_process');
  return await new Promise((resolve) => {
    const cp = spawn(ffprobeMod.default.path, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=s=x:p=0',
      videoPath,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    cp.stdout.on('data', (b) => { out += b.toString(); });
    cp.on('close', () => {
      const m = out.trim().match(/^(\d+)x(\d+)$/);
      resolve(m ? { width: Number(m[1]), height: Number(m[2]) } : { width: null, height: null });
    });
  });
}

async function blobUpload(localPath: string, blobPath: string, contentType: string): Promise<string> {
  const buf = await readFile(localPath);
  const blob = await put(blobPath, buf, {
    access: 'public',
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return blob.url;
}

export async function runClipIngest(
  job: { id: string; payload: unknown },
  _supabase: SupabaseClient,
): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  const trace: string[] = [];
  const log = (msg: string) => {
    const line = `[clip_ingest] +${Date.now() - t0}ms ${msg}`;
    console.log(line);
    trace.push(line);
  };

  try {
    return await ingestInternal();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAILED: ${msg}`);
    throw new ClipIngestError(msg, trace.join('\n'));
  }

  async function ingestInternal(): Promise<Record<string, unknown>> {
    const payload = job.payload as {
      source_url: string;
      source_creator: string | null;
      niche_id: string;
      channel_id: string;
      added_by?: 'reddit_ingest' | 'manual';
      post_metadata?: unknown;
    };

    const workDir = await mkdtemp(join(tmpdir(), 'clip-ingest-'));
    const videoPath = join(workDir, 'clip.mp4');

    // 1) yt-dlp download + auto-subs
    log(`downloading ${payload.source_url}`);
    const { autoSubtitlesText } = await downloadVideoAndAutoSubs({
      sourceUrl: payload.source_url,
      outputPath: videoPath,
    });
    const videoStat = await stat(videoPath);
    log(`downloaded ${(videoStat.size / 1024 / 1024).toFixed(1)}MB; auto-subs=${autoSubtitlesText ? autoSubtitlesText.length + 'c' : 'none'}`);

    // 2) Probe
    const probe = await probeFull(videoPath);
    log(`probed: ${probe.durationSeconds}s ${probe.width}x${probe.height}`);
    if (probe.durationSeconds > 600) throw new Error(`duration ${probe.durationSeconds}s exceeds 600s cap`);
    if (probe.width && probe.height && probe.width / probe.height > 16 / 9 + 0.01) {
      throw new Error(`aspect ${probe.width}x${probe.height} wider than 16:9 — vertical/square only`);
    }

    // 3) Frames + thumbnail
    const framesDir = join(workDir, 'frames');
    const { framePaths, thumbnailPath } = await extractFramesAndThumbnail({
      videoPath, durationSeconds: probe.durationSeconds, outDir: framesDir,
    });
    log(`extracted ${framePaths.length} frames + 1 thumb`);

    // 4) Transcript: prefer auto-subs, else Whisper
    let transcript: string | null = autoSubtitlesText;
    if (!transcript) {
      try {
        // Whisper helper needs a WAV; the clip is mp4. Use ffmpeg to extract WAV.
        const wavPath = join(workDir, 'audio.wav');
        await extractWav(videoPath, wavPath);
        const { words } = await transcribeWavWithWordTimestamps(wavPath);
        transcript = words.map((w) => w.word).join(' ');
        log(`whisper fallback transcribed ${words.length} words`);
      } catch (err) {
        log(`whisper failed; continuing without transcript: ${(err as Error).message}`);
        transcript = null;
      }
    }

    // 5) Claude vision → description + tags
    const desc = await describeClipFromFrames({
      framePaths,
      transcript,
      nicheSlug: 'cars', // Phase 3 single-niche; future: look up niche.slug from niche_id
      nicheTagVocabulary: [], // Phase 3 tolerates empty
    });
    log(`described: tags=[${desc.tags.join(',')}] desc.len=${desc.description.length}`);

    // 6) Blob upload (clip + thumb)
    const clipBlobUrl = await blobUpload(videoPath, `clip-library/${job.id}.mp4`, 'video/mp4');
    const thumbBlobUrl = await blobUpload(thumbnailPath, `clip-library/${job.id}.thumb.jpg`, 'image/jpeg');
    log(`uploaded clip=${clipBlobUrl} thumb=${thumbBlobUrl}`);

    return {
      source_url: payload.source_url,
      source_platform: 'reddit',
      source_creator: payload.source_creator,
      local_path: clipBlobUrl,
      thumbnail_url: thumbBlobUrl,
      duration_seconds: probe.durationSeconds,
      width: probe.width,
      height: probe.height,
      description: desc.description,
      tags: desc.tags,
      niche_id: payload.niche_id,
      added_by: payload.added_by ?? 'reddit_ingest',
      debug_trace: trace.join('\n'),
    };
  }
}

async function extractWav(srcMp4: string, outWav: string): Promise<void> {
  const ffmpegStatic = (await import('ffmpeg-static')).default;
  if (!ffmpegStatic) throw new Error('ffmpeg-static path missing');
  const { spawn } = await import('node:child_process');
  await new Promise<void>((resolve, reject) => {
    const cp = spawn(ffmpegStatic, [
      '-y', '-i', srcMp4,
      '-ac', '1', '-ar', '16000', '-vn', '-f', 'wav',
      outWav,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    cp.stderr.on('data', (b) => { stderr += b.toString(); });
    cp.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg wav extract exit ${code}: ${stderr.slice(-300)}`)));
  });
}
```

Notes on the implementation:
- `description` field is currently hardcoded to `nicheSlug: 'cars'` and empty vocabulary because Phase 3 is single-niche. Phase 4 will plumb through a real lookup when more niches activate.
- The Whisper fallback path uses ffmpeg-static to extract WAV (the existing `transcribeWavWithWordTimestamps` requires WAV input).
- All sanity checks (env, binary presence) happen inside the function call, never at module scope (Phase 2 lesson #4).

- [ ] **Step 2: Commit**

```bash
git add scripts/render-worker/handlers/clip-ingest.ts
git commit -m "feat(worker): full clip_ingest handler with yt-dlp + frames + vision"
```

---

## Task 16: Wire clip_ingest into worker run.ts + Sandbox env

**Files:**
- Modify: `scripts/render-worker/run.ts`
- Modify: `src/lib/render/workers/vercel-sandbox.ts`

- [ ] **Step 1: Update run.ts to pass (job, supabase) + propagate ClipIngestError**

Replace the dispatch + error branches in `run.ts`:

```ts
import { runClipIngest, ClipIngestError } from './handlers/clip-ingest.ts';
import { runRenderF1, RenderF1Error } from './handlers/render-f1.ts';
// ... other imports unchanged

async function main() {
  const supabase = getSupabase();
  const { data: job, error } = await supabase
    .from('render_jobs').select('*').eq('id', jobId).single();
  if (error || !job) {
    await postCallback({
      jobId, jobToken, sandboxInvocationId,
      result: { status: 'failed', error: `job not found: ${error?.message ?? 'no row'}` },
    });
    return;
  }
  try {
    let output: Record<string, unknown>;
    switch (job.job_type) {
      case 'clip_ingest':  output = await runClipIngest(job, supabase); break;
      case 'render_f1':    output = await runRenderF1(job, supabase); break;
      case 'render_f2':    output = await runRenderF2(); break;
      case 'upload':       output = await runUpload(); break;
      default: throw new Error(`unknown job_type: ${job.job_type}`);
    }
    await postCallback({ jobId, jobToken, sandboxInvocationId, result: { status: 'succeeded', output } });
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
    const trace =
      err instanceof RenderF1Error ? err.trace
      : err instanceof ClipIngestError ? err.trace
      : undefined;
    await postCallback({
      jobId, jobToken, sandboxInvocationId,
      result: { status: 'failed', error: msg, output: trace ? { debug_trace: trace } : undefined },
    });
  }
}
```

- [ ] **Step 2: Add ANTHROPIC_API_KEY to Sandbox env propagation**

Edit `src/lib/render/workers/vercel-sandbox.ts` — in `sandboxEnv`, add:

```ts
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
```

(next to the existing CARTESIA_API_KEY / GROQ_API_KEY entries).

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add scripts/render-worker/run.ts src/lib/render/workers/vercel-sandbox.ts
git commit -m "feat(worker): wire clip_ingest into dispatch + pass ANTHROPIC_API_KEY to sandbox"
```

---

## Task 17: Callback handler — clip_ingest success branch

**Files:**
- Modify: `src/app/api/render/complete/route.ts`

On `succeeded` + output has `local_path` and `source_url`, insert a `clip_library` row. Same trace-persistence behavior as render_f1.

- [ ] **Step 1: Update the success branch**

Add a `clip_ingest` clause inside the `body.result.status === 'succeeded'` block:

```ts
  if (body.result.status === 'succeeded') {
    const rows = await markJobSucceeded(supabase, { jobId: body.job_id });
    if (rows > 0) {
      const out = body.result.output;
      const trace = typeof out.debug_trace === 'string' ? out.debug_trace : null;

      // render_f1 — existing behavior
      if ('render_artifact_url' in out) {
        const url = out.render_artifact_url as string;
        const { data: jobRow } = await supabase
          .from('render_jobs').select('your_video_id').eq('id', body.job_id).single();
        if (jobRow?.your_video_id) {
          await supabase
            .from('your_videos')
            .update({ render_artifact_url: url, status: 'rendered', updated_at: new Date().toISOString() })
            .eq('id', jobRow.your_video_id);
        }
      }

      // clip_ingest — new behavior
      if ('source_url' in out && 'local_path' in out) {
        const { data: inserted, error: insErr } = await supabase
          .from('clip_library')
          .insert({
            source_url: out.source_url,
            source_platform: out.source_platform,
            source_creator: out.source_creator ?? null,
            local_path: out.local_path,
            duration_seconds: out.duration_seconds,
            width: out.width,
            height: out.height,
            description: out.description ?? null,
            tags: out.tags ?? [],
            niche_id: out.niche_id ?? null,
            added_by: out.added_by ?? 'reddit_ingest',
          })
          .select('id')
          .single();
        if (insErr && insErr.code !== '23505') {
          // 23505 = unique_violation on source_url — idempotent on duplicate callback
          console.error('clip_library insert failed:', insErr);
        }
        if (inserted) {
          await supabase
            .from('render_jobs')
            .update({ clip_library_id: inserted.id })
            .eq('id', body.job_id);
        }
      }

      // Persist trace (Phase 2 carryover for diagnostics)
      if (trace) {
        await supabase
          .from('render_jobs')
          .update({ last_error: trace })
          .eq('id', body.job_id);
      }
    }
  } else {
    // ... (existing failed branch unchanged — trace already appended)
```

- [ ] **Step 2: Build + commit**

```bash
npm run build
git add src/app/api/render/complete/route.ts
git commit -m "feat(render): callback inserts clip_library row on clip_ingest success"
```

---

## Task 18: /clips page + Inbox tab (server component)

**Files:**
- Create: `src/app/clips/page.tsx`
- Create: `src/components/clips/inbox-tab.tsx`

- [ ] **Step 1: Page shell**

`src/app/clips/page.tsx`:

```tsx
import { CockpitShell } from "@/components/cockpit/cockpit-shell";
import { InboxTab } from "@/components/clips/inbox-tab";

export const dynamic = "force-dynamic";

export default async function ClipsPage() {
  return (
    <CockpitShell>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">Clips</h1>
          <p className="text-text-secondary text-sm mt-1">
            Auto-ingested clips ready for Format-2 compilations. Block low-signal sources here.
          </p>
        </header>
        <InboxTab />
      </div>
    </CockpitShell>
  );
}
```

- [ ] **Step 2: Inbox tab (server component, fetches data)**

`src/components/clips/inbox-tab.tsx`:

```tsx
import { getServiceClient } from "@/lib/supabase/server";
import { listInboxClips } from "@/lib/supabase/repositories/clip-library";
import { ClipCard } from "@/components/clips/clip-card";
import { IngestUrlInput } from "@/components/clips/ingest-url-input";

export async function InboxTab() {
  const supabase = getServiceClient();
  const clips = await listInboxClips(supabase, { limit: 60 });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Inbox ({clips.length})</h2>
        <IngestUrlInput />
      </div>
      {clips.length === 0 ? (
        <p className="text-text-secondary text-sm border border-dashed border-border rounded p-6 text-center">
          No clips yet. The reddit-clip-discovery cron runs every 30 minutes and writes here.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clips.map((clip) => <ClipCard key={clip.id} clip={clip} />)}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Commit (the children — ClipCard, IngestUrlInput, BlockSourceModal — land in Task 19)**

Build will fail until Task 19 lands. Defer commit until then.

---

## Task 19: ClipCard + BlockSourceModal + IngestUrlInput (client components)

**Files:**
- Create: `src/components/clips/clip-card.tsx`
- Create: `src/components/clips/block-source-modal.tsx`
- Create: `src/components/clips/ingest-url-input.tsx`
- Modify: `src/components/cockpit/cockpit-shell.tsx` (add /clips nav link)

- [ ] **Step 1: ClipCard**

```tsx
"use client";
import { useState } from "react";
import type { ClipLibraryRow } from "@/lib/supabase/repositories/clip-library";
import { BlockSourceModal } from "@/components/clips/block-source-modal";

const REDDIT_PERMALINK_RE = /reddit\.com\/(r\/[^/]+)\/comments\/([^/?#]+)/i;

function parseSubredditFromUrl(url: string): string | null {
  const m = url.match(/reddit\.com\/r\/([^/?#]+)/i);
  return m ? m[1] : null;
}

export function ClipCard({ clip }: { clip: ClipLibraryRow }) {
  const [showBlock, setShowBlock] = useState(false);
  const subreddit = clip.source_platform === "reddit" ? parseSubredditFromUrl(clip.source_url) : null;
  const author = clip.source_creator?.replace(/^u\//, "") ?? null;
  const thumbnailUrl = clip.local_path.replace(/\.mp4$/, ".thumb.jpg");

  return (
    <article className="border border-border rounded overflow-hidden flex flex-col bg-surface-1">
      <video
        src={clip.local_path}
        poster={thumbnailUrl}
        controls
        preload="none"
        className="aspect-[9/16] w-full bg-black object-cover"
      />
      <div className="p-3 flex flex-col gap-2 text-sm">
        <p className="text-text-primary line-clamp-3">{clip.description ?? "(no description)"}</p>
        <div className="flex flex-wrap gap-1">
          {clip.tags.map((t) => (
            <span key={t} className="text-xs bg-surface-2 px-2 py-0.5 rounded">{t}</span>
          ))}
        </div>
        <div className="text-text-secondary text-xs flex flex-col gap-0.5">
          <a href={clip.source_url} target="_blank" rel="noreferrer" className="hover:underline truncate">
            {clip.source_url}
          </a>
          <span>{clip.source_platform}{author ? ` · u/${author}` : ""}{subreddit ? ` · r/${subreddit}` : ""} · {Math.round(clip.duration_seconds)}s</span>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => setShowBlock(true)}
            disabled={!subreddit && !author}
            className="text-xs border border-border rounded px-2 py-1 hover:bg-surface-2 disabled:opacity-50"
          >
            Block source
          </button>
        </div>
      </div>
      {showBlock && subreddit && (
        <BlockSourceModal
          clipId={clip.id}
          subreddit={subreddit}
          author={author}
          onClose={() => setShowBlock(false)}
        />
      )}
    </article>
  );
}
```

- [ ] **Step 2: BlockSourceModal**

```tsx
"use client";
import { useState } from "react";

interface Props {
  clipId: string;
  subreddit: string;
  author: string | null;
  onClose: () => void;
}

export function BlockSourceModal({ clipId, subreddit, author, onClose }: Props) {
  const [choice, setChoice] = useState<"subreddit" | "author">("subreddit");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true); setErr(null);
    try {
      const res = await fetch("/api/clips/block", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourcePlatform: "reddit",
          identifierType: choice,
          identifier: choice === "subreddit" ? subreddit : author,
          reason: reason || undefined,
          softDeleteClipId: clipId,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      // Hard reload to refresh the server-rendered list.
      window.location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "block failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface-1 border border-border rounded p-4 max-w-sm w-full space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-medium">Block source</h3>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={choice === "subreddit"} onChange={() => setChoice("subreddit")} />
            Block r/{subreddit}
          </label>
          {author && (
            <label className="flex items-center gap-2">
              <input type="radio" checked={choice === "author"} onChange={() => setChoice("author")} />
              Block u/{author}
            </label>
          )}
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="w-full bg-surface-2 border border-border rounded p-2 text-sm"
          rows={2}
        />
        {err && <p className="text-red-400 text-xs">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={submitting} className="text-xs border border-border rounded px-3 py-1.5">Cancel</button>
          <button type="button" onClick={submit} disabled={submitting} className="text-xs bg-text-primary text-surface-0 rounded px-3 py-1.5 disabled:opacity-50">
            {submitting ? "Blocking…" : "Block"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: IngestUrlInput**

```tsx
"use client";
import { useState } from "react";

export function IngestUrlInput() {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setMsg(null);
    try {
      const res = await fetch("/api/clips/ingest-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setMsg(`Enqueued (job ${j.jobId})`);
      setUrl("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "enqueue failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        type="url"
        required
        placeholder="Ingest URL manually"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="bg-surface-2 border border-border rounded px-3 py-1.5 text-sm w-80"
      />
      <button type="submit" disabled={submitting || !url} className="text-xs border border-border rounded px-3 py-1.5 hover:bg-surface-2 disabled:opacity-50">
        {submitting ? "…" : "Ingest"}
      </button>
      {msg && <span className="text-xs text-text-secondary">{msg}</span>}
    </form>
  );
}
```

- [ ] **Step 4: Cockpit nav — add /clips link**

Find the existing nav link rendering in `src/components/cockpit/cockpit-shell.tsx` (look for the existing `/lab` link) and add a sibling `/clips` link with matching styling. The implementer should match the file's current pattern (likely a `<Link href="/lab">` element in a `<nav>`).

- [ ] **Step 5: Build + smoke locally**

```bash
npm run build
```

Expected: build passes. Optionally, `npm run dev` and open http://localhost:3000/clips — should render empty-state.

- [ ] **Step 6: Commit (covers Tasks 18 + 19)**

```bash
git add src/app/clips src/components/clips src/components/cockpit/cockpit-shell.tsx
git commit -m "feat(clips): /clips Inbox tab with ClipCard, BlockSourceModal, IngestUrlInput"
```

---

## Task 20: Type-check + full test pass

**Files:** (none modified — guard rail only)

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: previous baseline + 6 new tests added in tasks 3, 4, 6, 7, 10, 11 → roughly 175+ tests passing. The 11 pre-existing env-validation failures stay.

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: If anything fails, fix forward**

Do not skip or weaken tests. Phase 2 lesson #4: if a test failure is caused by a module-level side effect that breaks under test mocking, fix the test-time guard inside the function, not at module top.

- [ ] **Step 4: Commit any fixes**

```bash
git commit -am "chore: fixups from Phase 3 build+test gate" # only if fixes were needed
```

---

## Task 21: Deploy + production smoke + acceptance gate

**Files:** (operational; no code changes unless smoke surfaces a bug)

- [ ] **Step 1: Push branch + open PR**

```bash
git push -u origin plan-4-phase-3
gh pr create --title "Plan #4 Phase 3 — Reddit clip ingest + /clips Inbox" --body "$(cat <<'EOF'
## Summary
- Adds reddit-clip-discovery cron + Stage-1 Haiku triage
- Adds clip_ingest Sandbox handler (yt-dlp + frames + Claude vision)
- Adds /clips page Inbox tab with Block-source + manual-URL controls

## Test plan
- [ ] CI passes (~175 tests)
- [ ] After merge: cron fires within 30 min and writes ≥1 clip_library row
- [ ] /clips Inbox renders the row with preview + tags
- [ ] Block source modal soft-deletes + prevents re-ingest from that source
- [ ] Per-clip cost on Vercel logs stays ≤$0.70

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Wait for CI; merge to main**

```bash
gh pr checks --watch
gh pr merge --squash --delete-branch
```

- [ ] **Step 3: Confirm prod deployment**

```bash
gh run list --workflow=deploy --limit 1
# or: vercel inspect <deployment-url>
```

- [ ] **Step 4: Trigger the cron manually (Vercel cron only fires on Production — Phase 1 lesson)**

```bash
curl -X GET 'https://shorts-os-roan.vercel.app/api/cron/reddit-clip-discovery' \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expected: 200 OK with `{ ok: true, channelsProcessed, channelsAtCap, enqueued, skipped }`.

- [ ] **Step 5: Watch the queue**

Run repeatedly for 5-10 minutes until at least one `clip_ingest` job transitions through `claimed → running → succeeded`:

```sql
-- in Supabase SQL editor or via psql
select id, job_type, status, attempts, last_error, finished_at - started_at as elapsed
from render_jobs
where job_type = 'clip_ingest'
order by created_at desc
limit 5;
```

- [ ] **Step 6: Verify clip_library row + cost**

```sql
select id, source_url, source_creator, duration_seconds, width, height,
       length(description) as desc_len, tags, added_at, added_by
from clip_library
order by added_at desc limit 5;
```

Expected: ≥1 row. Then read the matching `render_jobs.last_error` for the trace and estimate cost (Haiku tokens × $0.80/Mtok ≤ $0.70/clip).

- [ ] **Step 7: Open /clips in a browser**

Open https://shorts-os-roan.vercel.app/clips. Expected: the new clip appears as a card with thumbnail (poster), description, tags, source link.

- [ ] **Step 8: Test the Block flow**

Click **Block source** on any card → choose Block r/<subreddit> → submit. Expected:
- POST `/api/clips/block` returns 200.
- Page reloads; the clip is gone.
- Trigger the cron again; in the next tick no clip from that subreddit re-ingests.

- [ ] **Step 9: Test the manual-URL flow**

Enter a Reddit video URL into the "Ingest URL manually" input. Expected: returns `jobId`; within a couple minutes the clip appears in Inbox.

- [ ] **Step 10: Write the Phase 3 benchmark note**

Create `docs/superpowers/notes/2026-05-26-plan-4-phase-3-benchmark.md` mirroring the Phase 2 benchmark doc structure: per-stage timing of one clip_ingest job (from `last_error` trace), measured Claude cost, any adaptation notes that surfaced during smoke. If the smoke uncovered new bugs, list them with the commit that fixed each.

Commit:

```bash
git checkout main && git pull
git add docs/superpowers/notes/2026-05-26-plan-4-phase-3-benchmark.md
git commit -m "docs(plan-4): Phase 3 benchmark + acceptance gate PASS"
git push origin main
```

**Acceptance gate (PASS ⇒ stop; FAIL ⇒ stop and report):**
- [x] Cron returns 200 OK and enqueues ≥1 clip_ingest job within 30 minutes of being active.
- [x] ≥1 `clip_library` row exists with non-null description, ≥1 tag, valid Blob URL.
- [x] `/clips` Inbox renders that row with playable preview.
- [x] Block source modal soft-deletes and prevents re-ingest from that source.
- [x] `vercel logs` show per-clip cost ≤$0.70 (Haiku tokens × public rate).

---

## Notes for the implementing agents

1. **Don't catch up on Phase 2 lessons after each task** — re-read this plan's intro before writing worker code. Tasks 12–17 are where Phase 2's silent-crash hazards bite hardest.
2. **The cars channel + niches.subreddits seed is already correct** — no migration in this phase. Operator already confirmed the 8-subreddit default list in `20260525000003_reseed_dyfrx_channel.sql`.
3. **Single-niche assumption is OK for Phase 3** — `clip_ingest` handler hardcodes `nicheSlug: 'cars'` in the Claude vision call. Phase 4's Composer + multi-niche support will plumb the real lookup through.
4. **decisions table writes are deferred** — the Stage-1 scorer doesn't write a `decisions` row in this phase. The spec's "every Claude-call agent writes a decisions row" rule applies to Strategist/Director/Voice-Coach/Writer; the Stage-1 triage is an internal triage call (analogous to the existing `scoreTopic` helper which also doesn't write decisions). If retrofitting later, add a `clip_triage` `agent_id` and standard decisions insert. **Do not block Phase 3 on this.**
5. **Cost ceiling enforcement is at the cron, not the worker** — `max_clip_ingest_per_day` in `channels` (default 10) caps Stage-2 spend. Stage-1 spend is bounded by the cadence × subreddit count × posts/sub.
6. **If yt-dlp fails on TikTok**, the discovery cron's `looksLikeVideo()` already includes a TikTok pattern but TikAPI-routed ingest is a Phase 4+ enhancement. For Phase 3 expect v.redd.it as the dominant source.

---

## Self-review (post-write)

**Spec coverage:**
- §4 Reddit discovery loop → Task 7 (pure-fn) + Task 8 (route) + Task 9 (cron)
- §4 clip_ingest 7-step handler → Tasks 12–15
- §4 Stage-1 triage + threshold → Tasks 2, 6
- §4 /clips Inbox + Block + manual-URL → Tasks 10, 11, 18, 19
- §4 ingest_blocklist + ingest_skip_log → Tasks 4, 5
- §4 clip_library auto-insert via callback → Task 17
- §1 schema → no new migration needed (already shipped)
- Acceptance gate from outline → Task 21

**Placeholder scan:** No TBDs. Every code step contains the actual content. The only deferred items are explicit Phase 4+ punts called out in §Notes (multi-niche vocabulary lookup; decisions-row for stage-1).

**Type consistency:** `ClipIngestError`, `Stage1ScoreSchema`, `ClipLibraryInsert`, `runRedditClipDiscovery` signatures, and `enqueueClipIngestJob` repo shape are referenced consistently across Tasks 6/7/8/15/17.
