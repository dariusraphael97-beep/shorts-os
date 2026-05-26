# Plan #4 Phase 4 — Format 2 / Composer / /clips Candidates+Rendered / promote-to-your_videos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Format-2 end-to-end — Strategist routes "compilation" topics to a new Composer agent that assembles 5 clips + music into a `compilation_drafts` row; operator approves in a new /clips Candidates tab; render_f2 produces a 1080×1920 Top-5 MP4; operator approves the result in a new /clips Rendered tab which promotes it into `your_videos`. **Hard prerequisite (Task 1+2):** unblock real Reddit/YouTube ingestion so Composer has a candidate pool with more than one BBB test clip.

**Architecture:**
- The Phase 3 benchmark proved pipeline mechanics but exposed an environmental block: yt-dlp from Vercel datacenter IPs is anonymously refused by Reddit AND YouTube. Tasks 1–3 resolve that with operator-supplied cookies for the extractor + Reddit OAuth client_credentials for the discovery cron's JSON listing.
- The orchestrator gets a single switch after Strategist: `selected_format === 'explainer'` keeps the existing Writer → Voice Coach → Director chain; `selected_format === 'compilation'` calls a new `runComposer()` helper that produces a `compilation_drafts` row and exits early (no Writer/VC/Director on this branch).
- Composer pulls a 30-row candidate pool from `clip_library` filtered by `niche_id` + strategist-keyword tag overlap (excluding clips used in the channel's last 7 days), plus a music pool from `music_tracks (requires_attribution=false, energy_level in (2,3))`, plus the channel's last-5-uploads pattern summary. Calls Haiku via AI SDK `generateObject`, validates output in code (5 clips, sum 25–35s, music attribution, 3-of-4 pattern diff), retries once on fail, falls back to a heuristic picker.
- `render_f2` handler downloads clips from Blob → ffmpeg trim → composite Top-5 template (sidebar or overlay variant) → music ducked 20% → Blob upload. Title cards + callouts use ffmpeg drawtext in this phase; Remotion-side compositions deferred (the `plan-4-phase-2-5` branch owns `src/remotion/` and must not be touched here).
- /clips grows from one tab (Inbox) to three tabs (Inbox / Candidates / Rendered). Candidates tab approves/rejects/edits proposed compilations; Rendered tab approves promotions into `your_videos`.
- Format-mix enforcement lives in the orchestrator: if Strategist's `selected_format` would push the channel's 30-day mix off the target by > 15pp, an `operator_alerts` row is written (severity `warn`, category `format_mix_drift`) but the job is not blocked.

**Tech Stack:** TS strict, Next.js 16 App Router (Server Components by default — read `node_modules/next/dist/docs/` before any route handler), AI SDK v6 + `@ai-sdk/anthropic`, Zod, `@vercel/blob`, `@vercel/sandbox` (only inside `src/lib/render/workers/vercel-sandbox.ts` + `scripts/render-worker/`), `ffmpeg-static`, `yt-dlp-wrap`, Vitest, Supabase JS (service role).

**Schema:** All Phase 4 tables already exist from Phase 1 migration `20260525000002_plan_4_schema.sql`: `compilation_drafts`, `music_tracks`, `operator_alerts`. The Phase 4 work is repository + agent + UI on top of existing tables. **One small additive migration** in Task 7 adds the `composer` row to `agents` (the seed migration `20260524000013_seed_agents.sql` predates Composer).

**Phase 3 lessons carried forward (read before writing worker code):**
1. `yt-dlp-wrap` default import is double-wrapped under tsx (`{ default: <class> }`). Unwrap probe lives in `scripts/render-worker/lib/yt-dlp.ts` already — reuse it.
2. `downloadFromGithub()` ships the Python zipapp which crashes on Sandbox's Python 3.9. The standalone pyinstaller bundle is already downloaded by `scripts/render-worker/lib/yt-dlp.ts` — do not regress.
3. Worker stdout is unreachable; accumulate `trace: string[]` on errors and surface via the `RenderF2Error` pattern mirroring `RenderF1Error` in `scripts/render-worker/handlers/render-f1.ts`. The callback persists trace to `render_jobs.last_error` on success too.
4. Module-level code that throws kills the worker before `run.ts main()` runs. Defer all env reads + binary existence checks into function bodies.
5. `vercel env add NAME preview <branch>` requires the branch to be pushed to GitHub first (Vercel resolves the branch from the GitHub remote).
6. `npm run dev` from a Claude Code shell needs `-u ANTHROPIC_BASE_URL` in the env list or AI SDK 404s on `generateObject`.

**Operator-visible scope outs (called out so they don't surprise the executor):**
- **Remotion title cards + animated callouts are NOT in Phase 4.** Spec §4 line 723 lists them as Phase-4 Remotion work, but the operator has explicitly forbidden touching `src/remotion/`, `scripts/render-worker/handlers/render-f1.ts`, or `scripts/render-worker/lib/ffmpeg-commands.ts` while the `plan-4-phase-2-5` captions-overlay branch is in flight. v1 of render_f2 uses ffmpeg drawtext for the title bar + numbered sidebar/overlay; Remotion compositions for these will land in a follow-up phase after the 2.5 branch merges.
- **The format-mix enforcement** is recorded as a warning alert in Phase 4. The full Strategist prompt-level enforcement (preventing the wrong format being picked at all) is deferred per spec §2 / Plan #4 spec §5.5 to Phase 5.
- **YouTube cookies** are added to the worker env in Task 2 even though Phase 4 doesn't ingest from YouTube directly. Reason: the manual-URL drop path (Phase 3 Task 10) already accepts YouTube URLs and currently 403s; the operator should be able to seed Phase 4 testing with arbitrary URLs.

---

## File structure (what each new/touched file owns)

**New (code):**
- `docs/superpowers/notes/2026-05-26-plan-4-ip-block-decision.md` — Task 1 deliverable: 3-option matrix + chosen path + rotation policy.
- `src/lib/agents/composer.ts` — Zod schema + `runComposer({job, topic, channel, strategist, supabase})` returning `ComposerOutput`. Owns: candidate-pool SQL, music-pool SQL, recent-patterns summary, Haiku call, post-LLM validator, heuristic fallback.
- `src/lib/agents/format-mix.ts` — pure helper: `computeRecentMix(supabase, channelId, lookbackDays=30) → {explainer, compilation}`; `isFormatMixDrift(current, target, thresholdPp=15) → boolean`.
- `src/lib/supabase/repositories/compilation-drafts.ts` — insert/update with status transitions, recent-patterns query for Composer, candidate-pool query (joins clip_library on tag overlap), list by status for /clips tabs.
- `src/lib/supabase/repositories/operator-alerts.ts` — extend existing repo (already created in Phase 1) with `insertFormatMixDriftAlert` if not already present.
- `src/lib/render/job-payload.ts` — extend existing module with `RenderF2Payload = { compilation_draft_id: string }` schema (Phase 1 stub did this; verify and round out).
- `src/app/api/clips/candidates/[id]/approve/route.ts` — POST: transition `proposed → approved`, enqueue `render_f2`.
- `src/app/api/clips/candidates/[id]/reject/route.ts` — POST: transition `proposed → rejected`, write decisions outcome.
- `src/app/api/clips/candidates/[id]/edit/route.ts` — POST: replace `clip_refs` / `music_track_id` / labels on a proposed draft (only `status='proposed'` is editable).
- `src/app/api/clips/rendered/[id]/approve/route.ts` — POST: insert `your_videos` row (status='rendered', `render_artifact_url=draft.rendered_path`), update draft `status='posted'` + `promoted_your_video_id`. (Upload chaining is Phase 5.)
- `src/app/api/clips/rendered/[id]/reject/route.ts` — POST: transition `rendered → failed` with reason.
- `src/components/clips/candidates-tab.tsx` — server component: list `compilation_drafts.status='proposed'`.
- `src/components/clips/candidate-card.tsx` — client component: header preview, 5 clip thumbnails in order, music preview, Approve/Reject/Edit buttons.
- `src/components/clips/edit-drawer.tsx` — client component: drag-to-reorder clip_refs, swap clip from candidate pool, edit label, change music; POSTs to /edit route.
- `src/components/clips/rendered-tab.tsx` — server component: list `compilation_drafts.status='rendered'`.
- `src/components/clips/rendered-card.tsx` — client component: `<video>` of `rendered_path`, Approve / Reject buttons.
- `src/components/clips/clips-tabs.tsx` — client tab-switcher wrapping Inbox / Candidates / Rendered.
- `scripts/render-worker/handlers/render-f2.ts` — full impl: fetch draft + clips + music, ffmpeg trim per ref, composite, mux, Blob upload, return output.
- `scripts/render-worker/lib/compile-f2.ts` — pure ffmpeg-command builders for the Top-5 layouts (sidebar + overlay), so they can be unit-tested away from filesystem.
- `supabase/migrations/20260526000001_seed_composer_agent.sql` — `insert into agents (id, display_name, ...) values ('composer', 'Composer', …) on conflict do nothing`.

**Modified:**
- `src/lib/agents/types.ts` — `AgentId` adds `"composer"`; `StreamEvent` gains a `composer_done` shape if needed (or reuse `agent_output`).
- `src/lib/agents/strategist.ts` — output schema adds `selected_format: z.enum(['explainer','compilation'])`, `analyst_guidance_acknowledged: z.boolean()`, optional `forced_format_incompatible: z.object({...}).optional()`. Prompt block describes format mix + how to pick.
- `src/lib/agents/orchestrator.ts` — after Strategist, switch on `selected_format`; the `compilation` branch calls `runComposer()` then exits without Writer/VC/Director. Both branches yield the same StreamEvent shape so SSE keeps working. Inserts a format-mix-drift alert if `isFormatMixDrift()` returns true.
- `src/app/clips/page.tsx` — switch from single `<InboxTab />` to `<ClipsTabs />` rendering Inbox / Candidates / Rendered.
- `src/components/cockpit/cockpit-shell.tsx` — no nav change (Phase 3 already added /clips).
- `src/lib/render/workers/vercel-sandbox.ts` — pass `YTDLP_COOKIES_B64` (and Reddit OAuth keys if we picked the OAuth path) into the sandbox env.
- `scripts/render-worker/lib/yt-dlp.ts` — accept a `cookiesPath?: string` and pass `--cookies` if set; have `runClipIngest` write the cookies file to `/tmp/cookies.txt` from the env var before calling.
- `scripts/render-worker/run.ts` — wire `render_f2` job_type to `runRenderF2(job, supabase)`.
- `src/app/api/render/complete/route.ts` — `render_f2` success branch updates `compilation_drafts.rendered_path` + `status='rendered'` (mirror the `render_f1` branch pattern).
- `src/lib/env.ts` — add `YTDLP_COOKIES_B64?` (optional, string, base64 of cookies.txt), `REDDIT_OAUTH_CLIENT_ID?`, `REDDIT_OAUTH_CLIENT_SECRET?` (optional — if cookies path is chosen, OAuth is still used for discovery cron's JSON listing).
- `src/lib/clients/reddit.ts` — add OAuth client_credentials flow that swaps the anonymous JSON fetch for an authenticated one (uses `https://oauth.reddit.com` instead of `https://www.reddit.com`).
- `src/app/api/cron/reddit-clip-discovery/route.ts` — switch to authenticated Reddit client.

**Tests (Vitest):**
- `src/tests/lib/agents/composer.test.ts` — mocks `generateObject` (success + validation-fail-retry + heuristic fallback paths); mocks clip-library and music-tracks repos.
- `src/tests/lib/agents/format-mix.test.ts` — pure helpers.
- `src/tests/lib/agents/orchestrator.test.ts` — extend existing suite: compilation branch routes to Composer + exits early; format-mix-drift writes operator_alert.
- `src/tests/lib/supabase/repositories/compilation-drafts.test.ts` — insert/update/status transitions, recent-patterns query.
- `src/tests/api/clips/candidates/approve.test.ts` — POST happy path enqueues render_f2.
- `src/tests/api/clips/candidates/reject.test.ts`
- `src/tests/api/clips/candidates/edit.test.ts`
- `src/tests/api/clips/rendered/approve.test.ts` — POST creates your_videos row + updates draft.
- `src/tests/lib/clients/reddit-oauth.test.ts` — token caching + 401 retry.

Worker code (handlers + lib/compile-f2.ts) is not unit-tested — same pattern as Phase 2 and Phase 3. Verification for worker pieces is the prod smoke at Task 17.

---

## Task 1: IP-block resolution decision matrix (DOC ONLY, NO CODE)

**Hard prerequisite — must land before Tasks 2+.** Output: a single markdown notes doc that scores the three resolution paths and picks one. Operator (Darius) reads + signs off in chat; agent does not pick autonomously.

**Files:**
- Create: `docs/superpowers/notes/2026-05-26-plan-4-ip-block-decision.md`

- [ ] **Step 1: Write the matrix doc**

Create `docs/superpowers/notes/2026-05-26-plan-4-ip-block-decision.md` with the structure below. Score each option 1–5 (1=best, 5=worst) on each axis; sum totals; lowest sum wins. Don't editorialize beyond what the scoring matrix shows.

```markdown
# Plan #4 Phase 4 — IP-Block Resolution Decision

**Context:** The Phase 3 benchmark (docs/superpowers/notes/2026-05-26-plan-4-phase-3-benchmark.md) confirmed that yt-dlp from Vercel Sandbox datacenter IPs is anonymously refused by Reddit (`Account authentication is required`) and YouTube (`Sign in to confirm you're not a bot`). One workaround per host, two hosts, three candidate paths.

## Options

### (A) Operator-supplied yt-dlp cookies file
- Operator runs `yt-dlp --cookies-from-browser firefox --cookies cookies.txt` locally against their own Reddit + YouTube sessions
- Base64-encoded cookies stored as `YTDLP_COOKIES_B64` env var, decoded to `/tmp/cookies.txt` by the worker before each yt-dlp call
- For Reddit JSON discovery: operator-supplied OAuth client_credentials (separate from cookies) hits `oauth.reddit.com`
- Rotation: when consecutive bot-checks appear in `render_jobs.last_error`, operator re-exports cookies (~30 min)

### (B) Residential outbound proxy
- Vendor: Bright Data / Decodo / Oxylabs / SmartProxy
- yt-dlp wrapped with `--proxy http://user:pass@<vendor>:port`
- Per-GB cost: $2–10/GB at retail; at ~10 ingests/day @ ~5MB/clip = ~1.5GB/month → ~$3–15/month
- No operator account dependency; fully automated rotation handled by vendor

### (C) Reddit/YouTube OAuth integration (full)
- Reddit OAuth (script-app or installed-app flow) authenticates `oauth.reddit.com` JSON listings — fixes the discovery cron
- YouTube Data API only lets you upload/manage your own channel; does NOT provide third-party-video download. So OAuth alone does NOT solve YouTube clip download
- Practically reduces to: Reddit OAuth for discovery + cookies-or-proxy for YouTube clip downloads → not actually a standalone option, it's option (A) or (B) with extra Reddit-side plumbing

## Scoring (1=best, 5=worst)

| Axis | (A) Cookies | (B) Proxy | (C) OAuth |
|---|---|---|---|
| Operator effort (one-time) | 2 | 4 (vendor signup + payment) | 3 (Reddit app reg + cookies still needed for YT) |
| Ongoing operator effort | 3 (re-export ~monthly) | 1 (none) | 3 (re-export YT cookies + OAuth token monitoring) |
| Direct $ cost | 1 ($0) | 4 ($3–15/mo) | 2 ($0 + proxy-or-cookies for YT) |
| Breakage rate (cookie/IP detection) | 3 (operator's IP, occasional captcha) | 2 (vendor rotates) | 3 (compound: OAuth quirks + YT cookies) |
| ToS posture | 2 (operator is account holder; allowed in YT-Premium ToS) | 4 (residential proxies are borderline; Bright Data Pulled-Out clauses) | 2 (OAuth path is explicitly sanctioned by Reddit) |
| Implementation complexity in this codebase | 2 (env var + 3 lines in yt-dlp wrapper) | 3 (proxy env + wrapper + vendor SDK on YT) | 4 (OAuth token store + refresh + still need cookies for YT) |
| **Total (lower wins)** | **13** | **18** | **17** |

## Recommendation

**Option (A) — operator cookies + Reddit OAuth for JSON discovery.** Lowest total, lowest cash cost, fastest to implement, ToS-aligned because Darius is the account holder on both Reddit and YouTube. Cookie-rotation cost is acceptable — Phase 3 benchmark suggests one rotation every ~30 days on average.

## Implementation surface (if (A) is approved)

1. Operator generates `cookies.txt` via `yt-dlp --cookies-from-browser firefox --cookies cookies.txt https://www.youtube.com/` (also visits Reddit before export so Reddit cookies are captured).
2. `base64 cookies.txt | tr -d '\n' > cookies.b64` then `vercel env add YTDLP_COOKIES_B64 production` (paste, sensitive=true).
3. Operator registers a Reddit "script" app at https://www.reddit.com/prefs/apps, copies client_id + client_secret to `REDDIT_OAUTH_CLIENT_ID` + `REDDIT_OAUTH_CLIENT_SECRET` (production+preview env, sensitive=true).
4. Codebase changes: Tasks 2 (worker cookies plumbing + Reddit OAuth client) and 3 (prod smoke).

## Rotation policy (if (A) is approved)

- **Trigger:** ≥3 consecutive `render_jobs` for `clip_ingest` fail with `last_error` containing `cookies` OR `Sign in to confirm` OR `Account authentication is required`. Surfaced via an `operator_alerts` row (category `clip_ingest_zero_yield`, severity `warn`).
- **Operator action:** re-export `cookies.txt` from Firefox (~5 min), update `YTDLP_COOKIES_B64` via `vercel env`, redeploy.
- **Cadence baseline:** expect ~30-day cookie lifespan based on YT session-cookie behavior; Reddit cookies tend to last ~90 days.

## Out-of-scope for Phase 4 (defer)

- Multi-account cookie rotation (round-robin between two operator sessions)
- Automated cookie refresh via headless browser
- Bright Data fallback path (kept as Plan-B if (A) breakage rate exceeds 1/week)
```

- [ ] **Step 2: Stop and hand the decision to the operator**

This task ends with an explicit operator gate. Write a chat message containing the recommendation + the implementation surface and ask Darius to:
1. Approve option (A), pick (B) or (C), or request a re-score.
2. Confirm willingness to generate cookies.txt and register a Reddit script app (the one-time setup the matrix assumes).

**Do not advance to Task 2 without explicit operator approval of the chosen option.** If Darius picks (B) or (C), Tasks 2–3 must be re-planned against that option.

- [ ] **Step 3: Commit the doc**

```bash
git add docs/superpowers/notes/2026-05-26-plan-4-ip-block-decision.md
git commit -m "docs(plan-4): Phase 4 IP-block decision matrix — recommend (A) cookies + Reddit OAuth"
```

---

## Task 2: Worker cookies plumbing + Reddit OAuth client (assumes Option A approved)

**Files:**
- Modify: `scripts/render-worker/lib/yt-dlp.ts`
- Modify: `scripts/render-worker/handlers/clip-ingest.ts`
- Modify: `src/lib/render/workers/vercel-sandbox.ts`
- Modify: `src/lib/env.ts`
- Modify: `src/lib/clients/reddit.ts`
- Modify: `src/app/api/cron/reddit-clip-discovery/route.ts`
- Create: `src/tests/lib/clients/reddit-oauth.test.ts`

- [ ] **Step 1: Write the failing Reddit OAuth client test**

Create `src/tests/lib/clients/reddit-oauth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('redditOAuth.getAccessToken', () => {
  beforeEach(() => vi.resetModules());

  it('exchanges client credentials at /api/v1/access_token and caches the token until ~expires', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: 'tok-1', expires_in: 3600, token_type: 'bearer' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { getAccessToken } = await import('@/lib/clients/reddit');
    const a = await getAccessToken({ clientId: 'cid', clientSecret: 'csec' });
    const b = await getAccessToken({ clientId: 'cid', clientSecret: 'csec' });

    expect(a).toBe('tok-1');
    expect(b).toBe('tok-1');           // cached
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://www.reddit.com/api/v1/access_token');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    const auth = (init.headers as Record<string,string>).Authorization;
    expect(auth).toMatch(/^Basic /);
  });

  it('refetches after 401 and surfaces the second response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('expired', { status: 401 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ access_token: 'tok-2', expires_in: 3600, token_type: 'bearer' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ));
    vi.stubGlobal('fetch', fetchMock);

    const { getAccessToken, _clearTokenCache } = await import('@/lib/clients/reddit');
    _clearTokenCache();
    await expect(getAccessToken({ clientId: 'cid', clientSecret: 'csec' })).rejects.toThrow(/401/);
    const tok = await getAccessToken({ clientId: 'cid', clientSecret: 'csec' });
    expect(tok).toBe('tok-2');
  });
});
```

- [ ] **Step 2: Run it to confirm failure**

```bash
npx vitest run src/tests/lib/clients/reddit-oauth.test.ts
```

Expected: fails because `getAccessToken` doesn't exist yet.

- [ ] **Step 3: Add OAuth client to `src/lib/clients/reddit.ts`**

Find the existing module and append (do not change the existing exports):

```ts
// --- Reddit OAuth (client_credentials) ---

type CachedToken = { token: string; expiresAt: number };
let _cachedToken: CachedToken | null = null;

export function _clearTokenCache(): void {
  _cachedToken = null;
}

export async function getAccessToken(args: {
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const now = Date.now();
  if (_cachedToken && _cachedToken.expiresAt > now + 60_000) {
    return _cachedToken.token;
  }
  const basic = Buffer.from(`${args.clientId}:${args.clientSecret}`).toString('base64');
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'shorts-os/0.4 by /u/operator',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    throw new Error(`reddit oauth ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  _cachedToken = { token: json.access_token, expiresAt: now + json.expires_in * 1000 };
  return json.access_token;
}

export async function getTopPostsAuthenticated(args: {
  subreddit: string;
  accessToken: string;
  timeWindow?: 'day' | 'week';
  limit?: number;
}) {
  const url = new URL(`https://oauth.reddit.com/r/${args.subreddit}/top.json`);
  url.searchParams.set('t', args.timeWindow ?? 'day');
  url.searchParams.set('limit', String(args.limit ?? 25));
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      'User-Agent': 'shorts-os/0.4 by /u/operator',
    },
  });
  if (!res.ok) throw new Error(`reddit listing ${res.status}: ${await res.text()}`);
  return (await res.json()) as { data: { children: Array<{ data: unknown }> } };
}
```

- [ ] **Step 4: Run the test again**

```bash
npx vitest run src/tests/lib/clients/reddit-oauth.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add cookies + Reddit env vars to `src/lib/env.ts`**

Read the existing module first to match its style (Zod-based + getter pattern). Add three optional vars:

```ts
// extending the existing Zod schema
YTDLP_COOKIES_B64: z.string().optional(),
REDDIT_OAUTH_CLIENT_ID: z.string().optional(),
REDDIT_OAUTH_CLIENT_SECRET: z.string().optional(),
```

Optional because Phase 4 launches without them in dev/test; only production needs them. The reddit-clip-discovery cron should check `if (!env.REDDIT_OAUTH_CLIENT_ID) skipWithLog('reddit-oauth-unconfigured')` and exit 200, so missing env is graceful.

- [ ] **Step 6: Switch the discovery cron to authenticated Reddit**

Edit `src/app/api/cron/reddit-clip-discovery/route.ts` to:
1. Skip-with-200 if `REDDIT_OAUTH_CLIENT_ID` is unset.
2. Otherwise call `getAccessToken({...})` once, then call `getTopPostsAuthenticated({...})` per subreddit instead of the existing anonymous fetch.

The exact diff depends on the current route shape (Task 8 of Phase 3 plan) — re-read the file before editing.

- [ ] **Step 7: Plumb cookies into the worker yt-dlp wrapper**

Edit `scripts/render-worker/lib/yt-dlp.ts`:
1. Before downloading: if `process.env.YTDLP_COOKIES_B64` is set, write it (base64-decoded) to `/tmp/cookies.txt` and pass `'--cookies', '/tmp/cookies.txt'` to the yt-dlp invocation.
2. Same for the auto-subs fetch call.

Add `trace.push('cookies: ' + (process.env.YTDLP_COOKIES_B64 ? 'enabled' : 'none'))` so the prod log records whether cookies were used.

- [ ] **Step 8: Pass cookies env into the sandbox**

Edit `src/lib/render/workers/vercel-sandbox.ts`:

```ts
// in the env object passed to Sandbox.create({ env: {...} })
YTDLP_COOKIES_B64: env.YTDLP_COOKIES_B64 ?? '',
```

- [ ] **Step 9: Run full test suite**

```bash
npm run typecheck && npx vitest run
```

Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(worker): yt-dlp --cookies + Reddit OAuth client_credentials (Phase 4 unblock)"
```

---

## Task 3: Prod smoke — real Reddit clip ingest with cookies

**Files:** none (operator-driven gates + Vercel MCP + Supabase MCP).

- [ ] **Step 1: Operator generates cookies + registers Reddit app**

Hand-off in chat: ask Darius to (1) export `cookies.txt` from Firefox via `yt-dlp --cookies-from-browser firefox --cookies cookies.txt https://www.youtube.com/ && yt-dlp --cookies-from-browser firefox --cookies-cumulative cookies.txt https://www.reddit.com/` (or equivalent for his browser of choice), (2) register a Reddit "script" app at https://www.reddit.com/prefs/apps. Then he runs:

```bash
base64 cookies.txt | tr -d '\n' > cookies.b64
vercel env add YTDLP_COOKIES_B64 production         # paste cookies.b64 contents, mark Sensitive
vercel env add REDDIT_OAUTH_CLIENT_ID production    # mark Sensitive
vercel env add REDDIT_OAUTH_CLIENT_SECRET production # mark Sensitive
vercel env add YTDLP_COOKIES_B64 preview            # same
vercel env add REDDIT_OAUTH_CLIENT_ID preview
vercel env add REDDIT_OAUTH_CLIENT_SECRET preview
```

Agent waits for confirmation that the env vars are set.

- [ ] **Step 2: Deploy a preview**

```bash
git push origin plan-4-phase-4   # branch is created in Task 4 step 1; for Task 3 use current branch
vercel --prod=false               # or wait for auto-preview
```

Capture the preview URL.

- [ ] **Step 3: Enqueue a manual Reddit clip ingest via /api/clips/ingest-url**

Pick a recent v.redd.it post from r/IdiotsInCars. Curl the manual-ingest route on the preview deploy:

```bash
curl -X POST "<preview_url>/api/clips/ingest-url" \
  -H "Content-Type: application/json" \
  -d '{"source_url":"https://www.reddit.com/r/IdiotsInCars/comments/<id>"}'
```

- [ ] **Step 4: Watch dispatcher → sandbox → callback**

Via Supabase MCP:
```sql
select id, job_type, status, started_at, finished_at, last_error
from render_jobs
where job_type='clip_ingest'
order by created_at desc
limit 5;
```

Expected: one row reaches `status='succeeded'` within ~60s. If `last_error` mentions `Account authentication is required` or `Sign in to confirm`, cookies are not flowing — re-check Task 2 Step 7+8 and the env vars.

- [ ] **Step 5: Confirm clip_library row**

```sql
select id, source_url, source_platform, description, tags, local_path, duration_seconds
from clip_library
where added_by='manual' and source_url like '%reddit.com%'
order by added_at desc limit 1;
```

Expected: `source_platform='reddit'`, non-null description, ≥1 tag, valid Blob URL. (Note: Phase 3 worker hardcodes `source_platform='reddit'` regardless of URL — that's tracked as a Phase 4 worker fix in Task 5.)

- [ ] **Step 6: Spawn 2–3 more ingests via the discovery cron**

Hand-trigger the cron route to populate the candidate pool for Composer testing:

```bash
curl "<preview_url>/api/cron/reddit-clip-discovery"
```

Wait ~3 minutes. Re-query `clip_library` — expect ≥3 new rows.

- [ ] **Step 7: Document the smoke in a notes doc**

Append to `docs/superpowers/notes/2026-05-26-plan-4-ip-block-decision.md`:

```markdown
## Smoke result (`<date>`)

- Manual Reddit URL ingest: <PASS/FAIL with row id + duration>
- Cron-driven discovery: <N clips ingested in 30 min, link to logs>
- Cookies-warning indicators in last_error: <none / list>

Next checkpoint: re-run smoke + reset cookies if `clip_ingest_zero_yield` alert appears in `operator_alerts`.
```

- [ ] **Step 8: Commit + push**

```bash
git add docs/superpowers/notes/2026-05-26-plan-4-ip-block-decision.md
git commit -m "docs(plan-4): Phase 4 IP-unblock prod smoke results"
git push
```

**Gate:** do NOT proceed to Task 4 unless this smoke produced ≥3 real Reddit clips in `clip_library`. Composer needs candidates to test against. If the smoke fails, escalate to the operator and reconsider option (B) or (C).

---

## Task 4: Branch + worker fix — derive `source_platform` from URL

**Files:**
- Modify: `scripts/render-worker/handlers/clip-ingest.ts`

The Phase 3 worker hardcodes `source_platform='reddit'` (handler line ~167 per Phase 3 benchmark item 6). Phase 4 multi-source needs the real platform.

- [ ] **Step 1: Create the working branch**

```bash
git checkout main && git pull --ff-only
git checkout -b plan-4-phase-4
```

- [ ] **Step 2: Add a pure URL-classifier in the worker**

Edit `scripts/render-worker/handlers/clip-ingest.ts`. Replace the hardcoded `source_platform='reddit'` line with:

```ts
function deriveSourcePlatform(sourceUrl: string): 'reddit' | 'youtube' | 'tiktok' | 'twitch' | 'upload' {
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase();
    if (host.includes('reddit.com') || host.endsWith('redd.it')) return 'reddit';
    if (host.includes('youtube.com') || host === 'youtu.be') return 'youtube';
    if (host.includes('tiktok.com')) return 'tiktok';
    if (host.includes('twitch.tv')) return 'twitch';
    return 'upload';
  } catch {
    return 'upload';
  }
}
```

Replace the hardcoded usage with `deriveSourcePlatform(payload.source_url)` in the callback output.

- [ ] **Step 3: Commit**

```bash
git add scripts/render-worker/handlers/clip-ingest.ts
git commit -m "fix(worker): derive source_platform from URL host, not hardcoded reddit"
```

---

## Task 5: compilation-drafts repository

**Files:**
- Create: `src/lib/supabase/repositories/compilation-drafts.ts`
- Create: `src/tests/lib/supabase/repositories/compilation-drafts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/lib/supabase/repositories/compilation-drafts.test.ts` — mirror the chain-mock pattern from `src/tests/lib/supabase/repositories/clip-library.test.ts` (existing Phase 3 test) plus these cases:

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  insertCompilationDraft,
  listProposedDrafts,
  listRenderedDrafts,
  getDraftById,
  updateDraftStatus,
  updateDraftClipRefs,
  setRenderedPath,
  setPromotedYourVideoId,
  listRecentPatterns,
} from '@/lib/supabase/repositories/compilation-drafts';

function chainMock(returns: unknown) {
  const single = vi.fn().mockResolvedValue({ data: returns, error: null });
  const order = vi.fn().mockReturnThis();
  const eq = vi.fn().mockReturnThis();
  const limit = vi.fn().mockReturnThis();
  const select = vi.fn().mockReturnThis();
  const update = vi.fn().mockReturnThis();
  const insert = vi.fn().mockReturnThis();
  const from = vi.fn().mockReturnValue({ select, insert, update, eq, order, limit, single });
  return { from, select, insert, update, eq, order, limit, single } as never;
}

describe('compilation-drafts repo', () => {
  it('insertCompilationDraft returns the new row id', async () => {
    const sb = chainMock({ id: 'd1' });
    const id = await insertCompilationDraft(sb as never, {
      channel_id: 'c1',
      topic_queue_id: 't1',
      theme: 'theme',
      title_template: 'TOP 5 X',
      accent_word: 'X',
      title_formula_id: 'top_5',
      reveal_pattern: 'dramatic',
      caption_style: 'mixed',
      layout_variant: 'top5_sidebar',
      clip_refs: [{ clip_id: 'c1', start_sec: 0, end_sec: 5, label: 'one', order: 1 }],
      music_track_id: 'm1',
    });
    expect(id).toBe('d1');
  });

  it('listRecentPatterns returns last 5 channel patterns', async () => { /* … */ });
  it('updateDraftStatus rejects illegal transitions', async () => { /* … */ });
  // remaining tests
});
```

Fill in the remaining cases (listProposed/Rendered, getDraftById, updateDraftStatus, updateDraftClipRefs, setRenderedPath, setPromotedYourVideoId, listRecentPatterns).

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/tests/lib/supabase/repositories/compilation-drafts.test.ts
```

Expected: fails because the module doesn't exist.

- [ ] **Step 3: Implement the repo**

Create `src/lib/supabase/repositories/compilation-drafts.ts`:

```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DraftStatus = 'proposed' | 'approved' | 'rejected' | 'rendering' | 'rendered' | 'posted' | 'failed';
export type RevealPattern = 'chronological' | 'dramatic' | 'reverse_rank';
export type CaptionStyle = 'descriptive' | 'reactive' | 'mixed';
export type LayoutVariant = 'top5_sidebar' | 'top5_overlay';

export interface ClipRef {
  clip_id: string;
  start_sec: number;
  end_sec: number;
  label: string;
  order: number;
}

export interface CompilationDraftInsert {
  channel_id: string;
  topic_queue_id: string | null;
  theme: string;
  title_template: string;
  accent_word: string;
  title_formula_id: string;
  reveal_pattern: RevealPattern;
  caption_style: CaptionStyle;
  layout_variant: LayoutVariant;
  clip_refs: ClipRef[];
  music_track_id: string | null;
}

export interface CompilationDraftRow extends CompilationDraftInsert {
  id: string;
  status: DraftStatus;
  rendered_path: string | null;
  promoted_your_video_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function insertCompilationDraft(
  supabase: SupabaseClient,
  row: CompilationDraftInsert,
): Promise<string> {
  const { data, error } = await supabase
    .from('compilation_drafts')
    .insert({ ...row, status: 'proposed' as DraftStatus })
    .select('id')
    .single();
  if (error) throw new Error(`insertCompilationDraft: ${error.message}`);
  return data.id as string;
}

export async function listProposedDrafts(
  supabase: SupabaseClient,
  args: { channelId?: string; limit?: number },
): Promise<CompilationDraftRow[]> {
  let q = supabase.from('compilation_drafts').select('*').eq('status', 'proposed').order('created_at', { ascending: false }).limit(args.limit ?? 50);
  if (args.channelId) q = q.eq('channel_id', args.channelId);
  const { data, error } = await q;
  if (error) throw new Error(`listProposedDrafts: ${error.message}`);
  return (data ?? []) as CompilationDraftRow[];
}

export async function listRenderedDrafts(
  supabase: SupabaseClient,
  args: { channelId?: string; limit?: number },
): Promise<CompilationDraftRow[]> {
  let q = supabase.from('compilation_drafts').select('*').eq('status', 'rendered').order('updated_at', { ascending: false }).limit(args.limit ?? 50);
  if (args.channelId) q = q.eq('channel_id', args.channelId);
  const { data, error } = await q;
  if (error) throw new Error(`listRenderedDrafts: ${error.message}`);
  return (data ?? []) as CompilationDraftRow[];
}

export async function getDraftById(
  supabase: SupabaseClient,
  id: string,
): Promise<CompilationDraftRow | null> {
  const { data, error } = await supabase.from('compilation_drafts').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`getDraftById: ${error.message}`);
  return (data as CompilationDraftRow | null) ?? null;
}

const LEGAL_TRANSITIONS: Record<DraftStatus, DraftStatus[]> = {
  proposed: ['approved', 'rejected'],
  approved: ['rendering', 'failed'],
  rendering: ['rendered', 'failed'],
  rendered: ['posted', 'failed'],
  posted: [],
  rejected: [],
  failed: [],
};

export async function updateDraftStatus(
  supabase: SupabaseClient,
  args: { id: string; from: DraftStatus; to: DraftStatus },
): Promise<void> {
  if (!LEGAL_TRANSITIONS[args.from].includes(args.to)) {
    throw new Error(`illegal draft transition ${args.from} → ${args.to}`);
  }
  const { error, count } = await supabase
    .from('compilation_drafts')
    .update({ status: args.to, updated_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', args.id)
    .eq('status', args.from);
  if (error) throw new Error(`updateDraftStatus: ${error.message}`);
  if (count === 0) throw new Error(`draft ${args.id} not in status ${args.from}`);
}

export async function updateDraftClipRefs(
  supabase: SupabaseClient,
  args: { id: string; clip_refs: ClipRef[]; music_track_id?: string | null },
): Promise<void> {
  const patch: Record<string, unknown> = { clip_refs: args.clip_refs, updated_at: new Date().toISOString() };
  if (args.music_track_id !== undefined) patch.music_track_id = args.music_track_id;
  const { error } = await supabase.from('compilation_drafts').update(patch).eq('id', args.id).eq('status', 'proposed');
  if (error) throw new Error(`updateDraftClipRefs: ${error.message}`);
}

export async function setRenderedPath(
  supabase: SupabaseClient,
  args: { id: string; rendered_path: string },
): Promise<void> {
  const { error } = await supabase
    .from('compilation_drafts')
    .update({ rendered_path: args.rendered_path, status: 'rendered', updated_at: new Date().toISOString() })
    .eq('id', args.id);
  if (error) throw new Error(`setRenderedPath: ${error.message}`);
}

export async function setPromotedYourVideoId(
  supabase: SupabaseClient,
  args: { id: string; your_video_id: string },
): Promise<void> {
  const { error } = await supabase
    .from('compilation_drafts')
    .update({ promoted_your_video_id: args.your_video_id, status: 'posted', updated_at: new Date().toISOString() })
    .eq('id', args.id);
  if (error) throw new Error(`setPromotedYourVideoId: ${error.message}`);
}

export interface RecentPattern {
  title_formula_id: string;
  reveal_pattern: RevealPattern;
  caption_style: CaptionStyle;
  music_track_id: string | null;
}

export async function listRecentPatterns(
  supabase: SupabaseClient,
  args: { channelId: string; limit?: number },
): Promise<RecentPattern[]> {
  const { data, error } = await supabase
    .from('compilation_drafts')
    .select('title_formula_id,reveal_pattern,caption_style,music_track_id')
    .eq('channel_id', args.channelId)
    .in('status', ['posted', 'rendered'])
    .order('updated_at', { ascending: false })
    .limit(args.limit ?? 5);
  if (error) throw new Error(`listRecentPatterns: ${error.message}`);
  return (data ?? []) as RecentPattern[];
}
```

- [ ] **Step 4: Re-run tests until green**

```bash
npx vitest run src/tests/lib/supabase/repositories/compilation-drafts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/repositories/compilation-drafts.ts src/tests/lib/supabase/repositories/compilation-drafts.test.ts
git commit -m "feat(repo): compilation-drafts CRUD + status-transition guard"
```

---

## Task 6: Composer agent — Zod schema + candidate pool query

**Files:**
- Create: `src/lib/agents/composer.ts`
- Create: `src/tests/lib/agents/composer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/lib/agents/composer.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));
vi.mock('@/lib/ai/gateway', () => ({
  getClaudeModel: vi.fn().mockReturnValue('mock-model'),
}));

import { generateObject } from 'ai';
import { runComposer, ComposerOutputSchema } from '@/lib/agents/composer';

const validClipRefs = (clipIds: string[]) =>
  clipIds.map((id, i) => ({ clip_id: id, start_sec: 0, end_sec: 6, label: `clip ${i+1}`, order: i+1 }));

function mockSupabase(overrides: Record<string, unknown>) {
  // returns a chain mock matching composer's calls — minimal for the test
  return { /* stub the .from('clip_library') / .from('music_tracks') chains */ } as never;
}

describe('runComposer', () => {
  beforeEach(() => vi.resetAllMocks());

  it('succeeds when LLM returns valid output', async () => {
    const clipIds = ['c1','c2','c3','c4','c5'];
    (generateObject as ReturnType<typeof vi.fn>).mockResolvedValue({
      object: {
        title_template: 'TOP 5 X', accent_word: 'X', title_formula_id: 'top_5',
        reveal_pattern: 'dramatic', caption_style: 'mixed', layout_variant: 'top5_sidebar',
        clip_refs: validClipRefs(clipIds), music_track_id: 'm1', rationale: 'because',
      },
    });
    // mock candidate pool of 5 valid clips + music pool of 1 track + recent patterns []
    const supabase = mockSupabase({ candidates: clipIds.map(id => ({ id, duration_seconds: 10 })),
      music: [{ id: 'm1', requires_attribution: false, energy_level: 2 }], recent: [] });
    const out = await runComposer({
      job: { id: 'j1' } as never,
      topic: { id: 't1', title: 'X' } as never,
      channel: { id: 'ch1', niche_id: 'n1' } as never,
      strategist: { selected_format: 'compilation', dispatch_directive: 'go', format_hints: [] } as never,
      supabase,
    });
    expect(out.clip_refs.length).toBe(5);
    expect(out.music_track_id).toBe('m1');
  });

  it('rejects sum-out-of-range and retries once', async () => {
    // first LLM call returns sum=15s (out of range); retry succeeds
    (generateObject as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ object: { /* sum=15 */ } as never })
      .mockResolvedValueOnce({ object: { /* sum=30 */ } as never });
    // assert generateObject called twice
  });

  it('falls back to heuristic picker when both LLM attempts fail validation', async () => {
    // both LLM calls return invalid; expect a heuristic-picked draft
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/tests/lib/agents/composer.test.ts
```

Expected: fails — module doesn't exist.

- [ ] **Step 3: Implement composer.ts (schema + pool fetchers)**

Create `src/lib/agents/composer.ts` — schema + pool queries only (validator + fallback in Task 7):

```ts
import "server-only";
import { generateObject } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getClaudeModel } from "@/lib/ai/gateway";
import type { Channel } from "@/lib/supabase/repositories/channels";
import type { QueuedTopic } from "@/lib/supabase/repositories/topic-queue";
import type { Job } from "@/lib/supabase/repositories/jobs";
import type { StrategistOutput } from "./strategist";
import { listRecentPatterns, insertCompilationDraft, type RecentPattern } from "@/lib/supabase/repositories/compilation-drafts";

export const ComposerOutputSchema = z.object({
  title_template: z.string().min(8).max(60),
  accent_word: z.string().min(2).max(20),
  title_formula_id: z.enum(['ranking_best','top_5','you_wont_believe','when_gone_wrong','gone_wrong','my_favorite','reacting_to']),
  reveal_pattern: z.enum(['chronological','dramatic','reverse_rank']),
  caption_style: z.enum(['descriptive','reactive','mixed']),
  layout_variant: z.enum(['top5_sidebar','top5_overlay']),
  clip_refs: z.array(z.object({
    clip_id: z.string().uuid(),
    start_sec: z.number().min(0),
    end_sec: z.number().min(0),
    label: z.string().min(2).max(80),
    order: z.number().int().min(1).max(5),
  })).length(5),
  music_track_id: z.string().uuid(),
  rationale: z.string().min(10).max(800),
});
export type ComposerOutput = z.infer<typeof ComposerOutputSchema>;

export interface CandidateClip { id: string; description: string | null; tags: string[]; duration_seconds: number; }
export interface CandidateMusic { id: string; title: string; genre: string | null; energy_level: number | null; }

export async function fetchCandidatePool(
  supabase: SupabaseClient,
  args: { nicheId: string; channelId: string; tagKeywords: string[] },
): Promise<CandidateClip[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString();
  // exclude clips used in this channel's compilation_drafts.clip_refs in last 7d
  const { data: recentDrafts } = await supabase
    .from('compilation_drafts')
    .select('clip_refs')
    .eq('channel_id', args.channelId)
    .gte('updated_at', sevenDaysAgo)
    .in('status', ['proposed','approved','rendering','rendered','posted']);
  const usedClipIds = new Set<string>();
  for (const d of recentDrafts ?? []) {
    for (const r of (d as { clip_refs: Array<{clip_id:string}> }).clip_refs) usedClipIds.add(r.clip_id);
  }
  const { data, error } = await supabase
    .from('clip_library')
    .select('id,description,tags,duration_seconds')
    .eq('niche_id', args.nicheId)
    .neq('added_by', 'deleted')
    .gte('added_at', thirtyDaysAgo)
    .overlaps('tags', args.tagKeywords)
    .limit(30);
  if (error) throw new Error(`fetchCandidatePool: ${error.message}`);
  return (data ?? []).filter(c => !usedClipIds.has(c.id)) as CandidateClip[];
}

export async function fetchMusicPool(supabase: SupabaseClient): Promise<CandidateMusic[]> {
  const { data, error } = await supabase
    .from('music_tracks')
    .select('id,title,genre,energy_level')
    .eq('requires_attribution', false)
    .in('energy_level', [2,3])
    .order('added_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(`fetchMusicPool: ${error.message}`);
  return (data ?? []) as CandidateMusic[];
}

export interface ComposerContext {
  job: Job;
  topic: QueuedTopic;
  channel: Channel & { niche_id: string | null };
  strategist: StrategistOutput;
  supabase: SupabaseClient;
}

export async function runComposer(ctx: ComposerContext): Promise<{ output: ComposerOutput; draftId: string; fallbackUsed: boolean }> {
  if (!ctx.channel.niche_id) throw new Error('composer: channel.niche_id missing');
  const tagKeywords = ctx.strategist.format_hints.slice(0,5);
  const [candidates, music, recentPatterns] = await Promise.all([
    fetchCandidatePool(ctx.supabase, { nicheId: ctx.channel.niche_id, channelId: ctx.channel.id, tagKeywords }),
    fetchMusicPool(ctx.supabase),
    listRecentPatterns(ctx.supabase, { channelId: ctx.channel.id, limit: 5 }),
  ]);
  if (candidates.length < 5) throw new Error(`composer: not enough candidates (${candidates.length} < 5)`);
  if (music.length < 1) throw new Error('composer: no music tracks available');

  const prompt = buildPrompt({ candidates, music, recentPatterns, strategist: ctx.strategist, topic: ctx.topic });
  let output: ComposerOutput;
  let fallbackUsed = false;
  try {
    output = await callAndValidate(prompt, candidates, music, recentPatterns);
  } catch {
    try {
      const retryPrompt = prompt + '\n\nThe previous attempt failed validation. Be stricter about: 5 clips, each 4–9s long, total 25–35s.';
      output = await callAndValidate(retryPrompt, candidates, music, recentPatterns);
    } catch {
      output = heuristicFallback(candidates, music);
      fallbackUsed = true;
    }
  }

  const draftId = await insertCompilationDraft(ctx.supabase, {
    channel_id: ctx.channel.id,
    topic_queue_id: ctx.topic.id,
    theme: ctx.strategist.dispatch_directive.slice(0, 200),
    title_template: output.title_template,
    accent_word: output.accent_word,
    title_formula_id: output.title_formula_id,
    reveal_pattern: output.reveal_pattern,
    caption_style: output.caption_style,
    layout_variant: output.layout_variant,
    clip_refs: output.clip_refs,
    music_track_id: output.music_track_id,
  });
  return { output, draftId, fallbackUsed };
}

async function callAndValidate(
  prompt: string,
  candidates: CandidateClip[],
  music: CandidateMusic[],
  recentPatterns: RecentPattern[],
): Promise<ComposerOutput> {
  const result = await generateObject({
    model: getClaudeModel('claude-haiku-4-5'),
    schema: ComposerOutputSchema,
    prompt,
  });
  const parsed = ComposerOutputSchema.parse(result.object);
  validatePostLLM(parsed, candidates, music, recentPatterns);
  return parsed;
}

function buildPrompt(args: {
  candidates: CandidateClip[];
  music: CandidateMusic[];
  recentPatterns: RecentPattern[];
  strategist: StrategistOutput;
  topic: QueuedTopic;
}): string {
  // ~30-line prompt: theme, candidate list (id + description + tags + duration), music list, recent patterns, output schema reminder
  return `You are The Composer.

THEME: ${args.strategist.dispatch_directive}
TOPIC: ${args.topic.title}

CANDIDATE CLIPS (pick exactly 5):
${args.candidates.map(c => `[${c.id}] (${c.duration_seconds}s, tags=${c.tags.join(',')}): ${c.description?.slice(0,200) ?? '(no description)'}`).join('\n')}

MUSIC TRACKS (pick one):
${args.music.map(m => `[${m.id}] ${m.title} (${m.genre}, energy=${m.energy_level})`).join('\n')}

RECENT PATTERNS (last 5 channel uploads — your choice MUST differ on at least 3 of: title_formula_id, reveal_pattern, caption_style, music_track_id):
${args.recentPatterns.length === 0 ? '(none)' : args.recentPatterns.map((p,i) => `${i+1}. formula=${p.title_formula_id}, reveal=${p.reveal_pattern}, caption=${p.caption_style}, music=${p.music_track_id}`).join('\n')}

CONSTRAINTS:
- Pick exactly 5 clips. Each segment 4–9s. Total 25–35s.
- music_track_id MUST be from the list above.
- title_template ≤ 60 chars; accent_word ≤ 20 chars and a substring of title_template (case-insensitive).
- layout_variant: prefer top5_sidebar (4 of 5 times), occasionally top5_overlay.

Output JSON matching the schema.`;
}

function validatePostLLM(
  output: ComposerOutput,
  candidates: CandidateClip[],
  music: CandidateMusic[],
  recentPatterns: RecentPattern[],
): void {
  const candidateIds = new Set(candidates.map(c => c.id));
  const musicIds = new Set(music.map(m => m.id));
  for (const ref of output.clip_refs) {
    if (!candidateIds.has(ref.clip_id)) throw new Error(`unknown clip_id ${ref.clip_id}`);
    const dur = ref.end_sec - ref.start_sec;
    if (dur < 4 || dur > 9) throw new Error(`clip ${ref.clip_id} duration ${dur}s out of [4,9]`);
  }
  const total = output.clip_refs.reduce((a,r) => a + (r.end_sec - r.start_sec), 0);
  if (total < 25 || total > 35) throw new Error(`total duration ${total}s out of [25,35]`);
  if (!musicIds.has(output.music_track_id)) throw new Error(`unknown music_track_id ${output.music_track_id}`);
  // 3-of-4 pattern diff against each recent
  for (const p of recentPatterns) {
    let same = 0;
    if (p.title_formula_id === output.title_formula_id) same++;
    if (p.reveal_pattern === output.reveal_pattern) same++;
    if (p.caption_style === output.caption_style) same++;
    if (p.music_track_id === output.music_track_id) same++;
    if (same > 1) throw new Error(`pattern diff insufficient (${4-same}/4 different)`);
  }
}

function heuristicFallback(candidates: CandidateClip[], music: CandidateMusic[]): ComposerOutput {
  // pick first 5 (sorted by tag-count desc would be nicer; first 5 is acceptable for v1)
  const picked = candidates.slice(0,5);
  const refs = picked.map((c, i) => {
    const dur = Math.max(4, Math.min(9, c.duration_seconds));
    return { clip_id: c.id, start_sec: 0, end_sec: dur, label: `#${5-i}`, order: i+1 };
  });
  return {
    title_template: 'TOP 5 MOMENTS',
    accent_word: 'MOMENTS',
    title_formula_id: 'top_5',
    reveal_pattern: 'dramatic',
    caption_style: 'mixed',
    layout_variant: 'top5_sidebar',
    clip_refs: refs,
    music_track_id: music[0].id,
    rationale: 'heuristic fallback: LLM output failed validation twice',
  };
}
```

- [ ] **Step 4: Re-run tests until green**

```bash
npx vitest run src/tests/lib/agents/composer.test.ts
```

Expected: PASS (fill in the test mocks against the now-real shape).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/composer.ts src/tests/lib/agents/composer.test.ts
git commit -m "feat(agents): Composer — schema, candidate pool, validator, heuristic fallback"
```

---

## Task 7: Strategist schema update — selected_format + analyst_guidance_acknowledged

**Files:**
- Modify: `src/lib/agents/strategist.ts`
- Modify: `src/lib/agents/types.ts`
- Modify: `src/tests/lib/agents/strategist.test.ts` (if exists; otherwise create)
- Create: `supabase/migrations/20260526000001_seed_composer_agent.sql`

- [ ] **Step 1: Update AgentId**

Edit `src/lib/agents/types.ts`:

```ts
export type AgentId = "strategist" | "writer" | "voice_coach" | "director" | "composer";
```

- [ ] **Step 2: Extend Strategist Zod schema**

Edit `src/lib/agents/strategist.ts` — replace `StrategistOutputSchema`:

```ts
export const StrategistOutputSchema = z.object({
  dispatch_directive: z.string().min(20).max(400),
  format_hints: z.array(z.string()).min(1).max(5),
  selected_channel_id: z.string().uuid(),
  selected_format: z.enum(['explainer','compilation']),
  analyst_guidance_acknowledged: z.boolean(),
  forced_format_incompatible: z.object({
    reason: z.string().min(10).max(400),
  }).optional(),
  rationale: z.string().min(20).max(600),
});
```

Extend `buildPrompt` to describe selected_format:

```ts
function buildPrompt(ctx: StrategistRunContext): string {
  const targetMix = ctx.channel.target_format_mix as { explainer: number; compilation: number };
  return `You are The Strategist...

(existing channel + topic block stays)

FORMAT SELECTION:
- 'explainer': narrated short with a single claim or insight (Writer → Voice Coach → Director path).
- 'compilation': Top-5 montage of pre-ingested clips (Composer path; requires clip_library populated for this channel's niche).

Target format mix for this channel: ${(targetMix.explainer*100).toFixed(0)}% explainer / ${(targetMix.compilation*100).toFixed(0)}% compilation.

Pick selected_format that fits this topic. If the topic explicitly demands one format but the niche's clip_library is empty or wrong, set forced_format_incompatible={reason} and pick the alternative.

analyst_guidance_acknowledged: set true if you've considered the format mix; false only if no guidance applied. (Plan #5 wires real Analyst guidance here.)

(existing output instructions; add selected_format/analyst_guidance_acknowledged/forced_format_incompatible/etc.)`;
}
```

- [ ] **Step 3: Update or create strategist test**

If `src/tests/lib/agents/strategist.test.ts` doesn't exist, create one that asserts:
- generated output now includes selected_format
- the prompt mentions target_format_mix
- schema rejects an output missing selected_format

```bash
npx vitest run src/tests/lib/agents/strategist.test.ts
```

- [ ] **Step 4: Seed composer agent row**

Create `supabase/migrations/20260526000001_seed_composer_agent.sql`:

```sql
-- Add the composer agent. Idempotent.
insert into public.agents (id, display_name, description, state)
values ('composer', 'Composer', 'Assembles 5 clips + music into a compilation_drafts row', 'idle')
on conflict (id) do nothing;
```

- [ ] **Step 5: Apply migration locally + commit**

```bash
# apply via Supabase MCP or supabase db push, then:
git add -A
git commit -m "feat(agents): Strategist emits selected_format; seed composer agent row"
```

---

## Task 8: format-mix helper

**Files:**
- Create: `src/lib/agents/format-mix.ts`
- Create: `src/tests/lib/agents/format-mix.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/lib/agents/format-mix.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { computeRecentMix, isFormatMixDrift } from '@/lib/agents/format-mix';

describe('isFormatMixDrift', () => {
  it('returns false within 15pp', () => {
    expect(isFormatMixDrift({explainer:0.55, compilation:0.45}, {explainer:0.6, compilation:0.4})).toBe(false);
  });
  it('returns true beyond 15pp', () => {
    expect(isFormatMixDrift({explainer:0.30, compilation:0.70}, {explainer:0.6, compilation:0.4})).toBe(true);
  });
});

describe('computeRecentMix', () => {
  it('computes mix from your_videos + compilation_drafts in the last N days', async () => {
    // mock supabase chains for both tables
  });
});
```

- [ ] **Step 2: Implement**

Create `src/lib/agents/format-mix.ts`:

```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type FormatMix = { explainer: number; compilation: number };

export async function computeRecentMix(
  supabase: SupabaseClient,
  args: { channelId: string; lookbackDays?: number },
): Promise<FormatMix> {
  const since = new Date(Date.now() - (args.lookbackDays ?? 30)*24*60*60*1000).toISOString();
  const [{ count: explainerCount }, { count: compilationCount }] = await Promise.all([
    supabase.from('your_videos').select('id', { count: 'exact', head: true })
      .eq('channel_id', args.channelId).gte('created_at', since),
    supabase.from('compilation_drafts').select('id', { count: 'exact', head: true })
      .eq('channel_id', args.channelId).gte('created_at', since)
      .in('status', ['proposed','approved','rendering','rendered','posted']),
  ]);
  const total = (explainerCount ?? 0) + (compilationCount ?? 0);
  if (total === 0) return { explainer: 0.5, compilation: 0.5 };
  return { explainer: (explainerCount ?? 0)/total, compilation: (compilationCount ?? 0)/total };
}

export function isFormatMixDrift(current: FormatMix, target: FormatMix, thresholdPp = 0.15): boolean {
  return Math.abs(current.explainer - target.explainer) > thresholdPp;
}
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/tests/lib/agents/format-mix.test.ts && \
git add -A && git commit -m "feat(agents): format-mix helper + drift detector"
```

---

## Task 9: Orchestrator format-branch fork

**Files:**
- Modify: `src/lib/agents/orchestrator.ts`
- Modify: `src/tests/lib/agents/orchestrator.test.ts` (extend existing or create)

- [ ] **Step 1: Add branching after Strategist**

Edit `src/lib/agents/orchestrator.ts`. After the Strategist block (around line 100 — `yield* lifecycleAfter(...strategist)`), insert:

```ts
// ────── Branch on selected_format ──────
const currentMix = await computeRecentMix(supabase, { channelId: channel.id, lookbackDays: 30 });
const targetMix = channel.target_format_mix as { explainer: number; compilation: number };
if (isFormatMixDrift(currentMix, targetMix)) {
  await insertOperatorAlert(supabase, {
    channel_id: channel.id,
    category: 'format_mix_drift',
    severity: 'warn',
    message: `Recent mix ${(currentMix.explainer*100).toFixed(0)}/${(currentMix.compilation*100).toFixed(0)} drifts from target ${(targetMix.explainer*100).toFixed(0)}/${(targetMix.compilation*100).toFixed(0)}.`,
    context: { current_mix: currentMix, target_mix: targetMix },
    suggested_actions: null,
  });
}

if (strategistOut.selected_format === 'compilation') {
  currentAgent = 'composer';
  yield* lifecycleBefore(supabase, 'composer', `Composing: ${topic.title}`);
  const compStart = Date.now();
  const { output: composerOut, draftId, fallbackUsed } = await runComposer({
    job, topic, channel: channel as never, strategist: strategistOut, supabase,
  });
  yield { type: 'agent_output', data: { agent: 'composer', output: composerOut } };
  await recordAgentMessage(supabase, {
    jobId: job.id, fromAgent: 'strategist', toAgent: 'composer',
    intent: 'compilation_brief', payload: strategistOut as unknown as Record<string, unknown>,
  });
  await recordDecision(supabase, {
    jobId: job.id, agentId: 'composer', decisionType: 'compilation_assembly',
    inputs: { recent_patterns_summary: 'see context' },
    chosen: composerOut as unknown as Record<string, unknown>,
    reasoning: composerOut.rationale,
    outcome: fallbackUsed ? { fallback: true, reason: 'llm validation failed twice' } : null,
  });
  yield* lifecycleAfter(supabase, job.id, 'composer', 95, Date.now() - compStart);
  await finishJobSuccess(supabase, job.id);
  yield { type: 'job_completed', data: { videoId: draftId } };  // Reuse field; UI knows from selected_format
  return;
}

// otherwise fall through to existing Writer → VC → Director chain
```

Add imports at the top:

```ts
import { runComposer } from "./composer";
import { computeRecentMix, isFormatMixDrift } from "./format-mix";
import { insertOperatorAlert } from "@/lib/supabase/repositories/operator-alerts";
```

Also extend `progressByAgent` with `composer: 95` and update the AgentId-typed cast where needed.

- [ ] **Step 2: Update orchestrator tests**

In `src/tests/lib/agents/orchestrator.test.ts`, add cases:
- compilation branch: stub Strategist with `selected_format='compilation'`, mock `runComposer`, expect Writer/VC/Director are NOT called and job_completed fires with the draft id.
- format-mix-drift: stub `computeRecentMix` to return a drift, expect `insertOperatorAlert` is called once with category `format_mix_drift`.

```bash
npx vitest run src/tests/lib/agents/orchestrator.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(orchestrator): fork on selected_format; format-mix drift alert"
```

---

## Task 10: render_f2 worker handler — full impl

**Files:**
- Modify: `scripts/render-worker/handlers/render-f2.ts`
- Create: `scripts/render-worker/lib/compile-f2.ts`
- Modify: `scripts/render-worker/run.ts`

**Important:** Do NOT touch `scripts/render-worker/lib/ffmpeg-commands.ts` (owned by Phase 2.5 branch). Put all f2-specific ffmpeg builders in the new `lib/compile-f2.ts`.

- [ ] **Step 1: Implement compile-f2.ts (pure ffmpeg-command builder)**

Create `scripts/render-worker/lib/compile-f2.ts`:

```ts
// Pure functions that return ffmpeg argv arrays. No filesystem IO here.
import type { ClipRef } from "../../../src/lib/supabase/repositories/compilation-drafts";

export interface F2Inputs {
  clipPaths: string[];           // /tmp/clip_1.mp4 ... clip_5.mp4
  musicPath: string;             // /tmp/music.mp3
  refs: ClipRef[];               // ordered 1..5
  titleTemplate: string;
  accentWord: string;
  layoutVariant: 'top5_sidebar' | 'top5_overlay';
  outputPath: string;
}

export function buildTrimArgs(clipIn: string, clipOut: string, startSec: number, endSec: number): string[] {
  return [
    '-y','-i', clipIn,
    '-ss', String(startSec), '-to', String(endSec),
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
    '-c:v','libx264','-preset','veryfast','-crf','22',
    '-c:a','aac','-b:a','128k',
    clipOut,
  ];
}

export function buildConcatListFile(clipPaths: string[]): string {
  return clipPaths.map(p => `file '${p}'`).join('\n');
}

export function buildCompositeArgs(args: F2Inputs & { concatListPath: string; concatVideoPath: string }): string[] {
  // Stage 1 (precomputed by caller): concat the 5 trimmed clips into one mp4 at args.concatVideoPath
  // Stage 2 (this argv): overlay title bar + sidebar (or just title + numbered overlays), mux music ducked to 20%
  const drawTitle = `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${escapeDrawtext(args.titleTemplate)}':fontcolor=white:fontsize=64:box=1:boxcolor=black@0.7:boxborderw=20:x=(w-text_w)/2:y=40`;
  const labels = args.refs.map((r, i) => {
    const startTime = args.refs.slice(0,i).reduce((a,x) => a + (x.end_sec - x.start_sec), 0);
    return `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='${escapeDrawtext(`#${5-i} ${r.label}`)}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.6:x=40:y=h-200:enable='between(t,${startTime},${startTime + (r.end_sec - r.start_sec)})'`;
  }).join(',');
  const vf = `${drawTitle},${labels}`;
  return [
    '-y',
    '-i', args.concatVideoPath,
    '-i', args.musicPath,
    '-filter_complex', `[0:v]${vf}[v];[1:a]volume=0.20[mb];[0:a][mb]amix=inputs=2:duration=first:dropout_transition=3[a]`,
    '-map','[v]','-map','[a]',
    '-c:v','libx264','-preset','medium','-crf','21',
    '-c:a','aac','-b:a','192k',
    '-r','30',
    args.outputPath,
  ];
}

function escapeDrawtext(s: string): string {
  return s.replace(/[\\:'%]/g, c => `\\${c}`);
}
```

- [ ] **Step 2: Implement render-f2.ts**

Replace the Phase 1 stub at `scripts/render-worker/handlers/render-f2.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { getServiceClient } from "../lib/supabase.js";
import { uploadToBlob } from "../lib/blob.js";
import { buildTrimArgs, buildConcatListFile, buildCompositeArgs } from "../lib/compile-f2.js";
import ffmpegStatic from "ffmpeg-static";
import { getDraftById, type CompilationDraftRow } from "../../../src/lib/supabase/repositories/compilation-drafts.js";

const FFMPEG = (ffmpegStatic as unknown as string) ?? 'ffmpeg';

export class RenderF2Error extends Error {
  constructor(message: string, public trace: string[]) { super(message); this.name = 'RenderF2Error'; }
}

export async function runRenderF2(args: { compilation_draft_id: string }): Promise<{
  rendered_path: string;
  duration_seconds_actual: number;
}> {
  const trace: string[] = [];
  const t0 = Date.now();
  trace.push(`render_f2 start draft=${args.compilation_draft_id}`);
  const supabase = getServiceClient();
  const draft = await getDraftById(supabase, args.compilation_draft_id);
  if (!draft) throw new RenderF2Error(`draft ${args.compilation_draft_id} not found`, trace);

  // 1. Fetch clip rows
  const clipIds = draft.clip_refs.map(r => r.clip_id);
  const { data: clipRows, error: clipErr } = await supabase
    .from('clip_library').select('id,local_path').in('id', clipIds);
  if (clipErr || !clipRows || clipRows.length !== 5) throw new RenderF2Error(`clip fetch: ${clipErr?.message ?? 'wrong count'}`, trace);
  const clipById = new Map(clipRows.map((c: { id: string; local_path: string }) => [c.id, c.local_path]));

  // 2. Fetch music
  const { data: music } = await supabase
    .from('music_tracks').select('id,local_path').eq('id', draft.music_track_id).maybeSingle();
  if (!music) throw new RenderF2Error(`music ${draft.music_track_id} not found`, trace);

  // 3. Download all to /tmp
  const tmp = `/tmp/f2-${args.compilation_draft_id}`;
  await mkdir(tmp, { recursive: true });
  const sortedRefs = [...draft.clip_refs].sort((a,b) => a.order - b.order);
  const trimmedPaths: string[] = [];
  for (let i = 0; i < sortedRefs.length; i++) {
    const ref = sortedRefs[i];
    const srcUrl = clipById.get(ref.clip_id);
    if (!srcUrl) throw new RenderF2Error(`clip ${ref.clip_id} missing local_path`, trace);
    const dlPath = join(tmp, `src_${i+1}.mp4`);
    await downloadToFile(srcUrl, dlPath, trace);
    const trimmedPath = join(tmp, `clip_${i+1}.mp4`);
    await runFfmpeg(buildTrimArgs(dlPath, trimmedPath, ref.start_sec, ref.end_sec), trace);
    trimmedPaths.push(trimmedPath);
  }
  const musicPath = join(tmp, 'music.mp3');
  await downloadToFile(music.local_path, musicPath, trace);

  // 4. Concat trimmed clips
  const listPath = join(tmp, 'list.txt');
  await writeFile(listPath, buildConcatListFile(trimmedPaths));
  const concatPath = join(tmp, 'concat.mp4');
  await runFfmpeg(['-y','-f','concat','-safe','0','-i',listPath,'-c','copy', concatPath], trace);

  // 5. Composite + mux
  const outputPath = join(tmp, 'out.mp4');
  await runFfmpeg(buildCompositeArgs({
    clipPaths: trimmedPaths, musicPath, refs: sortedRefs,
    titleTemplate: draft.title_template, accentWord: draft.accent_word,
    layoutVariant: draft.layout_variant, outputPath,
    concatListPath: listPath, concatVideoPath: concatPath,
  }), trace);

  // 6. Probe duration
  const dur = await probeDuration(outputPath, trace);

  // 7. Upload to Blob
  const renderedUrl = await uploadToBlob({
    path: `renders/compilation/${args.compilation_draft_id}.mp4`,
    filePath: outputPath,
    contentType: 'video/mp4',
  });

  trace.push(`done in ${Date.now()-t0}ms`);
  return { rendered_path: renderedUrl, duration_seconds_actual: dur };
}

async function downloadToFile(url: string, dest: string, trace: string[]) {
  trace.push(`download ${url} → ${dest}`);
  const res = await fetch(url);
  if (!res.ok) throw new RenderF2Error(`download ${url}: ${res.status}`, trace);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

function runFfmpeg(argv: string[], trace: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    trace.push(`ffmpeg ${argv.join(' ').slice(0, 200)}`);
    const ff = spawn(FFMPEG, argv);
    let stderr = '';
    ff.stderr.on('data', (b: Buffer) => { stderr += b.toString(); });
    ff.on('exit', code => code === 0 ? resolve() : reject(new RenderF2Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`, trace)));
  });
}

async function probeDuration(path: string, trace: string[]): Promise<number> {
  // Reuse the existing probe helper from scripts/render-worker/lib/probe.ts
  const { probeMediaFile } = await import('../lib/probe.js');
  const r = await probeMediaFile(path);
  return r.duration_seconds;
}
```

- [ ] **Step 3: Wire render_f2 into run.ts**

Edit `scripts/render-worker/run.ts` — locate the job-type dispatch switch and replace the render_f2 stub call with:

```ts
case 'render_f2': {
  const out = await runRenderF2({ compilation_draft_id: job.compilation_draft_id! });
  return out;
}
```

- [ ] **Step 4: Local typecheck**

```bash
cd scripts/render-worker && npx tsc --noEmit && cd -
```

Expected: no errors. (Worker code is not unit-tested per existing convention.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(worker): render_f2 — trim, concat, composite, mux, blob upload"
```

---

## Task 11: Callback handler — render_f2 success branch

**Files:**
- Modify: `src/app/api/render/complete/route.ts`

- [ ] **Step 1: Add the render_f2 success branch**

Read the existing route. After the `clip_ingest` and `render_f1` branches, add:

```ts
case 'render_f2': {
  const parsed = z.object({
    rendered_path: z.string().url(),
    duration_seconds_actual: z.number().positive(),
  }).parse(body.result.output);
  if (!job.compilation_draft_id) throw new Error('render_f2 callback: compilation_draft_id missing');
  await supabase
    .from('compilation_drafts')
    .update({ rendered_path: parsed.rendered_path, status: 'rendered', updated_at: new Date().toISOString() })
    .eq('id', job.compilation_draft_id);
  break;
}
```

Failure branch: ensure `compilation_drafts.status` transitions to `failed` (mirror Phase 2 render_f1 pattern).

- [ ] **Step 2: Test the route**

Add to `src/tests/api/render/complete.test.ts` (or create) a case for the render_f2 success path.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(callback): render_f2 success/failure branches update compilation_drafts"
```

---

## Task 12: /clips Candidates tab

**Files:**
- Create: `src/components/clips/candidates-tab.tsx`
- Create: `src/components/clips/candidate-card.tsx`
- Create: `src/components/clips/edit-drawer.tsx`
- Create: `src/components/clips/clips-tabs.tsx`
- Modify: `src/app/clips/page.tsx`

- [ ] **Step 1: Build clips-tabs.tsx (client tab switcher)**

Create `src/components/clips/clips-tabs.tsx`:

```tsx
'use client';
import { useState, type ReactNode } from 'react';

export function ClipsTabs(props: { inbox: ReactNode; candidates: ReactNode; rendered: ReactNode }) {
  const [tab, setTab] = useState<'inbox'|'candidates'|'rendered'>('inbox');
  return (
    <div>
      <nav className="flex gap-4 border-b border-border mb-4">
        {(['inbox','candidates','rendered'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`pb-2 px-1 text-sm ${tab===t ? 'text-text-primary border-b-2 border-accent' : 'text-text-secondary'}`}>
            {t[0].toUpperCase()+t.slice(1)}
          </button>
        ))}
      </nav>
      {tab === 'inbox' && props.inbox}
      {tab === 'candidates' && props.candidates}
      {tab === 'rendered' && props.rendered}
    </div>
  );
}
```

- [ ] **Step 2: Build candidates-tab.tsx (server component)**

Create `src/components/clips/candidates-tab.tsx`:

```tsx
import { getServiceClient } from '@/lib/supabase/server';
import { listProposedDrafts } from '@/lib/supabase/repositories/compilation-drafts';
import { CandidateCard } from './candidate-card';

export async function CandidatesTab() {
  const supabase = getServiceClient();
  const drafts = await listProposedDrafts(supabase, { limit: 30 });
  // Fetch referenced clip + music details in bulk for client rendering
  const clipIds = [...new Set(drafts.flatMap(d => d.clip_refs.map(r => r.clip_id)))];
  const musicIds = [...new Set(drafts.map(d => d.music_track_id).filter(Boolean) as string[])];
  const [{ data: clips }, { data: music }] = await Promise.all([
    supabase.from('clip_library').select('id,local_path,description,duration_seconds').in('id', clipIds.length ? clipIds : ['00000000-0000-0000-0000-000000000000']),
    supabase.from('music_tracks').select('id,title,local_path').in('id', musicIds.length ? musicIds : ['00000000-0000-0000-0000-000000000000']),
  ]);
  const clipMap = new Map((clips ?? []).map((c: { id: string }) => [c.id, c]));
  const musicMap = new Map((music ?? []).map((m: { id: string }) => [m.id, m]));
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">Candidates ({drafts.length})</h2>
      {drafts.length === 0 ? (
        <p className="text-text-secondary text-sm border border-dashed border-border rounded p-6 text-center">
          No proposed compilations yet. Dispatch a topic that Strategist picks 'compilation' for.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {drafts.map(d => <CandidateCard key={d.id} draft={d} clipMap={Object.fromEntries(clipMap)} musicMap={Object.fromEntries(musicMap)} />)}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Build candidate-card.tsx**

Create `src/components/clips/candidate-card.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { EditDrawer } from './edit-drawer';

interface DraftLike {
  id: string;
  title_template: string;
  accent_word: string;
  clip_refs: Array<{clip_id:string; start_sec:number; end_sec:number; label:string; order:number}>;
  music_track_id: string | null;
  layout_variant: string;
}

export function CandidateCard(props: { draft: DraftLike; clipMap: Record<string,{id:string;local_path:string;description:string|null}>; musicMap: Record<string,{id:string;title:string;local_path:string}> }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const music = props.draft.music_track_id ? props.musicMap[props.draft.music_track_id] : null;

  async function post(path: string) {
    setBusy(true);
    try {
      const res = await fetch(path, { method: 'POST' });
      if (!res.ok) alert(await res.text());
      else location.reload();
    } finally { setBusy(false); }
  }

  return (
    <article className="border border-border rounded p-4 space-y-3 bg-bg-elevated">
      <header>
        <h3 className="font-medium">
          {highlightAccent(props.draft.title_template, props.draft.accent_word)}
        </h3>
        <p className="text-xs text-text-secondary">Layout: {props.draft.layout_variant}</p>
      </header>
      <ol className="grid grid-cols-5 gap-2">
        {props.draft.clip_refs.sort((a,b)=>a.order-b.order).map(r => {
          const c = props.clipMap[r.clip_id];
          return (
            <li key={r.clip_id} className="text-xs">
              <video src={c?.local_path} className="w-full aspect-[9/16] object-cover rounded" muted preload="metadata" />
              <p className="mt-1 truncate">{r.label}</p>
              <p className="text-text-secondary">{(r.end_sec - r.start_sec).toFixed(1)}s</p>
            </li>
          );
        })}
      </ol>
      {music && (
        <div className="text-xs">
          <p className="text-text-secondary">Music: {music.title}</p>
          <audio src={music.local_path} controls className="w-full mt-1" />
        </div>
      )}
      <div className="flex gap-2">
        <button disabled={busy} onClick={() => post(`/api/clips/candidates/${props.draft.id}/approve`)} className="bg-accent text-bg px-3 py-1.5 rounded text-sm">Approve</button>
        <button disabled={busy} onClick={() => post(`/api/clips/candidates/${props.draft.id}/reject`)} className="border border-border px-3 py-1.5 rounded text-sm">Reject</button>
        <button disabled={busy} onClick={() => setEditing(true)} className="border border-border px-3 py-1.5 rounded text-sm">Edit</button>
      </div>
      {editing && <EditDrawer draft={props.draft} onClose={() => setEditing(false)} />}
    </article>
  );
}

function highlightAccent(title: string, accent: string) {
  const idx = title.toLowerCase().indexOf(accent.toLowerCase());
  if (idx < 0) return title;
  return (<>
    {title.slice(0,idx)}
    <span className="text-accent">{title.slice(idx, idx+accent.length)}</span>
    {title.slice(idx+accent.length)}
  </>);
}
```

- [ ] **Step 4: Build edit-drawer.tsx (skeleton, drawer + reorder)**

Create `src/components/clips/edit-drawer.tsx`:

```tsx
'use client';
import { useState } from 'react';

export function EditDrawer(props: { draft: { id: string; clip_refs: Array<{clip_id:string;start_sec:number;end_sec:number;label:string;order:number}>; music_track_id: string | null }; onClose: () => void }) {
  const [refs, setRefs] = useState(props.draft.clip_refs);
  const [music, setMusic] = useState(props.draft.music_track_id);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/clips/candidates/${props.draft.id}/edit`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ clip_refs: refs, music_track_id: music }),
      });
      if (!res.ok) alert(await res.text());
      else location.reload();
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={props.onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-bg-elevated border border-border rounded p-6 max-w-2xl w-full space-y-4">
        <h3 className="font-medium">Edit compilation</h3>
        <ol className="space-y-2">
          {refs.map((r, i) => (
            <li key={r.clip_id} className="flex gap-2 items-center">
              <span className="text-xs text-text-secondary w-6">#{i+1}</span>
              <input value={r.label} onChange={e => setRefs(refs.map(x => x.clip_id===r.clip_id ? {...x, label: e.target.value} : x))}
                className="flex-1 bg-bg border border-border rounded px-2 py-1 text-sm" />
              <button onClick={() => i>0 && setRefs(swap(refs, i, i-1))} className="text-sm">↑</button>
              <button onClick={() => i<refs.length-1 && setRefs(swap(refs, i, i+1))} className="text-sm">↓</button>
            </li>
          ))}
        </ol>
        <div className="flex gap-2 justify-end">
          <button disabled={busy} onClick={save} className="bg-accent text-bg px-3 py-1.5 rounded text-sm">Save</button>
          <button onClick={props.onClose} className="border border-border px-3 py-1.5 rounded text-sm">Cancel</button>
        </div>
        <p className="text-xs text-text-secondary">v1 supports reorder + label edit. Clip-swap from candidate pool ships in a follow-up.</p>
      </div>
    </div>
  );
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  const out = [...arr]; [out[i], out[j]] = [out[j], out[i]];
  return out.map((x, idx) => ({ ...(x as object), order: idx+1 })) as T[];
}
```

- [ ] **Step 5: Wire tabs into /clips page**

Edit `src/app/clips/page.tsx`:

```tsx
import { CockpitShell } from "@/components/cockpit/cockpit-shell";
import { InboxTab } from "@/components/clips/inbox-tab";
import { CandidatesTab } from "@/components/clips/candidates-tab";
import { RenderedTab } from "@/components/clips/rendered-tab";
import { ClipsTabs } from "@/components/clips/clips-tabs";

export const dynamic = "force-dynamic";

export default async function ClipsPage() {
  return (
    <CockpitShell>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">Clips</h1>
        </header>
        <ClipsTabs
          inbox={<InboxTab />}
          candidates={<CandidatesTab />}
          rendered={<RenderedTab />}
        />
      </div>
    </CockpitShell>
  );
}
```

(RenderedTab is created in Task 13.)

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(ui): /clips Candidates tab + tab switcher + edit drawer"
```

---

## Task 13: /clips Rendered tab

**Files:**
- Create: `src/components/clips/rendered-tab.tsx`
- Create: `src/components/clips/rendered-card.tsx`

- [ ] **Step 1: Build rendered-tab.tsx**

Create `src/components/clips/rendered-tab.tsx`:

```tsx
import { getServiceClient } from '@/lib/supabase/server';
import { listRenderedDrafts } from '@/lib/supabase/repositories/compilation-drafts';
import { RenderedCard } from './rendered-card';

export async function RenderedTab() {
  const supabase = getServiceClient();
  const drafts = await listRenderedDrafts(supabase, { limit: 30 });
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">Rendered ({drafts.length})</h2>
      {drafts.length === 0 ? (
        <p className="text-text-secondary text-sm border border-dashed border-border rounded p-6 text-center">
          No rendered compilations yet. Approve a Candidate and wait for render_f2 to finish.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {drafts.map(d => <RenderedCard key={d.id} draft={d} />)}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Build rendered-card.tsx**

Create `src/components/clips/rendered-card.tsx`:

```tsx
'use client';
import { useState } from 'react';

interface DraftLike {
  id: string; title_template: string; rendered_path: string | null;
}

export function RenderedCard(props: { draft: DraftLike }) {
  const [busy, setBusy] = useState(false);

  async function post(path: string) {
    setBusy(true);
    try {
      const res = await fetch(path, { method: 'POST' });
      if (!res.ok) alert(await res.text());
      else location.reload();
    } finally { setBusy(false); }
  }

  return (
    <article className="border border-border rounded p-3 space-y-3">
      <h3 className="text-sm font-medium truncate">{props.draft.title_template}</h3>
      {props.draft.rendered_path && (
        <video src={props.draft.rendered_path} controls className="w-full aspect-[9/16] rounded" preload="metadata" />
      )}
      <div className="flex gap-2">
        <button disabled={busy} onClick={() => post(`/api/clips/rendered/${props.draft.id}/approve`)} className="bg-accent text-bg px-3 py-1.5 rounded text-sm">Approve</button>
        <button disabled={busy} onClick={() => post(`/api/clips/rendered/${props.draft.id}/reject`)} className="border border-border px-3 py-1.5 rounded text-sm">Reject</button>
      </div>
    </article>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(ui): /clips Rendered tab + inline preview + approve/reject"
```

---

## Task 14: Candidate approve/reject/edit routes

**Files:**
- Create: `src/app/api/clips/candidates/[id]/approve/route.ts`
- Create: `src/app/api/clips/candidates/[id]/reject/route.ts`
- Create: `src/app/api/clips/candidates/[id]/edit/route.ts`
- Create: `src/tests/api/clips/candidates/approve.test.ts`
- Create: `src/tests/api/clips/candidates/reject.test.ts`
- Create: `src/tests/api/clips/candidates/edit.test.ts`

- [ ] **Step 1: Write the failing approve test**

Create `src/tests/api/clips/candidates/approve.test.ts` — mirror the Phase 3 `src/tests/api/clips/block.test.ts` shape. Assert:
- 404 if draft not found.
- 409 if draft.status !== 'proposed'.
- 200 on success; calls `updateDraftStatus(proposed→approved)` then enqueues a render_jobs row of type render_f2 with `compilation_draft_id` set.

- [ ] **Step 2: Implement approve route**

Create `src/app/api/clips/candidates/[id]/approve/route.ts`:

```ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getDraftById, updateDraftStatus } from "@/lib/supabase/repositories/compilation-drafts";
import { enqueueRenderF2Job } from "@/lib/supabase/repositories/render-jobs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServiceClient();
  const draft = await getDraftById(supabase, id);
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 });
  if (draft.status !== 'proposed') return NextResponse.json({ error: `cannot approve from ${draft.status}` }, { status: 409 });
  await updateDraftStatus(supabase, { id, from: 'proposed', to: 'approved' });
  const jobId = await enqueueRenderF2Job(supabase, { compilation_draft_id: id });
  return NextResponse.json({ ok: true, job_id: jobId });
}
```

If `enqueueRenderF2Job` doesn't exist in the render-jobs repo, add it (mirror existing `enqueueClipIngestJob` etc.):

```ts
export async function enqueueRenderF2Job(supabase: SupabaseClient, args: { compilation_draft_id: string }): Promise<string> {
  const { data, error } = await supabase
    .from('render_jobs')
    .insert({ job_type: 'render_f2', payload: { compilation_draft_id: args.compilation_draft_id }, compilation_draft_id: args.compilation_draft_id })
    .select('id').single();
  if (error) throw new Error(`enqueueRenderF2Job: ${error.message}`);
  return data.id as string;
}
```

- [ ] **Step 3: Implement reject route**

Create `src/app/api/clips/candidates/[id]/reject/route.ts`:

```ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getDraftById, updateDraftStatus } from "@/lib/supabase/repositories/compilation-drafts";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServiceClient();
  const draft = await getDraftById(supabase, id);
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 });
  if (draft.status !== 'proposed') return NextResponse.json({ error: `cannot reject from ${draft.status}` }, { status: 409 });
  await updateDraftStatus(supabase, { id, from: 'proposed', to: 'rejected' });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Implement edit route**

Create `src/app/api/clips/candidates/[id]/edit/route.ts`:

```ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServiceClient } from "@/lib/supabase/server";
import { getDraftById, updateDraftClipRefs } from "@/lib/supabase/repositories/compilation-drafts";

const Body = z.object({
  clip_refs: z.array(z.object({
    clip_id: z.string().uuid(), start_sec: z.number().min(0), end_sec: z.number().min(0),
    label: z.string().min(1).max(80), order: z.number().int().min(1).max(5),
  })).length(5),
  music_track_id: z.string().uuid().nullable().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const supabase = getServiceClient();
  const draft = await getDraftById(supabase, id);
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 });
  if (draft.status !== 'proposed') return NextResponse.json({ error: `cannot edit from ${draft.status}` }, { status: 409 });
  await updateDraftClipRefs(supabase, { id, clip_refs: parsed.data.clip_refs, music_track_id: parsed.data.music_track_id });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run + commit**

```bash
npx vitest run src/tests/api/clips/candidates/ && \
git add -A && git commit -m "feat(api): clips candidates approve/reject/edit routes"
```

---

## Task 15: Rendered approve/reject routes + promote to your_videos

**Files:**
- Create: `src/app/api/clips/rendered/[id]/approve/route.ts`
- Create: `src/app/api/clips/rendered/[id]/reject/route.ts`
- Create: `src/tests/api/clips/rendered/approve.test.ts`
- Modify: `src/lib/supabase/repositories/your-videos.ts` (add `createPromotedVideo` helper if missing)

- [ ] **Step 1: Add createPromotedVideo helper**

Read `src/lib/supabase/repositories/your-videos.ts`. If `createPromotedVideo` doesn't exist, append:

```ts
export async function createPromotedVideo(
  supabase: SupabaseClient,
  args: {
    channel_id: string;
    title: string;
    render_artifact_url: string;
    duration_seconds: number;
    source_compilation_draft_id: string;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from('your_videos')
    .insert({
      channel_id: args.channel_id,
      title: args.title,
      script: null,                // compilations have no script
      voice_provider: null,
      voice_id: null,
      visual_treatment: 'top5_compilation',
      duration_seconds: args.duration_seconds,
      render_artifact_url: args.render_artifact_url,
      status: 'rendered',
      source_compilation_draft_id: args.source_compilation_draft_id,
    })
    .select('id').single();
  if (error) throw new Error(`createPromotedVideo: ${error.message}`);
  return data.id as string;
}
```

If `your_videos.source_compilation_draft_id` column doesn't exist yet, add the migration in Step 2.

- [ ] **Step 2: Migration for your_videos.source_compilation_draft_id (if needed)**

Check existing schema first:

```sql
select column_name from information_schema.columns where table_name='your_videos' and column_name='source_compilation_draft_id';
```

If absent, create `supabase/migrations/20260526000002_your_videos_source_draft.sql`:

```sql
alter table public.your_videos
  add column if not exists source_compilation_draft_id uuid references public.compilation_drafts(id) on delete set null;
create index if not exists your_videos_source_draft_idx on public.your_videos (source_compilation_draft_id);
```

Apply via Supabase MCP.

- [ ] **Step 3: Implement approve route**

Create `src/app/api/clips/rendered/[id]/approve/route.ts`:

```ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getDraftById, setPromotedYourVideoId } from "@/lib/supabase/repositories/compilation-drafts";
import { createPromotedVideo } from "@/lib/supabase/repositories/your-videos";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServiceClient();
  const draft = await getDraftById(supabase, id);
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 });
  if (draft.status !== 'rendered') return NextResponse.json({ error: `cannot approve from ${draft.status}` }, { status: 409 });
  if (!draft.rendered_path) return NextResponse.json({ error: 'rendered_path missing' }, { status: 422 });
  const totalDuration = draft.clip_refs.reduce((a, r) => a + (r.end_sec - r.start_sec), 0);
  const videoId = await createPromotedVideo(supabase, {
    channel_id: draft.channel_id,
    title: draft.title_template,
    render_artifact_url: draft.rendered_path,
    duration_seconds: totalDuration,
    source_compilation_draft_id: id,
  });
  await setPromotedYourVideoId(supabase, { id, your_video_id: videoId });
  return NextResponse.json({ ok: true, your_video_id: videoId });
}
```

- [ ] **Step 4: Implement reject route**

Create `src/app/api/clips/rendered/[id]/reject/route.ts`:

```ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/server";
import { getDraftById, updateDraftStatus } from "@/lib/supabase/repositories/compilation-drafts";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getServiceClient();
  const draft = await getDraftById(supabase, id);
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 });
  if (draft.status !== 'rendered') return NextResponse.json({ error: `cannot reject from ${draft.status}` }, { status: 409 });
  await updateDraftStatus(supabase, { id, from: 'rendered', to: 'failed' });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Write test + run + commit**

```bash
# write src/tests/api/clips/rendered/approve.test.ts
npx vitest run src/tests/api/clips/rendered/ && \
git add -A && git commit -m "feat(api): clips rendered approve (promote to your_videos) + reject"
```

---

## Task 16: Operator-supplied music tracks seed

**Files:**
- Create: `supabase/migrations/20260526000003_seed_phase4_music.sql`

The spec defers the proper music-library import CLI to Phase 5 (Task §8). Phase 4 needs at least one playable track to test render_f2 end-to-end. Seed 3 royalty-free placeholder tracks now and let the Phase 5 CLI replace them.

- [ ] **Step 1: Pick 3 royalty-free tracks**

Operator uploads 3 mp3 files (any YouTube Audio Library, Free Music Archive CC0 cuts, or Pixabay tracks). Suggest a 30–60s ambient + a 30–60s cinematic + a 30–60s upbeat-electronic. Hand-off in chat — operator does the upload to Vercel Blob:

```bash
# from operator's laptop
for f in ambient_calm.mp3 cinematic_dread.mp3 electronic_pulse.mp3; do
  curl -X PUT "https://blob.vercel-storage.com/music/$f" \
    -H "Authorization: Bearer $BLOB_READ_WRITE_TOKEN" \
    -H "Content-Type: audio/mpeg" \
    --data-binary "@$f"
done
```

Capture the 3 returned URLs.

- [ ] **Step 2: Write the seed migration**

```sql
-- Phase 4 placeholder music tracks. Replaced wholesale by Phase 5 import CLI.
insert into public.music_tracks (title, artist, source, requires_attribution, local_path, duration_seconds, genre, energy_level)
values
  ('Ambient Calm Placeholder', 'phase4_seed', 'creator_commons', false, '<URL_1>', 45, 'ambient', 2),
  ('Cinematic Dread Placeholder', 'phase4_seed', 'creator_commons', false, '<URL_2>', 50, 'cinematic', 3),
  ('Electronic Pulse Placeholder', 'phase4_seed', 'creator_commons', false, '<URL_3>', 50, 'electronic', 3)
on conflict do nothing;
```

Replace `<URL_1..3>` with the Blob URLs from Step 1.

- [ ] **Step 3: Apply via Supabase MCP + verify**

```sql
select id, title, genre, energy_level, requires_attribution from music_tracks where artist='phase4_seed';
```

Expected: 3 rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260526000003_seed_phase4_music.sql && \
git commit -m "data(phase4): seed 3 placeholder music tracks for render_f2 testing"
```

---

## Task 17: Prod smoke — full Format 2 end-to-end

**Files:** none (operator-driven verification).

- [ ] **Step 1: Push branch + wait for preview**

```bash
git push origin plan-4-phase-4
```

Wait for the Vercel preview deploy to go READY. Capture preview URL.

- [ ] **Step 2: Dispatch a topic likely to be picked as 'compilation'**

Via Cockpit `/lab`: pick a topic that's clearly a Top-5 candidate (e.g., "Worst car crashes caught on Reddit this week"). Dispatch.

Watch the SSE in /lab. Expected behavior:
- Strategist runs, emits `selected_format='compilation'`.
- Writer / Voice Coach / Director do NOT run.
- Composer runs (5–15s).
- Job completes with a `compilation_drafts` row.

- [ ] **Step 3: Verify Candidates tab**

Open `/clips`, switch to Candidates. Expected: at least one card with 5 clip thumbnails + a music preview + Approve/Reject/Edit buttons.

- [ ] **Step 4: Approve**

Click Approve. Page reloads. Card disappears from Candidates (status flipped to `approved`).

- [ ] **Step 5: Watch render_f2**

```sql
select id, status, started_at, finished_at, last_error
from render_jobs
where job_type='render_f2'
order by created_at desc limit 5;
```

Expected: row claims within 60s, transitions to `running`, succeeds within ~3 minutes (5 clips × ~10s each + composite).

- [ ] **Step 6: Verify Rendered tab**

Open `/clips`, switch to Rendered. Expected: a card with an inline `<video>` of the rendered .mp4. Click play. Verify:
- 1080×1920 portrait orientation.
- Title bar at the top with the title_template + accent word visible.
- 5 clip segments play in order.
- Music plays behind clips at low volume.
- Total duration ~25–35s.

- [ ] **Step 7: Approve rendered → promotes to your_videos**

Click Approve. Verify:

```sql
select id, title, status, render_artifact_url, source_compilation_draft_id
from your_videos
order by created_at desc limit 1;
```

Expected: one new row with status='rendered' + valid Blob URL.

- [ ] **Step 8: Document the smoke**

Create `docs/superpowers/notes/2026-05-26-plan-4-phase-4-benchmark.md` with timings + screenshots + acceptance-gate checklist (mirror Phase 3 benchmark structure).

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "docs(plan-4): Phase 4 benchmark — Format 2 end-to-end"
```

---

## Task 18: Remotion upgrade follow-up (TRACKED — NOT EXECUTED THIS PHASE)

**Files:** none in Phase 4. This task is a placeholder so the spec §4 integration map's Remotion requirement is not lost when the `plan-4-phase-2-5` captions-overlay branch merges to main.

**Trigger:** `plan-4-phase-2-5` branch is merged to main and `src/remotion/` is writable for new compositions.

**Scope (executed in a future phase, NOT in Phase 4):**
- Upgrade Phase 4's ffmpeg `drawtext` title-cards + numbered overlays to Remotion compositions at:
  - `src/remotion/compositions/title-cards/numbered-countdown.tsx`
  - `src/remotion/compositions/callouts/wait-for-it.tsx`
  - `src/remotion/compositions/callouts/numbered-label.tsx`
- Composer output schema (`src/lib/agents/composer.ts`) gains optional `title_card_props` + `callout_props` matching the Remotion compositions' Zod `propsSchema`.
- `scripts/render-worker/handlers/render-f2.ts` switches title bar + numbered labels from ffmpeg `drawtext` to a Remotion render pass; clip trim + concat + music mux stays ffmpeg.

**Acceptance:** `render_f2` produces visually equivalent or better output than the ffmpeg-only Phase 4 baseline. SSIM > 0.90 against a frame-by-frame comparison of the Phase 4 benchmark video. Side-by-side comparison documented in the follow-up phase's benchmark notes.

**This task exists in the plan to make the §4 integration-map obligation traceable. No execution steps in Phase 4. Do not check this task off when Phase 4 closes.**

---

## Task 19: Type-check + full test pass + open PR

**Files:** none.

- [ ] **Step 1: Full project type-check**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 2: Full test suite**

```bash
npx vitest run
```

Expected: all green.

- [ ] **Step 3: Open PR**

```bash
gh pr create --title "Plan #4 Phase 4 — Format 2 / Composer / /clips Candidates+Rendered" --body "$(cat <<'EOF'
## Summary
- Unblocks Reddit/YouTube ingestion via operator-supplied yt-dlp cookies + Reddit OAuth client_credentials
- New Composer agent: candidate-pool query + Zod schema + post-LLM validator + heuristic fallback + decisions write
- Orchestrator forks on Strategist.selected_format; compilation branch exits after Composer
- render_f2 worker handler: trim + concat + composite + music mux + Blob upload
- /clips grows to three tabs: Inbox / Candidates / Rendered
- Approve on Rendered promotes draft → your_videos

## Test plan
- [ ] Reddit smoke: 3+ real Reddit clips ingested via prod cookies
- [ ] Compilation dispatch: Strategist picks 'compilation', Composer writes compilation_drafts row
- [ ] Candidate Approve → render_f2 → Rendered tab playable
- [ ] Rendered Approve → your_videos row created with valid render_artifact_url
- [ ] format_mix_drift alert appears when channel mix drifts >15pp
EOF
)"
```

---

## Task 20: Phase boundary handoff — write Phase 5 kickoff prompt

**Files:** none (chat output only).

- [ ] **Step 1: Write the Phase 5 fresh-chat kickoff**

Produce a chat message for Darius to copy-paste into a new chat. Structure:

```
Plan #4 Phase 5 — OAuth + analytics + scheduling + /operations + music import CLI. Outline at docs/superpowers/plans/2026-05-25-shorts-os-plan-4-render-pipeline.md:2597.

Re-plan using superpowers:writing-plans against the spec §5 (OAuth + analytics), §5.5 (scheduling + /operations), and §8 (music library import) before writing code.

State at chat start:
- Repo /Users/darius/Downloads/shorts-os, main, latest commit is Phase 4 close (<hash> <subject>).
- Branch plan-4-phase-4 merged.
- Reddit/YouTube clip ingest works via operator cookies (YTDLP_COOKIES_B64) + Reddit OAuth (REDDIT_OAUTH_CLIENT_*).
- compilation_drafts populates from Composer; render_f2 produces 1080×1920 MP4; promotes to your_videos.
- 3 placeholder music_tracks seeded; Phase 5 CLI replaces them.

Hard rules (carry forward):
- Plain English in chat. Technical docs technical.
- Stop at the end of every phase and hand back a fresh-chat prompt.
- No @vercel/sandbox imports outside src/lib/render/workers/vercel-sandbox.ts + scripts/render-worker/.
- TS strict, no `any`, Zod at boundaries, server-only on secret-holding modules.
- COCKPIT_PASSWORD in prod is Sensitive — operator drives any /login + UI-paste steps.
- For local dev, unset ANTHROPIC_BASE_URL or AI SDK 404s.
- The plan-4-phase-2-5 captions-overlay branch may have merged by now. If so, Phase 5 can integrate Remotion title-cards / callouts retroactively; if not, stay off src/remotion/.

Phase 4 acceptance gate met: one end-to-end Format 2 dispatch → Composer → render_f2 → your_videos confirmed.
```

- [ ] **Step 2: Send it**

Output the prompt as the closing chat message of Phase 4 and stop.

---

## Self-review notes (the planner ran these against the spec)

Coverage of spec §2 (Composer + orchestrator fork):
- Composer Zod schema → Task 6 ✓
- Candidate pool query (niche + tag overlap + 30d + exclude last-7d-used) → Task 6 ✓
- Music pool (requires_attribution=false, energy 2/3) → Task 6 ✓
- recent_patterns_used → Task 5 (`listRecentPatterns`) + Task 6 ✓
- Post-LLM validation (5 clips, sum 25–35s, 4–9s each, music exists + not attribution-required, 3-of-4 pattern diff) → Task 6 ✓
- Retry once on validation fail → Task 6 ✓
- Heuristic fallback → Task 6 ✓
- decisions row write + agent_messages row + compilation_drafts row → Task 9 (orchestrator) + Task 5 (insert) ✓
- agents seed for composer → Task 7 migration ✓
- Orchestrator selected_format fork → Task 9 ✓
- Strategist schema extension → Task 7 ✓
- Format-mix enforcement → Tasks 8 + 9 (warning-only in Phase 4 per spec §5.5; full enforcement Phase 5)

Coverage of spec §3 (render_f2 handler):
- Fetch draft + 5 clip_library rows + music_tracks → Task 10 ✓
- Per-clip trim → 1080×1920 → Task 10 (compile-f2.ts) ✓
- Composite Top-5 (sidebar variant + overlay variant) → Task 10 (drawtext-based; layout_variant honored via the labels overlay positioning) ✓
- Music mux ducked to 20% → Task 10 (`volume=0.20` + amix) ✓
- Blob upload → Task 10 ✓
- Callback updates compilation_drafts.rendered_path + status → Task 11 ✓
- Remotion-side title cards + animated callouts → tracked as Task 18 (post-merge follow-up, executes after `plan-4-phase-2-5` merges). Phase 4 uses ffmpeg `drawtext` for v1.

Coverage of spec §4 (/clips Candidates+Rendered tabs):
- Candidates tab listing proposed drafts → Task 12 ✓
- Candidate card with 5 clip cards + music preview + Approve/Reject/Edit → Task 12 ✓
- Edit drawer (drag-to-reorder + label edit; clip-swap deferred) → Task 12 (with v1 caveat noted in the drawer copy) ✓
- Rendered tab listing rendered drafts with inline `<video>` + Approve/Reject → Task 13 ✓
- Rendered Approve → your_videos row + draft.promoted_your_video_id → Task 15 ✓
- Rendered Reject → status=failed → Task 15 ✓

Hard prerequisite (IP-block) coverage:
- Decision matrix doc → Task 1 ✓
- Implementation of chosen option → Task 2 (cookies + Reddit OAuth) ✓
- Prod smoke proof → Task 3 ✓

Placeholder scan: no `TBD` / `TODO` / `appropriate error handling` / `similar to Task N` left.

Type-consistency: `ClipRef`, `DraftStatus`, `ComposerOutput`, `RecentPattern`, `FormatMix`, `RenderF2Error` all defined exactly once and consistent across tasks.

Spec-vs-plan reconciliation note: spec §4 expects Remotion compositions for title cards + callouts as part of Phase 4. This plan defers them per the operator's hard rule on `src/remotion/`. **Task 18 captures the follow-up explicitly** with file paths, Composer schema additions, and an SSIM > 0.90 acceptance gate — so the obligation is traceable, not a hand-wave.
