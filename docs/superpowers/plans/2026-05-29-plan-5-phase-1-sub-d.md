# Plan #5 Phase 1 Sub-phase D — Classifier + Clustering + Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Sub-phase C's raw `shorts_observations` into ranked niches — a two-pass vision+transcript LLM classifier, embeddings-based topic clustering, a renormalizing niche scorer with two-band/MMR digest selection, plus the `/admin/ingestion-health` and `/admin/classification-review` QC pages.

**Architecture:** Pipeline = ingestion (C) → `classify-observations` cron → `cluster-niches` weekly cron (cluster → score → digest-select). All LLM/embedding calls go through the Vercel AI Gateway (`gateway()` from `ai`, reading `AI_GATEWAY_API_KEY`). Pure logic (classifier orchestration, cosine/MMR clustering, scoring) lives in injectable, unit-tested libs; thin cron routes + a shared job registry wire clients/repos and wrap everything in `runWithIngestionLog`. Two admin pages read/write existing tables via the design-system `AppShell`.

**Tech Stack:** Next.js 16 (App Router, route handlers), TypeScript strict (no `any` in source), AI SDK v6 (`ai` 6.0.191) via `@ai-sdk/gateway`, Supabase (service-role client), Vitest (mock `ai`), Tailwind v4 + shadcn design system.

**Spec:** `docs/superpowers/specs/2026-05-29-plan-5-phase-1-sub-d-design.md` — read it before starting.

**Conventions to mirror (read these files first):**
- Repo pattern: `src/lib/supabase/repositories/shorts-classifications.ts` (camelCase params → snake_case columns, `throw new Error('fnName: ' + error.message)`, `maybeSingle` for nullable).
- Adapter pattern: `src/lib/ingestion/youtube-shorts-search.ts` (injected `client`/`repo`, returns `AdapterResult`, never throws on per-item failure — increments counters).
- Cron route pattern: `src/app/api/cron/youtube-shorts-search/route.ts` (`assertCronAuth`, `getServiceClient`, env assert, `runWithIngestionLog`, `scraperLog`/`serializeError`, `maxDuration = 300`).
- Run wrapper: `src/lib/ingestion/run.ts` (`AdapterResult`, `runWithIngestionLog`).
- Test pattern: `src/tests/lib/agents/voice-coach.test.ts` (`vi.mock("ai")` keeping `importActual`, then `vi.mocked(generateObject)`).
- Design system: `src/components/layout/{app-shell,sidebar,page-header}.tsx`; composition example `src/app/sandbox/components/sandbox-client.tsx:1376`.

**Global rules:** TS strict, no `any` in source (test fixtures may use `as any` sparingly, matching the codebase). Prod migrations are operator-gated — STOP and get Darius's in-chat OK before any `apply_migration`. Tests that hit the live gateway/DB stay env-gated (skip when keys blank).

---

## Task ordering & dependencies

1. Migrations + `IngestionJob` union (foundation)
2. AI Gateway model config
3. Transcript client (timedtext)
4. Classifier taxonomy (format→fit, enums)
5. Classifier library (two-pass)
6. Repo additions (classification-samples, observation queries)
7. `classify-observations` cron + adapter
8. Embedding cache repo + clustering library
9. Scoring library (niche_score + two-band/MMR)
10. Scoring components + niche-clusters repo `replaceWeek`
11. `cluster-niches` cron + adapter
12. Manual-trigger registry + `POST /api/admin/trigger-ingestion`
13. `/admin/ingestion-health` page
14. `/admin/classification-review` page
15. Register crons + full verification + handoff

Dependencies: Tasks 2–6 are mutually independent (the libs need only Task 1's types; the crons in T7/T11 need Task 1's union). T8 and T9 depend on T4 (taxonomy). T10 depends on T9. T11 depends on T8+T10. T13 depends on T12 (trigger) + T1. T14 depends on T6 (samples repo). Sequence as listed for subagent-driven execution.

---

## Task 1: Migrations + IngestionJob union extension

**Files:**
- Create: `supabase/migrations/20260529000001_topic_embeddings.sql`
- Create: `supabase/migrations/20260529000002_ingestion_runs_add_jobs.sql`
- Modify: `src/lib/supabase/repositories/ingestion-runs.ts:4-10` (extend `IngestionJob`)
- Modify (regenerate): `src/lib/supabase/types.ts`

- [ ] **Step 1: Write the `topic_embeddings` migration**

`supabase/migrations/20260529000001_topic_embeddings.sql`:
```sql
-- Cross-run cache of topic_label embeddings (Sub-phase D clustering fuzzy-merge).
-- Plain jsonb float[] — no pgvector; weekly batch scale is trivial.
create table if not exists public.topic_embeddings (
  topic_label text primary key,
  model       text not null,
  embedding   jsonb not null,
  created_at  timestamptz not null default now()
);
```

- [ ] **Step 2: Write the `ingestion_runs` job-constraint migration**

The `classify_observations` + `cluster_niches` jobs reuse `runWithIngestionLog`, so they must be valid `ingestion_runs.job` values. `supabase/migrations/20260529000002_ingestion_runs_add_jobs.sql`:
```sql
-- Sub-phase D processing jobs log into ingestion_runs too (powers /admin/ingestion-health).
alter table public.ingestion_runs drop constraint if exists ingestion_runs_job_check;
alter table public.ingestion_runs add constraint ingestion_runs_job_check
  check (job in (
    'youtube_category_sweep','youtube_shorts_search','watch_list_sync',
    'reddit_topic_discovery','google_trends','tiktok_creative_center',
    'classify_observations','cluster_niches'
  ));
```
> Note: the original constraint is auto-named `ingestion_runs_job_check` by Postgres (column `check (...)` inline). Verify the name on prod with `select conname from pg_constraint where conrelid = 'public.ingestion_runs'::regclass and contype='c';` before relying on the `drop`. If named differently, drop that name.

- [ ] **Step 3: Extend the `IngestionJob` union**

`src/lib/supabase/repositories/ingestion-runs.ts`, replace the `IngestionJob` type:
```ts
export type IngestionJob =
  | 'youtube_category_sweep'
  | 'youtube_shorts_search'
  | 'watch_list_sync'
  | 'reddit_topic_discovery'
  | 'google_trends'
  | 'tiktok_creative_center'
  | 'classify_observations'
  | 'cluster_niches';
```

- [ ] **Step 4: Verify constraint name on prod, then get sign-off + apply**

Run (read-only) via Supabase MCP `execute_sql` on prod `jfmjppzjicvbpnlkmxbg`:
```sql
select conname from pg_constraint
where conrelid = 'public.ingestion_runs'::regclass and contype = 'c';
```
Expected: a row like `ingestion_runs_job_check`. Adjust Step 2's `drop constraint` to the actual name if different.

**CHECKPOINT — operator-gated:** Surface to Darius: "About to apply migrations `topic_embeddings` and `ingestion_runs_add_jobs` to prod `jfmjppzjicvbpnlkmxbg`." Wait for in-chat OK. Then apply both via `apply_migration` (one per migration, names matching the files).

- [ ] **Step 5: Regenerate types**

After apply, regenerate `src/lib/supabase/types.ts` via Supabase MCP `generate_typescript_types` (project `jfmjppzjicvbpnlkmxbg`) and overwrite the file. Confirm `topic_embeddings` Row/Insert/Update types appear.

- [ ] **Step 6: Verify compile**

Run: `npx tsc --noEmit`
Expected: clean (the new union value is now usable; no call sites break).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260529000001_topic_embeddings.sql supabase/migrations/20260529000002_ingestion_runs_add_jobs.sql src/lib/supabase/repositories/ingestion-runs.ts src/lib/supabase/types.ts
git commit -m "feat(plan-5-d): topic_embeddings table + classify/cluster ingestion jobs"
```

---

## Task 2: AI Gateway model config

**Files:**
- Create: `src/lib/ai/models.ts`
- Test: `src/tests/lib/ai/models.test.ts`

- [ ] **Step 1: Write the failing test**

`src/tests/lib/ai/models.test.ts`:
```ts
import { describe, it, expect, afterEach, vi } from "vitest";

describe("ai/models config", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it("defaults to the spec model strings", async () => {
    const m = await import("@/lib/ai/models");
    expect(m.CLASSIFIER_TOPIC_MODEL).toBe("anthropic/claude-haiku-4-5");
    expect(m.CLASSIFIER_FORMAT_MODEL).toBe("anthropic/claude-haiku-4-5");
    expect(m.EMBEDDING_MODEL).toBe("openai/text-embedding-3-small");
  });

  it("is runtime-swappable via env", async () => {
    vi.stubEnv("CLASSIFIER_TOPIC_MODEL", "openai/gpt-4o-mini");
    vi.resetModules();
    const m = await import("@/lib/ai/models");
    expect(m.CLASSIFIER_TOPIC_MODEL).toBe("openai/gpt-4o-mini");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/ai/models.test.ts`
Expected: FAIL — cannot resolve `@/lib/ai/models`.

- [ ] **Step 3: Write the implementation**

`src/lib/ai/models.ts`:
```ts
import "server-only";
import { gateway } from "ai";
import { loadEnv } from "@/lib/env";

// Runtime-swappable model strings (Vercel AI Gateway "provider/model" form).
export const CLASSIFIER_TOPIC_MODEL = process.env.CLASSIFIER_TOPIC_MODEL ?? "anthropic/claude-haiku-4-5";
export const CLASSIFIER_FORMAT_MODEL = process.env.CLASSIFIER_FORMAT_MODEL ?? "anthropic/claude-haiku-4-5";
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "openai/text-embedding-3-small";

/** Fail loudly when the gateway key is missing (mirrors how crons assert YOUTUBE_API_KEY). */
export function assertGatewayConfigured(): void {
  const env = loadEnv();
  if (!env.AI_GATEWAY_API_KEY) {
    throw new Error("AI_GATEWAY_API_KEY not set — required for the AI Gateway classifier/embeddings");
  }
}

/** Language model handle for generateObject/generateText. */
export function getGatewayModel(modelString: string) {
  return gateway(modelString);
}

/** Text-embedding model handle for embed/embedMany. */
export function getGatewayEmbeddingModel(modelString: string) {
  return gateway.textEmbeddingModel(modelString);
}
```
> `server-only` makes this untestable if imported directly under vitest — but the vitest config aliases `server-only` to an empty module (`vitest.config.ts`), so the import is safe in tests.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/lib/ai/models.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/models.ts src/tests/lib/ai/models.test.ts
git commit -m "feat(plan-5-d): AI Gateway model config (runtime-swappable strings)"
```

---

## Task 3: Transcript client (timedtext)

**Files:**
- Create: `src/lib/clients/youtube-transcript.ts`
- Test: `src/tests/lib/clients/youtube-transcript.test.ts`

Captions come from YouTube's public `timedtext` endpoint, NOT the Data API. Two-stage: (1) read the watch page / `get_video_info` to find a caption track `baseUrl`, (2) fetch the track XML and flatten `<text>` cues. Any failure → `null` (never throws).

- [ ] **Step 1: Write the failing test**

`src/tests/lib/clients/youtube-transcript.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseTimedTextXml, createTranscriptClient } from "@/lib/clients/youtube-transcript";

describe("parseTimedTextXml", () => {
  it("flattens cue segments and decodes entities", () => {
    const xml = `<?xml version="1.0"?><transcript>` +
      `<text start="0" dur="1.5">Hello &amp; welcome</text>` +
      `<text start="1.5" dur="2">to the show&#39;s intro</text>` +
      `</transcript>`;
    expect(parseTimedTextXml(xml)).toBe("Hello & welcome to the show's intro");
  });

  it("returns empty string for no cues", () => {
    expect(parseTimedTextXml(`<transcript></transcript>`)).toBe("");
  });
});

describe("createTranscriptClient.fetchTranscript", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

  it("returns null when no caption track is found", async () => {
    globalThis.fetch = vi.fn(async () => new Response("<html>no captions</html>", { status: 200 })) as typeof fetch;
    const client = createTranscriptClient();
    expect(await client.fetchTranscript("abc123")).toBeNull();
  });

  it("returns null and never throws on network error", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("boom"); }) as typeof fetch;
    const client = createTranscriptClient();
    await expect(client.fetchTranscript("abc123")).resolves.toBeNull();
  });

  it("returns text + language when a track resolves", async () => {
    const trackXml = `<transcript><text start="0">captioned line</text></transcript>`;
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("/watch")) {
        // baseUrl embedded in player response (escaped JSON form)
        const body = `"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=abc123&lang=en","languageCode":"en","kind":"asr"}]`;
        return new Response(body, { status: 200 });
      }
      return new Response(trackXml, { status: 200 });
    }) as typeof fetch;
    const client = createTranscriptClient();
    const res = await client.fetchTranscript("abc123");
    expect(res).toEqual({ text: "captioned line", language: "en", auto_generated: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/clients/youtube-transcript.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/clients/youtube-transcript.ts`:
```ts
import "server-only";

export interface TranscriptResult {
  text: string;
  language: string;
  auto_generated: boolean;
}

export interface TranscriptClient {
  fetchTranscript(videoId: string): Promise<TranscriptResult | null>;
}

const ENTITY: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g, (m) => ENTITY[m] ?? m);
}

/** Flatten timedtext XML (<text start dur>cue</text>) into a single decoded string. */
export function parseTimedTextXml(xml: string): string {
  const cues = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
    decodeEntities(m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).trim(),
  );
  return cues.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

interface CaptionTrack { baseUrl: string; languageCode: string; kind?: string }

/** Extract the best caption track (prefer English, prefer asr/auto) from a watch-page body. */
function pickTrack(watchHtml: string): CaptionTrack | null {
  const m = watchHtml.match(/"captionTracks":(\[.*?\])/s);
  if (!m) return null;
  let tracks: CaptionTrack[];
  try {
    // The embedded JSON uses escaped unicode for & in baseUrl (&). Normalize.
    tracks = JSON.parse(m[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/")) as CaptionTrack[];
  } catch { return null; }
  if (tracks.length === 0) return null;
  const en = tracks.find((t) => t.languageCode?.startsWith("en"));
  return en ?? tracks[0];
}

export function createTranscriptClient(): TranscriptClient {
  return {
    async fetchTranscript(videoId: string): Promise<TranscriptResult | null> {
      try {
        const watch = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
          headers: { "accept-language": "en-US,en;q=0.9", "user-agent": "Mozilla/5.0 (compatible; shorts-os/1.0)" },
        });
        if (!watch.ok) return null;
        const html = await watch.text();
        const track = pickTrack(html);
        if (!track?.baseUrl) return null;
        const trackRes = await fetch(track.baseUrl);
        if (!trackRes.ok) return null;
        const text = parseTimedTextXml(await trackRes.text());
        if (!text) return null;
        return {
          text,
          language: track.languageCode ?? "und",
          auto_generated: track.kind === "asr",
        };
      } catch {
        return null;
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/lib/clients/youtube-transcript.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/clients/youtube-transcript.ts src/tests/lib/clients/youtube-transcript.test.ts
git commit -m "feat(plan-5-d): unofficial timedtext transcript client"
```

---

## Task 4: Classifier taxonomy (format→production_fit + enums)

**Files:**
- Create: `src/lib/classifier/taxonomy.ts`
- Test: `src/tests/lib/classifier/taxonomy.test.ts`

Shared by the classifier (enum validation) and clustering (fit derivation). Re-uses the `FormatLabel`/`AudienceSignal` types from the repo so there is one source of truth.

- [ ] **Step 1: Write the failing test**

`src/tests/lib/classifier/taxonomy.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { FORMAT_LABELS, AUDIENCE_SIGNALS, formatToProductionFit, PRODUCTION_FIT_WEIGHT } from "@/lib/classifier/taxonomy";

describe("taxonomy", () => {
  it("has all 18 format labels", () => {
    expect(FORMAT_LABELS).toHaveLength(18);
    expect(new Set(FORMAT_LABELS).size).toBe(18);
  });

  it("has 7 audience signals", () => {
    expect(AUDIENCE_SIGNALS).toHaveLength(7);
  });

  it("maps every format label to a production_fit", () => {
    for (const f of FORMAT_LABELS) {
      expect(["native", "needs_manual_recording", "needs_manual_editing", "manual_only"])
        .toContain(formatToProductionFit(f));
    }
  });

  it("maps representative labels per the spec table", () => {
    expect(formatToProductionFit("ai_voiceover_facts")).toBe("native");
    expect(formatToProductionFit("talking_head_advice")).toBe("needs_manual_recording");
    expect(formatToProductionFit("pov_skit")).toBe("needs_manual_editing");
    expect(formatToProductionFit("other")).toBe("manual_only");
  });

  it("weights fits native>recording>editing>manual_only", () => {
    expect(PRODUCTION_FIT_WEIGHT.native).toBe(1.0);
    expect(PRODUCTION_FIT_WEIGHT.needs_manual_recording).toBe(0.7);
    expect(PRODUCTION_FIT_WEIGHT.needs_manual_editing).toBe(0.5);
    expect(PRODUCTION_FIT_WEIGHT.manual_only).toBe(0.2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/classifier/taxonomy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/classifier/taxonomy.ts`:
```ts
import type { FormatLabel, AudienceSignal } from "@/lib/supabase/repositories/shorts-classifications";

export type ProductionFit = "native" | "needs_manual_recording" | "needs_manual_editing" | "manual_only";

export const FORMAT_LABELS: readonly FormatLabel[] = [
  "narrated_storytelling", "talking_head_facts", "talking_head_advice",
  "compilation_montage", "transformation_reveal", "ranking_list", "before_after",
  "tutorial_quick", "pov_skit", "screen_record_walkthrough", "ai_voiceover_facts",
  "reaction", "interview_clip", "news_recap", "product_review", "meme_format",
  "live_capture", "other",
] as const;

export const AUDIENCE_SIGNALS: readonly AudienceSignal[] = [
  "seniors", "gen_z", "millennials", "kids", "professionals", "hobbyists", "general",
] as const;

const FIT_BY_FORMAT: Record<FormatLabel, ProductionFit> = {
  ai_voiceover_facts: "native", compilation_montage: "native", ranking_list: "native",
  news_recap: "native", narrated_storytelling: "native",
  talking_head_facts: "needs_manual_recording", talking_head_advice: "needs_manual_recording",
  tutorial_quick: "needs_manual_recording", product_review: "needs_manual_recording",
  transformation_reveal: "needs_manual_editing", before_after: "needs_manual_editing",
  pov_skit: "needs_manual_editing", reaction: "needs_manual_editing",
  interview_clip: "needs_manual_editing", screen_record_walkthrough: "needs_manual_editing",
  meme_format: "needs_manual_editing", live_capture: "needs_manual_editing",
  other: "manual_only",
};

export function formatToProductionFit(format: FormatLabel): ProductionFit {
  return FIT_BY_FORMAT[format];
}

export const PRODUCTION_FIT_WEIGHT: Record<ProductionFit, number> = {
  native: 1.0, needs_manual_recording: 0.7, needs_manual_editing: 0.5, manual_only: 0.2,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/lib/classifier/taxonomy.test.ts`
Expected: PASS (5 cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/classifier/taxonomy.ts src/tests/lib/classifier/taxonomy.test.ts
git commit -m "feat(plan-5-d): classifier taxonomy + format→production_fit map"
```

---

## Task 5: Classifier library (two-pass)

**Files:**
- Create: `src/lib/classifier/schemas.ts` (Zod output schemas)
- Create: `src/lib/classifier/classify.ts` (orchestration)
- Test: `src/tests/lib/classifier/classify.test.ts`

Pure, injectable orchestration. The cron (Task 7) supplies the gateway-backed `generateObject`, the transcript client, and a thumbnail fetcher. Pass 1 (topic) batches 10 text-only; Pass 2 (format) is one vision call per video, bounded concurrency. Confidence = min(topicConf, formatConf). 5% deterministic sampling via injected RNG.

- [ ] **Step 1: Write the failing test**

`src/tests/lib/classifier/classify.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { classifyBatch } from "@/lib/classifier/classify";
import type { ClassifierDeps, ClassifierInput } from "@/lib/classifier/classify";

const input = (id: string): ClassifierInput => ({
  videoId: id, title: `t-${id}`, description: "d", tags: ["x"], channelTitle: "ch",
  channelSubscriberCount: 1000, durationSeconds: 30, viewCount: 5, likeCount: 1,
  commentCount: 0, thumbnailUrl: `https://img/${id}.jpg`,
});

function deps(over: Partial<ClassifierDeps> = {}): ClassifierDeps {
  return {
    topicModel: "m-topic", formatModel: "m-format", promptVersion: "test1",
    generateTopicBatch: vi.fn(async (items) => items.map((i) => ({
      videoId: i.videoId, topic_label: `topic ${i.videoId}`, audience_signal: "general", confidence: 0.9,
    }))),
    generateFormat: vi.fn(async (i) => ({ videoId: i.videoId, format_label: "ai_voiceover_facts", confidence: 0.8 })),
    fetchTranscript: vi.fn(async () => ({ text: "transcript words", language: "en", auto_generated: true })),
    fetchThumbnail: vi.fn(async () => "data:image/jpeg;base64,AAAA"),
    rng: () => 0.99, // above 0.05 → not sampled
    formatConcurrency: 2,
    ...over,
  };
}

describe("classifyBatch", () => {
  it("classifies each video with min(topic,format) confidence", async () => {
    const out = await classifyBatch([input("a"), input("b")], deps());
    expect(out.classifications).toHaveLength(2);
    const a = out.classifications.find((c) => c.videoId === "a")!;
    expect(a.topicLabel).toBe("topic a");
    expect(a.formatLabel).toBe("ai_voiceover_facts");
    expect(a.confidence).toBe(0.8); // min(0.9, 0.8)
    expect(a.visionUsed).toBe(true);
    expect(a.transcriptUsed).toBe(true);
    expect(a.model).toContain("m-topic");
    expect(a.model).toContain("m-format");
  });

  it("proceeds with transcriptUsed=false when transcript is null", async () => {
    const out = await classifyBatch([input("a")], deps({ fetchTranscript: vi.fn(async () => null) }));
    expect(out.classifications[0].transcriptUsed).toBe(false);
  });

  it("emits a sample when rng falls below 0.05", async () => {
    const out = await classifyBatch([input("a")], deps({ rng: () => 0.01 }));
    expect(out.samples).toHaveLength(1);
    expect(out.samples[0].videoId).toBe("a");
    expect(out.samples[0].promptFull.length).toBeGreaterThan(0);
    expect(out.samples[0].responseFull.length).toBeGreaterThan(0);
  });

  it("batches the topic pass in groups of 10", async () => {
    const gen = vi.fn(async (items: ClassifierInput[]) =>
      items.map((i) => ({ videoId: i.videoId, topic_label: "t", audience_signal: "general" as const, confidence: 0.7 })));
    const inputs = Array.from({ length: 23 }, (_, i) => input(`v${i}`));
    await classifyBatch(inputs, deps({ generateTopicBatch: gen }));
    expect(gen).toHaveBeenCalledTimes(3); // 10 + 10 + 3
  });

  it("re-issues singly for videos the topic batch dropped", async () => {
    let call = 0;
    const gen = vi.fn(async (items: ClassifierInput[]) => {
      call++;
      // First (batch) call drops 'b'; singleton retry returns it.
      if (call === 1) return items.filter((i) => i.videoId !== "b").map((i) => ({ videoId: i.videoId, topic_label: "t", audience_signal: "general" as const, confidence: 0.7 }));
      return items.map((i) => ({ videoId: i.videoId, topic_label: "retry", audience_signal: "general" as const, confidence: 0.6 }));
    });
    const out = await classifyBatch([input("a"), input("b")], deps({ generateTopicBatch: gen }));
    expect(out.classifications.find((c) => c.videoId === "b")?.topicLabel).toBe("retry");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/classifier/classify.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the Zod schemas**

`src/lib/classifier/schemas.ts`:
```ts
import { z } from "zod";
import { FORMAT_LABELS, AUDIENCE_SIGNALS } from "@/lib/classifier/taxonomy";

export const TopicResultSchema = z.object({
  video_id: z.string(),
  topic_label: z.string().min(1).max(80),
  audience_signal: z.enum(AUDIENCE_SIGNALS as unknown as [string, ...string[]]),
  confidence: z.number().min(0).max(1),
});
export const TopicBatchSchema = z.object({ results: z.array(TopicResultSchema) });

export const FormatResultSchema = z.object({
  format_label: z.enum(FORMAT_LABELS as unknown as [string, ...string[]]),
  confidence: z.number().min(0).max(1),
});

export type TopicResult = z.infer<typeof TopicResultSchema>;
export type FormatResult = z.infer<typeof FormatResultSchema>;
```

- [ ] **Step 4: Write the orchestration**

`src/lib/classifier/classify.ts`:
```ts
import type { FormatLabel, AudienceSignal } from "@/lib/supabase/repositories/shorts-classifications";
import type { TranscriptResult } from "@/lib/clients/youtube-transcript";

export interface ClassifierInput {
  videoId: string;
  title: string;
  description: string | null;
  tags: string[];
  channelTitle: string | null;
  channelSubscriberCount: number | null;
  durationSeconds: number | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string | null;
  /** Set by classifyBatch after the transcript fetch; consumed by the topic pass. */
  transcript?: string | null;
}

export interface TopicCall { videoId: string; topic_label: string; audience_signal: AudienceSignal; confidence: number }
export interface FormatCall { videoId: string; format_label: FormatLabel; confidence: number }

export interface ClassifierDeps {
  topicModel: string;
  formatModel: string;
  promptVersion: string;
  /** Topic pass — batched. Returns one TopicCall per input (may drop entries; orchestrator retries). */
  generateTopicBatch(items: ClassifierInput[]): Promise<TopicCall[]>;
  /** Format pass — one vision call per video. */
  generateFormat(item: ClassifierInput, thumbnailDataUrl: string | null): Promise<FormatCall>;
  fetchTranscript(videoId: string): Promise<TranscriptResult | null>;
  fetchThumbnail(url: string | null): Promise<string | null>;
  rng?: () => number;          // default Math.random; injected for deterministic sampling
  formatConcurrency?: number;  // default 6
  sampleRate?: number;         // default 0.05
}

export interface ClassificationRow {
  videoId: string;
  topicLabel: string;
  formatLabel: FormatLabel;
  audienceSignal: AudienceSignal | null;
  confidence: number;
  model: string;
  promptVersion: string;
  visionUsed: boolean;
  transcriptUsed: boolean;
}

export interface SampleRow {
  videoId: string;
  promptFull: string;
  responseFull: string;
  chosenLabels: { topic_label: string; format_label: FormatLabel; audience_signal: AudienceSignal | null; confidence: number };
}

export interface ClassifyOutput { classifications: ClassificationRow[]; samples: SampleRow[]; transcriptHits: number }

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function classifyBatch(inputs: ClassifierInput[], deps: ClassifierDeps): Promise<ClassifyOutput> {
  const rng = deps.rng ?? Math.random;
  const concurrency = deps.formatConcurrency ?? 6;
  const sampleRate = deps.sampleRate ?? 0.05;

  // Transcripts (best-effort, concurrent, never throw).
  const transcripts = new Map<string, TranscriptResult | null>();
  await mapWithConcurrency(inputs, concurrency, async (i) => {
    transcripts.set(i.videoId, await deps.fetchTranscript(i.videoId).catch(() => null));
  });
  const withTranscript: ClassifierInput[] = inputs.map((i) => ({ ...i, transcript: transcripts.get(i.videoId)?.text ?? null }));

  // Pass 1 — topic, batched 10 (transcript-enriched inputs), with singleton retry for dropped entries.
  const topicByVideo = new Map<string, TopicCall>();
  for (const group of chunk(withTranscript, 10)) {
    const res = await deps.generateTopicBatch(group);
    for (const r of res) topicByVideo.set(r.videoId, r);
    const missing = group.filter((g) => !topicByVideo.has(g.videoId));
    for (const m of missing) {
      const retry = await deps.generateTopicBatch([m]);
      const hit = retry.find((r) => r.videoId === m.videoId);
      if (hit) topicByVideo.set(m.videoId, hit);
    }
  }

  // Pass 2 — format, one vision call per video, bounded concurrency.
  const formats = await mapWithConcurrency(inputs, concurrency, async (i) => {
    const thumb = await deps.fetchThumbnail(i.thumbnailUrl).catch(() => null);
    const f = await deps.generateFormat(i, thumb);
    return { videoId: i.videoId, format: f, hadThumb: thumb !== null };
  });
  const formatByVideo = new Map(formats.map((f) => [f.videoId, f]));

  const model = `topic=${deps.topicModel};format=${deps.formatModel}`;
  const classifications: ClassificationRow[] = [];
  const samples: SampleRow[] = [];
  let transcriptHits = 0;

  for (const input of inputs) {
    const topic = topicByVideo.get(input.videoId);
    const fmt = formatByVideo.get(input.videoId);
    if (!topic || !fmt) continue; // both passes required
    const transcriptUsed = (transcripts.get(input.videoId)?.text ?? "").length > 0;
    if (transcriptUsed) transcriptHits++;
    const confidence = Math.min(topic.confidence, fmt.format.confidence);
    const row: ClassificationRow = {
      videoId: input.videoId,
      topicLabel: topic.topic_label.trim(),
      formatLabel: fmt.format.format_label,
      audienceSignal: topic.audience_signal ?? null,
      confidence,
      model,
      promptVersion: deps.promptVersion,
      visionUsed: true,
      transcriptUsed,
    };
    classifications.push(row);
    if (rng() < sampleRate) {
      samples.push({
        videoId: input.videoId,
        promptFull: JSON.stringify({ topicModel: deps.topicModel, formatModel: deps.formatModel, input: withTranscript.find((w) => w.videoId === input.videoId) }),
        responseFull: JSON.stringify({ topic, format: fmt.format }),
        chosenLabels: { topic_label: row.topicLabel, format_label: row.formatLabel, audience_signal: row.audienceSignal, confidence: row.confidence },
      });
    }
  }
  return { classifications, samples, transcriptHits };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/tests/lib/classifier/classify.test.ts`
Expected: PASS (5 cases).

- [ ] **Step 6: Commit**

```bash
git add src/lib/classifier/schemas.ts src/lib/classifier/classify.ts src/tests/lib/classifier/classify.test.ts
git commit -m "feat(plan-5-d): two-pass classifier orchestration (injectable, tested)"
```

---

## Task 6: Repository additions (samples + observation queries)

**Files:**
- Create: `src/lib/supabase/repositories/classification-samples.ts`
- Modify: `src/lib/supabase/repositories/shorts-observations.ts` (append two queries)
- Test: none (thin DB wrappers — covered by env-gated integration like the rest of the repo layer; verify via `tsc`). Mirror `shorts-classifications.ts` error/param style exactly.

- [ ] **Step 1: Create the classification-samples repo**

`src/lib/supabase/repositories/classification-samples.ts`:
```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormatLabel } from "@/lib/supabase/repositories/shorts-classifications";

export type ReviewVerdict = "correct" | "wrong" | "partial";

export interface ClassificationSample {
  id: string;
  video_id: string;
  prompt_full: string;
  response_full: string;
  chosen_labels: Record<string, unknown>;
  reviewed: boolean;
  review_verdict: ReviewVerdict | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export async function insertClassificationSample(
  supabase: SupabaseClient,
  params: { videoId: string; promptFull: string; responseFull: string; chosenLabels: Record<string, unknown> },
): Promise<ClassificationSample> {
  const { data, error } = await supabase
    .from("classification_samples")
    .insert({
      video_id: params.videoId,
      prompt_full: params.promptFull,
      response_full: params.responseFull,
      chosen_labels: params.chosenLabels,
    })
    .select()
    .single();
  if (error) throw new Error(`insertClassificationSample: ${error.message}`);
  return data as ClassificationSample;
}

export async function listUnreviewedSamples(
  supabase: SupabaseClient,
  params: { limit: number },
): Promise<ClassificationSample[]> {
  const { data, error } = await supabase
    .from("classification_samples")
    .select()
    .eq("reviewed", false)
    .order("created_at", { ascending: true })
    .limit(params.limit);
  if (error) throw new Error(`listUnreviewedSamples: ${error.message}`);
  return (data ?? []) as ClassificationSample[];
}

export async function recordSampleVerdict(
  supabase: SupabaseClient,
  params: { id: string; verdict: ReviewVerdict; reviewedBy: string },
): Promise<ClassificationSample> {
  const { data, error } = await supabase
    .from("classification_samples")
    .update({
      reviewed: true,
      review_verdict: params.verdict,
      reviewed_by: params.reviewedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select()
    .single();
  if (error) throw new Error(`recordSampleVerdict: ${error.message}`);
  return data as ClassificationSample;
}

export interface FormatAccuracy { format_label: FormatLabel; correct: number; partial: number; wrong: number; total: number }

/** Aggregate reviewed-sample verdicts per format_label (joins samples → classifications). */
export async function aggregateAccuracyByFormat(supabase: SupabaseClient): Promise<FormatAccuracy[]> {
  // chosen_labels.format_label is the authoritative label for the sample.
  const { data, error } = await supabase
    .from("classification_samples")
    .select("chosen_labels, review_verdict, reviewed")
    .eq("reviewed", true);
  if (error) throw new Error(`aggregateAccuracyByFormat: ${error.message}`);
  const byFormat = new Map<string, FormatAccuracy>();
  for (const row of (data ?? []) as Array<{ chosen_labels: Record<string, unknown>; review_verdict: ReviewVerdict | null }>) {
    const fmt = String(row.chosen_labels?.format_label ?? "other") as FormatLabel;
    const acc = byFormat.get(fmt) ?? { format_label: fmt, correct: 0, partial: 0, wrong: 0, total: 0 };
    acc.total++;
    if (row.review_verdict === "correct") acc.correct++;
    else if (row.review_verdict === "partial") acc.partial++;
    else if (row.review_verdict === "wrong") acc.wrong++;
    byFormat.set(fmt, acc);
  }
  return [...byFormat.values()];
}
```

- [ ] **Step 2: Append observation queries**

Append to `src/lib/supabase/repositories/shorts-observations.ts` (after `listShortsObservationsBySource`):
```ts
/** Observations with NO classification row yet (newest first) — classifier work queue. */
export async function listUnclassifiedObservations(
  supabase: SupabaseClient,
  params: { limit: number },
): Promise<ShortsObservation[]> {
  // Left-anti-join via the FK: classifications.video_id references observations.video_id.
  const { data, error } = await supabase
    .from("shorts_observations")
    .select("*, shorts_classifications!left(video_id)")
    .is("shorts_classifications", null)
    .order("observed_at", { ascending: false })
    .limit(params.limit);
  if (error) throw new Error(`listUnclassifiedObservations: ${error.message}`);
  // Strip the embedded join key before returning the plain observation shape.
  return (data ?? []).map(({ shorts_classifications: _omit, ...obs }) => obs as ShortsObservation);
}

export interface ClassifiedObservation {
  video_id: string;
  source: ShortsObservationSource;
  channel_id: string | null;
  channel_subscriber_count: number | null;
  description: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  published_at: string | null;
  observed_at: string;
  topic_label: string;
  format_label: string;
  audience_signal: string | null;
  confidence: number;
}

/** Observation × classification join over a window, at/above a confidence floor — clustering input. */
export async function listClassifiedObservationsSince(
  supabase: SupabaseClient,
  params: { since: Date; minConfidence: number },
): Promise<ClassifiedObservation[]> {
  const { data, error } = await supabase
    .from("shorts_classifications")
    .select(
      "video_id, topic_label, format_label, audience_signal, confidence, " +
      "shorts_observations!inner(source, channel_id, channel_subscriber_count, description, view_count, like_count, comment_count, published_at, observed_at)",
    )
    .gte("confidence", params.minConfidence)
    .gte("shorts_observations.observed_at", params.since.toISOString());
  if (error) throw new Error(`listClassifiedObservationsSince: ${error.message}`);
  type JoinRow = {
    video_id: string; topic_label: string; format_label: string; audience_signal: string | null; confidence: number;
    shorts_observations: {
      source: ShortsObservationSource; channel_id: string | null; channel_subscriber_count: number | null;
      description: string | null; view_count: number; like_count: number; comment_count: number;
      published_at: string | null; observed_at: string;
    };
  };
  return ((data ?? []) as unknown as JoinRow[]).map((r) => ({
    video_id: r.video_id, topic_label: r.topic_label, format_label: r.format_label,
    audience_signal: r.audience_signal, confidence: r.confidence,
    source: r.shorts_observations.source, channel_id: r.shorts_observations.channel_id,
    channel_subscriber_count: r.shorts_observations.channel_subscriber_count,
    description: r.shorts_observations.description, view_count: r.shorts_observations.view_count,
    like_count: r.shorts_observations.like_count, comment_count: r.shorts_observations.comment_count,
    published_at: r.shorts_observations.published_at, observed_at: r.shorts_observations.observed_at,
  }));
}
```
> The PostgREST embedded-join filter syntax (`!left`, `!inner`, `.is("relation", null)`) is fiddly. During the cron live-smoke (Task 14) confirm the anti-join returns the expected rows; if PostgREST rejects the `null` filter on the relation, fall back to two queries (load classified `video_id`s, filter observations in JS) — keep the same function signature.

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/repositories/classification-samples.ts src/lib/supabase/repositories/shorts-observations.ts
git commit -m "feat(plan-5-d): classification-samples repo + observation work-queue/join queries"
```

---

## Task 7: `classify-observations` cron + adapter

**Files:**
- Create: `src/lib/ingestion/classify-observations.ts` (adapter — wires gateway deps, returns `AdapterResult`)
- Create: `src/app/api/cron/classify-observations/route.ts`
- Test: `src/tests/lib/ingestion/classify-observations.test.ts`

The adapter is the gateway boundary: `buildGatewayDeps()` constructs the gateway-backed `generateTopicBatch`/`generateFormat`, the transcript client, and a thumbnail fetcher; `runClassification` fetches the queue, calls `classifyBatch`, and persists. The route is the thin C-style handler.

- [ ] **Step 1: Write the failing test (adapter wiring with mocked classifyBatch)**

`src/tests/lib/ingestion/classify-observations.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/classifier/classify", () => ({
  classifyBatch: vi.fn(async () => ({
    classifications: [{ videoId: "a", topicLabel: "t", formatLabel: "ai_voiceover_facts", audienceSignal: "general", confidence: 0.8, model: "m", promptVersion: "d1", visionUsed: true, transcriptUsed: false }],
    samples: [{ videoId: "a", promptFull: "p", responseFull: "r", chosenLabels: {} }],
    transcriptHits: 0,
  })),
}));

import { runClassification } from "@/lib/ingestion/classify-observations";
import type { ShortsObservation } from "@/lib/supabase/repositories/shorts-observations";

const observation = (id: string): ShortsObservation => ({
  video_id: id, source: "youtube_search", channel_id: "c", channel_subscriber_count: 1,
  title: "t", description: "d", tags: [], thumbnail_url: "https://img/x.jpg",
  duration_seconds: 30, published_at: null, view_count: 1, like_count: 0, comment_count: 0,
  observed_at: "2026-05-29T00:00:00Z", last_refreshed_at: "2026-05-29T00:00:00Z",
});

it("classifies the queue, persists classifications + samples, returns AdapterResult", async () => {
  const upserts: unknown[] = [];
  const samples: unknown[] = [];
  const result = await runClassification({
    fetchQueue: async () => [observation("a")],
    upsertClassification: async (p) => { upserts.push(p); },
    insertSample: async (p) => { samples.push(p); },
    deps: {} as never,
    limit: 150,
  });
  expect(result.ingested).toBe(1);
  expect(upserts).toHaveLength(1);
  expect(samples).toHaveLength(1);
  expect(result.context).toMatchObject({ classified: 1, sampled: 1 });
});

it("returns ingested=0 with empty queue", async () => {
  const result = await runClassification({
    fetchQueue: async () => [],
    upsertClassification: async () => {},
    insertSample: async () => {},
    deps: {} as never,
    limit: 150,
  });
  expect(result.ingested).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/ingestion/classify-observations.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the adapter**

`src/lib/ingestion/classify-observations.ts` — note: build `generateTopicBatch`'s return as `TopicCall[]`, casting `r.audience_signal as AudienceSignal` (import the type); no `any`. `classifyBatch` enriches each item with a `transcript` field before calling `generateTopicBatch`, so the prompt below includes `i.transcript` (truncated) — that is the transcript reaching the topic LLM.
```ts
import "server-only";
import { generateObject } from "ai";
import type { AdapterResult } from "@/lib/ingestion/run";
import type { ShortsObservation } from "@/lib/supabase/repositories/shorts-observations";
import type { AudienceSignal } from "@/lib/supabase/repositories/shorts-classifications";
import type { ClassificationRow, ClassifierDeps, ClassifierInput, SampleRow, TopicCall } from "@/lib/classifier/classify";
import { classifyBatch } from "@/lib/classifier/classify";
import { TopicBatchSchema, FormatResultSchema } from "@/lib/classifier/schemas";
import { getGatewayModel, CLASSIFIER_TOPIC_MODEL, CLASSIFIER_FORMAT_MODEL } from "@/lib/ai/models";
import { createTranscriptClient } from "@/lib/clients/youtube-transcript";

export const CLASSIFIER_PROMPT_VERSION = "d1";

function toInput(o: ShortsObservation): ClassifierInput {
  return {
    videoId: o.video_id, title: o.title, description: o.description,
    tags: Array.isArray(o.tags) ? (o.tags as unknown[]).map(String) : [],
    channelTitle: null, channelSubscriberCount: o.channel_subscriber_count,
    durationSeconds: o.duration_seconds, viewCount: o.view_count, likeCount: o.like_count,
    commentCount: o.comment_count, thumbnailUrl: o.thumbnail_url,
  };
}

/** Gateway-backed classifier deps (the real LLM boundary). */
export function buildGatewayDeps(): ClassifierDeps {
  const transcript = createTranscriptClient();
  return {
    topicModel: CLASSIFIER_TOPIC_MODEL,
    formatModel: CLASSIFIER_FORMAT_MODEL,
    promptVersion: CLASSIFIER_PROMPT_VERSION,
    async generateTopicBatch(items): Promise<TopicCall[]> {
      const { object } = await generateObject({
        model: getGatewayModel(CLASSIFIER_TOPIC_MODEL),
        schema: TopicBatchSchema,
        prompt:
          "Classify each YouTube Short by TOPIC (a 2-4 word noun phrase) and audience. " +
          "Return exactly one result per video, echoing its video_id. Videos:\n" +
          JSON.stringify(items.map((i) => ({ video_id: i.videoId, title: i.title, description: (i.description ?? "").slice(0, 300), tags: i.tags, transcript: (i.transcript ?? "").slice(0, 1200) || null }))),
      });
      return object.results.map((r) => ({
        videoId: r.video_id, topic_label: r.topic_label,
        audience_signal: r.audience_signal as AudienceSignal, confidence: r.confidence,
      }));
    },
    async generateFormat(item, thumbnailDataUrl) {
      const { object } = await generateObject({
        model: getGatewayModel(CLASSIFIER_FORMAT_MODEL),
        schema: FormatResultSchema,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `Classify this Short's FORMAT. Title: ${item.title}. Duration: ${item.durationSeconds ?? "?"}s.` },
            ...(thumbnailDataUrl ? [{ type: "image" as const, image: thumbnailDataUrl }] : []),
          ],
        }],
      });
      return { videoId: item.videoId, format_label: object.format_label, confidence: object.confidence };
    },
    fetchTranscript: (id) => transcript.fetchTranscript(id),
    async fetchThumbnail(url) {
      if (!url) return null;
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get("content-type") ?? "image/jpeg";
        return `data:${ct};base64,${buf.toString("base64")}`;
      } catch { return null; }
    },
  };
}

export interface RunClassificationArgs {
  fetchQueue: (limit: number) => Promise<ShortsObservation[]>;
  upsertClassification: (row: ClassificationRow) => Promise<void>;
  insertSample: (row: SampleRow) => Promise<void>;
  deps: ClassifierDeps;
  limit: number;
}

export async function runClassification(args: RunClassificationArgs): Promise<AdapterResult> {
  const queue = await args.fetchQueue(args.limit);
  if (queue.length === 0) return { ingested: 0, skipped: 0, quotaUnits: 0, context: { classified: 0, sampled: 0 } };
  const out = await classifyBatch(queue.map(toInput), args.deps);
  for (const c of out.classifications) await args.upsertClassification(c);
  for (const s of out.samples) await args.insertSample(s);
  return {
    ingested: out.classifications.length,
    skipped: queue.length - out.classifications.length,
    quotaUnits: 0,
    context: { classified: out.classifications.length, sampled: out.samples.length, transcriptHits: out.transcriptHits },
  };
}
```

- [ ] **Step 4: Write the route**

`src/app/api/cron/classify-observations/route.ts`:
```ts
import { NextResponse } from "next/server";
import { assertCronAuth, scraperLog, serializeError } from "@/lib/scrapers/shared";
import { getServiceClient } from "@/lib/supabase/server";
import { runWithIngestionLog } from "@/lib/ingestion/run";
import { assertGatewayConfigured } from "@/lib/ai/models";
import { listUnclassifiedObservations } from "@/lib/supabase/repositories/shorts-observations";
import { upsertClassification } from "@/lib/supabase/repositories/shorts-classifications";
import { insertClassificationSample } from "@/lib/supabase/repositories/classification-samples";
import { runClassification, buildGatewayDeps } from "@/lib/ingestion/classify-observations";

export const maxDuration = 300;
const PER_RUN_LIMIT = 150;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }
  try { assertGatewayConfigured(); } catch (e) { return NextResponse.json({ error: serializeError(e) }, { status: 500 }); }

  const supabase = getServiceClient();
  try {
    const run = await runWithIngestionLog(supabase, "classify_observations", () =>
      runClassification({
        fetchQueue: (limit) => listUnclassifiedObservations(supabase, { limit }),
        upsertClassification: (r) => upsertClassification(supabase, {
          videoId: r.videoId, topicLabel: r.topicLabel, formatLabel: r.formatLabel,
          audienceSignal: r.audienceSignal, confidence: r.confidence, model: r.model,
          promptVersion: r.promptVersion, visionUsed: r.visionUsed, transcriptUsed: r.transcriptUsed,
        }).then(() => undefined),
        insertSample: (s) => insertClassificationSample(supabase, {
          videoId: s.videoId, promptFull: s.promptFull, responseFull: s.responseFull, chosenLabels: s.chosenLabels,
        }).then(() => undefined),
        deps: buildGatewayDeps(),
        limit: PER_RUN_LIMIT,
      }),
    );
    return NextResponse.json({ ok: true, ...scraperLog("classify-observations", { run }) });
  } catch (e) {
    console.error("classify-observations failed", e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
```
> Re-classification of stale prompt-version rows is intentionally out of this first cut (the spec allows it; `listStaleClassifications` exists). Add a stale-pass to `fetchQueue` later if needed.

- [ ] **Step 5: Run tests + compile**

Run: `npx vitest run src/tests/lib/ingestion/classify-observations.test.ts && npx tsc --noEmit`
Expected: PASS (2 cases), tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingestion/classify-observations.ts src/app/api/cron/classify-observations/route.ts src/tests/lib/ingestion/classify-observations.test.ts
git commit -m "feat(plan-5-d): classify-observations cron + gateway adapter"
```

---

## Task 8: Embedding cache repo + clustering library

**Files:**
- Create: `src/lib/clustering/cosine.ts` (cosine + fuzzy-merge)
- Create: `src/lib/clustering/cluster.ts` (group + derive fields)
- Create: `src/lib/supabase/repositories/topic-embeddings.ts`
- Test: `src/tests/lib/clustering/cosine.test.ts`, `src/tests/lib/clustering/cluster.test.ts`

- [ ] **Step 1: Write the failing cosine/merge test**

`src/tests/lib/clustering/cosine.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { cosine, fuzzyMergeTopics } from "@/lib/clustering/cosine";

describe("cosine", () => {
  it("is 1 for identical, 0 for orthogonal", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("returns 0 for a zero vector (no NaN)", () => {
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("fuzzyMergeTopics", () => {
  it("merges labels at cosine >= 0.85 to the most-frequent surface form", () => {
    const embeddings = new Map<string, number[]>([
      ["cats", [1, 0, 0]],
      ["kittens", [0.99, 0.14, 0]],
      ["finance", [0, 0, 1]],
    ]);
    const counts = new Map<string, number>([["cats", 2], ["kittens", 1], ["finance", 5]]);
    const canon = fuzzyMergeTopics(["cats", "kittens", "finance"], embeddings, counts, 0.85);
    expect(canon.get("cats")).toBe("cats");
    expect(canon.get("kittens")).toBe("cats");
    expect(canon.get("finance")).toBe("finance");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/clustering/cosine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write cosine + fuzzy-merge**

`src/lib/clustering/cosine.ts`:
```ts
export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Greedy merge of near-duplicate topic labels. Process by descending frequency;
 * each label joins an existing canonical (cosine >= threshold to its representative)
 * or becomes a new canonical. Returns label -> canonical map.
 */
export function fuzzyMergeTopics(
  labels: string[],
  embeddings: Map<string, number[]>,
  counts: Map<string, number>,
  threshold: number,
): Map<string, string> {
  const ordered = [...labels].sort((x, y) => (counts.get(y) ?? 0) - (counts.get(x) ?? 0));
  const canonicals: string[] = [];
  const map = new Map<string, string>();
  for (const label of ordered) {
    const emb = embeddings.get(label);
    if (!emb) { map.set(label, label); canonicals.push(label); continue; }
    let best: { canon: string; sim: number } | null = null;
    for (const canon of canonicals) {
      const cEmb = embeddings.get(canon);
      if (!cEmb) continue;
      const sim = cosine(emb, cEmb);
      if (sim >= threshold && (!best || sim > best.sim)) best = { canon, sim };
    }
    if (best) map.set(label, best.canon);
    else { map.set(label, label); canonicals.push(label); }
  }
  return map;
}
```

- [ ] **Step 4: Run cosine test to verify it passes**

Run: `npx vitest run src/tests/lib/clustering/cosine.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Write the failing cluster test**

`src/tests/lib/clustering/cluster.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildClusters, type ClusterInputRow } from "@/lib/clustering/cluster";

const row = (over: Partial<ClusterInputRow>): ClusterInputRow => ({
  video_id: "v", source: "youtube_search", channel_id: "c1", channel_subscriber_count: 1000, description: null,
  topic_label: "ai tools", format_label: "ai_voiceover_facts", audience_signal: "general",
  view_count: 100, published_at: "2026-05-01T00:00:00Z", observed_at: "2026-05-20T00:00:00Z", ...over,
});

// NB: canonical map keys the raw label to its canonical topic. Use a topic with NO space
// so the "canon format" split key in buildClusters round-trips cleanly in this test.
const canon = new Map<string, string>([["aitools", "aitools"], ["aiapps", "aitools"]]);

describe("buildClusters", () => {
  it("drops groups under the 3-video minimum", () => {
    const rows = [row({ video_id: "a", topic_label: "aitools" }), row({ video_id: "b", topic_label: "aitools" })];
    expect(buildClusters(rows, canon)).toHaveLength(0);
  });

  it("groups by (canonical_topic, format_label) and counts distinct channels", () => {
    const rows = [
      row({ video_id: "a", channel_id: "c1", topic_label: "aitools" }),
      row({ video_id: "b", channel_id: "c2", topic_label: "aiapps" }),
      row({ video_id: "c", channel_id: "c2", topic_label: "aitools" }),
    ];
    const clusters = buildClusters(rows, canon);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].canonicalTopic).toBe("aitools");
    expect(clusters[0].channelCount).toBe(2);
    expect(clusters[0].productionFit).toBe("native");
  });

  it("sets discovery_state pre_public when no broad-public source present", () => {
    const rows = ["a", "b", "c"].map((id) => row({ video_id: id, channel_id: id, topic_label: "aitools", source: "reddit_topic" }));
    expect(buildClusters(rows, canon)[0].discoveryState).toBe("pre_public");
  });

  it("sets discovery_state public when most_popular or google_trends present", () => {
    const rows = [
      row({ video_id: "a", channel_id: "c1", topic_label: "aitools", source: "youtube_most_popular" }),
      row({ video_id: "b", channel_id: "c2", topic_label: "aitools", source: "reddit_topic" }),
      row({ video_id: "c", channel_id: "c3", topic_label: "aitools", source: "reddit_topic" }),
    ];
    expect(buildClusters(rows, canon)[0].discoveryState).toBe("public");
  });

  it("picks the modal audience_signal", () => {
    const rows = [
      row({ video_id: "a", channel_id: "c1", topic_label: "aitools", audience_signal: "gen_z" }),
      row({ video_id: "b", channel_id: "c2", topic_label: "aitools", audience_signal: "gen_z" }),
      row({ video_id: "c", channel_id: "c3", topic_label: "aitools", audience_signal: "millennials" }),
    ];
    expect(buildClusters(rows, canon)[0].audienceSignal).toBe("gen_z");
  });
});
```

- [ ] **Step 6: Run cluster test to verify it fails**

Run: `npx vitest run src/tests/lib/clustering/cluster.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Write the cluster builder**

`src/lib/clustering/cluster.ts` — IMPORTANT: do not join the group key with a plain space (canonical topics contain spaces). Use a tab (`\t`) or a `Map<string, {canon,format}>` keyed object so the topic/format split is unambiguous.
```ts
import type { FormatLabel, AudienceSignal } from "@/lib/supabase/repositories/shorts-classifications";
import type { ShortsObservationSource } from "@/lib/supabase/repositories/shorts-observations";
import { formatToProductionFit, type ProductionFit } from "@/lib/classifier/taxonomy";

export interface ClusterInputRow {
  video_id: string;
  source: ShortsObservationSource;
  channel_id: string | null;
  channel_subscriber_count: number | null;
  description: string | null;
  topic_label: string;
  format_label: FormatLabel;
  audience_signal: AudienceSignal | string | null;
  view_count: number;
  published_at: string | null;
  observed_at: string;
}

export interface BuiltCluster {
  canonicalTopic: string;
  formatLabel: FormatLabel;
  rows: ClusterInputRow[];
  exampleVideoIds: string[];
  channelCount: number;
  avgViews: number;
  firstSeenAt: string | null;
  productionFit: ProductionFit;
  discoveryState: "pre_public" | "public";
  audienceSignal: string | null;
}

const BROAD_PUBLIC: ReadonlySet<ShortsObservationSource> = new Set(["youtube_most_popular", "google_trends"]);
const MIN_CLUSTER_SIZE = 3;

function modal(values: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null, bestN = 0;
  for (const [v, n] of counts) if (n > bestN) { best = v; bestN = n; }
  return best;
}

export function buildClusters(rows: ClusterInputRow[], canonical: Map<string, string>): BuiltCluster[] {
  const groups = new Map<string, { canon: string; format: FormatLabel; rows: ClusterInputRow[] }>();
  for (const r of rows) {
    const canon = canonical.get(r.topic_label) ?? r.topic_label;
    const key = `${canon}\t${r.format_label}`;
    const g = groups.get(key) ?? { canon, format: r.format_label, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }
  const clusters: BuiltCluster[] = [];
  for (const g of groups.values()) {
    if (g.rows.length < MIN_CLUSTER_SIZE) continue;
    const channelIds = new Set(g.rows.map((r) => r.channel_id).filter((c): c is string => !!c));
    const sorted = [...g.rows].sort((a, b) => b.view_count - a.view_count);
    const times = g.rows.map((r) => r.published_at ?? r.observed_at).filter(Boolean).sort();
    clusters.push({
      canonicalTopic: g.canon,
      formatLabel: g.format,
      rows: g.rows,
      exampleVideoIds: sorted.slice(0, 5).map((r) => r.video_id),
      channelCount: channelIds.size,
      avgViews: Math.round(g.rows.reduce((s, r) => s + r.view_count, 0) / g.rows.length),
      firstSeenAt: times[0] ?? null,
      productionFit: formatToProductionFit(g.format),
      discoveryState: g.rows.some((r) => BROAD_PUBLIC.has(r.source)) ? "public" : "pre_public",
      audienceSignal: modal(g.rows.map((r) => (r.audience_signal as string | null) ?? null)),
    });
  }
  return clusters;
}
```

- [ ] **Step 8: Write the topic-embeddings repo**

`src/lib/supabase/repositories/topic-embeddings.ts`:
```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getEmbeddings(
  supabase: SupabaseClient,
  params: { labels: string[]; model: string },
): Promise<Map<string, number[]>> {
  if (params.labels.length === 0) return new Map();
  const { data, error } = await supabase
    .from("topic_embeddings")
    .select("topic_label, embedding")
    .eq("model", params.model)
    .in("topic_label", params.labels);
  if (error) throw new Error(`getEmbeddings: ${error.message}`);
  const map = new Map<string, number[]>();
  for (const row of (data ?? []) as Array<{ topic_label: string; embedding: number[] }>) {
    map.set(row.topic_label, row.embedding);
  }
  return map;
}

export async function upsertEmbeddings(
  supabase: SupabaseClient,
  rows: Array<{ topicLabel: string; model: string; embedding: number[] }>,
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("topic_embeddings")
    .upsert(rows.map((r) => ({ topic_label: r.topicLabel, model: r.model, embedding: r.embedding })));
  if (error) throw new Error(`upsertEmbeddings: ${error.message}`);
}
```

- [ ] **Step 9: Run tests + compile**

Run: `npx vitest run src/tests/lib/clustering/ && npx tsc --noEmit`
Expected: PASS (cosine 4 + cluster 5), tsc clean.

- [ ] **Step 10: Commit**

```bash
git add src/lib/clustering/cosine.ts src/lib/clustering/cluster.ts src/lib/supabase/repositories/topic-embeddings.ts src/tests/lib/clustering/
git commit -m "feat(plan-5-d): topic-embedding cache + cosine fuzzy-merge + cluster builder"
```

---

## Task 9: Scoring library (components + niche_score + two-band/MMR)

**Files:**
- Create: `src/lib/scoring/weights.ts` (tunable weights)
- Create: `src/lib/scoring/score.ts` (renormalizing niche_score)
- Create: `src/lib/scoring/select.ts` (two-band + MMR)
- Test: `src/tests/lib/scoring/score.test.ts`, `src/tests/lib/scoring/select.test.ts`

The scorer takes already-computed component values (some `null`) and renormalizes. Computing the raw components from rows/snapshots is the cron's job (Task 10) — the scorer is pure math on a `ScoreComponents` bag so it's trivially testable and the cold-start nulls are explicit.

- [ ] **Step 1: Write the failing score test**

`src/tests/lib/scoring/score.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeNicheScore, type ScoreComponents } from "@/lib/scoring/score";

const base: ScoreComponents = {
  firstMoverScore: 0.8,
  provenScore: 0.6,
  saturationInverse: 0.5,   // always present
  productionFitWeight: 1.0, // always present (native)
  discoveryStateWeight: 1.0,// always present (pre_public)
  outlierDensity: 0.4,
};

describe("computeNicheScore", () => {
  it("computes the full weighted mean when all components present", () => {
    const { score, contributions } = computeNicheScore(base);
    // 0.25*0.8 + 0.25*0.6 + 0.15*0.5 + 0.15*1.0 + 0.10*1.0 + 0.10*0.4 = 0.665, denom=1.0
    expect(score).toBeCloseTo(0.665, 3);
    expect(contributions.firstMoverScore?.available).toBe(true);
  });

  it("renormalizes over available weights when a component is null", () => {
    const { score } = computeNicheScore({ ...base, provenScore: null });
    // numerator = 0.665 - 0.25*0.6 = 0.515 ; denom = 1.0 - 0.25 = 0.75
    expect(score).toBeCloseTo(0.515 / 0.75, 4);
  });

  it("never divides by zero (always-present components keep denom > 0)", () => {
    const { score } = computeNicheScore({
      firstMoverScore: null, provenScore: null, outlierDensity: null,
      saturationInverse: 0.3, productionFitWeight: 0.7, discoveryStateWeight: 0.5,
    });
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBeGreaterThan(0);
  });

  it("marks null components as unavailable in contributions (explainability)", () => {
    const { contributions } = computeNicheScore({ ...base, provenScore: null });
    expect(contributions.provenScore?.available).toBe(false);
    expect(contributions.firstMoverScore?.available).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/scoring/score.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write weights + scorer**

`src/lib/scoring/weights.ts`:
```ts
// Starting weights (§4.4). Tunable later via /admin/scoring-analysis without code changes.
export const NICHE_WEIGHTS = {
  firstMoverScore: 0.25,
  provenScore: 0.25,
  saturationInverse: 0.15,
  productionFitWeight: 0.15,
  discoveryStateWeight: 0.10,
  outlierDensity: 0.10,
} as const;

export type ScoreComponentKey = keyof typeof NICHE_WEIGHTS;
```

`src/lib/scoring/score.ts`:
```ts
import { NICHE_WEIGHTS, type ScoreComponentKey } from "@/lib/scoring/weights";

export type ScoreComponents = Record<ScoreComponentKey, number | null>;

export interface Contribution { value: number; weight: number; available: boolean }
export interface NicheScoreResult {
  score: number;
  contributions: Partial<Record<ScoreComponentKey, Contribution>>;
}

/** Renormalizing weighted mean over the non-null components. */
export function computeNicheScore(components: ScoreComponents): NicheScoreResult {
  const contributions: Partial<Record<ScoreComponentKey, Contribution>> = {};
  let num = 0;
  let denom = 0;
  for (const key of Object.keys(NICHE_WEIGHTS) as ScoreComponentKey[]) {
    const weight = NICHE_WEIGHTS[key];
    const value = components[key];
    const available = value !== null && value !== undefined && Number.isFinite(value);
    contributions[key] = { value: available ? (value as number) : 0, weight, available };
    if (available) { num += weight * (value as number); denom += weight; }
  }
  return { score: denom > 0 ? num / denom : 0, contributions };
}
```

- [ ] **Step 4: Run score test to verify it passes**

Run: `npx vitest run src/tests/lib/scoring/score.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Write the failing selection test**

`src/tests/lib/scoring/select.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { assignBand, selectDigest, type ScoredCandidate } from "@/lib/scoring/select";

const cand = (id: string, niche: number, proven: number, firstMover: number, emb: number[]): ScoredCandidate => ({
  id, nicheScore: niche, provenScore: proven, firstMoverScore: firstMover, embedding: emb,
});

describe("assignBand", () => {
  it("classifies proven vs unproven vs none", () => {
    expect(assignBand(cand("a", 0.8, 0.7, 0.2, [1]))).toBe("proven");
    expect(assignBand(cand("b", 0.8, 0.4, 0.8, [1]))).toBe("unproven");
    expect(assignBand(cand("c", 0.8, 0.4, 0.3, [1]))).toBe("none"); // low proven AND low first-mover
  });
});

describe("selectDigest", () => {
  it("fills proven and unproven quotas and ranks 1..N", () => {
    const candidates = [
      cand("p1", 0.9, 0.7, 0.2, [1, 0]),
      cand("p2", 0.85, 0.65, 0.2, [0.9, 0.1]),
      cand("u1", 0.8, 0.3, 0.9, [0, 1]),
      cand("u2", 0.75, 0.3, 0.85, [0.1, 0.9]),
    ];
    const ranked = selectDigest(candidates, { provenTarget: 1, unprovenTarget: 1, lambda: 0.7 });
    expect(ranked.map((r) => r.digestRank)).toEqual([1, 2]);
    const ids = ranked.map((r) => r.id);
    expect(ids).toContain("p1"); // top proven
    expect(ids).toContain("u1"); // top unproven
  });

  it("returns empty when no candidates qualify for either band", () => {
    const ranked = selectDigest([cand("x", 0.5, 0.2, 0.1, [1])], { provenTarget: 2, unprovenTarget: 2, lambda: 0.7 });
    expect(ranked).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run selection test to verify it fails**

Run: `npx vitest run src/tests/lib/scoring/select.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Write the two-band + MMR selector**

`src/lib/scoring/select.ts`:
```ts
import { cosine } from "@/lib/clustering/cosine";

export type Band = "proven" | "unproven" | "none";

export interface ScoredCandidate {
  id: string;
  nicheScore: number;
  provenScore: number | null;
  firstMoverScore: number | null;
  embedding: number[];
}

export interface RankedCandidate extends ScoredCandidate { band: Band; digestRank: number }

const PROVEN_FLOOR = 0.6;
const FIRST_MOVER_FLOOR = 0.7;

export function assignBand(c: ScoredCandidate): Band {
  const proven = c.provenScore ?? 0;
  if (proven > PROVEN_FLOOR) return "proven";
  if ((c.firstMoverScore ?? 0) > FIRST_MOVER_FLOOR) return "unproven";
  return "none";
}

/** MMR pick from one band: maximize lambda*niche - (1-lambda)*maxSimToPicked. */
function mmrPick(pool: ScoredCandidate[], count: number, lambda: number): ScoredCandidate[] {
  const picked: ScoredCandidate[] = [];
  const remaining = [...pool].sort((a, b) => b.nicheScore - a.nicheScore);
  while (picked.length < count && remaining.length > 0) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      const maxSim = picked.length === 0 ? 0 : Math.max(...picked.map((p) => cosine(c.embedding, p.embedding)));
      const val = lambda * c.nicheScore - (1 - lambda) * maxSim;
      if (val > bestVal) { bestVal = val; bestIdx = i; }
    }
    picked.push(remaining.splice(bestIdx, 1)[0]);
  }
  return picked;
}

export function selectDigest(
  candidates: ScoredCandidate[],
  opts: { provenTarget: number; unprovenTarget: number; lambda: number },
): RankedCandidate[] {
  const proven = candidates.filter((c) => assignBand(c) === "proven");
  const unproven = candidates.filter((c) => assignBand(c) === "unproven");
  const pickedProven = mmrPick(proven, opts.provenTarget, opts.lambda).map((c) => ({ ...c, band: "proven" as const }));
  const pickedUnproven = mmrPick(unproven, opts.unprovenTarget, opts.lambda).map((c) => ({ ...c, band: "unproven" as const }));
  // Interleave by niche score, then assign 1-based ranks.
  const merged = [...pickedProven, ...pickedUnproven].sort((a, b) => b.nicheScore - a.nicheScore);
  return merged.map((c, i) => ({ ...c, digestRank: i + 1 }));
}
```

- [ ] **Step 8: Run tests + compile**

Run: `npx vitest run src/tests/lib/scoring/ && npx tsc --noEmit`
Expected: PASS (score 4 + select 2), tsc clean.

- [ ] **Step 9: Commit**

```bash
git add src/lib/scoring/ src/tests/lib/scoring/
git commit -m "feat(plan-5-d): renormalizing niche scorer + two-band/MMR digest selection"
```

---

## Task 10: Scoring components (cold-start-aware) + niche-clusters repo `replaceWeek`

**Files:**
- Create: `src/lib/scoring/components.ts` (build the `ScoreComponents` bag from a cluster)
- Modify: `src/lib/supabase/repositories/niche-clusters.ts` (add `replaceWeek`)
- Test: `src/tests/lib/scoring/components.test.ts`

Components computable from cluster rows alone: `saturationInverse`, `productionFitWeight`, `discoveryStateWeight`, `monetizationSignal` (→ the only non-null `provenScore` sub-component on cold start), `nicheAgeDays` (recorded in explainability). The snapshot-dependent components (`outlierDensity`, `avgVelocity`, 30/60/90d growth, sub_to_view, repeat_winner) and `comment_depth` return `null` now and the scorer renormalizes — they light up automatically as `channel_stat_snapshots`/`video_velocity_snapshots` accumulate.

- [ ] **Step 1: Write the failing test**

`src/tests/lib/scoring/components.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { saturationInverse, nicheAgeDays, monetizationSignal, computeComponents } from "@/lib/scoring/components";
import type { BuiltCluster } from "@/lib/clustering/cluster";

const cluster = (over: Partial<BuiltCluster> = {}): BuiltCluster => ({
  canonicalTopic: "ai tools", formatLabel: "ai_voiceover_facts",
  rows: [
    { video_id: "a", source: "youtube_search", channel_id: "c1", channel_subscriber_count: 1, description: "use code SAVE10", topic_label: "ai tools", format_label: "ai_voiceover_facts", audience_signal: "general", view_count: 1, published_at: null, observed_at: "2026-05-01T00:00:00Z" },
    { video_id: "b", source: "youtube_search", channel_id: "c2", channel_subscriber_count: 1, description: "no sponsor here", topic_label: "ai tools", format_label: "ai_voiceover_facts", audience_signal: "general", view_count: 1, published_at: null, observed_at: "2026-05-01T00:00:00Z" },
    { video_id: "c", source: "youtube_search", channel_id: "c3", channel_subscriber_count: 1, description: null, topic_label: "ai tools", format_label: "ai_voiceover_facts", audience_signal: "general", view_count: 1, published_at: null, observed_at: "2026-05-01T00:00:00Z" },
  ],
  exampleVideoIds: ["a"], channelCount: 3, avgViews: 1, firstSeenAt: "2026-05-01T00:00:00Z",
  productionFit: "native", discoveryState: "pre_public", audienceSignal: "general", ...over,
});

describe("scoring components", () => {
  it("saturationInverse = 1/ln(count+2)", () => {
    expect(saturationInverse(3)).toBeCloseTo(1 / Math.log(5), 6);
  });

  it("nicheAgeDays from firstSeenAt", () => {
    const age = nicheAgeDays("2026-05-01T00:00:00Z", new Date("2026-05-11T00:00:00Z"));
    expect(age).toBeCloseTo(10, 5);
    expect(nicheAgeDays(null, new Date())).toBeNull();
  });

  it("monetizationSignal = fraction of distinct channels with a mention", () => {
    // c1 has 'use code', c2/c3 do not → 1/3
    expect(monetizationSignal(cluster())).toBeCloseTo(1 / 3, 5);
  });

  it("computeComponents: cold-start nulls renormalize; proven=monetization only", () => {
    const { components, explain } = computeComponents(cluster(), new Date("2026-05-11T00:00:00Z"));
    expect(components.saturationInverse).toBeCloseTo(1 / Math.log(5), 6);
    expect(components.productionFitWeight).toBe(1.0);   // native
    expect(components.discoveryStateWeight).toBe(1.0);  // pre_public
    expect(components.provenScore).toBeCloseTo(1 / 3, 5); // monetization is the only available sub-component
    expect(components.firstMoverScore).toBeNull();      // outlier/velocity unavailable
    expect(components.outlierDensity).toBeNull();
    expect(explain.nicheAgeDays).toBeCloseTo(10, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/scoring/components.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the components builder**

`src/lib/scoring/components.ts`:
```ts
import type { BuiltCluster } from "@/lib/clustering/cluster";
import type { ScoreComponents } from "@/lib/scoring/score";
import { PRODUCTION_FIT_WEIGHT } from "@/lib/classifier/taxonomy";

const MONETIZATION_RE = /\b(sponsor|sponsored|patreon|merch|membership|join this channel|promo code|use code|discount code|affiliate)\b/i;

export function saturationInverse(channelCount: number): number {
  return 1 / Math.log(channelCount + 2);
}

export function nicheAgeDays(firstSeenAt: string | null, now: Date): number | null {
  if (!firstSeenAt) return null;
  return Math.max(0, (now.getTime() - new Date(firstSeenAt).getTime()) / 86_400_000);
}

/** Fraction of distinct cluster channels with a monetization mention in any description. */
export function monetizationSignal(cluster: BuiltCluster): number | null {
  const byChannel = new Map<string, boolean>();
  for (const r of cluster.rows) {
    if (!r.channel_id) continue;
    const prev = byChannel.get(r.channel_id) ?? false;
    byChannel.set(r.channel_id, prev || MONETIZATION_RE.test(r.description ?? ""));
  }
  if (byChannel.size === 0) return null;
  return [...byChannel.values()].filter(Boolean).length / byChannel.size;
}

/** Weighted mean over non-null sub-components; null if none available. */
function provenScore(parts: Array<number | null>): number | null {
  const present = parts.filter((p): p is number => p !== null && Number.isFinite(p));
  if (present.length === 0) return null;
  return present.reduce((s, p) => s + p, 0) / present.length;
}

const DISCOVERY_WEIGHT = { pre_public: 1.0, public: 0.5 } as const;

export interface ScoreExplain {
  nicheAgeDays: number | null;
  monetizationSignal: number | null;
  channelCount: number;
}

export function computeComponents(cluster: BuiltCluster, now: Date): { components: ScoreComponents; explain: ScoreExplain } {
  const monetization = monetizationSignal(cluster);
  // Cold-start: snapshot/comment-dependent sub-components are null and renormalize.
  const channelGrowth: number | null = null;
  const subToView: number | null = null;
  const commentDepth: number | null = null; // permanently null in D (no comment ingestion)
  const repeatWinner: number | null = null;
  const outlierDensity: number | null = null;
  const avgVelocity: number | null = null;

  const proven = provenScore([channelGrowth, subToView, commentDepth, repeatWinner, monetization]);
  // first_mover needs outlier_density AND avg_velocity; null until snapshots exist.
  const firstMover: number | null =
    outlierDensity !== null && avgVelocity !== null
      ? (1 / Math.max(nicheAgeDays(cluster.firstSeenAt, now) ?? 1, 1)) * outlierDensity * Math.log(1 + avgVelocity)
      : null;

  const components: ScoreComponents = {
    firstMoverScore: firstMover,
    provenScore: proven,
    saturationInverse: saturationInverse(cluster.channelCount),
    productionFitWeight: PRODUCTION_FIT_WEIGHT[cluster.productionFit],
    discoveryStateWeight: DISCOVERY_WEIGHT[cluster.discoveryState],
    outlierDensity,
  };
  return {
    components,
    explain: { nicheAgeDays: nicheAgeDays(cluster.firstSeenAt, now), monetizationSignal: monetization, channelCount: cluster.channelCount },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/lib/scoring/components.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Add `replaceWeek` to the niche-clusters repo**

First read `src/lib/supabase/repositories/niche-clusters.ts` to match its existing `insertNicheCluster` param names exactly. Then append:
```ts
export interface NicheClusterInsert {
  weekStart: string;            // 'YYYY-MM-DD'
  canonicalTopic: string;
  formatLabel: string;
  exampleVideoIds: string[];
  channelCount: number;
  avgViews: number | null;
  avgVelocity24h: number | null;
  outlierDensity: number | null;
  firstSeenAt: string | null;
  firstMoverScore: number | null;
  provenScore: number | null;
  nicheScore: number | null;
  discoveryState: "pre_public" | "public";
  productionFit: "native" | "needs_manual_recording" | "needs_manual_editing" | "manual_only";
  audienceSignal: string | null;
  digestRank: number | null;
  explainabilityTopSignals: Record<string, unknown>;
}

/** Idempotent weekly write: delete this week's rows, then insert the fresh set. */
export async function replaceWeek(
  supabase: SupabaseClient,
  weekStart: string,
  rows: NicheClusterInsert[],
): Promise<number> {
  const del = await supabase.from("niche_clusters").delete().eq("week_start", weekStart);
  if (del.error) throw new Error(`replaceWeek(delete): ${del.error.message}`);
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("niche_clusters").insert(
    rows.map((r) => ({
      week_start: r.weekStart, canonical_topic: r.canonicalTopic, format_label: r.formatLabel,
      example_video_ids: r.exampleVideoIds, channel_count: r.channelCount, avg_views: r.avgViews,
      avg_velocity_24h: r.avgVelocity24h, outlier_density: r.outlierDensity, first_seen_at: r.firstSeenAt,
      first_mover_score: r.firstMoverScore, proven_score: r.provenScore, niche_score: r.nicheScore,
      discovery_state: r.discoveryState, production_fit: r.productionFit, audience_signal: r.audienceSignal,
      digest_rank: r.digestRank, explainability_top_signals: r.explainabilityTopSignals,
    })),
  );
  if (error) throw new Error(`replaceWeek(insert): ${error.message}`);
  return rows.length;
}
```

- [ ] **Step 6: Compile**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/scoring/components.ts src/tests/lib/scoring/components.test.ts src/lib/supabase/repositories/niche-clusters.ts
git commit -m "feat(plan-5-d): cold-start scoring components + niche-clusters replaceWeek"
```

---

## Task 11: `cluster-niches` cron + adapter

**Files:**
- Create: `src/lib/ingestion/cluster-niches.ts` (adapter — inject embedder + repos)
- Create: `src/app/api/cron/cluster-niches/route.ts`
- Test: `src/tests/lib/ingestion/cluster-niches.test.ts`

The adapter glues everything: fetch joined rows → embed distinct labels (cache-aware) → `fuzzyMergeTopics` → `buildClusters` → `computeComponents`+`computeNicheScore` per cluster → `selectDigest` → `replaceWeek`. Embedding + repos are injected so the whole pipeline is unit-testable without the gateway/DB.

- [ ] **Step 1: Write the failing test**

`src/tests/lib/ingestion/cluster-niches.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { runClustering } from "@/lib/ingestion/cluster-niches";
import type { ClassifiedObservation } from "@/lib/supabase/repositories/shorts-observations";

const obs = (id: string, ch: string, topic: string): ClassifiedObservation => ({
  video_id: id, source: "youtube_search", channel_id: ch, channel_subscriber_count: 1000,
  description: id === "a" ? "use code SAVE" : null, view_count: 100, like_count: 1, comment_count: 0,
  published_at: "2026-05-10T00:00:00Z", observed_at: "2026-05-20T00:00:00Z",
  topic_label: topic, format_label: "ai_voiceover_facts", audience_signal: "general", confidence: 0.9,
});

it("clusters, scores, selects a digest, and persists one week", async () => {
  const rows = [obs("a", "c1", "ai tools"), obs("b", "c2", "ai apps"), obs("c", "c3", "ai tools")];
  // embed: identical vector per label → all merge into one canonical cluster.
  const embed = vi.fn(async (labels: string[]) => labels.map(() => [1, 0, 0]));
  let written: unknown[] = [];
  const result = await runClustering({
    since: new Date("2026-05-01T00:00:00Z"),
    weekStart: "2026-05-25",
    minConfidence: 0.5,
    mergeThreshold: 0.85,
    fetchRows: async () => rows,
    getCachedEmbeddings: async () => new Map(),
    embed,
    saveEmbeddings: async () => {},
    replaceWeek: async (_w, r) => { written = r; return r.length; },
    now: new Date("2026-05-25T00:00:00Z"),
  });
  expect(result.ingested).toBeGreaterThanOrEqual(1);
  expect(written.length).toBe(result.ingested);
  expect(embed).toHaveBeenCalledOnce(); // only uncached labels embedded
});

it("returns ingested=0 when there is nothing to cluster", async () => {
  const result = await runClustering({
    since: new Date(), weekStart: "2026-05-25", minConfidence: 0.5, mergeThreshold: 0.85,
    fetchRows: async () => [], getCachedEmbeddings: async () => new Map(),
    embed: vi.fn(async () => []), saveEmbeddings: async () => {},
    replaceWeek: async () => 0, now: new Date(),
  });
  expect(result.ingested).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/ingestion/cluster-niches.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the adapter**

`src/lib/ingestion/cluster-niches.ts`:
```ts
import "server-only";
import type { AdapterResult } from "@/lib/ingestion/run";
import type { ClassifiedObservation } from "@/lib/supabase/repositories/shorts-observations";
import type { NicheClusterInsert } from "@/lib/supabase/repositories/niche-clusters";
import type { FormatLabel } from "@/lib/supabase/repositories/shorts-classifications";
import { fuzzyMergeTopics } from "@/lib/clustering/cosine";
import { buildClusters, type ClusterInputRow } from "@/lib/clustering/cluster";
import { computeComponents } from "@/lib/scoring/components";
import { computeNicheScore } from "@/lib/scoring/score";
import { selectDigest, type ScoredCandidate } from "@/lib/scoring/select";

export interface RunClusteringArgs {
  since: Date;
  weekStart: string;       // 'YYYY-MM-DD' (Monday of the run's ISO week)
  minConfidence: number;
  mergeThreshold: number;
  now: Date;
  fetchRows: () => Promise<ClassifiedObservation[]>;
  getCachedEmbeddings: (labels: string[]) => Promise<Map<string, number[]>>;
  embed: (labels: string[]) => Promise<number[][]>;
  saveEmbeddings: (rows: Array<{ topicLabel: string; embedding: number[] }>) => Promise<void>;
  replaceWeek: (weekStart: string, rows: NicheClusterInsert[]) => Promise<number>;
}

function toClusterRow(o: ClassifiedObservation): ClusterInputRow {
  return {
    video_id: o.video_id, source: o.source, channel_id: o.channel_id,
    channel_subscriber_count: o.channel_subscriber_count, description: o.description,
    topic_label: o.topic_label, format_label: o.format_label as FormatLabel,
    audience_signal: o.audience_signal, view_count: o.view_count,
    published_at: o.published_at, observed_at: o.observed_at,
  };
}

export async function runClustering(args: RunClusteringArgs): Promise<AdapterResult> {
  const rows = await args.fetchRows();
  if (rows.length === 0) {
    await args.replaceWeek(args.weekStart, []);
    return { ingested: 0, skipped: 0, quotaUnits: 0, context: { clusters: 0, selected: 0 } };
  }

  // Distinct labels + frequencies.
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.topic_label, (counts.get(r.topic_label) ?? 0) + 1);
  const labels = [...counts.keys()];

  // Embeddings: cache hits + embed misses, then persist misses.
  const embeddings = await args.getCachedEmbeddings(labels);
  const misses = labels.filter((l) => !embeddings.has(l));
  if (misses.length > 0) {
    const vectors = await args.embed(misses);
    const toSave: Array<{ topicLabel: string; embedding: number[] }> = [];
    misses.forEach((label, i) => {
      const v = vectors[i];
      if (v) { embeddings.set(label, v); toSave.push({ topicLabel: label, embedding: v }); }
    });
    await args.saveEmbeddings(toSave);
  }

  const canonical = fuzzyMergeTopics(labels, embeddings, counts, args.mergeThreshold);
  const clusters = buildClusters(rows.map(toClusterRow), canonical);

  // Score each cluster; build digest candidates keyed by index.
  const scored = clusters.map((cluster, i) => {
    const { components, explain } = computeComponents(cluster, args.now);
    const { score, contributions } = computeNicheScore(components);
    const canonEmb = embeddings.get(cluster.canonicalTopic) ?? [0];
    return { i, cluster, components, explain, score, contributions, canonEmb };
  });

  const candidates: ScoredCandidate[] = scored.map((s) => ({
    id: String(s.i), nicheScore: s.score, provenScore: s.components.provenScore,
    firstMoverScore: s.components.firstMoverScore, embedding: s.canonEmb,
  }));
  const ranked = selectDigest(candidates, { provenTarget: 5, unprovenTarget: 3, lambda: 0.7 });
  const rankById = new Map(ranked.map((r) => [r.id, r.digestRank]));

  const inserts: NicheClusterInsert[] = scored.map((s) => ({
    weekStart: args.weekStart,
    canonicalTopic: s.cluster.canonicalTopic,
    formatLabel: s.cluster.formatLabel,
    exampleVideoIds: s.cluster.exampleVideoIds,
    channelCount: s.cluster.channelCount,
    avgViews: s.cluster.avgViews,
    avgVelocity24h: null,
    outlierDensity: s.components.outlierDensity,
    firstSeenAt: s.cluster.firstSeenAt,
    firstMoverScore: s.components.firstMoverScore,
    provenScore: s.components.provenScore,
    nicheScore: s.score,
    discoveryState: s.cluster.discoveryState,
    productionFit: s.cluster.productionFit,
    audienceSignal: s.cluster.audienceSignal,
    digestRank: rankById.get(String(s.i)) ?? null,
    explainabilityTopSignals: { ...s.explain, contributions: s.contributions },
  }));

  const written = await args.replaceWeek(args.weekStart, inserts);
  return { ingested: written, skipped: 0, quotaUnits: 0, context: { clusters: clusters.length, selected: ranked.length } };
}
```

- [ ] **Step 4: Write the route**

`src/app/api/cron/cluster-niches/route.ts`:
```ts
import { NextResponse } from "next/server";
import { embedMany } from "ai";
import { assertCronAuth, scraperLog, serializeError } from "@/lib/scrapers/shared";
import { getServiceClient } from "@/lib/supabase/server";
import { runWithIngestionLog } from "@/lib/ingestion/run";
import { assertGatewayConfigured, getGatewayEmbeddingModel, EMBEDDING_MODEL } from "@/lib/ai/models";
import { listClassifiedObservationsSince } from "@/lib/supabase/repositories/shorts-observations";
import { getEmbeddings, upsertEmbeddings } from "@/lib/supabase/repositories/topic-embeddings";
import { replaceWeek } from "@/lib/supabase/repositories/niche-clusters";
import { runClustering } from "@/lib/ingestion/cluster-niches";

export const maxDuration = 300;

/** Monday (UTC) of the given date's ISO week, as YYYY-MM-DD. */
function isoWeekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (x.getUTCDay() + 6) % 7; // 0 = Monday
  x.setUTCDate(x.getUTCDate() - day);
  return x.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }
  try { assertGatewayConfigured(); } catch (e) { return NextResponse.json({ error: serializeError(e) }, { status: 500 }); }

  const supabase = getServiceClient();
  const now = new Date();
  const since = new Date(now.getTime() - 28 * 86_400_000);
  const weekStart = isoWeekStart(now);

  try {
    const run = await runWithIngestionLog(supabase, "cluster_niches", () =>
      runClustering({
        since, weekStart, minConfidence: 0.5, mergeThreshold: 0.85, now,
        fetchRows: () => listClassifiedObservationsSince(supabase, { since, minConfidence: 0.5 }),
        getCachedEmbeddings: (labels) => getEmbeddings(supabase, { labels, model: EMBEDDING_MODEL }),
        embed: async (labels) => {
          const { embeddings } = await embedMany({ model: getGatewayEmbeddingModel(EMBEDDING_MODEL), values: labels });
          return embeddings;
        },
        saveEmbeddings: (saveRows) => upsertEmbeddings(supabase, saveRows.map((r) => ({ ...r, model: EMBEDDING_MODEL }))),
        replaceWeek: (w, clusterRows) => replaceWeek(supabase, w, clusterRows),
      }),
    );
    return NextResponse.json({ ok: true, ...scraperLog("cluster-niches", { run, weekStart }) });
  } catch (e) {
    console.error("cluster-niches failed", e);
    return NextResponse.json({ ok: false, error: serializeError(e) }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run tests + compile**

Run: `npx vitest run src/tests/lib/ingestion/cluster-niches.test.ts && npx tsc --noEmit`
Expected: PASS (2 cases), tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingestion/cluster-niches.ts src/app/api/cron/cluster-niches/route.ts src/tests/lib/ingestion/cluster-niches.test.ts
git commit -m "feat(plan-5-d): cluster-niches cron — cluster→score→select→persist"
```

---

## Task 12: Manual-trigger registry + `POST /api/admin/trigger-ingestion`

**Files:**
- Create: `src/lib/ingestion/registry.ts` (job → cron path + injectable dispatch)
- Create: `src/app/api/admin/trigger-ingestion/route.ts`
- Test: `src/tests/lib/ingestion/registry.test.ts`

> **Design note (deviates from spec §8.1 wording, same outcome):** rather than refactoring the six already-shipped C cron routes into shared callables (risky, expands the diff into C's territory which isn't merged yet), the trigger makes a server-side authenticated `fetch` to the existing cron route with the `CRON_SECRET` bearer. Zero duplication — it invokes the one cron handler — and covers all 8 jobs uniformly. Update the spec's §8.1 note to reflect this.

- [ ] **Step 1: Write the failing test**

`src/tests/lib/ingestion/registry.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { cronPathForJob, triggerIngestion } from "@/lib/ingestion/registry";

describe("cronPathForJob", () => {
  it("maps known jobs to cron paths", () => {
    expect(cronPathForJob("youtube_shorts_search")).toBe("/api/cron/youtube-shorts-search");
    expect(cronPathForJob("classify_observations")).toBe("/api/cron/classify-observations");
    expect(cronPathForJob("cluster_niches")).toBe("/api/cron/cluster-niches");
  });
  it("returns null for an unknown job", () => {
    expect(cronPathForJob("nope" as never)).toBeNull();
  });
});

describe("triggerIngestion", () => {
  it("calls the cron path with the CRON_SECRET bearer", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const res = await triggerIngestion({
      job: "cluster_niches", origin: "https://app.example", secret: "s3cret", fetchImpl,
    });
    expect(res.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://app.example/api/cron/cluster-niches",
      expect.objectContaining({ headers: { authorization: "Bearer s3cret" } }),
    );
  });
  it("rejects an unknown job without fetching", async () => {
    const fetchImpl = vi.fn();
    await expect(triggerIngestion({ job: "nope" as never, origin: "x", secret: "s", fetchImpl }))
      .rejects.toThrow(/unknown job/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/ingestion/registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the registry**

`src/lib/ingestion/registry.ts`:
```ts
import type { IngestionJob } from "@/lib/supabase/repositories/ingestion-runs";

const CRON_PATHS: Record<IngestionJob, string> = {
  youtube_category_sweep: "/api/cron/youtube-category-sweep",
  youtube_shorts_search: "/api/cron/youtube-shorts-search",
  watch_list_sync: "/api/cron/watch-list-sync",
  reddit_topic_discovery: "/api/cron/reddit-topic-discovery",
  google_trends: "/api/cron/google-trends",
  tiktok_creative_center: "/api/cron/tiktok-creative-center",
  classify_observations: "/api/cron/classify-observations",
  cluster_niches: "/api/cron/cluster-niches",
};

export const TRIGGERABLE_JOBS = Object.keys(CRON_PATHS) as IngestionJob[];

export function cronPathForJob(job: IngestionJob): string | null {
  return CRON_PATHS[job] ?? null;
}

export async function triggerIngestion(args: {
  job: IngestionJob;
  origin: string;
  secret: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; status: number; body: unknown }> {
  const path = cronPathForJob(args.job);
  if (!path) throw new Error(`triggerIngestion: unknown job '${args.job}'`);
  const doFetch = args.fetchImpl ?? fetch;
  const res = await doFetch(`${args.origin}${path}`, { headers: { authorization: `Bearer ${args.secret}` } });
  let body: unknown = null;
  try { body = await res.json(); } catch { body = null; }
  return { ok: res.ok, status: res.status, body };
}
```

- [ ] **Step 4: Write the admin route**

`src/app/api/admin/trigger-ingestion/route.ts`:
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { loadEnv } from "@/lib/env";
import { triggerIngestion, TRIGGERABLE_JOBS } from "@/lib/ingestion/registry";
import type { IngestionJob } from "@/lib/supabase/repositories/ingestion-runs";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ job: z.enum(TRIGGERABLE_JOBS as [IngestionJob, ...IngestionJob[]]) });

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid job" }, { status: 400 });
  const env = loadEnv();
  const origin = new URL(req.url).origin;
  const result = await triggerIngestion({ job: parsed.data.job, origin, secret: env.CRON_SECRET });
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
```
> Admin auth: this route follows the app's existing session gating (same as `/api/lab/*` — no inline session check; cockpit auth fronts the app). The `CRON_SECRET` bearer is added server-side; the secret is never exposed to the client.

- [ ] **Step 5: Run tests + compile**

Run: `npx vitest run src/tests/lib/ingestion/registry.test.ts && npx tsc --noEmit`
Expected: PASS (4 cases), tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingestion/registry.ts src/app/api/admin/trigger-ingestion/route.ts src/tests/lib/ingestion/registry.test.ts
git commit -m "feat(plan-5-d): manual ingestion-trigger registry + admin route"
```

---

## Task 13: `/admin/ingestion-health` page

**Files:**
- Modify: `src/lib/supabase/repositories/ingestion-runs.ts` (add `listLatestRunPerJob` + recent-runs-all-jobs helper)
- Create: `src/lib/admin/freshness.ts` (pure freshness classifier)
- Create: `src/app/admin/_components/admin-sidebar.tsx` (shared admin nav)
- Create: `src/app/admin/ingestion-health/page.tsx` (server component)
- Create: `src/app/admin/ingestion-health/trigger-button.tsx` (client)
- Test: `src/tests/lib/admin/freshness.test.ts`

Premium-UI rule: the page LEADS with one big health banner (all-green vs N degraded), then a per-source table with freshness dots, a recent-status sparkline, and a manual-trigger button per source.

- [ ] **Step 1: Write the failing freshness test**

`src/tests/lib/admin/freshness.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { freshnessFor, EXPECTED_MAX_AGE_MS, type RunSummary } from "@/lib/admin/freshness";

const now = new Date("2026-05-29T12:00:00Z");
const summary = (over: Partial<RunSummary>): RunSummary => ({
  job: "google_trends", status: "success", startedAt: "2026-05-29T11:00:00Z", ...over,
});

describe("freshnessFor", () => {
  it("green when last run succeeded within the expected window", () => {
    expect(freshnessFor(summary({ status: "success" }), now).level).toBe("green");
  });
  it("red when the last run failed", () => {
    expect(freshnessFor(summary({ status: "failed" }), now).level).toBe("red");
  });
  it("amber when partial", () => {
    expect(freshnessFor(summary({ status: "partial" }), now).level).toBe("amber");
  });
  it("red when stale beyond 2x the expected cadence", () => {
    const old = new Date(now.getTime() - EXPECTED_MAX_AGE_MS.google_trends * 2.5).toISOString();
    expect(freshnessFor(summary({ status: "success", startedAt: old }), now).level).toBe("red");
  });
  it("red when never run (null)", () => {
    expect(freshnessFor(summary({ startedAt: null }), now).level).toBe("red");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/lib/admin/freshness.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the freshness classifier**

`src/lib/admin/freshness.ts`:
```ts
import type { IngestionJob, IngestionStatus } from "@/lib/supabase/repositories/ingestion-runs";

export interface RunSummary { job: IngestionJob; status: IngestionStatus | null; startedAt: string | null }
export type FreshnessLevel = "green" | "amber" | "red";

const H = 3_600_000;
// Expected max age before a successful job is considered stale (≈2x its cadence headroom).
export const EXPECTED_MAX_AGE_MS: Record<IngestionJob, number> = {
  youtube_category_sweep: 12 * H,
  watch_list_sync: 12 * H,
  youtube_shorts_search: 30 * H,
  reddit_topic_discovery: 30 * H,
  google_trends: 30 * H,
  tiktok_creative_center: 9 * 24 * H,
  classify_observations: 12 * H,
  cluster_niches: 9 * 24 * H,
};

export function freshnessFor(run: RunSummary, now: Date): { level: FreshnessLevel; reason: string } {
  if (!run.startedAt || run.status === null) return { level: "red", reason: "never run" };
  if (run.status === "failed") return { level: "red", reason: "last run failed" };
  const ageMs = now.getTime() - new Date(run.startedAt).getTime();
  const max = EXPECTED_MAX_AGE_MS[run.job];
  if (ageMs > max * 2) return { level: "red", reason: "stale (no recent run)" };
  if (run.status === "partial") return { level: "amber", reason: "last run partial" };
  if (ageMs > max) return { level: "amber", reason: "slightly stale" };
  return { level: "green", reason: "healthy" };
}
```

- [ ] **Step 4: Run freshness test to verify it passes**

Run: `npx vitest run src/tests/lib/admin/freshness.test.ts`
Expected: PASS (5 cases).

- [ ] **Step 5: Add repo helpers**

Append to `src/lib/supabase/repositories/ingestion-runs.ts`:
```ts
/** Most-recent run per job (one row per job, newest). */
export async function listLatestRunPerJob(supabase: SupabaseClient): Promise<IngestionRunRow[]> {
  // Pull a generous recent window and reduce to the newest per job in JS (small table).
  const { data, error } = await supabase
    .from("ingestion_runs")
    .select()
    .order("started_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`listLatestRunPerJob: ${error.message}`);
  const seen = new Map<string, IngestionRunRow>();
  for (const row of (data ?? []) as IngestionRunRow[]) if (!seen.has(row.job)) seen.set(row.job, row);
  return [...seen.values()];
}

/** Recent runs across all jobs (for per-job sparklines), newest first. */
export async function listRecentRuns(supabase: SupabaseClient, limit: number): Promise<IngestionRunRow[]> {
  const { data, error } = await supabase
    .from("ingestion_runs")
    .select()
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentRuns: ${error.message}`);
  return (data ?? []) as IngestionRunRow[];
}
```

- [ ] **Step 6: Write the shared admin sidebar**

`src/app/admin/_components/admin-sidebar.tsx`:
```tsx
"use client";
import { Activity, ListChecks } from "lucide-react";
import { Sidebar, type SidebarItem } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const ADMIN_NAV: SidebarItem[] = [
  { href: "/admin/ingestion-health", label: "Ingestion Health", icon: Activity },
  { href: "/admin/classification-review", label: "Classification Review", icon: ListChecks },
];

export function AdminSidebar({ activeHref }: { activeHref: string }) {
  return <Sidebar items={ADMIN_NAV} activeHref={activeHref} footer={<ThemeToggle />} />;
}
```
> Confirm `theme-toggle.tsx` exports `ThemeToggle` (it does per `src/components/layout/theme-toggle.tsx`). Confirm `SidebarItem` is exported from `sidebar.tsx` (it is).

- [ ] **Step 7: Write the trigger button (client)**

`src/app/admin/ingestion-health/trigger-button.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function TriggerButton({ job }: { job: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function run() {
    setPending(true);
    try {
      const res = await fetch("/api/admin/trigger-ingestion", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) { toast.success(`Triggered ${job}`); router.refresh(); }
      else toast.error(`Trigger failed: ${body.error ?? res.status}`);
    } finally { setPending(false); }
  }
  return <Button size="sm" variant="outline" disabled={pending} onClick={run}>{pending ? "Running…" : "Run now"}</Button>;
}
```
> Verify `sonner`'s export is `toast` and a `<Toaster/>` is mounted in `src/app/layout.tsx` (it is). `Button` lives at `@/components/ui/button`.

- [ ] **Step 8: Write the page (server component)**

`src/app/admin/ingestion-health/page.tsx` — lead with the health banner, then the per-source table. Read `node_modules/next/dist/docs/` for any App Router specifics before writing; this is a plain async Server Component (no special APIs).
```tsx
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getServiceClient } from "@/lib/supabase/server";
import { listLatestRunPerJob, listRecentRuns, type IngestionRunRow } from "@/lib/supabase/repositories/ingestion-runs";
import { freshnessFor, type FreshnessLevel } from "@/lib/admin/freshness";
import { TRIGGERABLE_JOBS } from "@/lib/ingestion/registry";
import { AdminSidebar } from "@/app/admin/_components/admin-sidebar";
import { TriggerButton } from "./trigger-button";

export const dynamic = "force-dynamic";

const DOT: Record<FreshnessLevel, string> = {
  green: "bg-[var(--success,#22c55e)]", amber: "bg-[var(--warning,#f59e0b)]", red: "bg-[var(--danger,#ef4444)]",
};

export default async function IngestionHealthPage() {
  const supabase = getServiceClient();
  const [latest, recent] = await Promise.all([listLatestRunPerJob(supabase), listRecentRuns(supabase, 200)]);
  const now = new Date();
  const byJob = new Map(latest.map((r) => [r.job, r]));
  const recentByJob = new Map<string, IngestionRunRow[]>();
  for (const r of recent) (recentByJob.get(r.job) ?? recentByJob.set(r.job, []).get(r.job)!).push(r);

  const rows = TRIGGERABLE_JOBS.map((job) => {
    const last = byJob.get(job);
    const fresh = freshnessFor({ job, status: last?.status ?? null, startedAt: last?.started_at ?? null }, now);
    return { job, last, fresh, spark: (recentByJob.get(job) ?? []).slice(0, 12).reverse() };
  });
  const degraded = rows.filter((r) => r.fresh.level !== "green");

  return (
    <AppShell sidebar={<AdminSidebar activeHref="/admin/ingestion-health" />}>
      <PageHeader title="Ingestion Health" description="Per-source freshness, success rate, and manual re-runs." />

      {/* PRIMARY signal */}
      <Card className="mb-8 p-6">
        {degraded.length === 0 ? (
          <div className="flex items-center gap-3">
            <span className={`inline-block size-3 rounded-full ${DOT.green}`} />
            <span className="text-lg font-semibold text-[var(--text-primary)]">All {rows.length} sources healthy</span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className={`inline-block size-3 rounded-full ${DOT.red}`} />
            <span className="text-lg font-semibold text-[var(--text-primary)]">
              {degraded.length} of {rows.length} sources need attention
            </span>
          </div>
        )}
      </Card>

      <div className="space-y-2">
        {rows.map(({ job, last, fresh, spark }) => (
          <Card key={job} className="flex items-center gap-4 px-4 py-3">
            <span className={`inline-block size-2.5 rounded-full ${DOT[fresh.level]}`} title={fresh.reason} />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-[var(--text-primary)]">{job}</div>
              <div className="text-xs text-[var(--text-secondary)]">
                {last ? `last ${new Date(last.started_at).toLocaleString()} · ${last.status} · ${last.items_ingested} items · ${last.quota_units} quota` : "never run"}
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {spark.map((r) => (
                <span key={r.id} title={r.status}
                  className={`inline-block h-4 w-1.5 rounded-sm ${r.status === "success" ? DOT.green : r.status === "partial" ? DOT.amber : r.status === "skipped" ? "bg-[var(--border-subtle)]" : DOT.red}`} />
              ))}
            </div>
            <Badge variant="outline">{fresh.level}</Badge>
            <TriggerButton job={job} />
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
```
> The `Card`/`Badge` import paths + props must match the installed shadcn variants — open `src/components/ui/card.tsx` and `badge.tsx` first and adjust (e.g. `Badge` `variant`). CSS vars (`--text-primary`, `--border-subtle`, etc.) come from `globals.css`; the `var(--success,#…)` fallbacks cover any token not yet defined.

- [ ] **Step 9: Verify in the browser**

Start the dev server (remember to drop the inherited base URL): `env -u ANTHROPIC_BASE_URL npm run dev` (or use the preview tooling). Visit `/admin/ingestion-health`. Confirm: banner renders, each of the 8 jobs shows a row with a freshness dot + sparkline + "Run now" button, no console/server errors. (Seed a couple `ingestion_runs` rows locally if the table is empty so the UI isn't all "never run".) Capture a screenshot.

- [ ] **Step 10: Run tests + compile + commit**

Run: `npx vitest run src/tests/lib/admin/freshness.test.ts && npx tsc --noEmit`
Expected: PASS, clean.
```bash
git add src/lib/admin/freshness.ts src/lib/supabase/repositories/ingestion-runs.ts src/app/admin/ src/tests/lib/admin/freshness.test.ts
git commit -m "feat(plan-5-d): /admin/ingestion-health page + freshness classifier"
```

---

## Task 14: `/admin/classification-review` page

**Files:**
- Create: `src/app/api/admin/review-sample/route.ts` (verdict write)
- Create: `src/app/admin/classification-review/verdict-buttons.tsx` (client)
- Create: `src/app/admin/classification-review/page.tsx` (server component)
- Test: none new (logic lives in the already-tested `aggregateAccuracyByFormat`; verify via browser + `tsc`).

Premium-UI rule: LEAD with per-`format_label` accuracy (the signal that tells Darius whether the classifier is trustworthy), then the unreviewed-sample queue.

- [ ] **Step 1: Write the verdict-write route**

`src/app/api/admin/review-sample/route.ts`:
```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { recordSampleVerdict } from "@/lib/supabase/repositories/classification-samples";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  id: z.string().uuid(),
  verdict: z.enum(["correct", "wrong", "partial"]),
});

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const supabase = getServiceClient();
  await recordSampleVerdict(supabase, { id: parsed.data.id, verdict: parsed.data.verdict, reviewedBy: "admin" });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write the verdict buttons (client)**

`src/app/admin/classification-review/verdict-buttons.tsx`:
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Verdict = "correct" | "wrong" | "partial";

export function VerdictButtons({ id }: { id: string }) {
  const [pending, setPending] = useState<Verdict | null>(null);
  const router = useRouter();
  async function send(verdict: Verdict) {
    setPending(verdict);
    try {
      const res = await fetch("/api/admin/review-sample", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, verdict }),
      });
      if (res.ok) { toast.success(`Marked ${verdict}`); router.refresh(); }
      else toast.error("Failed to save verdict");
    } finally { setPending(null); }
  }
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => send("correct")}>Correct</Button>
      <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => send("partial")}>Partial</Button>
      <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => send("wrong")}>Wrong</Button>
    </div>
  );
}
```

- [ ] **Step 3: Write the page (server component)**

`src/app/admin/classification-review/page.tsx`:
```tsx
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getServiceClient } from "@/lib/supabase/server";
import { listUnreviewedSamples, aggregateAccuracyByFormat } from "@/lib/supabase/repositories/classification-samples";
import { AdminSidebar } from "@/app/admin/_components/admin-sidebar";
import { VerdictButtons } from "./verdict-buttons";

export const dynamic = "force-dynamic";

export default async function ClassificationReviewPage() {
  const supabase = getServiceClient();
  const [accuracy, samples] = await Promise.all([
    aggregateAccuracyByFormat(supabase),
    listUnreviewedSamples(supabase, { limit: 50 }),
  ]);
  const sorted = [...accuracy].sort((a, b) => b.total - a.total);

  return (
    <AppShell sidebar={<AdminSidebar activeHref="/admin/classification-review" />}>
      <PageHeader title="Classification Review" description="Spot-check the 5% sample and track per-format accuracy." />

      {/* PRIMARY signal: accuracy by format */}
      <Card className="mb-8 p-6">
        <div className="mb-3 text-sm font-medium text-[var(--text-secondary)]">Accuracy by format (reviewed samples)</div>
        {sorted.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No reviewed samples yet — work the queue below.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {sorted.map((a) => {
              const pct = a.total > 0 ? Math.round((a.correct / a.total) * 100) : 0;
              return (
                <div key={a.format_label} className="rounded-lg border border-[var(--border-subtle)] p-3">
                  <div className="text-xs text-[var(--text-secondary)]">{a.format_label}</div>
                  <div className="text-2xl font-semibold text-[var(--text-primary)]">{pct}%</div>
                  <div className="text-xs text-[var(--text-tertiary)]">{a.correct}/{a.total} correct · {a.partial} partial</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <h2 className="mb-3 text-sm font-medium text-[var(--text-secondary)]">Unreviewed samples ({samples.length})</h2>
      <div className="space-y-3">
        {samples.length === 0 ? (
          <Card className="p-6"><p className="text-sm text-[var(--text-secondary)]">Queue empty — no samples awaiting review.</p></Card>
        ) : samples.map((s) => {
          const labels = s.chosen_labels as { topic_label?: string; format_label?: string; audience_signal?: string; confidence?: number };
          return (
            <Card key={s.id} className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="outline">{labels.format_label ?? "?"}</Badge>
                <span className="text-sm font-medium text-[var(--text-primary)]">{labels.topic_label ?? "?"}</span>
                <span className="text-xs text-[var(--text-tertiary)]">conf {labels.confidence ?? "?"} · {labels.audience_signal ?? "?"}</span>
              </div>
              <details className="mb-3">
                <summary className="cursor-pointer text-xs text-[var(--text-secondary)]">Model response</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-[var(--surface-overlay)] p-2 text-xs">{s.response_full}</pre>
              </details>
              <VerdictButtons id={s.id} />
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
```
> Thumbnails: the sample doesn't store a thumbnail URL. If you want the thumbnail visible (nice for review), join the sample's `video_id` to `shorts_observations.thumbnail_url` in `listUnreviewedSamples` (add a `!inner` select) and render an `<img>`. Optional polish — not required for green.

- [ ] **Step 4: Verify in the browser**

`env -u ANTHROPIC_BASE_URL npm run dev`, visit `/admin/classification-review`. With an empty DB you should see the two empty-states (no accuracy yet / queue empty). Seed a `classification_samples` row locally to confirm a card renders and a verdict button POSTs successfully and refreshes. Capture a screenshot.

- [ ] **Step 5: Compile + commit**

Run: `npx tsc --noEmit`
Expected: clean.
```bash
git add src/app/admin/classification-review/ src/app/api/admin/review-sample/route.ts
git commit -m "feat(plan-5-d): /admin/classification-review page + verdict write"
```

---

## Task 15: Register crons + full verification + handoff

**Files:**
- Modify: `vercel.ts` (add 2 crons)
- Create: `docs/superpowers/notes/2026-05-29-plan-5-phase-1-sub-d-handoff.md`

- [ ] **Step 1: Register the crons**

In `vercel.ts`, inside the `crons` array (after the Sub-phase C block ending with `tiktok-creative-center`), add:
```ts
    // ── Plan #5 Sub-phase D — niche-finder brain ──
    { path: '/api/cron/classify-observations', schedule: '15 */6 * * *' }, // every 6h, offset after ingestion
    { path: '/api/cron/cluster-niches',        schedule: '0 23 * * 0'   }, // weekly Sun 23:00 UTC
```
> Note the Hobby-plan cron-frequency caveat already in `vercel.ts` (sub-daily crons need Pro). `classify-observations` at `15 */6` is sub-daily — same situation as the existing category-sweep/watch-list crons, so no new constraint.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all NEW tests green; the only failures are the 11 pre-existing env-gated ones from the C baseline (AI gateway / env loader / live-DB). Confirm the count matches baseline — no new failures.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && env -u ANTHROPIC_BASE_URL npm run build`
Expected: tsc clean (no `any`); build succeeds (the two new pages + routes compile).

- [ ] **Step 4: Spec-coverage self-check**

Walk the spec (`docs/superpowers/specs/2026-05-29-plan-5-phase-1-sub-d-design.md`) §3–§13 and confirm each shipped item maps to a task: transcript client (T3), gateway config (T2), classifier two-pass + sampling + versioning (T4/T5), classify cron (T7), embeddings+clustering (T8), discovery_state/production_fit (T4/T8), scoring + renormalization + two-band/MMR (T9/T10), cluster cron (T11), topic_embeddings table (T1), manual trigger (T12), ingestion-health (T13), classification-review (T14), crons (T15). Confirm non-goals (digest email, sealed predictions, comment ingestion, niche UI, deferred admin pages, pgvector) are absent.

- [ ] **Step 5: Write the handoff note**

`docs/superpowers/notes/2026-05-29-plan-5-phase-1-sub-d-handoff.md` — what D ships, where things live, what's operator-gated (live gateway/YouTube smoke), and the fresh-chat kickoff prompt for the next sub-phase (digest email + sealed predictions + niche-finder UI). Mirror the C handoff's structure.

- [ ] **Step 6: Final commit + PR**

```bash
git add vercel.ts docs/superpowers/notes/2026-05-29-plan-5-phase-1-sub-d-handoff.md
git commit -m "chore(plan-5-d): register classify/cluster crons + Sub-phase D handoff"
```
Then push and open a PR against `main` (note in the PR body that it stacks on `plan-5-phase-1-sub-c` #15 and should merge after it). Do NOT push or open the PR without Darius's go-ahead.

---

## Live-smoke checklist (operator-gated, post-merge)

Like Sub-phase C, the first real runs need secrets (`AI_GATEWAY_API_KEY`, `YOUTUBE_API_KEY`) in the deploy env. After they're set:
1. Trigger `classify-observations` (dashboard or authorized curl with `CRON_SECRET`). Confirm an `ingestion_runs` row (`job=classify_observations`), new `shorts_classifications` rows, and ~5% `classification_samples`.
2. Trigger `cluster-niches`. Confirm `niche_clusters` rows for the current `week_start` with `production_fit`, `discovery_state`, `niche_score`, and `digest_rank` on the top ~10.
3. Open `/admin/ingestion-health` (all 8 jobs visible) and `/admin/classification-review` (samples + accuracy).
