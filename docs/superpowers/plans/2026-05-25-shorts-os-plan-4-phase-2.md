# Plan #4 Phase 2 — Format-1 full pipeline + /lab/drafts review UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use `- [ ]` syntax for tracking. Each task gets a fresh subagent; two-stage review (subagent self-review + parent review) between tasks.

**Goal:** Replace Phase-1's black-background `render_f1` with the full Format-1 pipeline (Pexels b-roll concat + Whisper-aligned caption burn-in + optional music bed), wire the operator's Render → Review → Post-now flow at `/lab/drafts`, and pass a <120s end-to-end render benchmark.

**Architecture:**
- **Render path:** Cartesia TTS → Pexels per-shot vertical clip download → Groq Whisper forced-alignment → SRT generation → music_tracks pick (best-effort, soft-skip when empty) → ffmpeg single concat-then-mux pass → Blob upload → callback.
- **UI path:** new `/lab/drafts` page with 3 tabs (Draft | Rendered | Posted). `DraftRow` gains a Render button + status-aware variants. `RenderedRow` shows inline `<video>` + Approve&Schedule (disabled, Phase 5) + Post-now (logs-only stub) + Reject.
- **Discipline carried from Phase 1:** RenderWorker abstraction stays clean (no `@vercel/sandbox` imports outside `src/lib/render/workers/vercel-sandbox.ts` + `scripts/render-worker/`). New `/api/lab/*` routes require cockpit auth (NOT added to `PUBLIC_PATH_PREFIXES`). Conventional Commits, TS strict, no `any`, Zod at boundaries, `server-only` on secret-holding modules.

**Tech Stack:** Next.js 16.2.6 (App Router), ffmpeg-static (concat demuxer + filter_complex), @vercel/blob, Cartesia REST, Pexels v1, Groq `/audio/transcriptions` (verbose_json + word granularities), vitest with HTTP-boundary mocks. No new npm deps in the worker package — everything fits within the Phase 1 deps.

---

## Plan deltas vs the prompt outline

These are deliberate departures from the outline at the bottom of `2026-05-25-shorts-os-plan-4-render-pipeline.md`, made during sub-planning:

1. **Treatment name uses kebab-case (`held-shot-with-text-animation`)**, not the snake_case `held_shot_with_text_animation` from the outline. Reason: all existing entries in `VISUAL_TREATMENTS` (`kinetic-typography`, `stock-montage`, etc.) are kebab-case. Convention matches the codebase.

2. **`/lab` page is unchanged.** The outline lists `src/app/lab/page.tsx` under "Files to modify", but Phase 1's /lab page is a dispatch console (Ready to Dispatch → Active Run → Recent Drafts). The new tabbed UI lives at `/lab/drafts`. /lab's RecentDraftsPane stays — clicking Render on a row there works the same way (DraftRow is shared). Spec §5 phrases the new UI as "/lab/drafts UI update" which fits this split cleanly.

3. **No `src/lib/clients/cartesia.ts` is created.** The outline lists this under "Files to create", but the only consumer in Phase 2 is the worker (which has `scripts/render-worker/lib/cartesia.ts`). Voice Coach doesn't call Cartesia (it picks an id from the static `VOICE_POOL`). A server-side Cartesia client would be unused dead code; defer to whenever a server-side Cartesia call is actually needed.

4. **`/api/lab/upload` (not `/api/lab/post-now`)** matches spec §5's contract for "Post now → POSTs to `/api/lab/upload`". In Phase 2 the route body is a stub; Phase 5 swaps it for the real `enqueueRenderJob({ jobType: 'upload' })` call. Same path, no migration needed.

5. **Worker handler's `fetchShotList` duplicates the `getDirectorShotListForVideo` repo helper** (Task 10). Reason: Sandbox-side code can't import from `src/*` (separate tsconfig + npm package). The repo helper is added anyway because it's unit-testable from the Next.js side and may be used by future routes that need to display the shot list in the UI.

---

## File map

### Created
- `src/lib/clients/pexels.ts` — Pexels v1 `searchVideos(query, opts)` (server-only)
- `src/lib/clients/groq-whisper.ts` — Groq `/audio/transcriptions` client (server-only; verbose_json + word timestamps)
- `src/app/api/lab/render/route.ts` — POST `/api/lab/render` → enqueue `render_f1`
- `src/app/api/lab/upload/route.ts` — POST `/api/lab/upload` → Phase 2 stub (logs + returns 200; Phase 5 replaces body with real `enqueueRenderJob({ jobType: 'upload', ... })`)
- `src/app/api/lab/reject/route.ts` — POST `/api/lab/reject` → set `status='failed'`
- `src/app/lab/drafts/page.tsx` — 3-tab review page
- `src/components/lab/drafts-tabs.tsx` — client tabs (URL param `?tab=draft|rendered|posted`)
- `src/components/lab/rendered-row.tsx` — Rendered tab row
- `src/components/lab/posted-row.tsx` — Posted tab row (placeholder for Phase 5)
- `src/lib/supabase/repositories/music-tracks.ts` — `pickAmbientCinematicTrack` selector
- `scripts/render-worker/lib/pexels.ts` — worker-side fetch + download
- `scripts/render-worker/lib/whisper.ts` — worker-side Groq client + SRT generator
- `scripts/render-worker/lib/music.ts` — worker-side music_tracks fetch + download
- `scripts/render-worker/lib/probe.ts` — ffprobe wrapper for accurate WAV duration
- `docs/superpowers/notes/2026-05-25-plan-4-phase-2-benchmark.md` — exit benchmark

### Modified
- `src/lib/agents/constants.ts` — add `held_shot_with_text_animation` to VISUAL_TREATMENTS; replace preset-name VOICE_POOL ids with real Cartesia UUIDs
- `src/lib/agents/director.ts` — prompt regeneration to describe new treatment
- `src/components/lab/draft-row.tsx` — Render button + rendering-state UI
- `src/components/lab/recent-drafts-pane.tsx` — rename + tab-aware listing (or keep + add a sibling pane)
- `src/lib/supabase/repositories/your-videos.ts` — add `listVideosByStatus`, `setVideoStatus`
- `src/app/api/render/complete/route.ts` — log render_artifact_url + duration in structured form (no behavior change; quality of life for Phase 2 debugging)
- `scripts/render-worker/handlers/render-f1.ts` — full pipeline
- `scripts/render-worker/lib/ffmpeg-commands.ts` — new `renderF1Composition` function (multi-input concat + caption burn-in + audio mix)
- `scripts/render-worker/lib/cartesia.ts` — use ffprobe for duration instead of WAV-bytes heuristic
- `src/proxy.ts` — verify `/api/lab/*` is NOT in `PUBLIC_PATH_PREFIXES` (audit-only; no change expected)
- `src/app/api/render/debug/route.ts` — delete OR admin-gate (operator decision)

---

## Pre-flight (run once before Task 1)

```bash
# Confirm clean baseline
cd /Users/darius/Downloads/shorts-os
git status            # expect: clean on main
npm test              # expect: 151/151 passing
git log -1 --oneline  # expect: ceb9cd9 docs(plan-4): Phase 1 benchmark — PASS at 15s
```

Create branch:
```bash
git checkout -b plan-4-phase-2
```

---

## Task 1: Audit & delete `/api/render/debug` route

**Files:**
- Delete: `src/app/api/render/debug/route.ts`

Rationale: Phase 1 benchmark passed; the debug route spins up a Sandbox on every hit (cost + abuse risk) and there's no reason to keep it on a public repo. CRON_SECRET auth alone isn't sufficient long-term.

- [ ] **Step 1.1: Remove the route file**

```bash
rm src/app/api/render/debug/route.ts
rmdir src/app/api/render/debug
```

- [ ] **Step 1.2: Run tests to confirm no test referenced this route**

```bash
npm test
```
Expected: 151/151 passing.

- [ ] **Step 1.3: Commit**

```bash
git add -A
git commit -m "chore(render): delete debug route now that Phase 1 benchmark passed"
```

---

## Task 2: Replace VOICE_POOL preset-name ids with real Cartesia UUIDs

**Operator constraint (locked in):** Pool is 6 voices, slot-typed for variety across future multi-channel work. Cars channel `dyfrx_9754` keeps Corey's UUID (`630ed21c-2c5c-41cf-9d82-10a7fd668370`) as `channels.default_voice_id`. Voice Coach defaults to that channel default in ~95% of dispatches; only deviates when script tone explicitly demands a different voice (e.g., a dramatic crash story → dramatic-male).

**Slot spec:**
1. `narrative-male-warm` (Corey — preserve current channel default UUID `630ed21c-2c5c-41cf-9d82-10a7fd668370`)
2. `narrative-male-deadpan` — dry, mid-pace, slightly skeptical
3. `narrative-male-energetic` — TikTok-native pace, punchy male
4. `dramatic-male` — gravelly, '60 Minutes' weight, suited to crash/disaster stories
5. `casual-male` — conversational, friendly, podcast-style
6. `wild-card` — anything that breaks the male-narrator mold (foreign accent, female, character voice). Whatever Cartesia's catalog offers that's most distinctive.

**Files:**
- Modify: `src/lib/agents/constants.ts:27-67`
- Modify: `src/lib/agents/voice-coach.ts:84-99` (prompt change for channel-default bias)
- Modify: `src/tests/lib/agents/voice-coach.test.ts` (if it hardcodes preset names — verify; tests use `VOICE_POOL_IDS[0]` indirectly so the structure stays the same)

- [ ] **Step 2.1: Fetch Cartesia voice catalog**

The local `.env.local` has a placeholder CARTESIA_API_KEY. Pull the real key from Vercel:

```bash
# Pull preview env vars to a temp file (Vercel CLI; project must be linked)
vercel env pull .env.vercel-pull.tmp --environment=preview
set -a && source .env.vercel-pull.tmp && set +a
```

If `vercel env pull` is unavailable, fall back to the Vercel MCP (`mcp__plugin_vercel_vercel__*`) or have the operator paste the key into the shell.

Hit the catalog. Cartesia's `/voices` endpoint uses `X-API-Key` header per their public docs:

```bash
curl -sS -H "X-API-Key: $CARTESIA_API_KEY" \
     -H "Cartesia-Version: 2025-04-16" \
     "https://api.cartesia.ai/voices?limit=200" \
     -o /tmp/cartesia-voices.json
jq 'length' /tmp/cartesia-voices.json  # sanity check; should be > 0
```

If the response is an object wrapping `{ data: [...] }` rather than a top-level array, adjust the jq paths in step 2.2 accordingly.

- [ ] **Step 2.2: Pick 6 voices matching the slot spec**

Filter by `language='en'` and `gender='masculine'` (5 of 6 slots; the wild-card can be anything). Inspect each voice's `name` + `description` fields. Pick UUIDs that match the slot personas. Capture name + UUID in the commit message body so the operator can rubber-stamp in PR review.

```bash
jq '[.[] | select(.language=="en") | { id, name, description, gender }] | .[0:30]' /tmp/cartesia-voices.json | less
```

After picking, delete the temp env file:

```bash
rm /tmp/cartesia-voices.json .env.vercel-pull.tmp
```

- [ ] **Step 2.3: Update VOICE_POOL**

```ts
// src/lib/agents/constants.ts
export const VOICE_POOL = [
  {
    id: "630ed21c-2c5c-41cf-9d82-10a7fd668370",  // Corey — Supportive Buddy. Channel default for dyfrx_9754.
    provider: "cartesia",
    description: "Warm masculine US English casual narrator (cars channel default)",
  },
  {
    id: "<UUID-narrative-male-deadpan>",
    provider: "cartesia",
    description: "Dry deadpan male, mid-pace, slightly skeptical",
  },
  {
    id: "<UUID-narrative-male-energetic>",
    provider: "cartesia",
    description: "Energetic male, TikTok-native pace, punchy",
  },
  {
    id: "<UUID-dramatic-male>",
    provider: "cartesia",
    description: "Gravelly dramatic male, '60 Minutes' weight, crash/disaster stories",
  },
  {
    id: "<UUID-casual-male>",
    provider: "cartesia",
    description: "Casual conversational male, podcast-style storyteller",
  },
  {
    id: "<UUID-wild-card>",
    provider: "cartesia",
    description: "Wild-card: distinctive voice that breaks the male-narrator mold",
  },
] as const;
```

Real UUIDs replace the `<UUID-…>` placeholders from step 2.2's picks. Provider stays `'cartesia'` for all 6 (ElevenLabs still deferred). `VOICE_PROVIDERS` array stays `["cartesia","elevenlabs"]` — no schema churn.

- [ ] **Step 2.4: Update Voice Coach prompt for channel-default bias**

```ts
// src/lib/agents/voice-coach.ts:84-99 — replace buildPrompt
function buildPrompt(ctx: VoiceCoachRunContext): string {
  return `You are The Voice Coach. Pick ONE voice from the pool below for this script.

Script:
${ctx.previousOutputs.writer.script}

Channel persona:
${JSON.stringify(ctx.channel.persona, null, 2)}

Channel default voice_id: ${ctx.channel.default_voice_id ?? "(none)"}

Voice pool (you must pick a voice_id from this list — no others are valid):
${VOICE_POOL.map((v) => `- ${v.id} (${v.provider}): ${v.description}`).join("\n")}

DECISION RULE:
- Default strongly to the channel default voice_id. In ~95% of cases, the channel default IS the right pick.
- Only deviate when the script's tone EXPLICITLY demands a different voice — e.g., a dramatic crash/disaster story may warrant the dramatic-male voice, a high-energy hype piece may warrant the energetic-male voice.
- A passing reference to "drama" or "energy" in the script is NOT enough — the script's overall tone has to genuinely match a non-default voice better than the default.

Set speed (0.8–1.2; 1.0 is normal pace) and stability (0–1; lower = more expressive, higher = more consistent).
Explain your pick in 1-2 sentences. If you picked the channel default, say so; if you deviated, name the specific tonal cue in the script that triggered the override.`;
}
```

- [ ] **Step 2.5: Update channel migration (preserve Corey UUID)**

`channels.default_voice_id` for `dyfrx_9754` already equals Corey's UUID after Phase 1 (per the benchmark notes). Phase 2's `VOICE_POOL[0]` is the same UUID, so no migration needed — the channel default is already in the pool. Verify before assuming:

```bash
# Via Supabase MCP or psql
mcp__eb0e215d-09d2-42bf-b558-7c883674fdc6__execute_sql \
  "select slug, default_voice_id, default_tts_provider from public.channels where slug='dyfrx_9754'"
```

Expected: `default_voice_id = '630ed21c-2c5c-41cf-9d82-10a7fd668370'`, `default_tts_provider = 'cartesia'`. If different, write a corrective migration `supabase/migrations/20260525000005_phase_2_align_default_voice.sql` to align it. If it's correct, skip the migration.

- [ ] **Step 2.6: Run tests**

```bash
npm test
```
Expected: 151/151 still passing. (`director.test.ts` uses `VOICE_POOL_IDS[0]` dynamically; the schema-patterns test just iterates VOICE_POOL.)

- [ ] **Step 2.7: Commit**

Commit message MUST include the 6 picked voices (name + UUID + description) so operator can rubber-stamp in PR review:

```bash
git add src/lib/agents/constants.ts src/lib/agents/voice-coach.ts \
        supabase/migrations/20260525000005_phase_2_align_default_voice.sql 2>/dev/null  # only if migration written
git commit -m "$(cat <<'EOF'
feat(voice-pool): replace preset-name ids with real Cartesia UUIDs

Slot picks (rubber-stamp in PR review):
1. narrative-male-warm     → 630ed21c-2c5c-41cf-9d82-10a7fd668370 (Corey — Supportive Buddy) [CHANNEL DEFAULT for dyfrx_9754]
2. narrative-male-deadpan  → <UUID> (<Name>)
3. narrative-male-energetic→ <UUID> (<Name>)
4. dramatic-male           → <UUID> (<Name>)
5. casual-male             → <UUID> (<Name>)
6. wild-card               → <UUID> (<Name>)

Voice Coach prompt now defaults strongly to channel.default_voice_id;
deviation requires an explicit tonal cue in the script.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `held_shot_with_text_animation` to VISUAL_TREATMENTS

**Files:**
- Modify: `src/lib/agents/constants.ts:7-25`
- Modify: `src/lib/agents/director.ts` (prompt mentions new treatment via VISUAL_TREATMENT_DESCRIPTIONS — auto-picks up; no manual edit needed)
- Modify: `src/tests/lib/agents/director.test.ts` (existing test references VISUAL_TREATMENTS[0] — still passes)

- [ ] **Step 3.1: Add the treatment to the const array + description map**

```ts
// src/lib/agents/constants.ts
export const VISUAL_TREATMENTS = [
  "kinetic-typography",
  "stock-montage",
  "data-viz",
  "archive-collage",
  "satellite-zoom",
  "split-screen",
  "held-shot-with-text-animation",  // NEW
] as const;

export const VISUAL_TREATMENT_DESCRIPTIONS: Record<VisualTreatment, string> = {
  "kinetic-typography": "text flying / animated, words highlighted as spoken",
  "stock-montage": "sequence of stock video clips matching script beats",
  "data-viz": "animated charts, graphs, numbers",
  "archive-collage": "old photos, newspaper clippings, grainy footage",
  "satellite-zoom": "Google-Earth-style zooms into locations",
  "split-screen": "two clips side by side, comparison-style",
  "held-shot-with-text-animation":
    "single sustained b-roll shot with animated text overlays that pulse with the captions",
};
```

- [ ] **Step 3.2: Run director tests**

```bash
npm test -- src/tests/lib/agents/director.test.ts
```
Expected: PASS.

- [ ] **Step 3.3: Commit**

```bash
git add src/lib/agents/constants.ts
git commit -m "feat(director): add held-shot-with-text-animation visual treatment"
```

---

## Task 4: Pexels client (server-only)

**Files:**
- Create: `src/lib/clients/pexels.ts`
- Create: `src/tests/lib/clients/pexels.test.ts`

The client is server-only (holds PEXELS_API_KEY) and parses the v1 response with Zod. Worker-side downloader (Task 5) consumes the search-result link. Per spec: pick a vertical (height >= width) video file at or near 1080×1920; fall back to the highest-quality file when no vertical exists.

- [ ] **Step 4.1: Write the failing test**

```ts
// src/tests/lib/clients/pexels.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const ORIGINAL_KEY = process.env.PEXELS_API_KEY;
beforeEach(() => {
  process.env.PEXELS_API_KEY = "fake-key";
});

describe("searchVideos", () => {
  it("returns the first vertical video_file from the top result", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toContain("https://api.pexels.com/videos/search");
      expect(url).toContain("query=vintage+car");
      expect((init.headers as Record<string, string>).Authorization).toBe("fake-key");
      return new Response(JSON.stringify({
        page: 1, per_page: 5, total_results: 1, videos: [
          {
            id: 1, width: 1080, height: 1920, duration: 12,
            video_files: [
              { id: 11, quality: "sd", file_type: "video/mp4", width: 540, height: 960, link: "https://cdn.example/sd.mp4" },
              { id: 12, quality: "hd", file_type: "video/mp4", width: 1080, height: 1920, link: "https://cdn.example/hd.mp4" },
            ],
          },
        ],
      }), { status: 200 });
    }));

    const { searchVideos } = await import("@/lib/clients/pexels");
    const result = await searchVideos({ query: "vintage car", perPage: 5 });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].downloadUrl).toBe("https://cdn.example/hd.mp4");
    expect(result[0].width).toBe(1080);
    expect(result[0].height).toBe(1920);
  });

  it("returns the highest-quality file when no vertical exists", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      page: 1, per_page: 1, total_results: 1, videos: [
        {
          id: 2, width: 1920, height: 1080, duration: 8,
          video_files: [
            { id: 21, quality: "hd", file_type: "video/mp4", width: 1920, height: 1080, link: "https://cdn.example/landscape.mp4" },
          ],
        },
      ],
    }), { status: 200 })));

    const { searchVideos } = await import("@/lib/clients/pexels");
    const result = await searchVideos({ query: "anything" });
    expect(result[0].downloadUrl).toBe("https://cdn.example/landscape.mp4");
  });

  it("returns empty array on Pexels 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
    const { searchVideos } = await import("@/lib/clients/pexels");
    const result = await searchVideos({ query: "asdf" });
    expect(result).toEqual([]);
  });

  it("throws when PEXELS_API_KEY is missing", async () => {
    delete process.env.PEXELS_API_KEY;
    const { searchVideos } = await import("@/lib/clients/pexels");
    await expect(searchVideos({ query: "x" })).rejects.toThrow(/PEXELS_API_KEY/);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY) process.env.PEXELS_API_KEY = ORIGINAL_KEY;
  else delete process.env.PEXELS_API_KEY;
});
```

- [ ] **Step 4.2: Run test to verify failure**

```bash
npm test -- src/tests/lib/clients/pexels.test.ts
```
Expected: FAIL (module not found).

- [ ] **Step 4.3: Implement the client**

```ts
// src/lib/clients/pexels.ts
import "server-only";
import { z } from "zod";

const VideoFile = z.object({
  id: z.number(),
  quality: z.string(),
  file_type: z.string(),
  width: z.number(),
  height: z.number(),
  link: z.string().url(),
});
const Video = z.object({
  id: z.number(),
  width: z.number(),
  height: z.number(),
  duration: z.number(),
  video_files: z.array(VideoFile),
});
const SearchResponse = z.object({
  page: z.number(),
  per_page: z.number(),
  total_results: z.number(),
  videos: z.array(Video),
});

export interface PexelsClip {
  videoId: number;
  width: number;
  height: number;
  durationSeconds: number;
  downloadUrl: string;
}

export async function searchVideos(args: {
  query: string;
  perPage?: number;
}): Promise<PexelsClip[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error("PEXELS_API_KEY must be set");

  const url = new URL("https://api.pexels.com/videos/search");
  url.searchParams.set("query", args.query);
  url.searchParams.set("per_page", String(args.perPage ?? 5));
  url.searchParams.set("orientation", "portrait");

  const res = await fetch(url.toString(), {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) return [];

  const parsed = SearchResponse.parse(await res.json());

  return parsed.videos.map((v) => {
    const vertical = v.video_files
      .filter((f) => f.file_type === "video/mp4" && f.height >= f.width)
      .sort((a, b) => b.height * b.width - a.height * a.width);
    const fallback = v.video_files
      .filter((f) => f.file_type === "video/mp4")
      .sort((a, b) => b.height * b.width - a.height * a.width);
    const file = vertical[0] ?? fallback[0];
    return {
      videoId: v.id,
      width: file.width,
      height: file.height,
      durationSeconds: v.duration,
      downloadUrl: file.link,
    };
  });
}
```

- [ ] **Step 4.4: Run test to verify pass**

```bash
npm test -- src/tests/lib/clients/pexels.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/clients/pexels.ts src/tests/lib/clients/pexels.test.ts
git commit -m "feat(clients): add Pexels v1 search client with portrait-preference"
```

---

## Task 5: Worker-side Pexels downloader

**Files:**
- Create: `scripts/render-worker/lib/pexels.ts`

No vitest tests at this layer — it's a thin wrapper around `searchVideos` (covered in Task 4) plus `fetch + writeFile`. The render-f1 handler integration test (Task 11) exercises this end-to-end.

- [ ] **Step 5.1: Implement the downloader**

```ts
// scripts/render-worker/lib/pexels.ts
//
// Worker-side: search Pexels, download the chosen vertical clip to /tmp.
// Mirrors src/lib/clients/pexels.ts but is duplicated to keep the worker
// package self-contained (it can't import from src/* in the Sandbox).
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';

const VideoFile = z.object({
  id: z.number(),
  quality: z.string(),
  file_type: z.string(),
  width: z.number(),
  height: z.number(),
  link: z.string().url(),
});
const Video = z.object({
  id: z.number(),
  width: z.number(),
  height: z.number(),
  duration: z.number(),
  video_files: z.array(VideoFile),
});
const SearchResponse = z.object({
  videos: z.array(Video),
});

export interface PexelsDownloadResult {
  outputPath: string;
  width: number;
  height: number;
  durationSeconds: number;
  pexelsVideoId: number;
}

export async function searchAndDownloadVertical(args: {
  query: string;
  outputPath: string;
}): Promise<PexelsDownloadResult | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error('PEXELS_API_KEY must be set');

  const url = new URL('https://api.pexels.com/videos/search');
  url.searchParams.set('query', args.query);
  url.searchParams.set('per_page', '5');
  url.searchParams.set('orientation', 'portrait');

  const searchRes = await fetch(url.toString(), { headers: { Authorization: apiKey } });
  if (!searchRes.ok) return null;

  const parsed = SearchResponse.parse(await searchRes.json());
  if (parsed.videos.length === 0) return null;

  // Pick first video; pick its largest vertical mp4 file (fall back to largest mp4).
  const video = parsed.videos[0];
  const verticals = video.video_files
    .filter((f) => f.file_type === 'video/mp4' && f.height >= f.width)
    .sort((a, b) => b.height * b.width - a.height * a.width);
  const fallback = video.video_files
    .filter((f) => f.file_type === 'video/mp4')
    .sort((a, b) => b.height * b.width - a.height * a.width);
  const file = verticals[0] ?? fallback[0];
  if (!file) return null;

  const dlRes = await fetch(file.link);
  if (!dlRes.ok) throw new Error(`pexels download failed ${dlRes.status}`);
  const buffer = Buffer.from(await dlRes.arrayBuffer());
  await writeFile(args.outputPath, buffer);

  return {
    outputPath: args.outputPath,
    width: file.width,
    height: file.height,
    durationSeconds: video.duration,
    pexelsVideoId: video.id,
  };
}
```

- [ ] **Step 5.2: Commit**

```bash
git add scripts/render-worker/lib/pexels.ts
git commit -m "feat(worker): Pexels portrait clip downloader for render_f1"
```

---

## Task 6: Worker-side ffprobe wrapper

**Files:**
- Create: `scripts/render-worker/lib/probe.ts`
- Modify: `scripts/render-worker/lib/cartesia.ts:36-37` — replace WAV-bytes duration heuristic with ffprobe

The Phase 1 cartesia.ts estimates WAV duration from byte length, which works for the black-bg case but breaks if Cartesia returns stereo or a different sample rate. ffprobe gives us the truth, and we'll need it again for Pexels clips.

- [ ] **Step 6.1: Implement ffprobe wrapper**

```ts
// scripts/render-worker/lib/probe.ts
//
// Thin wrapper around the ffprobe binary that ships with ffmpeg-static.
// Returns the media duration in seconds as a float.
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';

const ffprobePath = (() => {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not provide a binary path');
  // ffmpeg-static colocates ffprobe in the same directory on Linux x64.
  return join(dirname(ffmpegPath), 'ffprobe');
})();

export function probeDurationSeconds(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const argv = ['-v', 'error', '-show_entries', 'format=duration',
                  '-of', 'default=noprint_wrappers=1:nokey=1', filePath];
    const p = spawn(ffprobePath, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}: ${err}`));
      const n = parseFloat(out.trim());
      if (!Number.isFinite(n)) return reject(new Error(`ffprobe returned non-numeric: "${out}"`));
      resolve(n);
    });
  });
}
```

> NOTE for the implementer: if `ffmpeg-static` doesn't ship ffprobe on the Sandbox's platform, fall back to npm's `@ffprobe-installer/ffprobe`. Add it to `scripts/render-worker/package.json` only if needed. The Sandbox is `node24` on Linux x64 (Vercel Sandbox runtime), where ffmpeg-static does ship ffprobe alongside ffmpeg.

- [ ] **Step 6.2: Update cartesia.ts to use it**

```ts
// scripts/render-worker/lib/cartesia.ts
import { writeFile } from 'node:fs/promises';
import { probeDurationSeconds } from './probe.ts';

export async function synthesizeToWav(args: {
  script: string;
  voiceId: string;
  outputPath: string;
}): Promise<{ durationSeconds: number }> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) throw new Error('CARTESIA_API_KEY must be set');

  const res = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Cartesia-Version': '2025-04-16',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: 'sonic-2',
      transcript: args.script,
      voice: { mode: 'id', id: args.voiceId },
      output_format: { container: 'wav', sample_rate: 44100, encoding: 'pcm_s16le' },
    }),
  });
  if (!res.ok) throw new Error(`Cartesia TTS failed ${res.status}: ${await res.text()}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(args.outputPath, buffer);

  const durationSeconds = await probeDurationSeconds(args.outputPath);
  return { durationSeconds };
}
```

- [ ] **Step 6.3: Commit**

```bash
git add scripts/render-worker/lib/probe.ts scripts/render-worker/lib/cartesia.ts
git commit -m "refactor(worker): use ffprobe for media duration instead of WAV-bytes heuristic"
```

---

## Task 7: Groq Whisper client (Next.js side) + SRT generator (worker side)

**Files:**
- Create: `src/lib/clients/groq-whisper.ts` — server-only, holds GROQ_API_KEY
- Create: `src/tests/lib/clients/groq-whisper.test.ts`
- Create: `scripts/render-worker/lib/whisper.ts` — worker-side
- Create: `scripts/render-worker/lib/captions.ts` — pure SRT-string generation; unit-testable
- Create: `src/tests/lib/clients/captions.test.ts` — pure unit tests for SRT generation (imports the worker file as a regular .ts module via Vite's resolution; mirror the schema-patterns test pattern that already imports across the worker boundary)

Forced-alignment design:
- Groq's `whisper-large-v3` model returns word-level timestamps when `timestamp_granularities[]=word` is requested.
- Group words into ≤3-word cues, ≤2s duration each, for vertical mobile readability.
- Emit SRT (simpler than ASS for first cut). Apply burn-in styling via ffmpeg's `subtitles=` filter `force_style` (Phase 2.5+ can switch to ASS for animated reveal).

- [ ] **Step 7.1: Test for groq-whisper client (HTTP boundary)**

```ts
// src/tests/lib/clients/groq-whisper.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_KEY = process.env.GROQ_API_KEY;
beforeEach(() => { process.env.GROQ_API_KEY = "fake-groq"; });
afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY) process.env.GROQ_API_KEY = ORIGINAL_KEY;
  else delete process.env.GROQ_API_KEY;
});

describe("transcribeWithWordTimestamps", () => {
  it("returns word list parsed from verbose_json", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
      return new Response(JSON.stringify({
        text: "hello world",
        segments: [],
        words: [
          { word: "hello", start: 0.0, end: 0.4 },
          { word: "world", start: 0.5, end: 0.9 },
        ],
      }), { status: 200 });
    }));

    const { transcribeWithWordTimestamps } = await import("@/lib/clients/groq-whisper");
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });
    const result = await transcribeWithWordTimestamps(blob, "v.wav");
    expect(result.words).toHaveLength(2);
    expect(result.words[0]).toEqual({ word: "hello", start: 0.0, end: 0.4 });
  });

  it("throws on missing GROQ_API_KEY", async () => {
    delete process.env.GROQ_API_KEY;
    const { transcribeWithWordTimestamps } = await import("@/lib/clients/groq-whisper");
    const blob = new Blob([new Uint8Array([1])]);
    await expect(transcribeWithWordTimestamps(blob, "v.wav")).rejects.toThrow(/GROQ_API_KEY/);
  });
});
```

- [ ] **Step 7.2: Implement groq-whisper client**

```ts
// src/lib/clients/groq-whisper.ts
import "server-only";
import { z } from "zod";

const WordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});
const ResponseSchema = z.object({
  text: z.string(),
  words: z.array(WordSchema).optional(),
});

export interface TimedWord { word: string; start: number; end: number; }

export async function transcribeWithWordTimestamps(
  audio: Blob,
  filename: string,
): Promise<{ words: TimedWord[] }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY must be set");

  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Groq Whisper failed ${res.status}: ${await res.text()}`);
  const parsed = ResponseSchema.parse(await res.json());
  return { words: parsed.words ?? [] };
}
```

- [ ] **Step 7.3: Run test to verify pass**

```bash
npm test -- src/tests/lib/clients/groq-whisper.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 7.4: Worker-side whisper.ts (mirror of the client)**

```ts
// scripts/render-worker/lib/whisper.ts
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const WordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});
const ResponseSchema = z.object({
  text: z.string(),
  words: z.array(WordSchema).optional(),
});

export interface TimedWord { word: string; start: number; end: number; }

export async function transcribeWavWithWordTimestamps(
  wavPath: string,
): Promise<{ words: TimedWord[] }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY must be set');

  const buffer = await readFile(wavPath);
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'audio/wav' }), 'voice.wav');
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Groq Whisper failed ${res.status}: ${await res.text()}`);
  const parsed = ResponseSchema.parse(await res.json());
  return { words: parsed.words ?? [] };
}
```

- [ ] **Step 7.5: Captions module (pure SRT-string generation) + tests**

```ts
// scripts/render-worker/lib/captions.ts
//
// Convert a flat list of word-level timings into an SRT file optimized for
// vertical-mobile burn-in: ≤3 words per cue, ≤2.0s per cue, gaps preserved.

export interface TimedWord { word: string; start: number; end: number; }

const MAX_WORDS_PER_CUE = 3;
const MAX_CUE_DURATION_SEC = 2.0;

export function wordsToSrt(words: TimedWord[]): string {
  if (words.length === 0) return '';
  const cues: { start: number; end: number; text: string }[] = [];
  let current: TimedWord[] = [];

  const flush = () => {
    if (current.length === 0) return;
    cues.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.word.trim()).join(' '),
    });
    current = [];
  };

  for (const w of words) {
    if (current.length === 0) { current.push(w); continue; }
    const span = w.end - current[0].start;
    if (current.length >= MAX_WORDS_PER_CUE || span > MAX_CUE_DURATION_SEC) {
      flush();
    }
    current.push(w);
  }
  flush();

  return cues.map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text.toUpperCase()}\n`).join('\n');
}

function fmt(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const ms = Math.floor((secs - Math.floor(secs)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}
```

```ts
// src/tests/lib/worker/captions.test.ts
import { describe, it, expect } from "vitest";
import { wordsToSrt } from "../../../../scripts/render-worker/lib/captions.ts";

describe("wordsToSrt", () => {
  it("returns empty string for empty input", () => {
    expect(wordsToSrt([])).toBe("");
  });

  it("groups up to 3 words per cue, uppercases, formats timestamps", () => {
    const out = wordsToSrt([
      { word: "the", start: 0.0, end: 0.2 },
      { word: "fastest", start: 0.2, end: 0.7 },
      { word: "car", start: 0.7, end: 1.0 },
      { word: "ever", start: 1.1, end: 1.4 },
    ]);
    // First cue: 3 words. Second cue: 1 word.
    expect(out).toContain("00:00:00,000 --> 00:00:01,000");
    expect(out).toContain("THE FASTEST CAR");
    expect(out).toContain("00:00:01,100 --> 00:00:01,400");
    expect(out).toContain("EVER");
  });

  it("breaks a cue when duration exceeds 2.0s even if word count fits", () => {
    const out = wordsToSrt([
      { word: "a", start: 0.0, end: 0.1 },
      { word: "b", start: 2.5, end: 2.6 },  // 2.6 - 0.0 = 2.6 > 2.0 → break
    ]);
    expect(out.split(/\n\n/).filter(Boolean).length).toBe(2);
  });
});
```

- [ ] **Step 7.6: Run captions test**

```bash
npm test -- src/tests/lib/worker/captions.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 7.7: Commit**

```bash
git add src/lib/clients/groq-whisper.ts \
        scripts/render-worker/lib/whisper.ts \
        scripts/render-worker/lib/captions.ts \
        src/tests/lib/clients/groq-whisper.test.ts \
        src/tests/lib/worker/captions.test.ts
git commit -m "feat(captions): Groq Whisper word-timestamps + SRT generation"
```

---

## Task 8: music_tracks repo + worker downloader

**Files:**
- Create: `src/lib/supabase/repositories/music-tracks.ts`
- Create: `src/tests/lib/supabase/repositories/music-tracks.test.ts`
- Create: `scripts/render-worker/lib/music.ts`

Phase 2 treats music as **best-effort**: if `music_tracks` is empty (likely; the Phase-5 import CLI hasn't shipped yet), the worker logs a warning and renders without music. ffmpeg path is fully wired so the moment the operator inserts rows, music kicks in.

- [ ] **Step 8.1: Repo test**

```ts
// src/tests/lib/supabase/repositories/music-tracks.test.ts
import { describe, it, expect, vi } from "vitest";
import { pickAmbientCinematicTrack } from "@/lib/supabase/repositories/music-tracks";

describe("pickAmbientCinematicTrack", () => {
  it("queries music_tracks with the spec filters and returns first row", async () => {
    const single = vi.fn(async () => ({ data: { id: "mt1", title: "Calm Drive", local_path: "https://blob/x.mp3" }, error: null }));
    const limit = vi.fn(() => ({ single }));
    const order = vi.fn(() => ({ limit }));
    const inFn = vi.fn(() => ({ order }));
    const eq = vi.fn(() => ({ in: inFn }));
    const eq2 = vi.fn(() => ({ eq }));
    const select = vi.fn(() => ({ eq: eq2 }));
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as never;

    const row = await pickAmbientCinematicTrack(supabase);
    expect(from).toHaveBeenCalledWith("music_tracks");
    expect(eq2).toHaveBeenCalledWith("requires_attribution", false);
    expect(inFn).toHaveBeenCalledWith("energy_level", [2, 3]);
    expect(row?.id).toBe("mt1");
  });

  it("returns null when no row matches (table empty)", async () => {
    const single = vi.fn(async () => ({ data: null, error: { code: "PGRST116" } }));
    const supabase = {
      from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ in: () => ({ order: () => ({ limit: () => ({ single }) }) }) }) }) }),
    } as never;
    const row = await pickAmbientCinematicTrack(supabase);
    expect(row).toBeNull();
  });
});
```

- [ ] **Step 8.2: Implement repo**

```ts
// src/lib/supabase/repositories/music-tracks.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface MusicTrack {
  id: string;
  title: string;
  artist: string | null;
  local_path: string;
  duration_seconds: number | null;
  genre: string | null;
  energy_level: number | null;
}

export async function pickAmbientCinematicTrack(
  supabase: SupabaseClient,
): Promise<MusicTrack | null> {
  const { data, error } = await supabase
    .from("music_tracks")
    .select("id,title,artist,local_path,duration_seconds,genre,energy_level")
    .in("genre", ["ambient", "cinematic"])
    .eq("requires_attribution", false)
    .in("energy_level", [2, 3])
    .order("added_at", { ascending: false })
    .limit(1)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;  // no rows
    return null;
  }
  return data as MusicTrack;
}
```

Note: the test's mock-chain calls `.eq("requires_attribution", false)` BEFORE `.in("energy_level", ...)`. The implementation order matches.

- [ ] **Step 8.3: Run test**

```bash
npm test -- src/tests/lib/supabase/repositories/music-tracks.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 8.4: Worker-side music.ts**

```ts
// scripts/render-worker/lib/music.ts
//
// Picks an ambient/cinematic, no-attribution, low-energy music track from
// music_tracks. If table is empty, returns null and the handler renders
// without a music bed (Phase 2 is best-effort music).
import { writeFile } from 'node:fs/promises';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface DownloadedMusic {
  outputPath: string;
  musicTrackId: string;
}

export async function pickAndDownloadMusic(args: {
  supabase: SupabaseClient;
  outputPath: string;
}): Promise<DownloadedMusic | null> {
  const { data, error } = await args.supabase
    .from('music_tracks')
    .select('id, local_path')
    .in('genre', ['ambient', 'cinematic'])
    .eq('requires_attribution', false)
    .in('energy_level', [2, 3])
    .order('added_at', { ascending: false })
    .limit(1)
    .single();
  if (error || !data) return null;

  const res = await fetch(data.local_path);
  if (!res.ok) {
    console.warn(`music download failed ${res.status}; rendering without music bed`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(args.outputPath, buf);
  return { outputPath: args.outputPath, musicTrackId: data.id };
}
```

- [ ] **Step 8.5: Commit**

```bash
git add src/lib/supabase/repositories/music-tracks.ts \
        src/tests/lib/supabase/repositories/music-tracks.test.ts \
        scripts/render-worker/lib/music.ts
git commit -m "feat(music): music_tracks picker repo + worker downloader (best-effort)"
```

---

## Task 9: ffmpeg multi-input composition function

**Files:**
- Modify: `scripts/render-worker/lib/ffmpeg-commands.ts`
- Create: `src/tests/lib/worker/ffmpeg-commands.test.ts` — argv-level unit tests (assert filter graph string)

Composition strategy:
- **Shots**: Pexels per-shot clips OR colored-bg fallback. Each shot is trimmed to `duration_seconds` from the Director's shot_list. Use a **concat demuxer** (text file listing each clip with optional trim) for video — simpler than `-filter_complex concat`.
- **Audio mix**: voice WAV (full volume) + music MP3 (25% volume via `volume=0.25`), then `amix=inputs=2:duration=first` so the mix is exactly voice length.
- **Captions**: SRT burned in via `subtitles=` filter with `force_style` for bold + outline.
- **Scaling**: each shot scaled+cropped to 1080×1920 via `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`.

Because of scale-per-input + variable shot lengths, we'll do this in TWO ffmpeg passes:
1. **Per-shot normalize pass**: scale+crop each downloaded clip to a normalized 1080×1920 30fps clip at a deterministic length. Output: `/tmp/norm_N.mp4`.
2. **Final concat + audio mix + captions pass**: concat demuxer over the normalized clips → filter_complex for the audio mix → subtitles filter → encode.

- [ ] **Step 9.1: Test for argv shape**

```ts
// src/tests/lib/worker/ffmpeg-commands.test.ts
import { describe, it, expect, vi } from "vitest";
import * as child from "node:child_process";

vi.mock("node:child_process");

import {
  buildNormalizeShotArgs,
  buildFinalComposeArgs,
} from "../../../../scripts/render-worker/lib/ffmpeg-commands.ts";

describe("buildNormalizeShotArgs", () => {
  it("scales-crops to 1080x1920 at 30fps and truncates to duration", () => {
    const argv = buildNormalizeShotArgs({
      inputPath: "/tmp/shot_1.mp4",
      durationSeconds: 5,
      outputPath: "/tmp/norm_1.mp4",
    });
    expect(argv).toContain("-y");
    expect(argv).toContain("-i");
    expect(argv).toContain("/tmp/shot_1.mp4");
    expect(argv).toContain("-t");
    expect(argv).toContain("5");
    expect(argv.join(" ")).toContain("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920");
    expect(argv.join(" ")).toContain("-r 30");
    expect(argv).toContain("/tmp/norm_1.mp4");
  });
});

describe("buildFinalComposeArgs", () => {
  it("uses concat demuxer + amix(0.25 music) + subtitles filter", () => {
    const argv = buildFinalComposeArgs({
      concatListPath: "/tmp/list.txt",
      voicePath: "/tmp/voice.wav",
      musicPath: "/tmp/music.mp3",
      subtitlesPath: "/tmp/captions.srt",
      outputPath: "/tmp/out.mp4",
    });
    expect(argv).toContain("-f");
    expect(argv).toContain("concat");
    expect(argv).toContain("/tmp/list.txt");
    expect(argv.join(" ")).toContain("[2:a]volume=0.25[m]");
    expect(argv.join(" ")).toContain("[1:a][m]amix=inputs=2:duration=first[a]");
    expect(argv.join(" ")).toContain("subtitles=/tmp/captions.srt");
    expect(argv).toContain("/tmp/out.mp4");
  });

  it("omits music branch when musicPath is null", () => {
    const argv = buildFinalComposeArgs({
      concatListPath: "/tmp/list.txt",
      voicePath: "/tmp/voice.wav",
      musicPath: null,
      subtitlesPath: "/tmp/captions.srt",
      outputPath: "/tmp/out.mp4",
    });
    expect(argv.join(" ")).not.toContain("amix");
    expect(argv.join(" ")).not.toContain("volume=0.25");
  });

  it("omits subtitles filter when subtitlesPath is null", () => {
    const argv = buildFinalComposeArgs({
      concatListPath: "/tmp/list.txt",
      voicePath: "/tmp/voice.wav",
      musicPath: null,
      subtitlesPath: null,
      outputPath: "/tmp/out.mp4",
    });
    expect(argv.join(" ")).not.toContain("subtitles=");
  });
});
```

- [ ] **Step 9.2: Implement composition functions**

```ts
// scripts/render-worker/lib/ffmpeg-commands.ts
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

if (!ffmpegPath) throw new Error('ffmpeg-static did not provide a binary path');

export async function renderBlackBackgroundWithAudio(args: {
  audioPath: string;
  durationSeconds: number;
  outputPath: string;
}): Promise<void> {
  const argv = [
    '-y',
    '-f', 'lavfi', '-i', `color=c=black:s=1080x1920:d=${args.durationSeconds}:r=30`,
    '-i', args.audioPath,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-tune', 'stillimage',
    '-c:a', 'aac', '-b:a', '128k', '-shortest',
    '-movflags', '+faststart',
    args.outputPath,
  ];
  await runFfmpeg(argv);
}

export function buildNormalizeShotArgs(args: {
  inputPath: string;
  durationSeconds: number;
  outputPath: string;
}): string[] {
  return [
    '-y',
    '-i', args.inputPath,
    '-t', String(args.durationSeconds),
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1',
    '-r', '30',
    '-an',  // strip source audio
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-preset', 'veryfast',
    args.outputPath,
  ];
}

export async function normalizeShot(args: {
  inputPath: string;
  durationSeconds: number;
  outputPath: string;
}): Promise<void> {
  await runFfmpeg(buildNormalizeShotArgs(args));
}

export async function renderColoredBackground(args: {
  hexColor: string;     // e.g. "0x202020"
  durationSeconds: number;
  outputPath: string;
}): Promise<void> {
  const argv = [
    '-y',
    '-f', 'lavfi', '-i', `color=c=${args.hexColor}:s=1080x1920:d=${args.durationSeconds}:r=30`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    args.outputPath,
  ];
  await runFfmpeg(argv);
}

export async function writeConcatList(paths: string[], outputPath: string): Promise<void> {
  const body = paths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n';
  await writeFile(outputPath, body);
}

const SRT_FORCE_STYLE =
  "FontName=Arial,FontSize=72,PrimaryColour=&HFFFFFFFF,OutlineColour=&H00000000," +
  "Outline=4,BorderStyle=1,Alignment=2,MarginV=300,Bold=1";

export function buildFinalComposeArgs(args: {
  concatListPath: string;
  voicePath: string;
  musicPath: string | null;
  subtitlesPath: string | null;
  outputPath: string;
}): string[] {
  const inputs: string[] = [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', args.concatListPath,  // input 0: video concat
    '-i', args.voicePath,                                      // input 1: voice
  ];
  if (args.musicPath) inputs.push('-i', args.musicPath);       // input 2: music (optional)

  let videoFilter = '[0:v]';
  const videoChainParts: string[] = [];
  if (args.subtitlesPath) {
    videoChainParts.push(`subtitles=${args.subtitlesPath}:force_style='${SRT_FORCE_STYLE}'`);
  }
  // Build final video stream label
  let videoStream: string;
  if (videoChainParts.length > 0) {
    videoFilter += videoChainParts.join(',') + '[v]';
    videoStream = '[v]';
  } else {
    videoStream = '0:v';
    videoFilter = '';
  }

  let audioFilter: string;
  let audioStream: string;
  if (args.musicPath) {
    audioFilter = '[2:a]volume=0.25[m];[1:a][m]amix=inputs=2:duration=first[a]';
    audioStream = '[a]';
  } else {
    audioFilter = '';
    audioStream = '1:a';
  }

  const filterComplex = [videoFilter, audioFilter].filter(Boolean).join(';');

  const argv = [
    ...inputs,
    ...(filterComplex ? ['-filter_complex', filterComplex] : []),
    '-map', videoStream,
    '-map', audioStream,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest',
    '-movflags', '+faststart',
    args.outputPath,
  ];
  return argv;
}

export async function finalCompose(args: {
  concatListPath: string;
  voicePath: string;
  musicPath: string | null;
  subtitlesPath: string | null;
  outputPath: string;
}): Promise<void> {
  await runFfmpeg(buildFinalComposeArgs(args));
}

function runFfmpeg(argv: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath as string, argv, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}
```

- [ ] **Step 9.3: Run tests**

```bash
npm test -- src/tests/lib/worker/ffmpeg-commands.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 9.4: Commit**

```bash
git add scripts/render-worker/lib/ffmpeg-commands.ts \
        src/tests/lib/worker/ffmpeg-commands.test.ts
git commit -m "feat(worker): ffmpeg compose helpers — normalize, concat, mix, subtitles"
```

---

## Task 10: Full render-f1 handler

**Files:**
- Modify: `scripts/render-worker/handlers/render-f1.ts` (full rewrite)

The handler:
1. Loads `your_videos` row + the Director's shot_list (latest `decisions` row for this job: `agent_id='director'`, `decision_type='shot_list'`, latest by created_at where `job_id` matches the most recent `produce_video` job for `your_video.topic_queue_id`).
2. Cartesia TTS the script → /tmp/voice.wav.
3. For each shot in shot_list, in parallel where possible: Pexels search+download → normalize to 1080×1920 30fps trimmed to `duration_seconds`. On Pexels miss, fall back to colored-bg `renderColoredBackground` at the same duration.
4. Whisper transcribe the voice WAV → words → SRT.
5. Music pick (best-effort) → /tmp/music.mp3 OR null.
6. Final compose → /tmp/out.mp4.
7. Upload to Blob.
8. Return `{ render_artifact_url, duration_seconds_actual }`.

Decision-row shot_list lookup: `decisions.chosen` is JSONB. Phase 1's `recordDecision` write was:
```ts
chosen: directorOut as unknown as Record<string, unknown>,
```
So `decisions.chosen.shot_list` is the array of `{ segment_text, broll_search_query, duration_seconds }`.

To find the right `decisions` row: join `decisions` → `jobs` → `topic_queue_id`, take the latest where `agent_id='director'`. The query: `your_videos` has `topic_queue_id`. There exists a `jobs` row where `job.payload.topicId == topic_queue_id` AND `job.job_type='produce_video'` (latest by created_at). Take that `job.id`, then `decisions where job_id=$1 and agent_id='director'` (latest). Simpler: join via `jobs.topic_queue_id` if that column exists, else use the existing `getActiveProduceVideoJob` pattern but historical (not active).

Inspect: does `jobs.topic_queue_id` column exist? Phase 1 was modeled around `jobs.payload` JSON. Implementer to verify; if it doesn't exist, just look up by `topic_queue_id` via `jobs.payload->>topicId`.

- [ ] **Step 10.1: Add a repo helper to fetch a director shot_list for a your_video**

```ts
// src/lib/supabase/repositories/decisions.ts (append)

export interface ShotListEntry {
  segment_text: string;
  broll_search_query: string;
  duration_seconds: number;
}

export async function getDirectorShotListForVideo(
  supabase: SupabaseClient,
  yourVideoId: string,
): Promise<ShotListEntry[] | null> {
  // 1. Fetch the your_video → topic_queue_id
  const { data: yv } = await supabase
    .from("your_videos")
    .select("topic_queue_id")
    .eq("id", yourVideoId)
    .single();
  if (!yv?.topic_queue_id) return null;

  // 2. Find the most recent produce_video job for that topic_queue_id
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id")
    .eq("job_type", "produce_video")
    .filter("payload->>topicId", "eq", yv.topic_queue_id)
    .order("created_at", { ascending: false })
    .limit(1);
  const jobRow = jobs?.[0];
  if (!jobRow) return null;

  // 3. Latest director decision for that job
  const { data: dec } = await supabase
    .from("decisions")
    .select("chosen")
    .eq("job_id", jobRow.id)
    .eq("agent_id", "director")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!dec) return null;

  const shotList = (dec.chosen as { shot_list?: unknown }).shot_list;
  if (!Array.isArray(shotList)) return null;
  return shotList as ShotListEntry[];
}
```

Add a unit test (mocked supabase chain) in `src/tests/lib/supabase/repositories/decisions.test.ts` (extend existing file):

```ts
// Append to src/tests/lib/supabase/repositories/decisions.test.ts
import { getDirectorShotListForVideo } from "@/lib/supabase/repositories/decisions";

describe("getDirectorShotListForVideo", () => {
  it("returns the latest director decision's shot_list", async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "your_videos") {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { topic_queue_id: "topic-1" } }) }) }) };
        }
        if (table === "jobs") {
          return { select: () => ({ eq: () => ({ filter: () => ({ order: () => ({ limit: async () => ({ data: [{ id: "job-1" }] }) }) }) }) }) };
        }
        if (table === "decisions") {
          return { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ single: async () => ({ data: { chosen: { shot_list: [{ segment_text: "a", broll_search_query: "q", duration_seconds: 5 }] } } }) }) }) }) }) }) };
        }
        throw new Error("unexpected table");
      }),
    } as never;

    const out = await getDirectorShotListForVideo(supabase, "video-1");
    expect(out).toEqual([{ segment_text: "a", broll_search_query: "q", duration_seconds: 5 }]);
  });
});
```

Run:
```bash
npm test -- src/tests/lib/supabase/repositories/decisions.test.ts
```
Expected: existing tests still pass + new test passes.

- [ ] **Step 10.2: Rewrite the handler**

```ts
// scripts/render-worker/handlers/render-f1.ts
//
// Phase 2: full Format-1 pipeline.
//   1. Cartesia TTS → voice.wav
//   2. For each shot in director's shot_list: Pexels download (or colored-bg fallback) → normalize to 1080x1920
//   3. Groq Whisper word-level → captions.srt
//   4. Music pick (best-effort) → music.mp3 (or null)
//   5. ffmpeg final compose: concat normalized shots, mux voice + music(@25%), burn captions
//   6. Blob upload
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { synthesizeToWav } from '../lib/cartesia.ts';
import {
  normalizeShot,
  renderColoredBackground,
  writeConcatList,
  finalCompose,
} from '../lib/ffmpeg-commands.ts';
import { uploadMp4ToBlob } from '../lib/blob.ts';
import { searchAndDownloadVertical } from '../lib/pexels.ts';
import { transcribeWavWithWordTimestamps } from '../lib/whisper.ts';
import { wordsToSrt } from '../lib/captions.ts';
import { pickAndDownloadMusic } from '../lib/music.ts';
import { probeDurationSeconds } from '../lib/probe.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

type ShotListEntry = { segment_text: string; broll_search_query: string; duration_seconds: number };

const FALLBACK_BG_COLORS = ['0x101418', '0x1a1d24', '0x0f1419', '0x14181c'];

export async function runRenderF1(
  job: { id: string; payload: unknown },
  supabase: SupabaseClient,
): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  const log = (msg: string) => console.log(`[render_f1] +${Date.now() - t0}ms ${msg}`);

  const payload = job.payload as { your_video_id: string };

  // ─── Load your_videos row + shot_list ───
  const { data: yv, error: yvErr } = await supabase
    .from('your_videos')
    .select('id, script, voice_id, channel_id, topic_queue_id')
    .eq('id', payload.your_video_id)
    .single();
  if (yvErr || !yv) throw new Error(`your_videos row not found: ${yvErr?.message ?? 'no row'}`);

  const shotList = await fetchShotList(supabase, yv.id);
  log(`loaded yv + shot_list (${shotList.length} shots)`);

  // ─── Cartesia TTS ───
  const workDir = await mkdtemp(join(tmpdir(), 'render-f1-'));
  const voicePath = join(workDir, 'voice.wav');
  const { durationSeconds } = await synthesizeToWav({
    script: yv.script,
    voiceId: yv.voice_id ?? '',
    outputPath: voicePath,
  });
  log(`cartesia tts done (${durationSeconds.toFixed(1)}s)`);

  // ─── Per-shot: Pexels download → normalize ───
  const normalizedPaths: string[] = [];
  for (let i = 0; i < shotList.length; i++) {
    const shot = shotList[i];
    const rawPath = join(workDir, `shot_${i}.mp4`);
    const normPath = join(workDir, `norm_${i}.mp4`);
    try {
      const dl = await searchAndDownloadVertical({
        query: shot.broll_search_query,
        outputPath: rawPath,
      });
      if (dl) {
        await normalizeShot({
          inputPath: rawPath,
          durationSeconds: shot.duration_seconds,
          outputPath: normPath,
        });
      } else {
        await renderColoredBackground({
          hexColor: FALLBACK_BG_COLORS[i % FALLBACK_BG_COLORS.length],
          durationSeconds: shot.duration_seconds,
          outputPath: normPath,
        });
      }
    } catch (err) {
      console.warn(`shot ${i} pexels/normalize failed; using fallback bg: ${(err as Error).message}`);
      await renderColoredBackground({
        hexColor: FALLBACK_BG_COLORS[i % FALLBACK_BG_COLORS.length],
        durationSeconds: shot.duration_seconds,
        outputPath: normPath,
      });
    }
    normalizedPaths.push(normPath);
  }
  log(`normalized ${normalizedPaths.length} shots`);

  // ─── Whisper forced-alignment ───
  let captionsPath: string | null = join(workDir, 'captions.srt');
  try {
    const { words } = await transcribeWavWithWordTimestamps(voicePath);
    const srt = wordsToSrt(words);
    if (srt.trim().length > 0) {
      await writeFile(captionsPath, srt);
      log(`captions wrote (${words.length} words)`);
    } else {
      captionsPath = null;
      log('captions skipped: empty word list');
    }
  } catch (err) {
    console.warn(`whisper failed; rendering without captions: ${(err as Error).message}`);
    captionsPath = null;
  }

  // ─── Music bed (best-effort) ───
  let musicPath: string | null = null;
  try {
    const music = await pickAndDownloadMusic({
      supabase,
      outputPath: join(workDir, 'music.mp3'),
    });
    if (music) {
      musicPath = music.outputPath;
      log(`music ready (track ${music.musicTrackId})`);
    } else {
      log('music skipped: no eligible tracks');
    }
  } catch (err) {
    console.warn(`music pick failed; rendering without bed: ${(err as Error).message}`);
  }

  // ─── Final compose ───
  const concatListPath = join(workDir, 'concat.txt');
  await writeConcatList(normalizedPaths, concatListPath);
  const outPath = join(workDir, 'out.mp4');
  await finalCompose({
    concatListPath,
    voicePath,
    musicPath,
    subtitlesPath: captionsPath,
    outputPath: outPath,
  });
  log('final compose done');

  const actualDuration = await probeDurationSeconds(outPath);

  // ─── Blob upload ───
  const blobUrl = await uploadMp4ToBlob(outPath, `renders/${payload.your_video_id}.mp4`);
  log(`uploaded to ${blobUrl}`);

  return {
    render_artifact_url: blobUrl,
    duration_seconds_actual: actualDuration,
  };
}

async function fetchShotList(supabase: SupabaseClient, yourVideoId: string): Promise<ShotListEntry[]> {
  // Resolve topic_queue_id → most recent produce_video job → latest director decision.
  const { data: yv } = await supabase
    .from('your_videos')
    .select('topic_queue_id')
    .eq('id', yourVideoId)
    .single();
  if (!yv?.topic_queue_id) throw new Error('your_video has no topic_queue_id; cannot find shot_list');

  const { data: jobs } = await supabase
    .from('jobs')
    .select('id')
    .eq('job_type', 'produce_video')
    .filter('payload->>topicId', 'eq', yv.topic_queue_id)
    .order('created_at', { ascending: false })
    .limit(1);
  const jobRow = jobs?.[0];
  if (!jobRow) throw new Error('no produce_video job found for this topic');

  const { data: dec } = await supabase
    .from('decisions')
    .select('chosen')
    .eq('job_id', jobRow.id)
    .eq('agent_id', 'director')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  const list = (dec?.chosen as { shot_list?: unknown } | undefined)?.shot_list;
  if (!Array.isArray(list) || list.length === 0) throw new Error('director shot_list empty or missing');
  return list as ShotListEntry[];
}
```

- [ ] **Step 10.3: Commit**

```bash
git add scripts/render-worker/handlers/render-f1.ts \
        src/lib/supabase/repositories/decisions.ts \
        src/tests/lib/supabase/repositories/decisions.test.ts
git commit -m "feat(render): full Format-1 pipeline — Pexels + captions + best-effort music"
```

---

## Task 11: `/api/lab/render` route

**Files:**
- Create: `src/app/api/lab/render/route.ts`
- Create: `src/tests/api/lab-render.test.ts`

Cockpit-authenticated POST that:
1. Validates `{ draftId: uuid }` body.
2. Loads the draft. Reject 404 if missing, 409 if status !== 'draft' (idempotent against double-clicks).
3. Atomic transition: `status='rendering'` (only if currently 'draft').
4. Enqueues `render_jobs` row `{ job_type: 'render_f1', payload: { your_video_id }, your_video_id }`.
5. Returns `{ ok: true, jobId, draftId }`.

Note: cockpit auth is enforced via the `proxy.ts` middleware. We do NOT add `/api/lab` to `PUBLIC_PATH_PREFIXES`. The test mocks supabase + the proxy auth path (route handler test, not middleware test).

- [ ] **Step 11.1: Test**

```ts
// src/tests/api/lab-render.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  getServiceClient: vi.fn(),
}));
vi.mock("@/lib/supabase/repositories/render-jobs", () => ({
  enqueueRenderJob: vi.fn(),
}));

import { POST } from "@/app/api/lab/render/route";
import { getServiceClient } from "@/lib/supabase/server";
import { enqueueRenderJob } from "@/lib/supabase/repositories/render-jobs";

function reqWithBody(body: unknown): Request {
  return new Request("http://x/api/lab/render", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/lab/render", () => {
  it("400s on missing draftId", async () => {
    const res = await POST(reqWithBody({}));
    expect(res.status).toBe(400);
  });

  it("404s on unknown draft", async () => {
    vi.mocked(getServiceClient).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { code: "PGRST116" } }) }) }) }),
    } as never);
    const res = await POST(reqWithBody({ draftId: "11111111-1111-1111-1111-111111111111" }));
    expect(res.status).toBe(404);
  });

  it("409s when draft is not in 'draft' status", async () => {
    vi.mocked(getServiceClient).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: "v1", status: "rendered" }, error: null }) }) }) }),
    } as never);
    const res = await POST(reqWithBody({ draftId: "11111111-1111-1111-1111-111111111111" }));
    expect(res.status).toBe(409);
  });

  it("happy path: flips status to rendering, enqueues job, returns 200", async () => {
    const update = vi.fn(() => ({ eq: () => ({ eq: async () => ({ error: null, count: 1 }) }) }));
    vi.mocked(getServiceClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "your_videos") {
          return {
            select: () => ({ eq: () => ({ single: async () => ({ data: { id: "v1", status: "draft" }, error: null }) }) }),
            update,
          };
        }
        throw new Error(`unexpected table ${table}`);
      }),
    } as never);
    vi.mocked(enqueueRenderJob).mockResolvedValue({ id: "job-uuid" } as never);

    const res = await POST(reqWithBody({ draftId: "11111111-1111-1111-1111-111111111111" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobId).toBe("job-uuid");
    expect(enqueueRenderJob).toHaveBeenCalledWith(expect.anything(), {
      jobType: "render_f1",
      payload: { your_video_id: "v1" },
      yourVideoId: "v1",
    });
  });
});
```

- [ ] **Step 11.2: Implementation**

```ts
// src/app/api/lab/render/route.ts
import "server-only";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { enqueueRenderJob } from "@/lib/supabase/repositories/render-jobs";

const BodySchema = z.object({ draftId: z.string().uuid() });

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "invalid body" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data: draft, error: loadErr } = await supabase
    .from("your_videos")
    .select("id, status")
    .eq("id", body.draftId)
    .single();
  if (loadErr || !draft) {
    return Response.json({ error: "draft_not_found" }, { status: 404 });
  }
  if (draft.status !== "draft") {
    return Response.json({ error: "wrong_status", currentStatus: draft.status }, { status: 409 });
  }

  // Atomic transition (skip if someone else won the race)
  const { error: updErr, count } = await supabase
    .from("your_videos")
    .update({ status: "rendering", updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", body.draftId)
    .eq("status", "draft");
  if (updErr) return Response.json({ error: updErr.message }, { status: 500 });
  if (!count) return Response.json({ error: "wrong_status_race" }, { status: 409 });

  const job = await enqueueRenderJob(supabase, {
    jobType: "render_f1",
    payload: { your_video_id: body.draftId },
    yourVideoId: body.draftId,
  });

  return Response.json({ ok: true, jobId: job.id, draftId: body.draftId });
}
```

- [ ] **Step 11.3: Run test**

```bash
npm test -- src/tests/api/lab-render.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 11.4: Commit**

```bash
git add src/app/api/lab/render/route.ts src/tests/api/lab-render.test.ts
git commit -m "feat(api): POST /api/lab/render enqueues render_f1 with atomic state transition"
```

---

## Task 12: `/api/lab/upload` stub + `/api/lab/reject`

**Files:**
- Create: `src/app/api/lab/upload/route.ts`
- Create: `src/app/api/lab/reject/route.ts`
- Create: `src/tests/api/lab-upload.test.ts`
- Create: `src/tests/api/lab-reject.test.ts`

Per spec §5: "Post now button (escape hatch) → POSTs to `/api/lab/upload?videoId=X`". Phase 2 implements this as a logging-only stub (real YouTube upload lands Phase 5 — that's when the route's body gets replaced with the actual `enqueueRenderJob({ jobType: 'upload', ... })` call). Reject sets `status='failed'`.

- [ ] **Step 12.1: upload stub**

```ts
// src/app/api/lab/upload/route.ts
import "server-only";
import { z } from "zod";

const BodySchema = z.object({ videoId: z.string().uuid() });

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try { body = BodySchema.parse(await req.json()); }
  catch (err) { return Response.json({ error: err instanceof Error ? err.message : "invalid body" }, { status: 400 }); }

  console.log(`[lab/upload] STUB: would upload videoId=${body.videoId} — real upload ships Phase 5`);
  return Response.json({ ok: true, stub: true, message: "Upload pipeline lands in Phase 5." });
}
```

```ts
// src/tests/api/lab-upload.test.ts
import { describe, it, expect } from "vitest";
import { POST } from "@/app/api/lab/upload/route";

describe("POST /api/lab/upload (Phase 2 stub)", () => {
  it("400s on missing videoId", async () => {
    const res = await POST(new Request("http://x/api/lab/upload", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    }));
    expect(res.status).toBe(400);
  });
  it("200s on valid videoId, marks as stub", async () => {
    const res = await POST(new Request("http://x/api/lab/upload", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId: "11111111-1111-1111-1111-111111111111" }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stub).toBe(true);
  });
});
```

- [ ] **Step 12.2: reject route**

```ts
// src/app/api/lab/reject/route.ts
import "server-only";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";

const BodySchema = z.object({ videoId: z.string().uuid() });

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof BodySchema>;
  try { body = BodySchema.parse(await req.json()); }
  catch (err) { return Response.json({ error: err instanceof Error ? err.message : "invalid body" }, { status: 400 }); }

  const supabase = getServiceClient();
  const { error } = await supabase
    .from("your_videos")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("id", body.videoId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
```

```ts
// src/tests/api/lab-reject.test.ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/supabase/server", () => ({ getServiceClient: vi.fn() }));
import { POST } from "@/app/api/lab/reject/route";
import { getServiceClient } from "@/lib/supabase/server";

describe("POST /api/lab/reject", () => {
  it("400s on missing videoId", async () => {
    const res = await POST(new Request("http://x/api/lab/reject", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(400);
  });
  it("200s on valid videoId", async () => {
    const eq = vi.fn(async () => ({ error: null }));
    vi.mocked(getServiceClient).mockReturnValue({
      from: () => ({ update: () => ({ eq }) }),
    } as never);
    const res = await POST(new Request("http://x/api/lab/reject", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId: "11111111-1111-1111-1111-111111111111" }),
    }));
    expect(res.status).toBe(200);
    expect(eq).toHaveBeenCalled();
  });
});
```

- [ ] **Step 12.3: Run tests**

```bash
npm test -- src/tests/api/lab-post-now.test.ts src/tests/api/lab-reject.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 12.4: Commit**

```bash
git add src/app/api/lab/upload/route.ts src/app/api/lab/reject/route.ts \
        src/tests/api/lab-upload.test.ts src/tests/api/lab-reject.test.ts
git commit -m "feat(api): /api/lab/upload Phase-2 stub + /api/lab/reject for review UI"
```

---

## Task 13: `your-videos` repo — add status-list helpers

**Files:**
- Modify: `src/lib/supabase/repositories/your-videos.ts`
- Create: `src/tests/lib/supabase/repositories/your-videos-listByStatus.test.ts`

- [ ] **Step 13.1: Add helper**

```ts
// Append to src/lib/supabase/repositories/your-videos.ts

export async function listVideosByStatus(
  supabase: SupabaseClient,
  status: VideoStatus | VideoStatus[],
  limit = 20,
): Promise<YourVideo[]> {
  const statuses = Array.isArray(status) ? status : [status];
  const { data, error } = await supabase
    .from("your_videos")
    .select("*")
    .in("status", statuses)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listVideosByStatus: ${error.message}`);
  return (data ?? []) as YourVideo[];
}
```

- [ ] **Step 13.2: Test**

```ts
// src/tests/lib/supabase/repositories/your-videos-listByStatus.test.ts
import { describe, it, expect, vi } from "vitest";
import { listVideosByStatus } from "@/lib/supabase/repositories/your-videos";

describe("listVideosByStatus", () => {
  it("filters by single status with order desc by updated_at", async () => {
    const limit = vi.fn(async () => ({ data: [{ id: "v1" }], error: null }));
    const order = vi.fn(() => ({ limit }));
    const inFn = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ in: inFn }));
    const from = vi.fn(() => ({ select }));

    const out = await listVideosByStatus({ from } as never, "rendered", 5);
    expect(from).toHaveBeenCalledWith("your_videos");
    expect(inFn).toHaveBeenCalledWith("status", ["rendered"]);
    expect(out).toHaveLength(1);
  });

  it("accepts an array of statuses", async () => {
    const limit = vi.fn(async () => ({ data: [], error: null }));
    const inFn = vi.fn(() => ({ order: () => ({ limit }) }));
    const supabase = { from: () => ({ select: () => ({ in: inFn }) }) } as never;
    await listVideosByStatus(supabase, ["draft", "rendering"]);
    expect(inFn).toHaveBeenCalledWith("status", ["draft", "rendering"]);
  });
});
```

- [ ] **Step 13.3: Run test**

```bash
npm test -- src/tests/lib/supabase/repositories/your-videos-listByStatus.test.ts
```
Expected: PASS (2 tests).

- [ ] **Step 13.4: Commit**

```bash
git add src/lib/supabase/repositories/your-videos.ts \
        src/tests/lib/supabase/repositories/your-videos-listByStatus.test.ts
git commit -m "feat(repo): listVideosByStatus for /lab/drafts tabbed UI"
```

---

## Task 14: `/lab/drafts` page + tabs component

**Files:**
- Create: `src/app/lab/drafts/page.tsx`
- Create: `src/components/lab/drafts-tabs.tsx`
- Create: `src/components/lab/rendered-row.tsx`
- Create: `src/components/lab/posted-row.tsx`

The page is a server component that reads `?tab=` from `searchParams`, queries the matching status set, and hands off to the tabs client component.

- [ ] **Step 14.1: Tabs client component**

```tsx
// src/components/lab/drafts-tabs.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

const TABS = [
  { key: "draft", label: "Draft" },
  { key: "rendered", label: "Rendered" },
  { key: "posted", label: "Posted" },
] as const;

export type DraftsTab = (typeof TABS)[number]["key"];

export function DraftsTabs({ active }: { active: DraftsTab }) {
  const router = useRouter();
  const sp = useSearchParams();

  function go(tab: DraftsTab) {
    const params = new URLSearchParams(sp.toString());
    params.set("tab", tab);
    router.push(`/lab/drafts?${params.toString()}`);
  }

  return (
    <div className="flex gap-1 border-b border-subtle">
      {TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => go(t.key)}
          className={[
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition",
            t.key === active
              ? "border-accent-electric text-text-primary"
              : "border-transparent text-text-muted hover:text-text-primary",
          ].join(" ")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 14.2: Rendered row**

```tsx
// src/components/lab/rendered-row.tsx
"use client";

import { useState } from "react";
import type { YourVideo } from "@/lib/supabase/repositories/your-videos";

export function RenderedRow({ video }: { video: YourVideo }) {
  const [busy, setBusy] = useState(false);

  async function postNow() {
    setBusy(true);
    try {
      await fetch("/api/lab/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId: video.id }),
      });
      alert("Post Now stub fired — real upload ships in Phase 5.");
    } finally { setBusy(false); }
  }

  async function reject() {
    if (!confirm("Reject this render?")) return;
    setBusy(true);
    try {
      await fetch("/api/lab/reject", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId: video.id }),
      });
      location.reload();
    } finally { setBusy(false); }
  }

  return (
    <li className="px-4 py-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium text-text-primary truncate">{video.title}</h3>
        <span className="text-xs font-mono text-text-muted">
          {video.duration_seconds ? `${video.duration_seconds.toFixed(0)}s` : "—"}
        </span>
      </div>

      {video.render_artifact_url ? (
        <video
          src={video.render_artifact_url}
          controls
          playsInline
          className="w-full max-w-xs rounded border border-subtle bg-black"
          style={{ aspectRatio: "9 / 16" }}
        />
      ) : (
        <p className="text-xs text-text-muted">No render_artifact_url; cannot preview.</p>
      )}

      <div className="flex items-center gap-2">
        <button
          disabled
          className="px-3 py-1.5 rounded bg-elevated text-text-muted text-xs font-medium border border-subtle cursor-not-allowed"
          title="Scheduling ships in Phase 5"
        >
          Approve &amp; Schedule (Phase 5)
        </button>
        <button
          onClick={postNow}
          disabled={busy}
          className="px-3 py-1.5 rounded bg-accent-electric text-app text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          Post now
        </button>
        <button
          onClick={reject}
          disabled={busy}
          className="px-3 py-1.5 rounded bg-elevated text-accent-red text-xs font-medium hover:bg-hover border border-accent-red/40 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </li>
  );
}
```

- [ ] **Step 14.3: Posted row (Phase 5 placeholder)**

```tsx
// src/components/lab/posted-row.tsx
import type { YourVideo } from "@/lib/supabase/repositories/your-videos";

export function PostedRow({ video }: { video: YourVideo }) {
  return (
    <li className="px-4 py-3 flex items-center justify-between gap-3">
      <span className="text-sm text-text-primary truncate">{video.title}</span>
      {video.url ? (
        <a href={video.url} target="_blank" rel="noopener" className="text-xs text-accent-electric hover:underline">
          View on YouTube ↗
        </a>
      ) : (
        <span className="text-xs text-text-muted">Posted at {video.posted_at ?? "—"}</span>
      )}
    </li>
  );
}
```

- [ ] **Step 14.4: Page**

```tsx
// src/app/lab/drafts/page.tsx
import { CockpitShell } from "@/components/cockpit/cockpit-shell";
import { getServiceClient } from "@/lib/supabase/server";
import { listVideosByStatus } from "@/lib/supabase/repositories/your-videos";
import { DraftsTabs, type DraftsTab } from "@/components/lab/drafts-tabs";
import { DraftRow } from "@/components/lab/draft-row";
import { RenderedRow } from "@/components/lab/rendered-row";
import { PostedRow } from "@/components/lab/posted-row";

export const dynamic = "force-dynamic";

export default async function LabDraftsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const active: DraftsTab = tab === "rendered" || tab === "posted" ? tab : "draft";

  const supabase = getServiceClient();
  const statusFor: Record<DraftsTab, Parameters<typeof listVideosByStatus>[1]> = {
    draft: ["draft", "rendering"],
    rendered: "rendered",
    posted: "posted",
  };
  const videos = await listVideosByStatus(supabase, statusFor[active], 20);

  return (
    <CockpitShell>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">Drafts</h1>
          <p className="text-text-secondary text-sm mt-1">
            Render, review, and approve videos generated by The Lab pipeline.
          </p>
        </header>

        <DraftsTabs active={active} />

        <section className="rounded-lg border border-subtle bg-surface">
          {videos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-muted">
              {active === "draft" && "No drafts. Dispatch a topic from /lab to make one."}
              {active === "rendered" && "No rendered videos yet. Render a draft to see it here."}
              {active === "posted" && "No posted videos yet. Posting pipeline ships in Phase 5."}
            </p>
          ) : (
            <ul className="divide-y divide-subtle">
              {videos.map((v) => {
                if (active === "draft") return <DraftRow key={v.id} draft={v} />;
                if (active === "rendered") return <RenderedRow key={v.id} video={v} />;
                return <PostedRow key={v.id} video={v} />;
              })}
            </ul>
          )}
        </section>
      </div>
    </CockpitShell>
  );
}
```

- [ ] **Step 14.5: Commit**

```bash
git add src/app/lab/drafts/page.tsx \
        src/components/lab/drafts-tabs.tsx \
        src/components/lab/rendered-row.tsx \
        src/components/lab/posted-row.tsx
git commit -m "feat(lab): /lab/drafts 3-tab review page (Draft | Rendered | Posted)"
```

---

## Task 15: `DraftRow` — Render button + rendering-state UI

**Files:**
- Modify: `src/components/lab/draft-row.tsx`

The current row supports `status='draft'`. Add a Render button when `status='draft'`. For `status='rendering'`, swap the action area to a spinner + "Rendering…" label. Reload page after render dispatch (UI polls via parent refresh).

- [ ] **Step 15.1: Update component**

```tsx
// src/components/lab/draft-row.tsx
"use client";

import { useState } from "react";
import type { YourVideo } from "@/lib/supabase/repositories/your-videos";

export function DraftRow({ draft }: { draft: YourVideo }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  function reDispatch() {
    if (!draft.topic_queue_id) return;
    window.dispatchEvent(
      new CustomEvent("lab:dispatch-start", { detail: { topicId: draft.topic_queue_id } }),
    );
  }

  async function discard() {
    if (!confirm("Discard this draft?")) return;
    await fetch(`/api/lab/drafts/${draft.id}`, { method: "DELETE" }).catch(() => null);
    location.reload();
  }

  async function render() {
    setBusy(true);
    try {
      const res = await fetch("/api/lab/render", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draftId: draft.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Render failed: ${err.error ?? res.statusText}`);
        return;
      }
      location.reload();  // reload so the row picks up status='rendering'
    } finally { setBusy(false); }
  }

  const isRendering = draft.status === "rendering";

  return (
    <li className="px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 text-left"
      >
        <span className="text-xs font-mono text-text-muted w-28 shrink-0">
          {formatTime(draft.created_at)}
        </span>
        <span className="flex-1 min-w-0 text-sm text-text-primary truncate">{draft.title}</span>
        <span className="text-xs font-mono text-text-muted">
          {draft.voice_id ?? "—"} · {draft.visual_treatment ?? "—"}
        </span>
        {isRendering && (
          <span className="text-xs font-mono text-accent-electric">rendering…</span>
        )}
        <span className="text-text-muted text-xs">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 pl-2 border-l border-subtle">
          <section>
            <p className="text-xs font-mono text-text-muted uppercase tracking-wide">Script</p>
            <p className="mt-1 text-sm text-text-primary whitespace-pre-wrap">{draft.script}</p>
          </section>
          <section className="flex items-center gap-2">
            {!isRendering && (
              <button
                onClick={render}
                disabled={busy}
                className="px-3 py-1.5 rounded bg-accent-electric text-app text-xs font-medium hover:opacity-90 disabled:opacity-50"
              >
                Render
              </button>
            )}
            <button
              onClick={reDispatch}
              className="px-3 py-1.5 rounded bg-elevated text-text-primary text-xs font-medium hover:bg-hover border border-subtle"
              disabled={!draft.topic_queue_id || isRendering}
            >
              Re-dispatch
            </button>
            <button
              onClick={discard}
              className="px-3 py-1.5 rounded bg-elevated text-accent-red text-xs font-medium hover:bg-hover border border-accent-red/40"
              disabled={isRendering}
            >
              Discard
            </button>
          </section>
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 15.2: Commit**

```bash
git add src/components/lab/draft-row.tsx
git commit -m "feat(lab): DraftRow render button + rendering-state UI"
```

---

## Task 16: Nav link to /lab/drafts

**Files:**
- Modify: `src/components/cockpit/cockpit-shell.tsx` (or wherever the nav lives)

Verify nav has a /lab/drafts link. If not, add one between /lab and any future /clips placeholder.

- [ ] **Step 16.1: Inspect current nav**

```bash
grep -n "/lab\"" src/components/cockpit/*.tsx
```

- [ ] **Step 16.2: Add link if missing**

Edit the nav to include `{ label: "Drafts", href: "/lab/drafts" }` adjacent to `/lab`. Implementation depends on the existing nav shape (file path may differ — verify before editing).

- [ ] **Step 16.3: Commit**

```bash
git add src/components/cockpit/cockpit-shell.tsx  # adjust path if different
git commit -m "feat(nav): add /lab/drafts entry"
```

---

## Task 17: Full test sweep + lint

- [ ] **Step 17.1: Run all tests**

```bash
npm test
```
Expected: All previous 151 tests + new Phase 2 tests pass. Count the delta and put it in the commit message.

- [ ] **Step 17.2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: Zero errors. If errors in `scripts/render-worker/*.ts` show up, confirm the existing `tsconfig.json` exclusion of that folder (Phase 1 commit 40efd7a) still holds.

- [ ] **Step 17.3: Build**

```bash
npm run build
```
Expected: Build succeeds.

- [ ] **Step 17.4: If anything fails, fix root cause; do not skip tests.**

---

## Task 18: Deploy to Vercel preview

- [ ] **Step 18.1: Push branch**

```bash
git push -u origin plan-4-phase-2
```

- [ ] **Step 18.2: Open preview deployment**

The GitHub-linked Vercel project will auto-build. Watch the deploy via:
```bash
gh pr create --draft --title "Plan #4 Phase 2: full Format-1 pipeline + /lab/drafts review UI" \
  --body "Pre-acceptance-gate preview deploy. Smoke test pending."
```
Capture the preview URL from the PR.

- [ ] **Step 18.3: Verify env vars in preview**

In Vercel dashboard for the preview project, confirm:
- `PEXELS_API_KEY` set
- `GROQ_API_KEY` set
- All Phase 1 env vars still present (operator setup checklist §8 in the spec)

---

## Task 19: End-to-end smoke test through `/lab/drafts`

Acceptance gate: dispatcher → render → callback in <120s, .mp4 playable in the Rendered tab.

- [ ] **Step 19.1: Pre-flight in the linked Supabase**

Verify there's a `your_videos` row with `status='draft'` and a Director shot_list in `decisions` for that video's job. If not, dispatch a fresh topic via `/lab` first:

1. Navigate to `https://<preview>.vercel.app/lab`.
2. Click any topic in Ready to Dispatch → wait for pipeline completion (~30-60s).
3. Confirm new row appears in Recent Drafts.

- [ ] **Step 19.2: Render**

1. Navigate to `https://<preview>.vercel.app/lab/drafts?tab=draft`.
2. Expand the new draft row.
3. Click **Render**.
4. Page reloads with `rendering…` badge.

- [ ] **Step 19.3: Watch the queue**

In a parallel terminal:
```bash
# Live-tail Vercel logs (function logs)
vercel logs <preview-url> --since 5m --follow
```

Look for:
- `render-dispatcher` claims the job within 60s.
- Sandbox boot logs (`[render_f1] +Xms`).
- Cartesia TTS, Pexels download(s), normalize, Whisper, music skip/use, final compose, blob upload.
- POST to `/api/render/complete` → 200.

- [ ] **Step 19.4: Confirm Rendered tab**

1. Navigate to `https://<preview>.vercel.app/lab/drafts?tab=rendered`.
2. Verify the row appears with the inline `<video>` element.
3. Click play — video plays end-to-end with audio + captions.

- [ ] **Step 19.5: Document the benchmark**

Capture the per-stage timing from logs into `docs/superpowers/notes/2026-05-25-plan-4-phase-2-benchmark.md`:

```markdown
# Plan #4 Phase 2 — End-to-end benchmark

**Date:** YYYY-MM-DD
**Result:** PASS / FAIL — total wall-clock _s (gate 120s)

## Per-stage timing (job <uuid>)

| Stage | Time | Notes |
|---|---|---|
| Dispatcher claim → Sandbox.create return | _ |  |
| Sandbox boot + git clone + npm ci | _ |  |
| Cartesia TTS | _ |  |
| Pexels download × N | _ | per-shot avg |
| Normalize ffmpeg × N | _ | per-shot avg |
| Whisper alignment | _ |  |
| Music pick + download | _ | skipped if music_tracks empty |
| Final compose ffmpeg | _ |  |
| Blob upload | _ |  |
| Callback → state transition | _ |  |
| **Total (claimed_at → finished_at)** | _ |  |

## Output

- render_artifact_url: ...
- duration_seconds_actual: ...
- Captions visible: yes / no
- Music bed present: yes / no
- Inline preview at /lab/drafts?tab=rendered plays: yes / no

## Adaptations from the plan

(Anything that required deviation from the written plan.)
```

- [ ] **Step 19.6: Acceptance decision**

If wall-clock ≤ 120s AND video plays AND captions visible:
- Phase 2 acceptance gate **PASSED**.
- Mark the PR ready for review.

If FAILED:
- Stop. Capture the breakdown and surface to operator before continuing.

- [ ] **Step 19.7: Commit benchmark doc**

```bash
git add docs/superpowers/notes/2026-05-25-plan-4-phase-2-benchmark.md
git commit -m "docs(plan-4): Phase 2 end-to-end benchmark — PASS / FAIL at _s"
git push
```

---

## Phase 2 exit checklist

- [ ] Task 1: `/api/render/debug` deleted
- [ ] Task 2: VOICE_POOL holds real Cartesia UUIDs (operator-approved) + channel default updated
- [ ] Task 3: `held-shot-with-text-animation` in VISUAL_TREATMENTS
- [ ] Task 4: Pexels client tested + committed
- [ ] Task 5: Worker Pexels downloader committed
- [ ] Task 6: ffprobe wrapper + cartesia uses it
- [ ] Task 7: Groq Whisper client + SRT generator tested
- [ ] Task 8: music_tracks repo + worker downloader (best-effort)
- [ ] Task 9: ffmpeg compose helpers tested at argv level
- [ ] Task 10: full render_f1 handler rewritten; integration covered by smoke
- [ ] Task 11: `/api/lab/render` tested + committed (cockpit-auth via proxy)
- [ ] Task 12: `/api/lab/post-now` stub + `/api/lab/reject` tested + committed
- [ ] Task 13: `listVideosByStatus` repo + test
- [ ] Task 14: `/lab/drafts` 3-tab page + RenderedRow + PostedRow components
- [ ] Task 15: DraftRow Render button + rendering state
- [ ] Task 16: Nav link to /lab/drafts
- [ ] Task 17: All tests + tsc + build green
- [ ] Task 18: Preview deploy live with env vars set
- [ ] Task 19: End-to-end smoke <120s; benchmark doc committed
- [ ] All commits pushed to remote
- [ ] PR opened, marked ready for review

---

## Hard-rule audit (run before declaring Phase 2 complete)

- [ ] Operator approval still mandatory before posting (Post-now stub does not actually upload — verify by reading the route handler)
- [ ] Decision logging unchanged — Phase 2 added no new Claude agents, so no new `decisions` writes; existing writes retain `prompt_version` + `guidance_ids_used` columns
- [ ] RenderWorker abstraction preserved: `grep -rn '@vercel/sandbox' src/` returns ONLY `src/lib/render/workers/vercel-sandbox.ts`
- [ ] No new secrets committed to repo (PEXELS_API_KEY + GROQ_API_KEY are env vars only; grep the diff)
- [ ] Conventional Commits format on every commit
- [ ] TS strict: `npx tsc --noEmit` clean
- [ ] Zod at all new HTTP boundaries (Pexels, Groq, /api/lab/*)
- [ ] `'server-only'` import on all secret-holding modules
- [ ] `/api/lab/*` NOT in `PUBLIC_PATH_PREFIXES` (cockpit auth enforced)
- [ ] `.gitignore` still covers `.env*` (no new secret file types introduced)

---

## Operator-blocking decisions (surface BEFORE execution)

1. **Voice pool UUIDs (Task 2):** which 6 Cartesia voices to use as the VOICE_POOL? Default: keep slot 1 = Corey (current channel default UUID `630ed21c-2c5c-41cf-9d82-10a7fd668370`) + operator picks 5 more from `https://api.cartesia.ai/voices`. OR: collapse VOICE_POOL to a single voice (Corey) and treat Voice Coach output as effectively-fixed for Phase 2.

2. **music_tracks seeding (Task 8 + 10):** Phase 2 designs the music path as best-effort — handler gracefully skips when table is empty. Operator chooses:
   - (a) Accept Phase 2 ships without a music bed (table stays empty until Phase 5 import CLI lands)
   - (b) Insert 5-10 rows manually via Supabase Studio (operator-uploaded mp3s, requires_attribution=false, energy_level 2-3)
   - (c) Hoist the Phase 5 music-import CLI into Phase 2 as an extra task

3. **Pexels tier:** confirm free tier (200 req/hr) is enough for Phase 2 (one benchmark + occasional manual renders). Paid only matters at Phase 5's posting cadence.

4. **`/api/render/debug` deletion vs admin-gating:** Task 1 plans a delete. If operator wants to keep it for troubleshooting Phase 3+, change Task 1 to admin-gate via `COCKPIT_COOKIE_NAME` + admin role check (admin role doesn't exist yet in the repo — would need a feature flag env var like `RENDER_DEBUG_ENABLED=true`).
