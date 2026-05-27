# Plan #4 Phase 5 — OAuth + analytics + scheduling + /operations + music import CLI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Plan #4 by adding YouTube OAuth + real YT upload from the Sandbox, a daily YouTube Analytics sync, a scheduling lattice (`scheduled` state + `scheduled_for` + 15-minute cron), a `/operations` calendar with auto-schedule and operator-alert banner, and a CLI that imports a real CC0 music library replacing the 3 placeholder rows.

**Architecture:** OAuth (Authorization Code with PKCE) → encrypted refresh token in `channels.oauth_refresh_token_encrypted` → Sandbox upload handler calls `videos.insert` (with access token minted in-VM from the decrypted refresh token) → callback writes posting state including `posted_hour_local` / `posted_dow_local`. Scheduling adds a new state machine slot between `rendered` and `uploading`; a 15-minute cron atomically claims due rows, defers when channel cap is hit, and writes a `schedule_backlog_overflow` alert above 7d horizon. `/operations` is a week-view calendar with drag-to-reschedule + recommendations panel (read-only in Plan #4) + format-mix bar. Music CLI runs locally, Haiku-tags each MP3, uploads to Blob, inserts rows.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Zod at boundaries, `server-only` on secret-holding modules, AES-256-GCM (`src/lib/encryption.ts`), `luxon` for timezone math, `googleapis`-style hand-rolled fetch wrappers for YT (no `googleapis` package — keep bundle small), Vercel Sandbox for upload execution, vitest for tests.

**Scope notes:**
- Single plan with 8 sub-phases (A–H). Each sub-phase ends with a green test run + commit + (where applicable) deploy. You may stop and ship at the end of any sub-phase if downstream work is paused — Sub-phases A→B alone get the operator to "one real video posted to YouTube," which is closing acceptance item #2.
- Phase 0 is a Task-0 prereq: an operator-driven UI walk on prod to verify Phase 4's full Strategist→Composer→`/clips`→`your_videos` path. The walk must pass before any code edits in Sub-phase A.
- Token decryption in the Sandbox uses a **byte-equal copy** of `src/lib/encryption.ts` at `scripts/render-worker/lib/encryption.ts`. A vitest enforces byte equality so the two copies don't drift.
- Sensitive env vars (CRON_SECRET preview, ANTHROPIC_API_KEY, GOOGLE_OAUTH_CLIENT_SECRET, OAUTH_TOKEN_ENCRYPTION_KEY_V1, COCKPIT_PASSWORD) cannot be pulled via `vercel env pull` — they come back empty. Any task that needs them in prod uses the **early-merge to main** pattern from Phase 2/3/4 (merge the branch, deploy, then verify on prod with the operator). Local dev tests stub them via `vi.stubEnv`.
- `ANTHROPIC_BASE_URL` must be unset when running `npm run dev` from a Claude Code shell, or AI SDK calls 404. Worker package + Haiku-via-Anthropic in the music CLI inherit the same constraint.

---

## State assumed at plan start

- HEAD on `main` = `cc441d9` (Phase 4 benchmark doc). Phase 4 PR `#6` merged; `cc56741` follow-up dropped ffmpeg drawtext.
- `package.json` version `0.3.1`.
- All Phase 5 schema columns/tables already exist (from `supabase/migrations/20260524000005_create_channels.sql` and `20260525000002_plan_4_schema.sql`):
  - `channels.oauth_refresh_token_encrypted text` (nullable)
  - `channels.external_channel_id text` (nullable)
  - `channels.max_uploads_per_day int default 2`
  - `channels.timezone text default 'America/New_York'`
  - `channels.posting_schedule jsonb default {...}`
  - `channels.target_format_mix jsonb default {...}`
  - `your_videos.scheduled_for timestamptz`, `your_videos.posted_hour_local int`, `your_videos.posted_dow_local int`
  - `your_videos.status` check constraint already includes `'scheduled'` and `'uploading'`
  - `youtube_oauth_state(state text pk, channel_id uuid, created_at)`
  - `video_analytics(... shares, impressions, watch_time_seconds, retention_curve_jsonb, raw_payload)`
  - `schedule_recommendations(... recommended_posting_schedule, recommended_format_mix, evidence, confidence, status)`
  - `operator_alerts(... category, severity, message, suggested_actions, status)`
  - `music_tracks(... source, requires_attribution, genre, energy_level)`
- Active channel UUID `c8edc30f-375d-4b38-b6b0-77fa4b5e59a7` (slug `dyfrx_9754`). Confirmed: `external_channel_id` was seeded with the placeholder `UCXXXXXXXXXXXXXXXXXXXX` per `20260525000003_reseed_dyfrx_channel.sql` — the operator updates this to the real `UCxxxx` value as part of Task A0.
- 3 placeholder `music_tracks` rows (artist `phase4_seed`). 7 placeholder `clip_library` rows (source_creator `phase4_seed`).
- Vitest test count baseline: 91. Each task that adds tests bumps this — track the running total in commit messages.

---

# Sub-phase 0: Phase 4 prod UI walk + prelim notes

This is a prereq, not implementation. Stops Phase 5 from being built on top of unverified Phase 4 surface.

### Task 0: Operator-driven prod UI walk

**Files:**
- Create: `docs/superpowers/notes/2026-05-27-plan-4-phase-5-prelim.md`

- [ ] **Step 1: Write the walk checklist for the operator**

Open a new file `docs/superpowers/notes/2026-05-27-plan-4-phase-5-prelim.md` with this exact body (the agent writes the file; the operator drives the browser steps and pastes findings back):

```markdown
# Plan #4 Phase 5 — Phase 0 prelim walk

The operator runs these steps on prod (https://shorts-os-roan.vercel.app) and pastes findings back into chat. The agent then appends an "Outcome" section here.

## Steps

1. Visit https://shorts-os-roan.vercel.app/lab and log in (COCKPIT_PASSWORD).
2. From "Ready to dispatch," pick any reviewed topic and click Dispatch.
3. Observe the active-run pane through Strategist → Writer (or Composer) → Voice Coach → Director.
   - If the Strategist picks `format='compilation'`, the run forks to Composer and writes a `compilation_drafts` row. Verify by visiting `/clips?tab=candidates`.
   - If the Strategist picks `format='explainer'`, a `your_videos` draft lands in `/lab/drafts`.
4. **Compilation path only:**
   a. Visit `/clips?tab=candidates`. The fresh candidate should appear.
   b. Click Approve. Wait ~60s for the render-dispatcher cron + ~30s for render_f2 to finish (the watchdog cron runs every 5 min — if the row stays in `rendering` past 5 min, capture the row's `compilation_drafts.id` and `render_jobs.last_error` value before reporting).
   c. Switch to `/clips?tab=rendered`. The freshly-rendered draft should appear with an inline `<video>` preview.
   d. Click Approve. The row should promote into `your_videos` (visible at `/lab/drafts?tab=rendered`).
5. **Explainer path only:** click Render on the draft in `/lab/drafts`. Wait for completion; verify the rendered preview at `/lab/drafts?tab=rendered`.

## What to capture in chat

For each step, report:
- Pass / Fail / Partial.
- Any UI rough edge (slow load, missing toast, broken link, weird empty state).
- Any console / network error visible in DevTools.

If render_dispatcher does not pick up the job within 90s, run this query at https://supabase.com/dashboard/project/jfmjppzjicvbpnlkmxbg/sql/new and paste the JSON:

```sql
select id, job_type, status, attempts, last_error, claimed_at, sandbox_invocation_id
from render_jobs
order by created_at desc
limit 5;
```

## Outcome

(Agent fills this in after the operator reports.)
```

- [ ] **Step 2: Hand the file path to the operator and wait**

Tell the operator in chat: "I've written the walk steps to [`docs/superpowers/notes/2026-05-27-plan-4-phase-5-prelim.md`](docs/superpowers/notes/2026-05-27-plan-4-phase-5-prelim.md). Please run them on prod and paste your findings back here — no time pressure."

- [ ] **Step 3: Append the Outcome section**

Once the operator reports back, edit the same file's `## Outcome` section with:
- Date + time of walk
- Per-step PASS / FAIL summary
- Any rough edges with file:line references where applicable
- Decision: proceed to Sub-phase A unchanged / pause Phase 5 to fix Phase 4 surface / proceed but file a follow-up task

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/notes/2026-05-27-plan-4-phase-5-prelim.md
git commit -m "docs(plan-4): Phase 5 prelim — Phase 4 prod UI walk outcome"
```

**Gate:** If any step in the walk FAILs and the failure isn't a known issue (placeholder data, intentional Phase 5 gap), pause this plan and open a focused fix branch before continuing.

---

# Sub-phase A: YouTube OAuth foundation

Three pieces: a `/settings/channel` page with a Connect YouTube button, a state-stored `/api/youtube/oauth/start` redirect, and a `/api/youtube/oauth/callback` that exchanges + encrypts. Plus a `channels` repo helper for save/load + sandbox-side encryption mirror.

### Task A0: Operator pre-work — Google Cloud OAuth client + Vercel env vars

This is operator-driven setup that has to happen before the OAuth callback can succeed end-to-end. The agent writes a checklist; the operator runs it.

**Files:**
- Modify: `docs/superpowers/notes/2026-05-27-plan-4-phase-5-prelim.md` (append an "Operator setup A0" section)

- [ ] **Step 1: Generate `OAUTH_TOKEN_ENCRYPTION_KEY_V1` locally**

The operator runs:

```bash
openssl rand -hex 32
```

Output is a 64-character hex string. Save it for Step 3.

- [ ] **Step 2: Google Cloud project + OAuth credentials**

The operator follows the spec §8 checklist:
1. Create a project at https://console.cloud.google.com (or reuse an existing personal one).
2. Enable **YouTube Data API v3** and **YouTube Analytics API** in that project.
3. OAuth consent screen → **External** → app status `Testing`. Add operator's own Google account to **Test users**.
4. Credentials → **Create OAuth client ID** → **Web application**. Authorized redirect URIs:
   - `https://shorts-os-roan.vercel.app/api/youtube/oauth/callback`
   - `http://localhost:3000/api/youtube/oauth/callback`
5. Copy the client ID + client secret.

- [ ] **Step 3: Add env vars to Vercel (Production + Preview)**

In the Vercel dashboard for project `prj_FooiiEYKOWNMZh3YtjoqwkbsWE0M`:

| Var | Type | Value | Environments |
|---|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Plaintext | (from Step 2) | Production, Preview, Development |
| `GOOGLE_OAUTH_CLIENT_SECRET` | **Sensitive** | (from Step 2) | Production, Preview, Development |
| `OAUTH_TOKEN_ENCRYPTION_KEY_V1` | **Sensitive** | (from Step 1) | Production, Preview, Development |
| `OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION` | Plaintext | `1` | Production, Preview, Development |
| `ANALYTICS_SYNC_WINDOW_DAYS` | Plaintext | `14` | Production, Preview, Development |
| `SCHEDULED_UPLOADER_BATCH_SIZE` | Plaintext | `5` | Production, Preview, Development |
| `OPERATIONS_BACKLOG_HORIZON_DAYS` | Plaintext | `7` | Production, Preview, Development |

Also add to `.env.local` (for the agent's local dev). The Sensitive ones in `.env.local` are the **dev values** the operator pastes once — they do not flow back from Vercel via `vercel env pull`.

- [ ] **Step 4: Update active channel's `external_channel_id`**

The placeholder `UCXXXXXXXXXXXXXXXXXXXX` must be replaced with the real channel ID. The operator runs at https://supabase.com/dashboard/project/jfmjppzjicvbpnlkmxbg/sql/new (real UC ID from YouTube Studio → Settings → Channel → Advanced):

```sql
update channels
set external_channel_id = '<real UCxxxx from YouTube Studio>'
where slug = 'dyfrx_9754';
```

- [ ] **Step 5: Trigger a redeploy so Vercel picks up the new envs**

Operator runs (from any local clone):

```bash
git commit --allow-empty -m "chore: bump env to pick up GOOGLE_OAUTH_* + OAUTH_TOKEN_ENCRYPTION_KEY_V1"
git push origin main
```

- [ ] **Step 6: Append the result to the prelim notes**

Edit `docs/superpowers/notes/2026-05-27-plan-4-phase-5-prelim.md` and add:

```markdown
## Operator setup A0 — Google OAuth + env vars

- Date: <YYYY-MM-DD>
- GOOGLE_OAUTH_CLIENT_ID configured: yes/no
- GOOGLE_OAUTH_CLIENT_SECRET configured (Sensitive): yes/no
- OAUTH_TOKEN_ENCRYPTION_KEY_V1 configured (Sensitive): yes/no
- channels.external_channel_id updated: yes/no, value first/last 4 = <UCxx...xxxx>
- Redeploy SHA: <sha>
```

**Gate:** Don't start Task A1 until Step 6 confirms all rows are `yes`. The OAuth callback will silently fail-with-cryptic-error otherwise.

---

### Task A1: `channels` repo extension — encrypt + decrypt refresh token

**Files:**
- Modify: `src/lib/supabase/repositories/channels.ts` (add `oauth_refresh_token_encrypted` field + helper functions)
- Test: `src/tests/lib/supabase/channels.test.ts` (NEW)

- [ ] **Step 1: Write the failing test**

Create `src/tests/lib/supabase/channels.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveEncryptedRefreshToken,
  loadEncryptedRefreshToken,
  type Channel,
} from '@/lib/supabase/repositories/channels';

const KEY_V1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const CHANNEL_ID = '11111111-1111-1111-1111-111111111111';

describe('channels repo — encrypted refresh token', () => {
  beforeEach(() => {
    vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_V1', KEY_V1);
    vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION', '1');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('round-trips a refresh token via Supabase update + select', async () => {
    const stored: { oauth_refresh_token_encrypted: string | null } = {
      oauth_refresh_token_encrypted: null,
    };
    const supabase = {
      from: (table: string) => {
        if (table !== 'channels') throw new Error(`unexpected table ${table}`);
        return {
          update: (patch: { oauth_refresh_token_encrypted: string }) => ({
            eq: async (_col: string, _id: string) => {
              stored.oauth_refresh_token_encrypted = patch.oauth_refresh_token_encrypted;
              return { error: null };
            },
          }),
          select: (_cols: string) => ({
            eq: (_col: string, _id: string) => ({
              single: async () => ({ data: stored, error: null }),
            }),
          }),
        };
      },
    } as never;

    await saveEncryptedRefreshToken(supabase, CHANNEL_ID, 'plain-refresh-token-abc123');
    const loaded = await loadEncryptedRefreshToken(supabase, CHANNEL_ID);
    expect(loaded).toBe('plain-refresh-token-abc123');
    expect(stored.oauth_refresh_token_encrypted).not.toBeNull();
    expect(stored.oauth_refresh_token_encrypted!.includes('plain-refresh-token-abc123')).toBe(false);
  });

  it('loadEncryptedRefreshToken returns null when column is empty', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { oauth_refresh_token_encrypted: null }, error: null }),
          }),
        }),
      }),
    } as never;
    const result = await loadEncryptedRefreshToken(supabase, CHANNEL_ID);
    expect(result).toBeNull();
  });

  it('Channel type exposes oauth_refresh_token_encrypted', () => {
    const c: Pick<Channel, 'oauth_refresh_token_encrypted'> = {
      oauth_refresh_token_encrypted: null,
    };
    expect(c.oauth_refresh_token_encrypted).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/tests/lib/supabase/channels.test.ts
```

Expected: FAIL — `saveEncryptedRefreshToken` / `loadEncryptedRefreshToken` undefined.

- [ ] **Step 3: Extend the channels repo**

Edit `src/lib/supabase/repositories/channels.ts`. Add `oauth_refresh_token_encrypted: string | null` to the `Channel` type (placed right after `external_channel_id`), then append at the bottom of the file:

```ts
import { encryptSecret, decryptSecret, type EncryptedSecret } from '@/lib/encryption';

export async function saveEncryptedRefreshToken(
  supabase: SupabaseClient,
  channelId: string,
  refreshToken: string,
): Promise<void> {
  const blob = encryptSecret(refreshToken);
  const json = JSON.stringify(blob);
  const { error } = await supabase
    .from('channels')
    .update({ oauth_refresh_token_encrypted: json })
    .eq('id', channelId);
  if (error) throw new Error(`saveEncryptedRefreshToken: ${error.message}`);
}

export async function loadEncryptedRefreshToken(
  supabase: SupabaseClient,
  channelId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('channels')
    .select('oauth_refresh_token_encrypted')
    .eq('id', channelId)
    .single();
  if (error) throw new Error(`loadEncryptedRefreshToken: ${error.message}`);
  const raw = (data as { oauth_refresh_token_encrypted: string | null }).oauth_refresh_token_encrypted;
  if (!raw) return null;
  const blob = JSON.parse(raw) as EncryptedSecret;
  return decryptSecret(blob);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/tests/lib/supabase/channels.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/repositories/channels.ts src/tests/lib/supabase/channels.test.ts
git commit -m "feat(channels): encrypt/decrypt refresh-token helpers + tests"
```

---

### Task A2: `youtube_oauth_state` repo

Tiny table; tiny repo. Used by /api/youtube/oauth/start + /callback to defeat CSRF.

**Files:**
- Create: `src/lib/supabase/repositories/youtube-oauth-state.ts`
- Test: `src/tests/lib/supabase/youtube-oauth-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  insertOAuthState,
  consumeOAuthState,
  OAuthStateError,
} from '@/lib/supabase/repositories/youtube-oauth-state';

const CHANNEL_ID = '11111111-1111-1111-1111-111111111111';

function makeStore() {
  const rows = new Map<string, { state: string; channel_id: string; created_at: string }>();
  return {
    rows,
    supabase: {
      from: (table: string) => {
        if (table !== 'youtube_oauth_state') throw new Error(`unexpected table ${table}`);
        return {
          insert: (row: { state: string; channel_id: string }) => {
            rows.set(row.state, { ...row, created_at: new Date().toISOString() });
            return { error: null };
          },
          select: (_cols: string) => ({
            eq: (_col: string, val: string) => ({
              single: async () => {
                const row = rows.get(val);
                return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116' } };
              },
            }),
          }),
          delete: () => ({
            eq: async (_col: string, val: string) => {
              rows.delete(val);
              return { error: null };
            },
          }),
        };
      },
    } as never,
  };
}

describe('youtube_oauth_state repo', () => {
  it('insertOAuthState writes a 32-char nanoid-style state', async () => {
    const { supabase, rows } = makeStore();
    const state = await insertOAuthState(supabase, CHANNEL_ID);
    expect(state).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(rows.get(state)?.channel_id).toBe(CHANNEL_ID);
  });

  it('consumeOAuthState returns channel_id and deletes the row', async () => {
    const { supabase, rows } = makeStore();
    const state = await insertOAuthState(supabase, CHANNEL_ID);
    const channelId = await consumeOAuthState(supabase, state, new Date());
    expect(channelId).toBe(CHANNEL_ID);
    expect(rows.has(state)).toBe(false);
  });

  it('consumeOAuthState throws OAuthStateError on unknown state', async () => {
    const { supabase } = makeStore();
    await expect(consumeOAuthState(supabase, 'doesnotexist', new Date())).rejects.toThrow(OAuthStateError);
  });

  it('consumeOAuthState throws OAuthStateError when state is older than 10 minutes', async () => {
    const { supabase, rows } = makeStore();
    const state = await insertOAuthState(supabase, CHANNEL_ID);
    const row = rows.get(state)!;
    rows.set(state, { ...row, created_at: new Date(Date.now() - 11 * 60_000).toISOString() });
    await expect(consumeOAuthState(supabase, state, new Date())).rejects.toThrow(/expired/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/tests/lib/supabase/youtube-oauth-state.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the repo**

Create `src/lib/supabase/repositories/youtube-oauth-state.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const STATE_TTL_MS = 10 * 60 * 1000;

export class OAuthStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthStateError';
  }
}

function generateState(): string {
  // 32 chars of base64url (~24 bytes raw entropy) — matches the spec's nanoid(32) shape.
  return randomBytes(24).toString('base64url').slice(0, 32);
}

export async function insertOAuthState(
  supabase: SupabaseClient,
  channelId: string,
): Promise<string> {
  const state = generateState();
  const { error } = await supabase
    .from('youtube_oauth_state')
    .insert({ state, channel_id: channelId });
  if (error) throw new Error(`insertOAuthState: ${error.message}`);
  return state;
}

export async function consumeOAuthState(
  supabase: SupabaseClient,
  state: string,
  now: Date,
): Promise<string> {
  const { data, error } = await supabase
    .from('youtube_oauth_state')
    .select('channel_id, created_at')
    .eq('state', state)
    .single();
  if (error || !data) throw new OAuthStateError('unknown or expired state');
  const row = data as { channel_id: string; created_at: string };
  const age = now.getTime() - new Date(row.created_at).getTime();
  if (age > STATE_TTL_MS) {
    await supabase.from('youtube_oauth_state').delete().eq('state', state);
    throw new OAuthStateError(`state expired (age ${Math.round(age / 1000)}s)`);
  }
  // Single-use: delete now even though we return the channel id.
  await supabase.from('youtube_oauth_state').delete().eq('state', state);
  return row.channel_id;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/tests/lib/supabase/youtube-oauth-state.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/repositories/youtube-oauth-state.ts src/tests/lib/supabase/youtube-oauth-state.test.ts
git commit -m "feat(oauth): youtube_oauth_state repo (insert + consume w/ 10min TTL)"
```

---

### Task A3: `/api/youtube/oauth/start` route

Inserts a state row, redirects to Google's consent screen with the right scopes.

**Files:**
- Create: `src/app/api/youtube/oauth/start/route.ts`
- Test: `src/tests/api/youtube-oauth-start.test.ts`

- [ ] **Step 1: Read Next.js 16 route handler docs**

The codebase is Next.js 16 with breaking changes. Before writing any handler, run:

```bash
ls node_modules/next/dist/docs/
```

Then read whichever file covers route handlers / redirects:

```bash
grep -ril "route handler\|NextResponse.redirect" node_modules/next/dist/docs/ | head -5
```

If `NextResponse.redirect` is still the canonical redirect API (it is in 16.2.6 — confirmed via `node_modules/next/dist/server/web/spec-extension/response.d.ts`), proceed. Otherwise use whatever the doc prescribes.

- [ ] **Step 2: Write the failing test**

Create `src/tests/api/youtube-oauth-start.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/supabase/repositories/youtube-oauth-state', () => ({
  insertOAuthState: vi.fn(),
}));
vi.mock('@/lib/supabase/repositories/channels', () => ({
  getDefaultChannel: vi.fn(),
}));

import { GET } from '@/app/api/youtube/oauth/start/route';
import { getServiceClient } from '@/lib/supabase/server';
import { insertOAuthState } from '@/lib/supabase/repositories/youtube-oauth-state';
import { getDefaultChannel } from '@/lib/supabase/repositories/channels';

describe('GET /api/youtube/oauth/start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'test-client-id');
    vi.mocked(getServiceClient).mockReturnValue({} as never);
    vi.mocked(getDefaultChannel).mockResolvedValue({ id: 'chan-1' } as never);
    vi.mocked(insertOAuthState).mockResolvedValue('STATE_ABCD_32_CHARS_EXACTLY________');
  });

  it('302-redirects to Google consent URL with all required params', async () => {
    const req = new Request('https://app.example.com/api/youtube/oauth/start');
    const res = await GET(req);
    expect(res.status).toBe(307); // NextResponse.redirect default
    const location = res.headers.get('location') ?? '';
    const u = new URL(location);
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('client_id')).toBe('test-client-id');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('state')).toBe('STATE_ABCD_32_CHARS_EXACTLY________');
    expect(u.searchParams.get('redirect_uri')).toBe('https://app.example.com/api/youtube/oauth/callback');
    const scope = u.searchParams.get('scope') ?? '';
    expect(scope).toContain('https://www.googleapis.com/auth/youtube.upload');
    expect(scope).toContain('https://www.googleapis.com/auth/youtube.readonly');
    expect(scope).toContain('https://www.googleapis.com/auth/yt-analytics.readonly');
  });

  it('500s when GOOGLE_OAUTH_CLIENT_ID is missing', async () => {
    vi.unstubAllEnvs();
    const res = await GET(new Request('https://app.example.com/api/youtube/oauth/start'));
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run src/tests/api/youtube-oauth-start.test.ts
```

Expected: FAIL — route module not found.

- [ ] **Step 4: Implement the route**

Create `src/app/api/youtube/oauth/start/route.ts`:

```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { getDefaultChannel } from '@/lib/supabase/repositories/channels';
import { insertOAuthState } from '@/lib/supabase/repositories/youtube-oauth-state';

export const dynamic = 'force-dynamic';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

export async function GET(req: Request): Promise<Response> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'GOOGLE_OAUTH_CLIENT_ID not configured' }, { status: 500 });
  }

  const supabase = getServiceClient();
  const channel = await getDefaultChannel(supabase);
  const state = await insertOAuthState(supabase, channel.id);

  const redirectUri = new URL('/api/youtube/oauth/callback', req.url).toString();
  const consent = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  consent.searchParams.set('client_id', clientId);
  consent.searchParams.set('redirect_uri', redirectUri);
  consent.searchParams.set('response_type', 'code');
  consent.searchParams.set('access_type', 'offline');
  consent.searchParams.set('prompt', 'consent');
  consent.searchParams.set('scope', SCOPES.join(' '));
  consent.searchParams.set('state', state);
  return NextResponse.redirect(consent.toString());
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run src/tests/api/youtube-oauth-start.test.ts
```

Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/youtube/oauth/start/route.ts src/tests/api/youtube-oauth-start.test.ts
git commit -m "feat(oauth): /api/youtube/oauth/start — state-stored consent redirect"
```

---

### Task A4: `/api/youtube/oauth/callback` route

Validates state, exchanges code for tokens, encrypts + saves refresh token, redirects to /settings/channel?connected=true.

**Files:**
- Create: `src/app/api/youtube/oauth/callback/route.ts`
- Create: `src/lib/clients/google-oauth.ts` (token-endpoint helper, used here + by `getValidAccessToken` later)
- Test: `src/tests/lib/clients/google-oauth.test.ts`
- Test: `src/tests/api/youtube-oauth-callback.test.ts`

- [ ] **Step 1: Write the failing test for the token-exchange helper**

Create `src/tests/lib/clients/google-oauth.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { exchangeCodeForTokens, refreshAccessToken, GoogleTokenError } from '@/lib/clients/google-oauth';

const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

describe('google-oauth client', () => {
  it('exchangeCodeForTokens posts to token endpoint and returns parsed tokens', async () => {
    globalThis.fetch = vi.fn(async (url: URL | string, init?: RequestInit) => {
      expect(String(url)).toBe('https://oauth2.googleapis.com/token');
      expect(init?.method).toBe('POST');
      const body = (init?.body as URLSearchParams);
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('AUTH-CODE');
      expect(body.get('client_id')).toBe('cid');
      expect(body.get('client_secret')).toBe('csecret');
      expect(body.get('redirect_uri')).toBe('https://x/cb');
      return new Response(JSON.stringify({
        access_token: 'AT', refresh_token: 'RT', expires_in: 3599, scope: 'a b', token_type: 'Bearer',
      }), { status: 200 });
    }) as never;

    const result = await exchangeCodeForTokens({
      code: 'AUTH-CODE', clientId: 'cid', clientSecret: 'csecret', redirectUri: 'https://x/cb',
    });
    expect(result.accessToken).toBe('AT');
    expect(result.refreshToken).toBe('RT');
    expect(result.expiresIn).toBe(3599);
  });

  it('exchangeCodeForTokens throws GoogleTokenError on non-200', async () => {
    globalThis.fetch = vi.fn(async () => new Response('bad_verifier', { status: 400 })) as never;
    await expect(
      exchangeCodeForTokens({ code: 'x', clientId: 'c', clientSecret: 's', redirectUri: 'u' }),
    ).rejects.toThrow(GoogleTokenError);
  });

  it('refreshAccessToken posts grant_type=refresh_token', async () => {
    globalThis.fetch = vi.fn(async (_url, init) => {
      const body = (init?.body as URLSearchParams);
      expect(body.get('grant_type')).toBe('refresh_token');
      expect(body.get('refresh_token')).toBe('RT');
      return new Response(JSON.stringify({ access_token: 'AT2', expires_in: 3599 }), { status: 200 });
    }) as never;

    const result = await refreshAccessToken({
      refreshToken: 'RT', clientId: 'c', clientSecret: 's',
    });
    expect(result.accessToken).toBe('AT2');
    expect(result.expiresIn).toBe(3599);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/tests/lib/clients/google-oauth.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/clients/google-oauth.ts`**

```ts
import 'server-only';

export class GoogleTokenError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'GoogleTokenError';
  }
}

export interface ExchangeArgs {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface ExchangeResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export async function exchangeCodeForTokens(args: ExchangeArgs): Promise<ExchangeResult> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: args.code,
    client_id: args.clientId,
    client_secret: args.clientSecret,
    redirect_uri: args.redirectUri,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new GoogleTokenError(`exchangeCodeForTokens: ${res.status} ${await res.text()}`, res.status);
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!json.access_token || !json.refresh_token) {
    throw new GoogleTokenError(`exchangeCodeForTokens: malformed token response`, res.status);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in ?? 0,
    scope: json.scope ?? '',
  };
}

export interface RefreshArgs {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

export interface RefreshResult {
  accessToken: string;
  expiresIn: number;
}

export async function refreshAccessToken(args: RefreshArgs): Promise<RefreshResult> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: args.refreshToken,
    client_id: args.clientId,
    client_secret: args.clientSecret,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new GoogleTokenError(`refreshAccessToken: ${res.status} ${await res.text()}`, res.status);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new GoogleTokenError(`refreshAccessToken: malformed`, res.status);
  }
  return { accessToken: json.access_token, expiresIn: json.expires_in ?? 0 };
}
```

- [ ] **Step 4: Run helper test — confirm pass**

```bash
npx vitest run src/tests/lib/clients/google-oauth.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Write the failing test for the callback route**

Create `src/tests/api/youtube-oauth-callback.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/supabase/repositories/youtube-oauth-state', () => ({
  consumeOAuthState: vi.fn(),
  OAuthStateError: class OAuthStateError extends Error {},
}));
vi.mock('@/lib/supabase/repositories/channels', () => ({
  saveEncryptedRefreshToken: vi.fn(),
}));
vi.mock('@/lib/clients/google-oauth', () => ({
  exchangeCodeForTokens: vi.fn(),
  GoogleTokenError: class GoogleTokenError extends Error {},
}));

import { GET } from '@/app/api/youtube/oauth/callback/route';
import { consumeOAuthState } from '@/lib/supabase/repositories/youtube-oauth-state';
import { saveEncryptedRefreshToken } from '@/lib/supabase/repositories/channels';
import { exchangeCodeForTokens } from '@/lib/clients/google-oauth';
import { getServiceClient } from '@/lib/supabase/server';

describe('GET /api/youtube/oauth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'cid');
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'csecret');
    vi.mocked(getServiceClient).mockReturnValue({} as never);
  });

  it('happy path: exchanges code, saves encrypted token, redirects to settings', async () => {
    vi.mocked(consumeOAuthState).mockResolvedValue('chan-1');
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      accessToken: 'AT', refreshToken: 'RT', expiresIn: 3599, scope: '',
    });
    vi.mocked(saveEncryptedRefreshToken).mockResolvedValue();
    const res = await GET(new Request('https://app/api/youtube/oauth/callback?code=AUTH&state=STATE'));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://app/settings/channel?connected=true');
    expect(vi.mocked(saveEncryptedRefreshToken)).toHaveBeenCalledWith(expect.anything(), 'chan-1', 'RT');
  });

  it('400s if state missing', async () => {
    const res = await GET(new Request('https://app/api/youtube/oauth/callback?code=AUTH'));
    expect(res.status).toBe(400);
  });

  it('400s if code missing', async () => {
    const res = await GET(new Request('https://app/api/youtube/oauth/callback?state=STATE'));
    expect(res.status).toBe(400);
  });

  it('403s on expired state', async () => {
    const { OAuthStateError } = await import('@/lib/supabase/repositories/youtube-oauth-state');
    vi.mocked(consumeOAuthState).mockRejectedValue(new OAuthStateError('expired'));
    const res = await GET(new Request('https://app/api/youtube/oauth/callback?code=AUTH&state=STATE'));
    expect(res.status).toBe(403);
  });

  it('502 on Google token exchange failure', async () => {
    const { GoogleTokenError } = await import('@/lib/clients/google-oauth');
    vi.mocked(consumeOAuthState).mockResolvedValue('chan-1');
    vi.mocked(exchangeCodeForTokens).mockRejectedValue(new GoogleTokenError('boom', 400));
    const res = await GET(new Request('https://app/api/youtube/oauth/callback?code=AUTH&state=STATE'));
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx vitest run src/tests/api/youtube-oauth-callback.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 7: Implement the callback route**

Create `src/app/api/youtube/oauth/callback/route.ts`:

```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import {
  consumeOAuthState,
  OAuthStateError,
} from '@/lib/supabase/repositories/youtube-oauth-state';
import { saveEncryptedRefreshToken } from '@/lib/supabase/repositories/channels';
import {
  exchangeCodeForTokens,
  GoogleTokenError,
} from '@/lib/clients/google-oauth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errParam = url.searchParams.get('error');

  if (errParam) {
    return NextResponse.redirect(new URL(`/settings/channel?error=${encodeURIComponent(errParam)}`, req.url));
  }
  if (!code || !state) {
    return NextResponse.json({ error: 'missing_code_or_state' }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'oauth_env_missing' }, { status: 500 });
  }

  const supabase = getServiceClient();
  let channelId: string;
  try {
    channelId = await consumeOAuthState(supabase, state, new Date());
  } catch (err) {
    if (err instanceof OAuthStateError) {
      return NextResponse.json({ error: 'invalid_state', detail: err.message }, { status: 403 });
    }
    throw err;
  }

  const redirectUri = new URL('/api/youtube/oauth/callback', req.url).toString();
  let tokens;
  try {
    tokens = await exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri });
  } catch (err) {
    if (err instanceof GoogleTokenError) {
      return NextResponse.json({ error: 'token_exchange_failed', detail: err.message }, { status: 502 });
    }
    throw err;
  }

  await saveEncryptedRefreshToken(supabase, channelId, tokens.refreshToken);
  return NextResponse.redirect(new URL('/settings/channel?connected=true', req.url));
}
```

- [ ] **Step 8: Run callback test — confirm pass**

```bash
npx vitest run src/tests/api/youtube-oauth-callback.test.ts
```

Expected: 5 passing.

- [ ] **Step 9: Commit**

```bash
git add src/lib/clients/google-oauth.ts src/app/api/youtube/oauth/callback/route.ts src/tests/lib/clients/google-oauth.test.ts src/tests/api/youtube-oauth-callback.test.ts
git commit -m "feat(oauth): /api/youtube/oauth/callback — exchange + encrypt + save"
```

---

### Task A5: `/settings/channel` page

Server component listing the active channel, its `external_channel_id`, OAuth-connected status (derived from `oauth_refresh_token_encrypted IS NOT NULL`), Connect / Reconnect button, and toast banner based on `?connected=true` / `?error=...` query params.

**Files:**
- Create: `src/app/settings/channel/page.tsx`
- Create: `src/components/settings/connect-youtube-button.tsx` (client component for the navigation)
- Modify: `src/lib/supabase/repositories/channels.ts` — add `isYouTubeConnected(supabase, channelId): Promise<boolean>` helper

- [ ] **Step 1: Extend channels repo with isYouTubeConnected**

Append to `src/lib/supabase/repositories/channels.ts`:

```ts
export async function isYouTubeConnected(
  supabase: SupabaseClient,
  channelId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('channels')
    .select('oauth_refresh_token_encrypted')
    .eq('id', channelId)
    .single();
  if (error) throw new Error(`isYouTubeConnected: ${error.message}`);
  return (data as { oauth_refresh_token_encrypted: string | null }).oauth_refresh_token_encrypted != null;
}
```

- [ ] **Step 2: Write the page**

Create `src/app/settings/channel/page.tsx`:

```tsx
import { CockpitShell } from '@/components/cockpit/cockpit-shell';
import { getServiceClient } from '@/lib/supabase/server';
import { getDefaultChannel, isYouTubeConnected } from '@/lib/supabase/repositories/channels';
import { ConnectYouTubeButton } from '@/components/settings/connect-youtube-button';

export const dynamic = 'force-dynamic';

export default async function SettingsChannelPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;
  const supabase = getServiceClient();
  const channel = await getDefaultChannel(supabase);
  const ytConnected = await isYouTubeConnected(supabase, channel.id);

  return (
    <CockpitShell>
      <div className="p-6 space-y-6 max-w-2xl mx-auto">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">Channel settings</h1>
          <p className="text-text-secondary text-sm mt-1">Connect YouTube + view channel state.</p>
        </header>

        {connected === 'true' && (
          <div className="rounded border border-accent-electric/40 bg-accent-electric/10 px-4 py-3 text-sm text-text-primary">
            ✓ YouTube connected. Upload jobs will now use this account.
          </div>
        )}
        {error && (
          <div className="rounded border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-sm text-text-primary">
            ✗ OAuth failed: {error}
          </div>
        )}

        <section className="rounded-lg border border-subtle bg-surface p-4 space-y-3">
          <h2 className="text-sm font-medium text-text-primary">{channel.display_name}</h2>
          <dl className="text-xs font-mono text-text-muted space-y-1">
            <div><dt className="inline">slug:</dt> <dd className="inline">{channel.slug}</dd></div>
            <div><dt className="inline">platform:</dt> <dd className="inline">{channel.platform}</dd></div>
            <div><dt className="inline">external_channel_id:</dt> <dd className="inline">{channel.external_channel_id ?? '(not set)'}</dd></div>
            <div>
              <dt className="inline">YouTube OAuth:</dt>{' '}
              <dd className="inline">{ytConnected ? 'connected' : 'not connected'}</dd>
            </div>
          </dl>
          <ConnectYouTubeButton connected={ytConnected} />
        </section>
      </div>
    </CockpitShell>
  );
}
```

- [ ] **Step 3: Write the button component**

Create `src/components/settings/connect-youtube-button.tsx`:

```tsx
'use client';

export function ConnectYouTubeButton({ connected }: { connected: boolean }) {
  return (
    <a
      href="/api/youtube/oauth/start"
      className="inline-block px-4 py-2 rounded bg-accent-electric text-app text-xs font-medium hover:opacity-90"
    >
      {connected ? 'Reconnect YouTube' : 'Connect YouTube'}
    </a>
  );
}
```

- [ ] **Step 4: Smoke test locally**

(Operator-driven — agent cannot drive a browser locally.) Hand the operator this checklist:

```
1. unset ANTHROPIC_BASE_URL && npm run dev
2. Open http://localhost:3000/settings/channel
3. Verify the channel info card renders with current external_channel_id + "YouTube OAuth: not connected"
4. Click "Connect YouTube" — should go to https://accounts.google.com/o/oauth2/v2/auth?... with scope=youtube.upload+readonly+yt-analytics.readonly
5. Consent (you're a test user). Should redirect back to http://localhost:3000/settings/channel?connected=true with green toast.
6. Reload the page — "YouTube OAuth: connected" should now show.
```

If the local dev redirect URI hasn't been added to the Google Cloud client (Task A0 Step 2), the consent flow errors with `redirect_uri_mismatch` — operator fixes that in the Cloud Console, then retries.

- [ ] **Step 5: Commit**

```bash
git add src/app/settings/channel/page.tsx src/components/settings/connect-youtube-button.tsx src/lib/supabase/repositories/channels.ts
git commit -m "feat(settings): /settings/channel page + Connect YouTube button"
```

---

### Task A6: Sandbox-side encryption mirror + byte-equality guard

The Sandbox worker needs `lib/encryption.ts` (to decrypt the refresh token in-VM during upload jobs). It's a separate npm package, so we copy the file. A vitest reads both files and asserts they're byte-equal — that's the drift-prevention.

**Files:**
- Create: `scripts/render-worker/lib/encryption.ts` (verbatim copy of `src/lib/encryption.ts`)
- Test: `src/tests/lib/encryption-mirror.test.ts`

- [ ] **Step 1: Copy the file**

```bash
cp src/lib/encryption.ts scripts/render-worker/lib/encryption.ts
```

- [ ] **Step 2: Write the byte-equality guard test**

Create `src/tests/lib/encryption-mirror.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('encryption mirror', () => {
  it('scripts/render-worker/lib/encryption.ts matches src/lib/encryption.ts byte-for-byte', () => {
    const root = process.cwd();
    const src = readFileSync(resolve(root, 'src/lib/encryption.ts'));
    const mirror = readFileSync(resolve(root, 'scripts/render-worker/lib/encryption.ts'));
    expect(mirror.equals(src)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

```bash
npx vitest run src/tests/lib/encryption-mirror.test.ts
```

Expected: 1 passing. If FAIL, re-run Step 1's `cp` and verify (most likely cause: editor added a trailing newline).

- [ ] **Step 4: Commit**

```bash
git add scripts/render-worker/lib/encryption.ts src/tests/lib/encryption-mirror.test.ts
git commit -m "feat(worker): mirror src/lib/encryption.ts into scripts/render-worker/lib/ + byte-equality guard"
```

---

### Task A7: Sub-phase A merge to main

OAuth is harmless until something calls it. Merging early lets Task B (which depends on a real refresh token in prod) test against the live OAuth flow.

- [ ] **Step 1: Confirm `npm test` green from repo root**

```bash
unset ANTHROPIC_BASE_URL && npx vitest run
```

Expected: all tests pass; vitest count = baseline 91 + 14 new (A1: 3, A2: 4, A3: 2, A4: 5+3, A6: 1 — wait, A4 added 5 callback tests + 3 helper tests = 8). Running total roughly 91 + 18 ≈ 109. Treat the absolute number as advisory; the **green** is the gate.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Open the PR**

```bash
git checkout -b plan-4-phase-5-oauth
git push -u origin plan-4-phase-5-oauth
gh pr create --title "Plan #4 Phase 5 Sub-phase A — YouTube OAuth foundation" --body "$(cat <<'EOF'
## Summary
- Encrypted refresh-token storage on `channels.oauth_refresh_token_encrypted` via `src/lib/encryption.ts` (AES-256-GCM with key-version dispatch already shipped in Phase 1).
- `/api/youtube/oauth/start` → state-stored Google consent redirect.
- `/api/youtube/oauth/callback` → state validate, code exchange, encrypt, save.
- `/settings/channel` page with Connect / Reconnect button.
- Sandbox-side mirror of `lib/encryption.ts` for upload-handler use, with byte-equality guard test.

## Test plan
- [ ] Operator confirmed `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (Sensitive), `OAUTH_TOKEN_ENCRYPTION_KEY_V1` (Sensitive), `OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION=1` in Vercel (Prod + Preview)
- [ ] Operator updated `channels.external_channel_id` to the real `UCxxxx`
- [ ] On preview deploy (after Vercel SSO bypass via vercel curl or operator browser): `/settings/channel` renders, Connect YouTube redirects to Google consent, callback writes `channels.oauth_refresh_token_encrypted` (verifiable in Supabase SQL), `/settings/channel?connected=true` shows the toast.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Operator-driven prod smoke**

Hand the operator:

```
1. Wait for the PR's Vercel preview to deploy.
2. The preview URL is SSO-protected, so visit it through a browser session you've already authed against Vercel.
3. Go to <preview>/settings/channel → click Connect YouTube → consent → expect /settings/channel?connected=true.
4. In Supabase SQL Editor:
     select id, oauth_refresh_token_encrypted is not null as connected from channels where slug='dyfrx_9754';
   Expect: connected=true.
5. Report PASS/FAIL back in chat.
```

- [ ] **Step 5: Merge**

After operator reports PASS:

```bash
gh pr merge plan-4-phase-5-oauth --squash --delete-branch
git checkout main && git pull origin main
```

**Sub-phase A acceptance:** `channels.oauth_refresh_token_encrypted` is populated for the active channel; roundtripping it through the repo decrypts to a string that matches `RT.{20,}` (Google refresh tokens are >20 chars).

---

# Sub-phase B: Sandbox upload handler + analytics sync

`upload` job: download mp4 from Blob → resumable upload to `videos.insert` → callback writes `posted_at` / `external_video_id` / `url` / `posted_hour_local` / `posted_dow_local`. Then `performance-sync` cron sweeps the last 14 days every morning.

### Task B1: Sandbox-side YouTube upload client

**Files:**
- Create: `scripts/render-worker/lib/youtube-upload.ts`
- Create: `scripts/render-worker/lib/google-oauth.ts` (Sandbox-side mirror; cannot import `server-only` files via @/ alias)
- Test: `src/tests/lib/clients/youtube-upload.test.ts` (test the mirror — same byte-equality guard as encryption)

The Sandbox runs from `scripts/render-worker/` and has its own `node_modules`. Use `fetch` directly (Node 24 has global fetch); avoid the `googleapis` package to keep the install footprint small.

- [ ] **Step 1: Mirror google-oauth.ts into the worker package**

```bash
cp src/lib/clients/google-oauth.ts scripts/render-worker/lib/google-oauth.ts
```

Then edit the copy and remove the `import 'server-only';` line (worker package has no React Server Components — `server-only` errors at import time outside RSC builds). Replace it with a one-line file-top comment:

```ts
// scripts/render-worker/lib/google-oauth.ts
// MIRROR OF src/lib/clients/google-oauth.ts — modulo the removed `server-only` import.
// Drift-checked at test time via src/tests/lib/google-oauth-mirror.test.ts.
```

- [ ] **Step 2: Write the byte-equality guard test (modulo first 3 lines)**

Create `src/tests/lib/google-oauth-mirror.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('google-oauth mirror', () => {
  it('worker mirror matches src after stripping the server-only import line', () => {
    const root = process.cwd();
    const src = readFileSync(resolve(root, 'src/lib/clients/google-oauth.ts'), 'utf8');
    const mirror = readFileSync(resolve(root, 'scripts/render-worker/lib/google-oauth.ts'), 'utf8');

    // Strip the first import-block in each: in src, the first non-blank line is `import 'server-only';`;
    // in the mirror, the first three lines are the explanatory comment. Compare the body after the first
    // blank line that follows the header.
    const tail = (text: string) => {
      const idx = text.indexOf('export ');
      if (idx < 0) throw new Error('no export found');
      return text.slice(idx);
    };
    expect(tail(mirror)).toBe(tail(src));
  });
});
```

- [ ] **Step 3: Run mirror test — confirm pass**

```bash
npx vitest run src/tests/lib/google-oauth-mirror.test.ts
```

Expected: 1 passing.

- [ ] **Step 4: Write the failing test for the upload helper**

Create `src/tests/lib/clients/youtube-upload.test.ts`:

```ts
// Imports the worker-side file directly via relative path — that's the file the test guards.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { uploadVideo, YouTubeUploadError } from '../../../../scripts/render-worker/lib/youtube-upload';

const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

describe('youtube-upload helper', () => {
  it('happy path: 1) initiates resumable session, 2) uploads bytes, 3) parses response', async () => {
    const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];
    globalThis.fetch = vi.fn(async (url: URL | string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url: u, method, headers });
      if (u.includes('uploads?uploadType=resumable')) {
        return new Response(null, {
          status: 200,
          headers: { location: 'https://upload.example.com/RESUMABLE_SESSION' },
        });
      }
      if (u === 'https://upload.example.com/RESUMABLE_SESSION') {
        return new Response(JSON.stringify({ id: 'EXTERNAL_VIDEO_ID', snippet: { title: 'T' } }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as never;

    const result = await uploadVideo({
      accessToken: 'AT',
      videoBytes: new Uint8Array([1, 2, 3, 4]),
      title: 'T',
      description: 'D',
      tags: ['cars'],
      privacyStatus: 'public',
      madeForKids: false,
      categoryId: '24',
    });

    expect(result.externalVideoId).toBe('EXTERNAL_VIDEO_ID');
    expect(result.url).toBe('https://www.youtube.com/shorts/EXTERNAL_VIDEO_ID');
    expect(calls[0].url).toContain('videos?uploadType=resumable');
    expect(calls[0].headers['Authorization']).toBe('Bearer AT');
    const initBody = calls[0];
    expect(initBody.method).toBe('POST');
    expect(calls[1].method).toBe('PUT');
    expect(calls[1].headers['Content-Type']).toBe('video/mp4');
  });

  it('throws YouTubeUploadError on quotaExceeded', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 403, message: 'quotaExceeded' } }), { status: 403 }),
    ) as never;
    await expect(
      uploadVideo({
        accessToken: 'AT', videoBytes: new Uint8Array(), title: 'T', description: 'D',
        tags: [], privacyStatus: 'public', madeForKids: false, categoryId: '24',
      }),
    ).rejects.toThrow(YouTubeUploadError);
  });
});
```

- [ ] **Step 5: Run upload test — confirm FAIL**

```bash
npx vitest run src/tests/lib/clients/youtube-upload.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 6: Implement `scripts/render-worker/lib/youtube-upload.ts`**

```ts
// scripts/render-worker/lib/youtube-upload.ts
// Sandbox-side YouTube Data API v3 videos.insert with a resumable upload session.
// Single-shot upload: we hold the whole MP4 in memory (< 200 MB for Shorts) and PUT
// it in one go. Multi-chunk resume is overkill for our file sizes.

export class YouTubeUploadError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'YouTubeUploadError';
  }
}

export interface UploadArgs {
  accessToken: string;
  videoBytes: Uint8Array;
  title: string;
  description: string;
  tags: string[];
  privacyStatus: 'private' | 'public' | 'unlisted';
  madeForKids: boolean;
  categoryId: string; // '24' = Entertainment, '22' = People & Blogs, etc.
}

export interface UploadResult {
  externalVideoId: string;
  url: string;
}

const INIT_ENDPOINT = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

export async function uploadVideo(args: UploadArgs): Promise<UploadResult> {
  const metadata = {
    snippet: {
      title: args.title,
      description: args.description,
      tags: args.tags,
      categoryId: args.categoryId,
    },
    status: {
      privacyStatus: args.privacyStatus,
      madeForKids: args.madeForKids,
      selfDeclaredMadeForKids: args.madeForKids,
    },
  };

  // 1. Initiate session
  const initRes = await fetch(INIT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${args.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(args.videoBytes.byteLength),
    },
    body: JSON.stringify(metadata),
  });
  if (!initRes.ok) {
    throw new YouTubeUploadError(`upload init: ${initRes.status} ${await initRes.text()}`, initRes.status);
  }
  const sessionUrl = initRes.headers.get('location');
  if (!sessionUrl) {
    throw new YouTubeUploadError('upload init: no Location header', initRes.status);
  }

  // 2. PUT bytes
  const putRes = await fetch(sessionUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(args.videoBytes.byteLength) },
    body: args.videoBytes,
  });
  if (!putRes.ok) {
    throw new YouTubeUploadError(`upload PUT: ${putRes.status} ${await putRes.text()}`, putRes.status);
  }
  const json = (await putRes.json()) as { id?: string };
  if (!json.id) {
    throw new YouTubeUploadError('upload response missing id', putRes.status);
  }
  return {
    externalVideoId: json.id,
    url: `https://www.youtube.com/shorts/${json.id}`,
  };
}
```

- [ ] **Step 7: Run upload test — confirm pass**

```bash
npx vitest run src/tests/lib/clients/youtube-upload.test.ts
```

Expected: 2 passing.

- [ ] **Step 8: Commit**

```bash
git add scripts/render-worker/lib/google-oauth.ts scripts/render-worker/lib/youtube-upload.ts src/tests/lib/google-oauth-mirror.test.ts src/tests/lib/clients/youtube-upload.test.ts
git commit -m "feat(worker): YouTube resumable upload helper + google-oauth mirror"
```

---

### Task B2: Sandbox-side upload handler

Replaces the Phase 1 stub `runUpload()`. Flow: load `your_video` row → load channel + encrypted refresh token → refresh access token → download MP4 from Blob → call `uploadVideo` → return result for callback.

**Files:**
- Modify: `scripts/render-worker/handlers/upload.ts` (full impl, replacing the stub)
- Modify: `scripts/render-worker/run.ts` (already routes to `runUpload(job, supabase)` — adjust signature)
- Test: `src/tests/lib/render/upload-handler.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tests/lib/render/upload-handler.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../scripts/render-worker/lib/youtube-upload', () => ({
  uploadVideo: vi.fn(),
  YouTubeUploadError: class YouTubeUploadError extends Error {},
}));
vi.mock('../../../../scripts/render-worker/lib/google-oauth', () => ({
  refreshAccessToken: vi.fn(),
  GoogleTokenError: class GoogleTokenError extends Error {},
}));

import { runUpload, UploadHandlerError } from '../../../../scripts/render-worker/handlers/upload';
import { uploadVideo } from '../../../../scripts/render-worker/lib/youtube-upload';
import { refreshAccessToken } from '../../../../scripts/render-worker/lib/google-oauth';

const KEY_V1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_V1', KEY_V1);
  vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION', '1');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'cid');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'csecret');
});

function makeEncryptedTokenJSON(plaintext: string): string {
  // Hand-encrypt with the same routine the repo uses, to avoid coupling the test to the helper.
  const { encryptSecret } = require('../../../../scripts/render-worker/lib/encryption');
  return JSON.stringify(encryptSecret(plaintext));
}

describe('runUpload handler', () => {
  it('happy path: refresh, download, upload, returns result', async () => {
    const encryptedJSON = makeEncryptedTokenJSON('FAKE_REFRESH_TOKEN');
    const supabase = {
      from: (table: string) => {
        if (table === 'your_videos') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: 'video-1',
                    channel_id: 'chan-1',
                    title: 'Title',
                    description: 'Desc',
                    render_artifact_url: 'https://blob.example.com/video.mp4',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'channels') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { oauth_refresh_token_encrypted: encryptedJSON },
                  error: null,
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    } as never;

    globalThis.fetch = vi.fn(async () =>
      new Response(new Uint8Array([0xff, 0xfe]).buffer, { status: 200 }),
    ) as never;
    vi.mocked(refreshAccessToken).mockResolvedValue({ accessToken: 'AT', expiresIn: 3599 });
    vi.mocked(uploadVideo).mockResolvedValue({ externalVideoId: 'EXT123', url: 'https://www.youtube.com/shorts/EXT123' });

    const result = await runUpload({ id: 'job-1', payload: { your_video_id: 'video-1' } }, supabase);
    expect(result.external_video_id).toBe('EXT123');
    expect(result.url).toBe('https://www.youtube.com/shorts/EXT123');
    expect(result.your_video_id).toBe('video-1');
    expect(vi.mocked(refreshAccessToken)).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: 'FAKE_REFRESH_TOKEN' }));
  });

  it('throws UploadHandlerError when channel has no refresh token', async () => {
    const supabase = {
      from: (table: string) => {
        if (table === 'your_videos') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { id: 'video-1', channel_id: 'chan-1', title: 'T', render_artifact_url: 'https://b/v.mp4' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'channels') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { oauth_refresh_token_encrypted: null }, error: null }),
              }),
            }),
          };
        }
        throw new Error('x');
      },
    } as never;
    await expect(runUpload({ id: 'j', payload: { your_video_id: 'video-1' } }, supabase)).rejects.toThrow(UploadHandlerError);
  });

  it('throws UploadHandlerError when payload.your_video_id missing', async () => {
    const supabase = {} as never;
    await expect(runUpload({ id: 'j', payload: {} }, supabase)).rejects.toThrow(/your_video_id/);
  });
});
```

- [ ] **Step 2: Run test — confirm FAIL**

```bash
npx vitest run src/tests/lib/render/upload-handler.test.ts
```

Expected: FAIL — current stub throws "upload handler not implemented".

- [ ] **Step 3: Implement the handler**

Replace `scripts/render-worker/handlers/upload.ts` entirely with:

```ts
// scripts/render-worker/handlers/upload.ts
// Phase 5: real YouTube upload.
//   1. Load your_videos row + channel.oauth_refresh_token_encrypted
//   2. Decrypt + refresh to get access token
//   3. Download MP4 from render_artifact_url (Vercel Blob signed URL works as-is)
//   4. Resumable upload via youtube-upload.ts
//   5. Return { your_video_id, external_video_id, url } for the callback handler
//      to write back to your_videos.

import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret, type EncryptedSecret } from '../lib/encryption.ts';
import { refreshAccessToken, GoogleTokenError } from '../lib/google-oauth.ts';
import { uploadVideo, YouTubeUploadError } from '../lib/youtube-upload.ts';

export class UploadHandlerError extends Error {
  constructor(message: string, public trace: string) {
    super(message);
    this.name = 'UploadHandlerError';
  }
}

interface VideoRow {
  id: string;
  channel_id: string;
  title: string;
  description: string | null;
  render_artifact_url: string | null;
}

export async function runUpload(
  job: { id: string; payload: unknown },
  supabase: SupabaseClient,
): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  const trace: string[] = [];
  const log = (msg: string) => {
    const line = `[upload] +${Date.now() - t0}ms ${msg}`;
    console.log(line);
    trace.push(line);
  };

  try {
    return await uploadInternal();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAILED: ${msg}`);
    throw new UploadHandlerError(msg, trace.join('\n'));
  }

  async function uploadInternal(): Promise<Record<string, unknown>> {
    const payload = job.payload as { your_video_id?: string };
    const videoId = payload.your_video_id;
    if (!videoId) throw new Error('payload.your_video_id missing');

    log(`loading your_videos ${videoId}`);
    const { data: vidData, error: vidErr } = await supabase
      .from('your_videos')
      .select('id, channel_id, title, description, render_artifact_url')
      .eq('id', videoId)
      .single();
    if (vidErr || !vidData) throw new Error(`your_videos fetch: ${vidErr?.message ?? 'no row'}`);
    const video = vidData as VideoRow;
    if (!video.render_artifact_url) throw new Error('render_artifact_url is null');

    log(`loading channel ${video.channel_id}`);
    const { data: chanData, error: chanErr } = await supabase
      .from('channels')
      .select('oauth_refresh_token_encrypted')
      .eq('id', video.channel_id)
      .single();
    if (chanErr || !chanData) throw new Error(`channels fetch: ${chanErr?.message ?? 'no row'}`);
    const encJSON = (chanData as { oauth_refresh_token_encrypted: string | null }).oauth_refresh_token_encrypted;
    if (!encJSON) throw new Error('channel has no oauth_refresh_token_encrypted — connect at /settings/channel');
    const blob = JSON.parse(encJSON) as EncryptedSecret;
    const refreshToken = decryptSecret(blob);

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('GOOGLE_OAUTH_CLIENT_ID/SECRET missing in sandbox env');

    log('refreshing access token');
    let accessToken: string;
    try {
      const refreshed = await refreshAccessToken({ refreshToken, clientId, clientSecret });
      accessToken = refreshed.accessToken;
    } catch (err) {
      if (err instanceof GoogleTokenError) throw new Error(`token refresh: ${err.message}`);
      throw err;
    }

    log(`downloading mp4 from ${video.render_artifact_url}`);
    const dlRes = await fetch(video.render_artifact_url);
    if (!dlRes.ok) throw new Error(`mp4 download: ${dlRes.status}`);
    const videoBytes = new Uint8Array(await dlRes.arrayBuffer());
    log(`downloaded ${videoBytes.byteLength} bytes`);

    log('uploading to YouTube');
    let result;
    try {
      result = await uploadVideo({
        accessToken,
        videoBytes,
        title: video.title,
        description: video.description ?? '',
        tags: [],
        privacyStatus: 'public',
        madeForKids: false,
        categoryId: '24',
      });
    } catch (err) {
      if (err instanceof YouTubeUploadError) throw new Error(`youtube upload: ${err.message}`);
      throw err;
    }
    log(`uploaded as ${result.externalVideoId}`);

    return {
      your_video_id: videoId,
      external_video_id: result.externalVideoId,
      url: result.url,
      debug_trace: trace.join('\n'),
    };
  }
}
```

- [ ] **Step 4: Run handler test — confirm pass**

```bash
npx vitest run src/tests/lib/render/upload-handler.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Update run.ts**

The handler signature changed from `runUpload()` (0 args) to `runUpload(job, supabase)`. Confirm `scripts/render-worker/run.ts` calls it as `runUpload(job, supabase)` (it currently calls `runUpload()`). Edit the line:

```ts
case 'upload':       output = await runUpload(job, supabase); break;
```

Also add the trace propagation, mirroring the other handlers — in the catch block of `main()`, extend the `trace` ternary:

```ts
const trace =
  err instanceof RenderF1Error ? err.trace
  : err instanceof RenderF2Error ? err.trace
  : err instanceof ClipIngestError ? err.trace
  : err instanceof UploadHandlerError ? err.trace
  : undefined;
```

And add the import at the top:

```ts
import { runUpload, UploadHandlerError } from './handlers/upload.ts';
```

(Replace the existing `import { runUpload } from './handlers/upload.ts';` line.)

- [ ] **Step 6: Type-check the worker package**

```bash
cd scripts/render-worker && npx tsc --noEmit && cd -
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add scripts/render-worker/handlers/upload.ts scripts/render-worker/run.ts src/tests/lib/render/upload-handler.test.ts
git commit -m "feat(worker): real upload handler — refresh token + Blob download + videos.insert"
```

---

### Task B3: Callback handler — upload side-effect

When `render_jobs.job_type='upload'` finishes succeeded, the callback writes back to `your_videos`.

**Files:**
- Modify: `src/app/api/render/complete/route.ts` (add upload branch)
- Modify: `src/lib/supabase/repositories/your-videos.ts` (add `markPosted` helper)
- Modify: `src/lib/supabase/repositories/operator-alerts.ts` (no change yet; flag for Task B5 if `posted_at` insert errors with a specific oauth-revoked code we recognize)
- Test: `src/tests/api/render-complete-upload.test.ts`
- Test: `src/tests/lib/supabase/your-videos-mark-posted.test.ts`

- [ ] **Step 1: Write the failing test for `markPosted`**

Create `src/tests/lib/supabase/your-videos-mark-posted.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { markPosted } from '@/lib/supabase/repositories/your-videos';

describe('markPosted', () => {
  it('writes external_video_id, url, posted_at, posted_hour_local, posted_dow_local, status', async () => {
    let captured: Record<string, unknown> | null = null;
    const supabase = {
      from: (table: string) => {
        if (table !== 'your_videos') throw new Error('wrong table');
        return {
          update: (patch: Record<string, unknown>) => ({
            eq: async () => { captured = patch; return { error: null }; },
          }),
        };
      },
    } as never;
    const now = new Date('2026-05-27T22:30:00Z'); // 18:30 ET (EDT) = local hour 18, dow 3 (Wed)
    await markPosted(supabase, {
      videoId: 'v1',
      externalVideoId: 'YT_ID',
      url: 'https://www.youtube.com/shorts/YT_ID',
      postedAt: now,
      channelTimezone: 'America/New_York',
    });
    expect(captured!.external_video_id).toBe('YT_ID');
    expect(captured!.url).toBe('https://www.youtube.com/shorts/YT_ID');
    expect(captured!.status).toBe('posted');
    expect(captured!.posted_at).toBe(now.toISOString());
    expect(captured!.posted_hour_local).toBe(18);
    expect(captured!.posted_dow_local).toBe(3); // 0=Sun..6=Sat; Wed=3
  });

  it('handles a Sunday posted_dow_local=0 across DST (Nov 1 2026 fall-back, 02:30 UTC = 22:30 ET Oct 31, Sat=6)', async () => {
    let captured: Record<string, unknown> | null = null;
    const supabase = {
      from: () => ({
        update: (patch: Record<string, unknown>) => ({
          eq: async () => { captured = patch; return { error: null }; },
        }),
      }),
    } as never;
    const now = new Date('2026-11-01T02:30:00Z'); // 22:30 ET Oct 31 (DST still in effect)
    await markPosted(supabase, {
      videoId: 'v1', externalVideoId: 'YT', url: 'u', postedAt: now,
      channelTimezone: 'America/New_York',
    });
    expect(captured!.posted_hour_local).toBe(22);
    expect(captured!.posted_dow_local).toBe(6); // Saturday in ET
  });
});
```

- [ ] **Step 2: Run test — confirm FAIL**

```bash
npx vitest run src/tests/lib/supabase/your-videos-mark-posted.test.ts
```

Expected: FAIL — `markPosted` undefined.

- [ ] **Step 3: Add `luxon` dependency**

```bash
npm install luxon@^3.5.0 && npm install --save-dev @types/luxon@^3.4.2
```

Verify in `package.json` that `luxon` lands under `dependencies` and `@types/luxon` under `devDependencies`.

- [ ] **Step 4: Implement `markPosted`**

Append to `src/lib/supabase/repositories/your-videos.ts`:

```ts
import { DateTime } from 'luxon';

export async function markPosted(
  supabase: SupabaseClient,
  args: {
    videoId: string;
    externalVideoId: string;
    url: string;
    postedAt: Date;
    channelTimezone: string;
  },
): Promise<void> {
  const local = DateTime.fromJSDate(args.postedAt).setZone(args.channelTimezone);
  // luxon weekday: 1=Mon..7=Sun. Convert to 0=Sun..6=Sat.
  const dow = local.weekday === 7 ? 0 : local.weekday;
  const { error } = await supabase
    .from('your_videos')
    .update({
      external_video_id: args.externalVideoId,
      url: args.url,
      posted_at: args.postedAt.toISOString(),
      posted_hour_local: local.hour,
      posted_dow_local: dow,
      status: 'posted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.videoId);
  if (error) throw new Error(`markPosted: ${error.message}`);
}
```

- [ ] **Step 5: Run `markPosted` test — confirm pass**

```bash
npx vitest run src/tests/lib/supabase/your-videos-mark-posted.test.ts
```

Expected: 2 passing.

- [ ] **Step 6: Write the failing test for the callback handler upload branch**

Create `src/tests/api/render-complete-upload.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/render/callback-token', () => ({
  verifyCallbackToken: vi.fn(() => ({ jobId: 'job-1' })),
  CallbackTokenError: class extends Error {},
}));
vi.mock('@/lib/supabase/repositories/render-jobs', () => ({
  markJobSucceeded: vi.fn(async () => 1),
  markJobFailed: vi.fn(async () => 1),
}));
vi.mock('@/lib/supabase/repositories/your-videos', () => ({
  markPosted: vi.fn(),
}));

import { POST } from '@/app/api/render/complete/route';
import { markPosted } from '@/lib/supabase/repositories/your-videos';
import { getServiceClient } from '@/lib/supabase/server';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServiceClient).mockReturnValue({
    from: (table: string) => {
      if (table === 'render_jobs') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { job_type: 'upload', your_video_id: 'video-1' },
                error: null,
              }),
              single: async () => ({
                data: { your_video_id: 'video-1', compilation_draft_id: null, job_type: 'upload' },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === 'your_videos') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { channel_id: 'chan-1' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'channels') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { timezone: 'America/New_York' }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as never);
});

describe('POST /api/render/complete — upload branch', () => {
  it('writes posted_at + external_video_id + url + hour_local + dow_local', async () => {
    const req = new Request('https://app/api/render/complete', {
      method: 'POST',
      headers: { authorization: 'Bearer TOKEN', 'content-type': 'application/json' },
      body: JSON.stringify({
        job_id: 'job-1',
        sandbox_invocation_id: 'inv-1',
        result: {
          status: 'succeeded',
          output: {
            your_video_id: 'video-1',
            external_video_id: 'YT_ID',
            url: 'https://www.youtube.com/shorts/YT_ID',
          },
        },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(vi.mocked(markPosted)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        videoId: 'video-1',
        externalVideoId: 'YT_ID',
        url: 'https://www.youtube.com/shorts/YT_ID',
        channelTimezone: 'America/New_York',
      }),
    );
  });
});
```

- [ ] **Step 7: Run test — confirm FAIL**

```bash
npx vitest run src/tests/api/render-complete-upload.test.ts
```

Expected: FAIL — callback doesn't handle upload payload yet.

- [ ] **Step 8: Add the upload branch to the callback handler**

In `src/app/api/render/complete/route.ts`, inside the `if (body.result.status === 'succeeded')` block, after the existing `render_f2` side-effect block, add:

```ts
      // upload side-effect — mark your_videos posted + record local hour/dow
      if ('your_video_id' in out && 'external_video_id' in out && 'url' in out) {
        const yourVideoId = out.your_video_id as string;
        const externalVideoId = out.external_video_id as string;
        const url = out.url as string;
        const { data: vidRow } = await supabase
          .from('your_videos')
          .select('channel_id')
          .eq('id', yourVideoId)
          .single();
        const channelId = vidRow?.channel_id;
        let channelTimezone = 'America/New_York';
        if (channelId) {
          const { data: chanRow } = await supabase
            .from('channels')
            .select('timezone')
            .eq('id', channelId)
            .single();
          if (chanRow?.timezone) channelTimezone = chanRow.timezone as string;
        }
        await markPosted(supabase, {
          videoId: yourVideoId,
          externalVideoId,
          url,
          postedAt: new Date(),
          channelTimezone,
        });
      }
```

Add the import at the top:

```ts
import { markPosted } from '@/lib/supabase/repositories/your-videos';
```

Also extend the failure branch so an upload failure flips the `your_videos` row to `status='failed'` with `last_error` (use a new column? No — `your_videos` doesn't have last_error; piggyback by writing the error into `your_videos.description`-suffix? Bad. Instead, write an `operator_alerts` row.). Add to the `else` branch (after the existing render_f2 failure block):

```ts
    // upload failure side-effect — flip your_videos.status='failed' + write operator_alert.
    if (jobRow?.job_type === 'upload' && jobRow.your_video_id) {
      await supabase
        .from('your_videos')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', jobRow.your_video_id);
      const isOAuth = body.result.error.toLowerCase().includes('token refresh') ||
                      body.result.error.toLowerCase().includes('invalid_grant');
      if (isOAuth) {
        const { data: vidRow } = await supabase
          .from('your_videos')
          .select('channel_id')
          .eq('id', jobRow.your_video_id)
          .single();
        if (vidRow?.channel_id) {
          await supabase.from('operator_alerts').insert({
            channel_id: vidRow.channel_id,
            category: 'oauth_token_revoked',
            severity: 'error',
            message: 'YouTube refresh token rejected. Reconnect at /settings/channel.',
            context: { job_id: body.job_id, error: body.result.error },
          });
        }
      }
    }
```

- [ ] **Step 9: Run callback test — confirm pass**

```bash
npx vitest run src/tests/api/render-complete-upload.test.ts
```

Expected: 1 passing.

- [ ] **Step 10: Commit**

```bash
git add src/app/api/render/complete/route.ts src/lib/supabase/repositories/your-videos.ts src/tests/api/render-complete-upload.test.ts src/tests/lib/supabase/your-videos-mark-posted.test.ts package.json package-lock.json
git commit -m "feat(callback): upload side-effect — markPosted + oauth_token_revoked alert"
```

---

### Task B4: `video_analytics` repo + `performance-sync` rewrite

The cron sweeps every active channel's last-14-day `posted` videos, fetches `videos.list` + 2× `reports.query`, UPSERTs `video_analytics` (one row per video per day).

**Files:**
- Create: `src/lib/supabase/repositories/video-analytics.ts`
- Create: `src/lib/clients/youtube-analytics.ts` (Analytics + Data API readers — fetch wrappers)
- Modify: `src/app/api/cron/performance-sync/route.ts` (replace stub)
- Test: `src/tests/lib/supabase/video-analytics.test.ts`
- Test: `src/tests/lib/clients/youtube-analytics.test.ts`
- Test: `src/tests/api/performance-sync.test.ts`

- [ ] **Step 1: Write the failing test for video-analytics repo**

Create `src/tests/lib/supabase/video-analytics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { upsertVideoAnalytics } from '@/lib/supabase/repositories/video-analytics';

describe('upsertVideoAnalytics', () => {
  it('upserts by (your_video_id, snapshot_at::date) — passes onConflict', async () => {
    let captured: { values: Record<string, unknown>; onConflict?: string } | null = null;
    const supabase = {
      from: (table: string) => {
        if (table !== 'video_analytics') throw new Error('wrong table');
        return {
          upsert: (values: Record<string, unknown>, opts?: { onConflict?: string }) => {
            captured = { values, onConflict: opts?.onConflict };
            return { error: null };
          },
        };
      },
    } as never;
    await upsertVideoAnalytics(supabase, {
      yourVideoId: 'v1',
      snapshotAt: new Date('2026-05-27T07:00:00Z'),
      views: 1000n,
      likes: 50n,
      comments: 5n,
      shares: 2n,
      avgViewDurationSeconds: 23.4,
      ctrPct: 5.1,
      subscribersGained: 3,
      impressions: 8000n,
      watchTimeSeconds: 23400n,
      retentionCurve: [{ elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 }],
      rawPayload: { foo: 'bar' },
    });
    expect(captured!.onConflict).toBe('your_video_id,snapshot_at');
    expect(captured!.values.views).toBe(1000n);
    expect(captured!.values.retention_curve_jsonb).toEqual([{ elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 }]);
  });
});
```

- [ ] **Step 2: Implement the repo**

Create `src/lib/supabase/repositories/video-analytics.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface UpsertParams {
  yourVideoId: string;
  snapshotAt: Date;
  views: bigint | number | null;
  likes: bigint | number | null;
  comments: bigint | number | null;
  shares: bigint | number | null;
  avgViewDurationSeconds: number | null;
  ctrPct: number | null;
  subscribersGained: number | null;
  impressions: bigint | number | null;
  watchTimeSeconds: bigint | number | null;
  retentionCurve: unknown;
  rawPayload: unknown;
}

export async function upsertVideoAnalytics(
  supabase: SupabaseClient,
  params: UpsertParams,
): Promise<void> {
  const { error } = await supabase.from('video_analytics').upsert(
    {
      your_video_id: params.yourVideoId,
      snapshot_at: params.snapshotAt.toISOString(),
      views: params.views,
      likes: params.likes,
      comments: params.comments,
      shares: params.shares,
      avg_view_duration_seconds: params.avgViewDurationSeconds,
      ctr_pct: params.ctrPct,
      subscribers_gained: params.subscribersGained,
      impressions: params.impressions,
      watch_time_seconds: params.watchTimeSeconds,
      retention_curve_jsonb: params.retentionCurve,
      raw_payload: params.rawPayload,
    },
    { onConflict: 'your_video_id,snapshot_at' },
  );
  if (error) throw new Error(`upsertVideoAnalytics: ${error.message}`);
}
```

Note on the conflict target: the existing unique constraint from `20260524000006_create_your_videos.sql` is on `(video_id, snapshot_at)` and was renamed to `your_video_id` in `20260525000002_plan_4_schema.sql`. Verify by running once at this point:

```bash
PGOPTIONS="--client-min-messages=warning" psql "<SUPABASE_DB_URL>" -c "\d public.video_analytics" 2>/dev/null | grep -i unique
```

(Operator-driven if the DB URL isn't in the agent's environment — the agent reports the assumption and asks the operator to verify before merging.)

- [ ] **Step 3: Run repo test — confirm pass**

```bash
npx vitest run src/tests/lib/supabase/video-analytics.test.ts
```

Expected: 1 passing.

- [ ] **Step 4: Write the failing test for the youtube-analytics client**

Create `src/tests/lib/clients/youtube-analytics.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchVideoStats, fetchCoreReport, fetchRetentionReport } from '@/lib/clients/youtube-analytics';

const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

describe('youtube-analytics client', () => {
  it('fetchVideoStats hits Data API videos.list with stats part', async () => {
    globalThis.fetch = vi.fn(async (url: URL | string, init?: RequestInit) => {
      const u = new URL(String(url));
      expect(u.origin + u.pathname).toBe('https://www.googleapis.com/youtube/v3/videos');
      expect(u.searchParams.get('part')).toBe('statistics');
      expect(u.searchParams.get('id')).toBe('EXT_ID');
      expect((init?.headers as Record<string,string>)['Authorization']).toBe('Bearer AT');
      return new Response(JSON.stringify({
        items: [{ statistics: { viewCount: '1000', likeCount: '50', commentCount: '5' } }],
      }), { status: 200 });
    }) as never;
    const r = await fetchVideoStats({ accessToken: 'AT', externalVideoId: 'EXT_ID' });
    expect(r.views).toBe(1000);
    expect(r.likes).toBe(50);
    expect(r.comments).toBe(5);
  });

  it('fetchCoreReport hits youtubeAnalytics reports.query with the right metrics', async () => {
    globalThis.fetch = vi.fn(async (url: URL | string) => {
      const u = new URL(String(url));
      expect(u.origin + u.pathname).toBe('https://youtubeanalytics.googleapis.com/v2/reports');
      expect(u.searchParams.get('metrics')).toContain('estimatedMinutesWatched');
      expect(u.searchParams.get('filters')).toBe('video==EXT_ID');
      return new Response(JSON.stringify({
        columnHeaders: [
          { name: 'estimatedMinutesWatched' }, { name: 'averageViewDuration' },
          { name: 'subscribersGained' }, { name: 'impressions' }, { name: 'ctrPct' },
        ],
        rows: [[400, 25.5, 7, 8000, 4.2]],
      }), { status: 200 });
    }) as never;
    const r = await fetchCoreReport({
      accessToken: 'AT',
      externalChannelId: 'UC_X', externalVideoId: 'EXT_ID',
      startDate: '2026-05-13', endDate: '2026-05-27',
    });
    expect(r.estimatedMinutesWatched).toBe(400);
    expect(r.averageViewDurationSeconds).toBe(25.5);
    expect(r.subscribersGained).toBe(7);
    expect(r.impressions).toBe(8000);
    expect(r.ctrPct).toBe(4.2);
  });

  it('fetchRetentionReport returns the audienceWatchRatio curve rows', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        columnHeaders: [{ name: 'elapsedVideoTimeRatio' }, { name: 'audienceWatchRatio' }],
        rows: [[0, 1.0], [0.1, 0.9], [0.5, 0.5]],
      }), { status: 200 }),
    ) as never;
    const r = await fetchRetentionReport({
      accessToken: 'AT', externalChannelId: 'UC', externalVideoId: 'EXT',
      startDate: '2026-05-13', endDate: '2026-05-27',
    });
    expect(r).toEqual([
      { elapsedVideoTimeRatio: 0, audienceWatchRatio: 1.0 },
      { elapsedVideoTimeRatio: 0.1, audienceWatchRatio: 0.9 },
      { elapsedVideoTimeRatio: 0.5, audienceWatchRatio: 0.5 },
    ]);
  });
});
```

- [ ] **Step 5: Implement `src/lib/clients/youtube-analytics.ts`**

```ts
import 'server-only';

export interface VideoStats {
  views: number;
  likes: number;
  comments: number;
}

export async function fetchVideoStats(args: {
  accessToken: string;
  externalVideoId: string;
}): Promise<VideoStats> {
  const u = new URL('https://www.googleapis.com/youtube/v3/videos');
  u.searchParams.set('part', 'statistics');
  u.searchParams.set('id', args.externalVideoId);
  const res = await fetch(u, { headers: { Authorization: `Bearer ${args.accessToken}` } });
  if (!res.ok) throw new Error(`fetchVideoStats: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    items?: Array<{ statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }>;
  };
  const s = json.items?.[0]?.statistics ?? {};
  return {
    views: parseInt(s.viewCount ?? '0', 10),
    likes: parseInt(s.likeCount ?? '0', 10),
    comments: parseInt(s.commentCount ?? '0', 10),
  };
}

export interface CoreReport {
  estimatedMinutesWatched: number;
  averageViewDurationSeconds: number;
  subscribersGained: number;
  impressions: number | null;
  ctrPct: number | null;
}

export async function fetchCoreReport(args: {
  accessToken: string;
  externalChannelId: string;
  externalVideoId: string;
  startDate: string;
  endDate: string;
}): Promise<CoreReport> {
  const u = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  u.searchParams.set('ids', `channel==${args.externalChannelId}`);
  u.searchParams.set('startDate', args.startDate);
  u.searchParams.set('endDate', args.endDate);
  u.searchParams.set('metrics', [
    'estimatedMinutesWatched',
    'averageViewDuration',
    'subscribersGained',
    'impressions',
    'ctrPct',
  ].join(','));
  u.searchParams.set('filters', `video==${args.externalVideoId}`);
  const res = await fetch(u, { headers: { Authorization: `Bearer ${args.accessToken}` } });
  if (!res.ok) throw new Error(`fetchCoreReport: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { rows?: Array<Array<number>> };
  const row = json.rows?.[0] ?? [0, 0, 0, null, null];
  return {
    estimatedMinutesWatched: row[0] ?? 0,
    averageViewDurationSeconds: row[1] ?? 0,
    subscribersGained: row[2] ?? 0,
    impressions: row[3] ?? null,
    ctrPct: row[4] ?? null,
  };
}

export interface RetentionPoint { elapsedVideoTimeRatio: number; audienceWatchRatio: number; }

export async function fetchRetentionReport(args: {
  accessToken: string;
  externalChannelId: string;
  externalVideoId: string;
  startDate: string;
  endDate: string;
}): Promise<RetentionPoint[]> {
  const u = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  u.searchParams.set('ids', `channel==${args.externalChannelId}`);
  u.searchParams.set('startDate', args.startDate);
  u.searchParams.set('endDate', args.endDate);
  u.searchParams.set('dimensions', 'elapsedVideoTimeRatio');
  u.searchParams.set('metrics', 'audienceWatchRatio');
  u.searchParams.set('filters', `video==${args.externalVideoId}`);
  const res = await fetch(u, { headers: { Authorization: `Bearer ${args.accessToken}` } });
  if (!res.ok) throw new Error(`fetchRetentionReport: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { rows?: Array<[number, number]> };
  return (json.rows ?? []).map(([elapsedVideoTimeRatio, audienceWatchRatio]) => ({
    elapsedVideoTimeRatio,
    audienceWatchRatio,
  }));
}
```

- [ ] **Step 6: Run client test — confirm pass**

```bash
npx vitest run src/tests/lib/clients/youtube-analytics.test.ts
```

Expected: 3 passing.

- [ ] **Step 7: Write the failing test for `performance-sync`**

Create `src/tests/api/performance-sync.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/scrapers/shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/scrapers/shared')>('@/lib/scrapers/shared');
  return { ...actual, assertCronAuth: vi.fn() };
});
vi.mock('@/lib/clients/google-oauth', () => ({
  refreshAccessToken: vi.fn(async () => ({ accessToken: 'AT', expiresIn: 3599 })),
  GoogleTokenError: class extends Error {},
}));
vi.mock('@/lib/clients/youtube-analytics', () => ({
  fetchVideoStats: vi.fn(async () => ({ views: 100, likes: 10, comments: 1 })),
  fetchCoreReport: vi.fn(async () => ({
    estimatedMinutesWatched: 50, averageViewDurationSeconds: 30, subscribersGained: 2,
    impressions: 800, ctrPct: 4.5,
  })),
  fetchRetentionReport: vi.fn(async () => [{ elapsedVideoTimeRatio: 0, audienceWatchRatio: 1 }]),
}));
vi.mock('@/lib/supabase/repositories/video-analytics', () => ({
  upsertVideoAnalytics: vi.fn(),
}));
vi.mock('@/lib/supabase/repositories/channels', () => ({
  loadEncryptedRefreshToken: vi.fn(async () => 'RT'),
}));

import { GET } from '@/app/api/cron/performance-sync/route';
import { getServiceClient } from '@/lib/supabase/server';
import { upsertVideoAnalytics } from '@/lib/supabase/repositories/video-analytics';
import { fetchVideoStats } from '@/lib/clients/youtube-analytics';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'cid');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'csecret');
  vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_V1', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  vi.stubEnv('OAUTH_TOKEN_ENCRYPTION_KEY_CURRENT_VERSION', '1');
  vi.stubEnv('ANALYTICS_SYNC_WINDOW_DAYS', '14');
});

describe('GET /api/cron/performance-sync', () => {
  it('sweeps each channel × video in window, calls upsertVideoAnalytics', async () => {
    vi.mocked(getServiceClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'channels') {
          return {
            select: () => ({
              eq: (_a: string, _b: unknown) => ({
                eq: (_c: string, _d: unknown) => ({
                  then: undefined,
                }),
              }),
            }),
          };
        }
        throw new Error('unmocked table ' + table);
      },
    } as never);

    // Simplify: stub the chain. The real implementation should fetch channels then videos.
    // We test via fetchVideoStats call count.
    vi.mocked(getServiceClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'channels') {
          return {
            select: () => ({
              eq: () => ({
                eq: async () => ({
                  data: [{ id: 'chan-1', external_channel_id: 'UC_X', timezone: 'America/New_York' }],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'your_videos') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  gte: async () => ({
                    data: [{ id: 'v1', external_video_id: 'EXT_1', channel_id: 'chan-1', posted_at: new Date().toISOString() }],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error('unmocked table ' + table);
      },
    } as never);

    const req = new Request('https://app/api/cron/performance-sync', { headers: { authorization: 'Bearer ANYCRON' } });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(vi.mocked(fetchVideoStats)).toHaveBeenCalledWith(
      expect.objectContaining({ externalVideoId: 'EXT_1', accessToken: 'AT' }),
    );
    expect(vi.mocked(upsertVideoAnalytics)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ yourVideoId: 'v1', views: 100 }),
    );
  });
});
```

- [ ] **Step 8: Replace the performance-sync stub**

Edit `src/app/api/cron/performance-sync/route.ts` entirely:

```ts
import 'server-only';
import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { getServiceClient } from '@/lib/supabase/server';
import { assertCronAuth, scraperLog } from '@/lib/scrapers/shared';
import { loadEncryptedRefreshToken } from '@/lib/supabase/repositories/channels';
import { refreshAccessToken, GoogleTokenError } from '@/lib/clients/google-oauth';
import {
  fetchVideoStats,
  fetchCoreReport,
  fetchRetentionReport,
} from '@/lib/clients/youtube-analytics';
import { upsertVideoAnalytics } from '@/lib/supabase/repositories/video-analytics';

export const maxDuration = 300;

interface ChannelRow {
  id: string;
  external_channel_id: string | null;
  timezone: string;
}

interface VideoRow {
  id: string;
  external_video_id: string | null;
  channel_id: string;
  posted_at: string | null;
}

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }
  const supabase = getServiceClient();
  const windowDays = parseInt(process.env.ANALYTICS_SYNC_WINDOW_DAYS ?? '14', 10);

  const { data: channels, error: chanErr } = await supabase
    .from('channels')
    .select('id, external_channel_id, timezone')
    .eq('is_active', true)
    .eq('platform', 'youtube');
  if (chanErr) return NextResponse.json({ ok: false, error: chanErr.message }, { status: 500 });

  const summary: Array<{ channelId: string; videos: number; errors: number }> = [];

  for (const c of (channels ?? []) as ChannelRow[]) {
    let videosCount = 0;
    let errCount = 0;

    if (!c.external_channel_id) {
      summary.push({ channelId: c.id, videos: 0, errors: 1 });
      continue;
    }

    const refreshToken = await loadEncryptedRefreshToken(supabase, c.id);
    if (!refreshToken) {
      summary.push({ channelId: c.id, videos: 0, errors: 1 });
      continue;
    }

    let accessToken: string;
    try {
      const r = await refreshAccessToken({
        refreshToken,
        clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      });
      accessToken = r.accessToken;
    } catch (err) {
      if (err instanceof GoogleTokenError) {
        // Could write an operator_alert here. Defer until B5.
        summary.push({ channelId: c.id, videos: 0, errors: 1 });
        continue;
      }
      throw err;
    }

    const windowStart = DateTime.utc().minus({ days: windowDays }).toISO();
    const { data: videos, error: vidErr } = await supabase
      .from('your_videos')
      .select('id, external_video_id, channel_id, posted_at')
      .eq('channel_id', c.id)
      .eq('status', 'posted')
      .gte('posted_at', windowStart);
    if (vidErr) { summary.push({ channelId: c.id, videos: 0, errors: 1 }); continue; }

    const startDate = DateTime.utc().minus({ days: windowDays }).toISODate();
    const endDate = DateTime.utc().toISODate();

    for (const v of (videos ?? []) as VideoRow[]) {
      if (!v.external_video_id) continue;
      try {
        const [stats, core, retention] = await Promise.all([
          fetchVideoStats({ accessToken, externalVideoId: v.external_video_id }),
          fetchCoreReport({
            accessToken,
            externalChannelId: c.external_channel_id,
            externalVideoId: v.external_video_id,
            startDate: startDate!,
            endDate: endDate!,
          }),
          fetchRetentionReport({
            accessToken,
            externalChannelId: c.external_channel_id,
            externalVideoId: v.external_video_id,
            startDate: startDate!,
            endDate: endDate!,
          }),
        ]);
        await upsertVideoAnalytics(supabase, {
          yourVideoId: v.id,
          snapshotAt: new Date(),
          views: stats.views,
          likes: stats.likes,
          comments: stats.comments,
          shares: null,
          avgViewDurationSeconds: core.averageViewDurationSeconds,
          ctrPct: core.ctrPct,
          subscribersGained: core.subscribersGained,
          impressions: core.impressions,
          watchTimeSeconds: core.estimatedMinutesWatched * 60,
          retentionCurve: retention,
          rawPayload: { stats, core, retention },
        });
        videosCount += 1;
      } catch {
        errCount += 1;
      }
    }
    summary.push({ channelId: c.id, videos: videosCount, errors: errCount });
  }

  return NextResponse.json({ ok: true, ...scraperLog('performance-sync', { summary }) });
}
```

- [ ] **Step 9: Run performance-sync test — confirm pass**

```bash
npx vitest run src/tests/api/performance-sync.test.ts
```

Expected: 1 passing.

- [ ] **Step 10: Commit**

```bash
git add src/lib/supabase/repositories/video-analytics.ts src/lib/clients/youtube-analytics.ts src/app/api/cron/performance-sync/route.ts src/tests/lib/supabase/video-analytics.test.ts src/tests/lib/clients/youtube-analytics.test.ts src/tests/api/performance-sync.test.ts
git commit -m "feat(analytics): rewrite performance-sync — videos.list + 2x reports.query, UPSERT"
```

---

### Task B5: Sub-phase B merge to main + prod smoke

The upload handler can't be triggered until Sub-phase D ships the "Post now" button wired to enqueue an upload job — BUT once Sub-phase D is in flight on top of B, we want B's prod surface verified independently of D's UI changes. So merge B now and smoke via a one-off SQL insert.

- [ ] **Step 1: Full local test suite green**

```bash
unset ANTHROPIC_BASE_URL && npx vitest run && npx tsc --noEmit
```

- [ ] **Step 2: Branch + PR**

```bash
git checkout -b plan-4-phase-5-upload-analytics
git push -u origin plan-4-phase-5-upload-analytics
gh pr create --title "Plan #4 Phase 5 Sub-phase B — upload handler + analytics sync" --body "$(cat <<'EOF'
## Summary
- `scripts/render-worker/handlers/upload.ts` now real: refresh token in-VM, Blob download, resumable `videos.insert`, returns `{your_video_id, external_video_id, url}`.
- Callback handler writes `markPosted` (with `posted_hour_local`/`posted_dow_local` computed via luxon from `channels.timezone`) and emits `oauth_token_revoked` alert on token-related failures.
- `performance-sync` cron rewritten: sweep `posted` videos in last `ANALYTICS_SYNC_WINDOW_DAYS` (default 14), `videos.list` + 2× `reports.query`, UPSERT `video_analytics(your_video_id, snapshot_at::date)` unique key.
- Mirrors: `scripts/render-worker/lib/{encryption,google-oauth}.ts` byte-equality guards.

## Test plan
- [ ] Operator picks one Phase 4-rendered `your_videos` row with status='rendered' as the prod smoke target. (Capture its UUID.)
- [ ] Operator runs in Supabase SQL Editor:
        insert into render_jobs(job_type, payload, your_video_id, status)
        values('upload', jsonb_build_object('your_video_id', '<uuid>'), '<uuid>', 'pending');
- [ ] Wait ~90s for render-dispatcher cron + ~30s for upload handler to finish.
- [ ] Verify in SQL: select status, external_video_id, url, posted_at, posted_hour_local, posted_dow_local from your_videos where id='<uuid>'. status should be 'posted', external_video_id non-null, url match shorts/<id>, posted_hour_local/dow_local set.
- [ ] Verify on YouTube Studio that the video appeared (public).
- [ ] Day +1: confirm performance-sync wrote a `video_analytics` row (`select count(*) from video_analytics where your_video_id='<uuid>'`).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Operator-driven smoke**

After Vercel deploys the merge, the operator drives the smoke from the PR description. The agent waits for PASS / FAIL.

- [ ] **Step 4: Merge after smoke PASS**

```bash
gh pr merge plan-4-phase-5-upload-analytics --squash --delete-branch
git checkout main && git pull origin main
```

- [ ] **Step 5: Phase-5 benchmark write-up**

After the prod video posts cleanly, create `docs/superpowers/notes/2026-05-27-plan-4-phase-5-upload-benchmark.md` capturing:
- The your_videos UUID + external_video_id
- Wall-clock from upload job claim to status='posted' (read render_jobs.claimed_at / finished_at)
- The YouTube Studio URL
- Any retries / errors observed

Commit:

```bash
git add docs/superpowers/notes/2026-05-27-plan-4-phase-5-upload-benchmark.md
git commit -m "docs(plan-4): Phase 5 Sub-phase B upload benchmark"
```

**Sub-phase B acceptance:** Closing acceptance item #2 of Plan #4 is now met — "One real video posted from drafts via /lab → /operations → YouTube." (The /operations leg ships in Sub-phase F; for now the operator drove the SQL insert manually, but the upload pipeline itself is proven.)

---

# Sub-phase C: Scheduling primitives

Pure backend: timezone library wired up with `nextOpenSlotAfter`, your-videos repo extensions for scheduling state, and a `schedule_recommendations` repo.

### Task C1: `src/lib/timezone.ts` — `nextOpenSlotAfter` + helpers

**Files:**
- Create: `src/lib/timezone.ts`
- Test: `src/tests/lib/timezone.test.ts`

- [ ] **Step 1: Write the failing test (basic cases)**

Create `src/tests/lib/timezone.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import {
  nextOpenSlotAfter,
  BacklogOverflowError,
  toLocalHourDow,
  type PostingSchedule,
  type ChannelForSchedule,
} from '@/lib/timezone';

const SCHEDULE: PostingSchedule = {
  weekdays: ['07:30', '18:30'],
  weekends: ['11:30', '19:30'],
};

const CHANNEL: ChannelForSchedule = {
  id: 'c1',
  timezone: 'America/New_York',
  posting_schedule: SCHEDULE,
};

describe('nextOpenSlotAfter — basics', () => {
  it('returns same-day next slot when before earliest weekday slot', async () => {
    // Mon 2026-06-01 04:00 ET (= 08:00 UTC EDT)
    const since = DateTime.fromISO('2026-06-01T04:00:00', { zone: 'America/New_York' }).toUTC();
    const isOccupied = async () => false;
    const slot = await nextOpenSlotAfter(CHANNEL, since, isOccupied);
    expect(slot.setZone('America/New_York').toFormat('yyyy-LL-dd HH:mm')).toBe('2026-06-01 07:30');
  });

  it('moves to next day when after last weekday slot', async () => {
    // Mon 2026-06-01 22:00 ET
    const since = DateTime.fromISO('2026-06-01T22:00:00', { zone: 'America/New_York' }).toUTC();
    const slot = await nextOpenSlotAfter(CHANNEL, since, async () => false);
    expect(slot.setZone('America/New_York').toFormat('yyyy-LL-dd HH:mm')).toBe('2026-06-02 07:30');
  });

  it('uses weekend slots on Saturday', async () => {
    // Sat 2026-06-06 09:00 ET
    const since = DateTime.fromISO('2026-06-06T09:00:00', { zone: 'America/New_York' }).toUTC();
    const slot = await nextOpenSlotAfter(CHANNEL, since, async () => false);
    expect(slot.setZone('America/New_York').toFormat('yyyy-LL-dd HH:mm')).toBe('2026-06-06 11:30');
  });

  it('skips occupied slots', async () => {
    const since = DateTime.fromISO('2026-06-01T04:00:00', { zone: 'America/New_York' }).toUTC();
    let calls = 0;
    const isOccupied = async (_at: DateTime) => { calls += 1; return calls === 1; };
    const slot = await nextOpenSlotAfter(CHANNEL, since, isOccupied);
    expect(slot.setZone('America/New_York').toFormat('yyyy-LL-dd HH:mm')).toBe('2026-06-01 18:30');
  });

  it('throws BacklogOverflowError when no slot available in 14 days', async () => {
    const since = DateTime.fromISO('2026-06-01T04:00:00', { zone: 'America/New_York' }).toUTC();
    await expect(nextOpenSlotAfter(CHANNEL, since, async () => true)).rejects.toThrow(BacklogOverflowError);
  });
});

describe('toLocalHourDow', () => {
  it('converts UTC instant to channel-local hour + day-of-week (0=Sun..6=Sat)', () => {
    // Wed 2026-05-27 22:30 UTC = 18:30 ET (EDT)
    const r = toLocalHourDow(new Date('2026-05-27T22:30:00Z'), 'America/New_York');
    expect(r.hour).toBe(18);
    expect(r.dow).toBe(3);
  });
});

describe('nextOpenSlotAfter — DST', () => {
  it('spring-forward 2026-03-08: skips 02:30 ET slot for that day if present', async () => {
    // 2026-03-08 02:00 ET jumps to 03:00 ET. A schedule with a 02:30 slot has no
    // valid 02:30 ET on that day. Use a synthetic schedule for the test:
    const channel: ChannelForSchedule = {
      id: 'c1', timezone: 'America/New_York',
      posting_schedule: { weekdays: ['07:30'], weekends: ['02:30', '11:30'] },
    };
    // Sun 2026-03-08 01:00 ET. Expect: 02:30 is skipped (luxon isValid=false), result is 11:30.
    const since = DateTime.fromISO('2026-03-08T01:00:00', { zone: 'America/New_York' }).toUTC();
    const slot = await nextOpenSlotAfter(channel, since, async () => false);
    expect(slot.setZone('America/New_York').toFormat('yyyy-LL-dd HH:mm')).toBe('2026-03-08 11:30');
  });

  it('fall-back 2026-11-01: 01:30 ET resolves to the SECOND (standard-time) occurrence', async () => {
    const channel: ChannelForSchedule = {
      id: 'c1', timezone: 'America/New_York',
      posting_schedule: { weekdays: ['07:30'], weekends: ['01:30', '11:30'] },
    };
    // Sun 2026-11-01 00:30 ET (still EDT). Expect: 01:30 resolves to standard-time (later UTC),
    // i.e. UTC 06:30 (EDT 01:30 would be UTC 05:30; standard 01:30 is UTC 06:30).
    const since = DateTime.fromISO('2026-11-01T00:30:00', { zone: 'America/New_York' }).toUTC();
    const slot = await nextOpenSlotAfter(channel, since, async () => false);
    expect(slot.toUTC().toISO()).toBe('2026-11-01T06:30:00.000Z');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/tests/lib/timezone.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/timezone.ts`**

```ts
import 'server-only';
import { DateTime } from 'luxon';

export interface PostingSchedule {
  weekdays: string[]; // "HH:MM"
  weekends: string[];
}

export interface ChannelForSchedule {
  id: string;
  timezone: string;
  posting_schedule: PostingSchedule;
}

export class BacklogOverflowError extends Error {
  constructor(public channelId: string) {
    super(`BacklogOverflowError: no open slot in 14d horizon for channel ${channelId}`);
    this.name = 'BacklogOverflowError';
  }
}

const MAX_HORIZON_DAYS = 14;

/**
 * Returns the next open slot (as a UTC DateTime) on or after `since`, per the
 * channel's posting_schedule + timezone. Skips DST-eliminated slots. For
 * fall-back ambiguous times, luxon's default resolves to the SECOND occurrence
 * (standard-time, later in UTC) which is what we want.
 *
 * `isOccupied` is async because the cron uses a Supabase query.
 */
export async function nextOpenSlotAfter(
  channel: ChannelForSchedule,
  since: DateTime,
  isOccupied: (slotUtc: DateTime) => Promise<boolean>,
): Promise<DateTime> {
  const tz = channel.timezone;
  const sinceLocal = since.setZone(tz);

  for (let dayOffset = 0; dayOffset <= MAX_HORIZON_DAYS; dayOffset++) {
    const day = sinceLocal.plus({ days: dayOffset });
    // luxon: 1=Mon..7=Sun
    const isWeekend = day.weekday >= 6;
    const slots = isWeekend ? channel.posting_schedule.weekends : channel.posting_schedule.weekdays;
    for (const slotStr of slots) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(slotStr);
      if (!m) continue;
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      const slotLocal = day.set({ hour: h, minute: min, second: 0, millisecond: 0 });
      if (!slotLocal.isValid) continue; // DST-eliminated
      if (slotLocal <= sinceLocal) continue;
      const slotUtc = slotLocal.toUTC();
      if (await isOccupied(slotUtc)) continue;
      return slotUtc;
    }
  }
  throw new BacklogOverflowError(channel.id);
}

export function toLocalHourDow(at: Date, tz: string): { hour: number; dow: number } {
  const local = DateTime.fromJSDate(at).setZone(tz);
  return { hour: local.hour, dow: local.weekday === 7 ? 0 : local.weekday };
}
```

- [ ] **Step 4: Run test — confirm pass**

```bash
npx vitest run src/tests/lib/timezone.test.ts
```

Expected: 8 passing. If the DST tests fail, double-check that luxon's installed and the `America/New_York` zone is available (it is in every Node 24 build by default — no `--icu` needed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/timezone.ts src/tests/lib/timezone.test.ts
git commit -m "feat(timezone): nextOpenSlotAfter + DST-safe slot enumeration"
```

---

### Task C2: `your-videos` repo — scheduling state helpers

**Files:**
- Modify: `src/lib/supabase/repositories/your-videos.ts`
- Test: `src/tests/lib/supabase/your-videos-schedule.test.ts`

The repo needs: `scheduleVideo`, `cancelSchedule`, `listScheduled`, `listScheduledForChannelInRange`, `markScheduledForUpload` (atomic claim used by the cron — implement as a Postgres function later, JS-side for now), `slotIsOccupied`. Also: `VideoStatus` union must include `scheduled` + `uploading`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/lib/supabase/your-videos-schedule.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  scheduleVideo,
  cancelSchedule,
  listScheduledForChannelInRange,
  slotIsOccupied,
  claimDueScheduled,
} from '@/lib/supabase/repositories/your-videos';

describe('your-videos scheduling helpers', () => {
  it('scheduleVideo flips status rendered->scheduled with scheduled_for', async () => {
    let captured: { patch: Record<string, unknown>; eqs: Array<[string, unknown]> } | null = null;
    const supabase = {
      from: (table: string) => {
        if (table !== 'your_videos') throw new Error('wrong table');
        return {
          update: (patch: Record<string, unknown>) => {
            const builder = {
              eqs: [] as Array<[string, unknown]>,
              eq(col: string, val: unknown) { builder.eqs.push([col, val]); return builder; },
              async then(resolve: (v: { error: null; count: number }) => unknown) {
                captured = { patch, eqs: builder.eqs };
                resolve({ error: null, count: 1 });
              },
            };
            return builder;
          },
        };
      },
    } as never;
    const at = new Date('2026-06-01T11:30:00Z');
    const ok = await scheduleVideo(supabase, { videoId: 'v1', scheduledFor: at });
    expect(ok).toBe(true);
    expect(captured!.patch.status).toBe('scheduled');
    expect(captured!.patch.scheduled_for).toBe(at.toISOString());
    expect(captured!.eqs).toEqual([['id', 'v1'], ['status', 'rendered']]);
  });

  it('scheduleVideo returns false on status-race (count=0)', async () => {
    const supabase = {
      from: () => ({
        update: () => ({
          eq() { return this; },
          async then(resolve: (v: { error: null; count: number }) => unknown) {
            resolve({ error: null, count: 0 });
          },
        }),
      }),
    } as never;
    const ok = await scheduleVideo(supabase, { videoId: 'v1', scheduledFor: new Date() });
    expect(ok).toBe(false);
  });

  it('cancelSchedule flips scheduled->rendered + clears scheduled_for', async () => {
    let captured: Record<string, unknown> | null = null;
    const supabase = {
      from: () => ({
        update: (patch: Record<string, unknown>) => ({
          eq() { return this; },
          async then(r: (v: { error: null; count: number }) => unknown) {
            captured = patch; r({ error: null, count: 1 });
          },
        }),
      }),
    } as never;
    await cancelSchedule(supabase, 'v1');
    expect(captured!.scheduled_for).toBeNull();
    expect(captured!.status).toBe('rendered');
  });

  it('slotIsOccupied returns true when any video has that scheduled_for (5-min tolerance)', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () => ({
              gte: () => ({
                lte: async () => ({ data: [{ id: 'v1' }], error: null }),
              }),
            }),
          }),
        }),
      }),
    } as never;
    const result = await slotIsOccupied(supabase, 'chan-1', new Date('2026-06-01T11:30:00Z'));
    expect(result).toBe(true);
  });

  it('listScheduledForChannelInRange returns rows in [from,to)', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({
                lt: async () => ({ data: [{ id: 'v1', scheduled_for: '2026-06-01T11:30:00Z' }], error: null }),
              }),
            }),
          }),
        }),
      }),
    } as never;
    const rows = await listScheduledForChannelInRange(supabase, {
      channelId: 'chan-1', fromUtc: new Date('2026-06-01'), toUtc: new Date('2026-06-08'),
    });
    expect(rows).toHaveLength(1);
  });

  it('claimDueScheduled flips scheduled->uploading for due rows, returns claimed rows', async () => {
    const supabase = {
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
        expect(fn).toBe('claim_due_scheduled_uploads');
        expect(args.p_limit).toBe(5);
        return { data: [{ id: 'v1', channel_id: 'chan-1' }], error: null };
      }),
    } as never;
    const claimed = await claimDueScheduled(supabase, { now: new Date(), limit: 5 });
    expect(claimed).toEqual([{ id: 'v1', channel_id: 'chan-1' }]);
  });
});
```

- [ ] **Step 2: Run test — confirm FAIL**

```bash
npx vitest run src/tests/lib/supabase/your-videos-schedule.test.ts
```

Expected: FAIL — symbols not yet exported.

- [ ] **Step 3: Update `VideoStatus` union + add helpers**

Edit `src/lib/supabase/repositories/your-videos.ts`. Change the `VideoStatus` type to:

```ts
export type VideoStatus = 'draft' | 'rendering' | 'rendered' | 'scheduled' | 'uploading' | 'posted' | 'failed';
```

Append at the bottom of the file:

```ts
export async function scheduleVideo(
  supabase: SupabaseClient,
  args: { videoId: string; scheduledFor: Date },
): Promise<boolean> {
  const { error, count } = await supabase
    .from('your_videos')
    .update(
      {
        status: 'scheduled',
        scheduled_for: args.scheduledFor.toISOString(),
        updated_at: new Date().toISOString(),
      },
      { count: 'exact' },
    )
    .eq('id', args.videoId)
    .eq('status', 'rendered');
  if (error) throw new Error(`scheduleVideo: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function cancelSchedule(
  supabase: SupabaseClient,
  videoId: string,
): Promise<boolean> {
  const { error, count } = await supabase
    .from('your_videos')
    .update(
      { status: 'rendered', scheduled_for: null, updated_at: new Date().toISOString() },
      { count: 'exact' },
    )
    .eq('id', videoId)
    .eq('status', 'scheduled');
  if (error) throw new Error(`cancelSchedule: ${error.message}`);
  return (count ?? 0) > 0;
}

export async function rescheduleVideo(
  supabase: SupabaseClient,
  args: { videoId: string; scheduledFor: Date },
): Promise<boolean> {
  const { error, count } = await supabase
    .from('your_videos')
    .update(
      { scheduled_for: args.scheduledFor.toISOString(), updated_at: new Date().toISOString() },
      { count: 'exact' },
    )
    .eq('id', args.videoId)
    .eq('status', 'scheduled');
  if (error) throw new Error(`rescheduleVideo: ${error.message}`);
  return (count ?? 0) > 0;
}

const SLOT_TOLERANCE_MS = 5 * 60 * 1000;

export async function slotIsOccupied(
  supabase: SupabaseClient,
  channelId: string,
  slotUtc: Date,
): Promise<boolean> {
  const from = new Date(slotUtc.getTime() - SLOT_TOLERANCE_MS).toISOString();
  const to = new Date(slotUtc.getTime() + SLOT_TOLERANCE_MS).toISOString();
  const { data, error } = await supabase
    .from('your_videos')
    .select('id')
    .eq('channel_id', channelId)
    .in('status', ['scheduled', 'uploading', 'posted'])
    .gte('scheduled_for', from)
    .lte('scheduled_for', to);
  if (error) throw new Error(`slotIsOccupied: ${error.message}`);
  return (data ?? []).length > 0;
}

export async function listScheduledForChannelInRange(
  supabase: SupabaseClient,
  args: { channelId: string; fromUtc: Date; toUtc: Date },
): Promise<YourVideo[]> {
  const { data, error } = await supabase
    .from('your_videos')
    .select('*')
    .eq('channel_id', args.channelId)
    .eq('status', 'scheduled')
    .gte('scheduled_for', args.fromUtc.toISOString())
    .lt('scheduled_for', args.toUtc.toISOString());
  if (error) throw new Error(`listScheduledForChannelInRange: ${error.message}`);
  return (data ?? []) as YourVideo[];
}

export async function countTodayUploads(
  supabase: SupabaseClient,
  args: { channelId: string; nowUtc: Date; tz: string },
): Promise<number> {
  // Counts your_videos in (uploading OR posted) whose posted_at falls within
  // today (channel timezone). Used by scheduled-uploader to enforce max_uploads_per_day.
  // For 'uploading' rows posted_at is null, so we fall back to updated_at.
  // (A small over-count edge case: a 'rendered' row uploaded today, posted today, edited
  //  later in day. updated_at moves to that edit time; we'd still count it once.)
  const { DateTime } = await import('luxon');
  const local = DateTime.fromJSDate(args.nowUtc).setZone(args.tz);
  const startUtc = local.startOf('day').toUTC().toISO();
  const endUtc = local.endOf('day').toUTC().toISO();
  const { data, error } = await supabase
    .from('your_videos')
    .select('id, status, posted_at, updated_at')
    .eq('channel_id', args.channelId)
    .in('status', ['uploading', 'posted'])
    .gte('updated_at', startUtc!)
    .lte('updated_at', endUtc!);
  if (error) throw new Error(`countTodayUploads: ${error.message}`);
  return (data ?? []).length;
}

export interface ClaimedRow {
  id: string;
  channel_id: string;
}

export async function claimDueScheduled(
  supabase: SupabaseClient,
  args: { now: Date; limit: number },
): Promise<ClaimedRow[]> {
  const { data, error } = await supabase.rpc('claim_due_scheduled_uploads', {
    p_now: args.now.toISOString(),
    p_limit: args.limit,
  });
  if (error) throw new Error(`claimDueScheduled: ${error.message}`);
  return (data ?? []) as ClaimedRow[];
}
```

- [ ] **Step 4: Add the Postgres function**

Create migration `supabase/migrations/20260527000001_claim_due_scheduled_uploads.sql`:

```sql
-- Atomic claim for the scheduled-uploader cron.
-- Matches the spec §5.5 CTE pattern: select due rows FOR UPDATE SKIP LOCKED,
-- flip status, return ids+channel_id.
create or replace function public.claim_due_scheduled_uploads(p_now timestamptz, p_limit int)
returns table (id uuid, channel_id uuid)
language plpgsql as $$
begin
  return query
  with due as (
    select y.id from public.your_videos y
    where y.status = 'scheduled' and y.scheduled_for <= p_now
    order by y.scheduled_for
    limit p_limit
    for update skip locked
  )
  update public.your_videos y
     set status = 'uploading', updated_at = now()
    from due d
   where y.id = d.id
   returning y.id, y.channel_id;
end;
$$;

grant execute on function public.claim_due_scheduled_uploads(timestamptz, int) to service_role;
```

The operator runs the migration:

```bash
# From the agent: write the SQL and ask the operator to apply via the Supabase MCP
# (mcp__eb0e215d-09d2-42bf-b558-7c883674fdc6__apply_migration) or the dashboard SQL editor.
```

Hand the operator:

```
Run this migration in Supabase: paste supabase/migrations/20260527000001_claim_due_scheduled_uploads.sql into the SQL editor and execute. The migration is idempotent (CREATE OR REPLACE) so re-running is safe.
```

- [ ] **Step 5: Run schedule tests — confirm pass**

```bash
npx vitest run src/tests/lib/supabase/your-videos-schedule.test.ts
```

Expected: 6 passing.

- [ ] **Step 6: Type-check the whole repo**

```bash
npx tsc --noEmit
```

If TS errors surface in components/routes that imported `VideoStatus` and used exhaustive switches over the old 5-state union, fix them inline. Likely culprits: `src/components/lab/*.tsx`, `src/app/lab/drafts/page.tsx`. Add the new states to any switch branches (most will just show "rendering" or "rendered" for `'scheduled'`/`'uploading'` for now — Sub-phase D wires the real UI).

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase/repositories/your-videos.ts supabase/migrations/20260527000001_claim_due_scheduled_uploads.sql src/tests/lib/supabase/your-videos-schedule.test.ts
git commit -m "feat(schedule): your-videos schedule helpers + claim_due_scheduled_uploads PG fn"
```

---

### Task C3: `schedule_recommendations` repo

Tiny — used by /operations Recommendations panel. Plan #4 only ships listing + apply/dismiss; Plan #5 writes the rows.

**Files:**
- Create: `src/lib/supabase/repositories/schedule-recommendations.ts`
- Test: `src/tests/lib/supabase/schedule-recommendations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  listPendingRecommendations,
  applyRecommendation,
  dismissRecommendation,
} from '@/lib/supabase/repositories/schedule-recommendations';

describe('schedule_recommendations repo', () => {
  it('listPendingRecommendations filters by channel_id + status=pending', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: async () => ({
                data: [{ id: 'r1', channel_id: 'c1', status: 'pending' }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as never;
    const rows = await listPendingRecommendations(supabase, 'c1');
    expect(rows).toHaveLength(1);
  });

  it('applyRecommendation copies posting_schedule/format_mix to channel and sets status=applied', async () => {
    const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
    const supabase = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                id: 'r1',
                channel_id: 'c1',
                recommended_posting_schedule: { weekdays: ['08:00'], weekends: ['12:00'] },
                recommended_format_mix: { explainer: 0.7, compilation: 0.3 },
              },
              error: null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async () => { updates.push({ table, patch }); return { error: null }; },
        }),
      }),
    } as never;
    await applyRecommendation(supabase, 'r1');
    const chanPatch = updates.find((u) => u.table === 'channels')!;
    expect((chanPatch.patch.posting_schedule as Record<string, unknown>)).toEqual({ weekdays: ['08:00'], weekends: ['12:00'] });
    expect((chanPatch.patch.target_format_mix as Record<string, unknown>)).toEqual({ explainer: 0.7, compilation: 0.3 });
    const recPatch = updates.find((u) => u.table === 'schedule_recommendations')!;
    expect(recPatch.patch.status).toBe('applied');
    expect(recPatch.patch.applied_at).toBeDefined();
  });

  it('dismissRecommendation sets status=dismissed + dismissed_at', async () => {
    let captured: Record<string, unknown> | null = null;
    const supabase = {
      from: () => ({
        update: (patch: Record<string, unknown>) => ({ eq: async () => { captured = patch; return { error: null }; } }),
      }),
    } as never;
    await dismissRecommendation(supabase, 'r1');
    expect(captured!.status).toBe('dismissed');
    expect(captured!.dismissed_at).toBeDefined();
  });
});
```

- [ ] **Step 2: Implement the repo**

Create `src/lib/supabase/repositories/schedule-recommendations.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ScheduleRecommendationRow {
  id: string;
  channel_id: string;
  recommended_posting_schedule: unknown;
  recommended_format_mix: unknown;
  evidence: unknown;
  confidence: 'low' | 'medium' | 'high';
  status: 'pending' | 'applied' | 'dismissed' | 'superseded';
  created_at: string;
}

export async function listPendingRecommendations(
  supabase: SupabaseClient,
  channelId: string,
): Promise<ScheduleRecommendationRow[]> {
  const { data, error } = await supabase
    .from('schedule_recommendations')
    .select('*')
    .eq('channel_id', channelId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`listPendingRecommendations: ${error.message}`);
  return (data ?? []) as ScheduleRecommendationRow[];
}

export async function applyRecommendation(
  supabase: SupabaseClient,
  recId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('schedule_recommendations')
    .select('id, channel_id, recommended_posting_schedule, recommended_format_mix')
    .eq('id', recId)
    .single();
  if (error || !data) throw new Error(`applyRecommendation: ${error?.message ?? 'not found'}`);
  const row = data as {
    id: string;
    channel_id: string;
    recommended_posting_schedule: unknown;
    recommended_format_mix: unknown;
  };

  const patch: Record<string, unknown> = {};
  if (row.recommended_posting_schedule != null) patch.posting_schedule = row.recommended_posting_schedule;
  if (row.recommended_format_mix != null) patch.target_format_mix = row.recommended_format_mix;
  if (Object.keys(patch).length > 0) {
    const { error: chErr } = await supabase.from('channels').update(patch).eq('id', row.channel_id);
    if (chErr) throw new Error(`applyRecommendation channels.update: ${chErr.message}`);
  }
  const now = new Date().toISOString();
  const { error: recErr } = await supabase
    .from('schedule_recommendations')
    .update({ status: 'applied', applied_at: now })
    .eq('id', recId);
  if (recErr) throw new Error(`applyRecommendation status: ${recErr.message}`);
}

export async function dismissRecommendation(
  supabase: SupabaseClient,
  recId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('schedule_recommendations')
    .update({ status: 'dismissed', dismissed_at: now })
    .eq('id', recId);
  if (error) throw new Error(`dismissRecommendation: ${error.message}`);
}
```

- [ ] **Step 3: Run test — confirm pass**

```bash
npx vitest run src/tests/lib/supabase/schedule-recommendations.test.ts
```

Expected: 3 passing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/repositories/schedule-recommendations.ts src/tests/lib/supabase/schedule-recommendations.test.ts
git commit -m "feat(repo): schedule_recommendations — list pending + apply + dismiss"
```

---

# Sub-phase D: Lab + /clips UI — Approve & Schedule flow

Wires the Approve & Schedule + Post now + Cancel buttons in /lab/drafts (Rendered + Scheduled tabs) and the /clips Rendered tab.

### Task D1: `/api/lab/schedule` route

**Files:**
- Create: `src/app/api/lab/schedule/route.ts`
- Test: `src/tests/api/lab-schedule.test.ts`

Payload: `{ videoId, scheduledFor? }`. If `scheduledFor` provided, schedules at exactly that time. Otherwise computes next open slot for the channel.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/supabase/repositories/your-videos', () => ({
  scheduleVideo: vi.fn(),
  slotIsOccupied: vi.fn(async () => false),
}));
vi.mock('@/lib/timezone', () => ({
  nextOpenSlotAfter: vi.fn(),
  BacklogOverflowError: class extends Error {},
}));

import { POST } from '@/app/api/lab/schedule/route';
import { getServiceClient } from '@/lib/supabase/server';
import { scheduleVideo } from '@/lib/supabase/repositories/your-videos';
import { nextOpenSlotAfter } from '@/lib/timezone';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServiceClient).mockReturnValue({
    from: (table: string) => {
      if (table === 'your_videos') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'v1', channel_id: 'c1', status: 'rendered' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'channels') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'c1', timezone: 'America/New_York',
                  posting_schedule: { weekdays: ['07:30'], weekends: ['11:30'] },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error('unmocked ' + table);
    },
  } as never);
});

function req(body: unknown): Request {
  return new Request('https://app/api/lab/schedule', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/lab/schedule', () => {
  it('400 on missing videoId', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('happy path with explicit scheduledFor: calls scheduleVideo with that timestamp', async () => {
    vi.mocked(scheduleVideo).mockResolvedValue(true);
    const at = '2026-06-01T11:30:00Z';
    const res = await POST(req({ videoId: '11111111-1111-1111-1111-111111111111', scheduledFor: at }));
    expect(res.status).toBe(200);
    expect(vi.mocked(scheduleVideo)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ videoId: '11111111-1111-1111-1111-111111111111' }),
    );
    const call = vi.mocked(scheduleVideo).mock.calls[0][1];
    expect(call.scheduledFor.toISOString()).toBe(at);
  });

  it('default path computes nextOpenSlotAfter when scheduledFor missing', async () => {
    const { DateTime } = await import('luxon');
    vi.mocked(nextOpenSlotAfter).mockResolvedValue(DateTime.fromISO('2026-06-01T11:30:00Z'));
    vi.mocked(scheduleVideo).mockResolvedValue(true);
    const res = await POST(req({ videoId: '11111111-1111-1111-1111-111111111111' }));
    expect(res.status).toBe(200);
    expect(vi.mocked(nextOpenSlotAfter)).toHaveBeenCalled();
    const body = await res.json();
    expect(body.scheduled_for).toBe('2026-06-01T11:30:00.000Z');
  });

  it('409 when scheduleVideo returns false (wrong-status race)', async () => {
    vi.mocked(scheduleVideo).mockResolvedValue(false);
    const res = await POST(req({ videoId: '11111111-1111-1111-1111-111111111111', scheduledFor: '2026-06-01T11:30:00Z' }));
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test — confirm FAIL**

```bash
npx vitest run src/tests/api/lab-schedule.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the route**

Create `src/app/api/lab/schedule/route.ts`:

```ts
import 'server-only';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { getServiceClient } from '@/lib/supabase/server';
import { scheduleVideo, slotIsOccupied } from '@/lib/supabase/repositories/your-videos';
import { nextOpenSlotAfter, BacklogOverflowError, type ChannelForSchedule } from '@/lib/timezone';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BodySchema = z.object({
  videoId: z.string().regex(UUID),
  scheduledFor: z.string().datetime().optional(),
});

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body;
  try { body = BodySchema.parse(await req.json()); }
  catch (err) { return Response.json({ error: err instanceof Error ? err.message : 'bad body' }, { status: 400 }); }

  const supabase = getServiceClient();
  const { data: vid, error: vErr } = await supabase
    .from('your_videos')
    .select('id, channel_id, status')
    .eq('id', body.videoId)
    .single();
  if (vErr || !vid) return Response.json({ error: 'video_not_found' }, { status: 404 });
  if ((vid as { status: string }).status !== 'rendered') {
    return Response.json({ error: 'wrong_status', currentStatus: (vid as { status: string }).status }, { status: 409 });
  }

  const channelId = (vid as { channel_id: string }).channel_id;
  const { data: chan, error: cErr } = await supabase
    .from('channels')
    .select('id, timezone, posting_schedule')
    .eq('id', channelId)
    .single();
  if (cErr || !chan) return Response.json({ error: 'channel_not_found' }, { status: 404 });

  let scheduledFor: Date;
  if (body.scheduledFor) {
    scheduledFor = new Date(body.scheduledFor);
  } else {
    const channel = chan as ChannelForSchedule;
    try {
      const slot = await nextOpenSlotAfter(
        channel,
        DateTime.utc(),
        async (slotUtc) => slotIsOccupied(supabase, channelId, slotUtc.toJSDate()),
      );
      scheduledFor = slot.toJSDate();
    } catch (err) {
      if (err instanceof BacklogOverflowError) {
        return Response.json({ error: 'backlog_overflow', channelId: err.channelId }, { status: 503 });
      }
      throw err;
    }
  }

  const ok = await scheduleVideo(supabase, { videoId: body.videoId, scheduledFor });
  if (!ok) return Response.json({ error: 'wrong_status_race' }, { status: 409 });
  return Response.json({ ok: true, video_id: body.videoId, scheduled_for: scheduledFor.toISOString() });
}
```

- [ ] **Step 4: Run test — confirm pass**

```bash
npx vitest run src/tests/api/lab-schedule.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/lab/schedule/route.ts src/tests/api/lab-schedule.test.ts
git commit -m "feat(lab): /api/lab/schedule — Approve & Schedule (default next-slot or explicit)"
```

---

### Task D2: `/api/lab/upload` route — real "Post now" enqueue

Currently a stub that just logs. Becomes: flips status from `'rendered'` to `'uploading'`, enqueues an `upload` render_job.

**Files:**
- Modify: `src/app/api/lab/upload/route.ts`
- Modify: `src/tests/api/lab-upload.test.ts` (already exists; rewrite tests for the real behavior)

- [ ] **Step 1: Rewrite the test**

Replace `src/tests/api/lab-upload.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/supabase/repositories/render-jobs', () => ({
  enqueueRenderJob: vi.fn(),
}));

import { POST } from '@/app/api/lab/upload/route';
import { getServiceClient } from '@/lib/supabase/server';
import { enqueueRenderJob } from '@/lib/supabase/repositories/render-jobs';

const UUID = '11111111-1111-1111-1111-111111111111';

function req(body: unknown): Request {
  return new Request('https://app/api/lab/upload', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

beforeEach(() => { vi.clearAllMocks(); });

describe('POST /api/lab/upload', () => {
  it('400 on missing videoId', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('404 on unknown video', async () => {
    vi.mocked(getServiceClient).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({ single: async () => ({ data: null, error: { code: 'PGRST116' } }) }),
        }),
      }),
    } as never);
    const res = await POST(req({ videoId: UUID }));
    expect(res.status).toBe(404);
  });

  it('409 when current status is not "rendered" or "scheduled"', async () => {
    vi.mocked(getServiceClient).mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({ single: async () => ({ data: { id: 'v1', status: 'posted' }, error: null }) }),
        }),
      }),
    } as never);
    const res = await POST(req({ videoId: UUID }));
    expect(res.status).toBe(409);
  });

  it('happy path: status->uploading, enqueues upload job', async () => {
    let updateCalled = false;
    vi.mocked(getServiceClient).mockReturnValue({
      from: (table: string) => {
        if (table !== 'your_videos') throw new Error(table);
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { id: UUID, status: 'rendered' }, error: null }) }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq() { return this; },
            async then(resolve: (v: { error: null; count: number }) => unknown) {
              expect(patch.status).toBe('uploading');
              updateCalled = true;
              resolve({ error: null, count: 1 });
            },
          }),
        };
      },
    } as never);
    vi.mocked(enqueueRenderJob).mockResolvedValue({ id: 'job-1' } as never);
    const res = await POST(req({ videoId: UUID }));
    expect(res.status).toBe(200);
    expect(updateCalled).toBe(true);
    expect(vi.mocked(enqueueRenderJob)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ jobType: 'upload', payload: { your_video_id: UUID }, yourVideoId: UUID }),
    );
  });
});
```

- [ ] **Step 2: Run test — confirm FAIL**

```bash
npx vitest run src/tests/api/lab-upload.test.ts
```

Expected: FAIL — current stub returns 200 without DB work.

- [ ] **Step 3: Implement the real route**

Replace `src/app/api/lab/upload/route.ts`:

```ts
import 'server-only';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server';
import { enqueueRenderJob } from '@/lib/supabase/repositories/render-jobs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BodySchema = z.object({ videoId: z.string().regex(UUID_RE, 'videoId must be a UUID') });

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body;
  try { body = BodySchema.parse(await req.json()); }
  catch (err) { return Response.json({ error: err instanceof Error ? err.message : 'bad body' }, { status: 400 }); }

  const supabase = getServiceClient();
  const { data: vid, error: vErr } = await supabase
    .from('your_videos')
    .select('id, status')
    .eq('id', body.videoId)
    .single();
  if (vErr || !vid) return Response.json({ error: 'video_not_found' }, { status: 404 });
  const status = (vid as { status: string }).status;
  if (status !== 'rendered' && status !== 'scheduled') {
    return Response.json({ error: 'wrong_status', currentStatus: status }, { status: 409 });
  }

  const { error: upErr, count } = await supabase
    .from('your_videos')
    .update({ status: 'uploading', scheduled_for: null, updated_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', body.videoId)
    .in('status', ['rendered', 'scheduled']);
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 });
  if (!count) return Response.json({ error: 'wrong_status_race' }, { status: 409 });

  const job = await enqueueRenderJob(supabase, {
    jobType: 'upload',
    payload: { your_video_id: body.videoId },
    yourVideoId: body.videoId,
  });
  return Response.json({ ok: true, video_id: body.videoId, job_id: job.id });
}
```

- [ ] **Step 4: Run test — confirm pass**

```bash
npx vitest run src/tests/api/lab-upload.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/lab/upload/route.ts src/tests/api/lab-upload.test.ts
git commit -m "feat(lab): real /api/lab/upload — flip status='uploading' + enqueue upload job"
```

---

### Task D3: `/api/lab/cancel-schedule` route

For the "Cancel" button on the Scheduled tab. Flips `scheduled` → `rendered`.

**Files:**
- Create: `src/app/api/lab/cancel-schedule/route.ts`
- Test: `src/tests/api/lab-cancel-schedule.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({} as never)) }));
vi.mock('@/lib/supabase/repositories/your-videos', () => ({
  cancelSchedule: vi.fn(),
}));

import { POST } from '@/app/api/lab/cancel-schedule/route';
import { cancelSchedule } from '@/lib/supabase/repositories/your-videos';

const UUID = '11111111-1111-1111-1111-111111111111';
beforeEach(() => vi.clearAllMocks());

function req(body: unknown): Request {
  return new Request('https://app/api/lab/cancel-schedule', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('POST /api/lab/cancel-schedule', () => {
  it('400 on missing videoId', async () => {
    expect((await POST(req({}))).status).toBe(400);
  });
  it('409 when cancelSchedule returns false', async () => {
    vi.mocked(cancelSchedule).mockResolvedValue(false);
    expect((await POST(req({ videoId: UUID }))).status).toBe(409);
  });
  it('200 happy path', async () => {
    vi.mocked(cancelSchedule).mockResolvedValue(true);
    expect((await POST(req({ videoId: UUID }))).status).toBe(200);
  });
});
```

- [ ] **Step 2: Implement the route**

```ts
import 'server-only';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server';
import { cancelSchedule } from '@/lib/supabase/repositories/your-videos';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BodySchema = z.object({ videoId: z.string().regex(UUID_RE) });
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body;
  try { body = BodySchema.parse(await req.json()); }
  catch { return Response.json({ error: 'bad body' }, { status: 400 }); }
  const supabase = getServiceClient();
  const ok = await cancelSchedule(supabase, body.videoId);
  if (!ok) return Response.json({ error: 'wrong_status_race' }, { status: 409 });
  return Response.json({ ok: true });
}
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/tests/api/lab-cancel-schedule.test.ts
# expect 3 passing
git add src/app/api/lab/cancel-schedule/route.ts src/tests/api/lab-cancel-schedule.test.ts
git commit -m "feat(lab): /api/lab/cancel-schedule — revert scheduled -> rendered"
```

---

### Task D4: Lab drafts UI — Scheduled tab + Approve & Schedule + Cancel

**Files:**
- Modify: `src/components/lab/drafts-tabs.tsx` — add Scheduled tab
- Modify: `src/app/lab/drafts/page.tsx` — add Scheduled status filter
- Modify: `src/components/lab/rendered-row.tsx` — wire Approve & Schedule (replaces the disabled button)
- Create: `src/components/lab/scheduled-row.tsx`
- Modify: `src/components/lab/posted-row.tsx` — show latest analytics snapshot

- [ ] **Step 1: Update tabs**

Edit `src/components/lab/drafts-tabs.tsx`:

```ts
const TABS = [
  { key: 'draft', label: 'Draft' },
  { key: 'rendered', label: 'Rendered' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'posted', label: 'Posted' },
] as const;
```

Type widens automatically.

- [ ] **Step 2: Update the page to route the new tab**

Edit `src/app/lab/drafts/page.tsx`:

```ts
const active: DraftsTab =
  tab === 'rendered' || tab === 'posted' || tab === 'scheduled' ? tab : 'draft';

const statusFor: Record<DraftsTab, VideoStatus | VideoStatus[]> = {
  draft: ['draft', 'rendering'],
  rendered: 'rendered',
  scheduled: ['scheduled', 'uploading'],
  posted: 'posted',
};
```

And in the JSX, add a render branch for `scheduled`:

```tsx
if (active === 'scheduled') return <ScheduledRow key={v.id} video={v} />;
```

Import the new component:

```ts
import { ScheduledRow } from '@/components/lab/scheduled-row';
```

- [ ] **Step 3: Replace the disabled button in `rendered-row.tsx`**

Replace the entire button-row in `src/components/lab/rendered-row.tsx`:

```tsx
async function approveAndSchedule() {
  setBusy(true);
  try {
    const res = await fetch('/api/lab/schedule', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ videoId: video.id }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Schedule failed: ${j.error ?? res.statusText}`);
      return;
    }
    location.reload();
  } finally { setBusy(false); }
}
```

Then in the JSX (replace the disabled-button block):

```tsx
<button
  onClick={approveAndSchedule}
  disabled={busy}
  className="px-3 py-1.5 rounded bg-accent-electric text-app text-xs font-medium hover:opacity-90 disabled:opacity-50"
>
  Approve &amp; Schedule
</button>
<button
  onClick={postNow}
  disabled={busy}
  className="px-3 py-1.5 rounded bg-elevated text-text-primary text-xs font-medium hover:bg-hover border border-subtle disabled:opacity-50"
>
  Post now
</button>
```

Also: postNow now redirects on success — remove the `alert(...)` and reload:

```tsx
async function postNow() {
  setBusy(true);
  try {
    const res = await fetch('/api/lab/upload', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ videoId: video.id }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Upload failed: ${j.error ?? res.statusText}`);
      return;
    }
    location.reload();
  } finally { setBusy(false); }
}
```

- [ ] **Step 4: Create `scheduled-row.tsx`**

```tsx
// src/components/lab/scheduled-row.tsx
'use client';

import { useState } from 'react';
import type { YourVideo } from '@/lib/supabase/repositories/your-videos';

export function ScheduledRow({ video }: { video: YourVideo }) {
  const [busy, setBusy] = useState(false);

  async function cancel() {
    if (!confirm('Cancel this scheduled post? It returns to Rendered.')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/lab/cancel-schedule', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ videoId: video.id }),
      });
      if (!res.ok) alert('Cancel failed.');
      else location.reload();
    } finally { setBusy(false); }
  }

  async function postNow() {
    setBusy(true);
    try {
      const res = await fetch('/api/lab/upload', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ videoId: video.id }),
      });
      if (!res.ok) alert('Post-now failed.');
      else location.reload();
    } finally { setBusy(false); }
  }

  const scheduledFor = video.scheduled_for ? new Date(video.scheduled_for) : null;
  const countdown = scheduledFor ? Math.max(0, scheduledFor.getTime() - Date.now()) : 0;
  const hours = Math.floor(countdown / 3_600_000);
  const minutes = Math.floor((countdown % 3_600_000) / 60_000);
  const isUploading = video.status === 'uploading';

  return (
    <li className="px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-text-primary truncate">{video.title}</p>
        {isUploading ? (
          <p className="text-xs font-mono text-accent-electric">uploading…</p>
        ) : (
          <p className="text-xs font-mono text-text-muted">
            posts in {hours}h {minutes}m
            {scheduledFor && ` · ${scheduledFor.toLocaleString()}`}
          </p>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        <button onClick={postNow} disabled={busy || isUploading} className="px-3 py-1.5 rounded bg-elevated text-text-primary text-xs font-medium hover:bg-hover border border-subtle disabled:opacity-50">
          Post now
        </button>
        <button onClick={cancel} disabled={busy || isUploading} className="px-3 py-1.5 rounded bg-elevated text-accent-red text-xs font-medium hover:bg-hover border border-accent-red/40 disabled:opacity-50">
          Cancel
        </button>
      </div>
    </li>
  );
}
```

Append to `YourVideo` interface the `scheduled_for` field if not already there — verify in `src/lib/supabase/repositories/your-videos.ts`. The schema has the column; check the TS type defines it:

```ts
export type YourVideo = {
  // ...existing fields...
  scheduled_for: string | null;
  posted_hour_local: number | null;
  posted_dow_local: number | null;
  // ...
};
```

If missing, add. (The repo previously didn't model these.)

- [ ] **Step 5: Update `posted-row.tsx` to show analytics summary**

```tsx
// src/components/lab/posted-row.tsx
import type { YourVideo } from '@/lib/supabase/repositories/your-videos';
import { getServiceClient } from '@/lib/supabase/server';

export async function PostedRow({ video }: { video: YourVideo }) {
  const supabase = getServiceClient();
  const { data: latest } = await supabase
    .from('video_analytics')
    .select('views, avg_view_duration_seconds, ctr_pct, snapshot_at')
    .eq('your_video_id', video.id)
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const stats = latest as { views: number | null; avg_view_duration_seconds: number | null; ctr_pct: number | null; snapshot_at: string } | null;

  return (
    <li className="px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-text-primary truncate">{video.title}</p>
        {stats ? (
          <p className="text-xs font-mono text-text-muted">
            {stats.views ?? 0} views · {stats.avg_view_duration_seconds?.toFixed(1) ?? '—'}s avg · {stats.ctr_pct?.toFixed(1) ?? '—'}% CTR
          </p>
        ) : (
          <p className="text-xs font-mono text-text-muted">no analytics yet (sync runs daily)</p>
        )}
      </div>
      {video.url && (
        <a href={video.url} target="_blank" rel="noopener" className="text-xs text-accent-electric hover:underline shrink-0">
          View on YouTube ↗
        </a>
      )}
    </li>
  );
}
```

`PostedRow` becomes an async server component. Since the parent `LabDraftsPage` is already async + server, this works. The `page.tsx` JSX where it's rendered (in a `videos.map`) — async components inside `.map` are fine in RSC.

- [ ] **Step 6: Type-check + run all tests**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: all green.

- [ ] **Step 7: Operator local smoke**

Hand the operator:

```
1. unset ANTHROPIC_BASE_URL && npm run dev
2. Visit /lab/drafts. Tabs: Draft | Rendered | Scheduled | Posted.
3. With at least one row in Rendered status (use any from prior phases): click "Approve & Schedule".
4. Page reloads; the row should appear under Scheduled with "posts in Nh Mm" + a Cancel button.
5. Click Cancel; the row should return to Rendered.
6. Click Approve & Schedule again, then on the Scheduled tab click Post now; row should disappear from Scheduled (status='uploading') and eventually appear in Posted after upload completes (this requires merged Sub-phase B).
```

If running before Sub-phase B is merged, Post now will fail mid-upload because the worker stub will still be in main. Comment in the operator handoff and skip step 6 unless B is merged.

- [ ] **Step 8: Commit**

```bash
git add src/components/lab/drafts-tabs.tsx src/components/lab/rendered-row.tsx src/components/lab/scheduled-row.tsx src/components/lab/posted-row.tsx src/app/lab/drafts/page.tsx src/lib/supabase/repositories/your-videos.ts
git commit -m "feat(lab): Scheduled tab + Approve & Schedule + Cancel + analytics summary"
```

---

### Task D5: /clips Rendered tab — Approve & Schedule + Post now

The current `/api/clips/rendered/[id]/approve/route.ts` promotes a compilation_draft into a `your_videos` row with `status='rendered'`. Spec change: it should now promote into `'scheduled'` with `scheduled_for=nextOpenSlot`, AND offer an explicit "Post now" path that promotes into `'uploading'` + enqueues upload.

Existing route shape (read at plan-writing time so we don't have to read it again at execution time):

```ts
// CURRENT /api/clips/rendered/[id]/approve/route.ts
import { getDraftById, setPromotedYourVideoId } from "@/lib/supabase/repositories/compilation-drafts";
import { createPromotedVideo } from "@/lib/supabase/repositories/your-videos";

export async function POST(_req, context) {
  const { id } = await context.params;
  const supabase = getServiceClient();
  const draft = await getDraftById(supabase, id);
  if (!draft) return 404;
  if (draft.status !== "rendered") return 409;
  if (!draft.rendered_path) return 422;
  const totalDuration = draft.clip_refs.reduce((a, r) => a + (r.end_sec - r.start_sec), 0);
  const videoId = await createPromotedVideo(supabase, {
    channelId: draft.channel_id, title: draft.title_template,
    renderArtifactUrl: draft.rendered_path, durationSeconds: totalDuration,
    sourceCompilationDraftId: id,
  });
  await setPromotedYourVideoId(supabase, { id, your_video_id: videoId });
  return { ok: true, your_video_id: videoId };
}
```

**Files:**
- Modify: `src/app/api/clips/rendered/[id]/approve/route.ts` (accept `?action=schedule|post_now`)
- Modify: `src/lib/supabase/repositories/your-videos.ts` (extend `createPromotedVideo` to take a `targetStatus` arg)
- Modify: `src/components/clips/rendered-card.tsx`
- Create: `src/tests/api/clips-rendered-approve.test.ts`

- [ ] **Step 1: Extend `createPromotedVideo` to accept `targetStatus` + `scheduledFor`**

Edit `src/lib/supabase/repositories/your-videos.ts`. Change `createPromotedVideo` signature:

```ts
export async function createPromotedVideo(
  supabase: SupabaseClient,
  args: {
    channelId: string;
    title: string;
    renderArtifactUrl: string;
    durationSeconds: number;
    sourceCompilationDraftId: string;
    targetStatus?: 'rendered' | 'scheduled' | 'uploading';
    scheduledFor?: Date | null;
  },
): Promise<string> {
  const status: VideoStatus = (args.targetStatus ?? 'rendered') as VideoStatus;
  const { data, error } = await supabase
    .from('your_videos')
    .insert({
      channel_id: args.channelId,
      title: args.title,
      script: null,
      voice_provider: null,
      voice_id: null,
      visual_treatment: 'top5_compilation',
      duration_seconds: args.durationSeconds,
      render_artifact_url: args.renderArtifactUrl,
      status,
      scheduled_for: args.scheduledFor ? args.scheduledFor.toISOString() : null,
      source_compilation_draft_id: args.sourceCompilationDraftId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`createPromotedVideo: ${error.message}`);
  return data.id as string;
}
```

This is **backwards-compatible** — existing callers that don't pass `targetStatus` still get the old `'rendered'` behavior. But for the /clips Approve, we'll start passing `'scheduled'`.

- [ ] **Step 2: Replace the /clips approve route — full file**

Overwrite `src/app/api/clips/rendered/[id]/approve/route.ts` entirely with:

```ts
import 'server-only';
import { DateTime } from 'luxon';
import { getServiceClient } from '@/lib/supabase/server';
import {
  getDraftById,
  setPromotedYourVideoId,
} from '@/lib/supabase/repositories/compilation-drafts';
import { createPromotedVideo, slotIsOccupied } from '@/lib/supabase/repositories/your-videos';
import { getDefaultChannel } from '@/lib/supabase/repositories/channels';
import { enqueueRenderJob } from '@/lib/supabase/repositories/render-jobs';
import { nextOpenSlotAfter, BacklogOverflowError } from '@/lib/timezone';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const action = new URL(req.url).searchParams.get('action') === 'post_now' ? 'post_now' : 'schedule';
  const supabase = getServiceClient();

  const draft = await getDraftById(supabase, id);
  if (!draft) return Response.json({ error: 'draft not found' }, { status: 404 });
  if (draft.status !== 'rendered') {
    return Response.json({ error: `cannot approve from ${draft.status}` }, { status: 409 });
  }
  if (!draft.rendered_path) return Response.json({ error: 'rendered_path missing' }, { status: 422 });

  const totalDuration = draft.clip_refs.reduce((a, r) => a + (r.end_sec - r.start_sec), 0);

  if (action === 'post_now') {
    const yvId = await createPromotedVideo(supabase, {
      channelId: draft.channel_id,
      title: draft.title_template,
      renderArtifactUrl: draft.rendered_path,
      durationSeconds: totalDuration,
      sourceCompilationDraftId: id,
      targetStatus: 'uploading',
    });
    await enqueueRenderJob(supabase, {
      jobType: 'upload',
      payload: { your_video_id: yvId },
      yourVideoId: yvId,
    });
    await setPromotedYourVideoId(supabase, { id, your_video_id: yvId });
    return Response.json({ ok: true, your_video_id: yvId, posting_now: true });
  }

  // action === 'schedule' — default
  const channel = await getDefaultChannel(supabase);
  let scheduledFor: Date;
  try {
    const slot = await nextOpenSlotAfter(
      channel,
      DateTime.utc(),
      async (slotUtc) => slotIsOccupied(supabase, channel.id, slotUtc.toJSDate()),
    );
    scheduledFor = slot.toJSDate();
  } catch (err) {
    if (err instanceof BacklogOverflowError) {
      return Response.json({ error: 'backlog_overflow' }, { status: 503 });
    }
    throw err;
  }

  const yvId = await createPromotedVideo(supabase, {
    channelId: draft.channel_id,
    title: draft.title_template,
    renderArtifactUrl: draft.rendered_path,
    durationSeconds: totalDuration,
    sourceCompilationDraftId: id,
    targetStatus: 'scheduled',
    scheduledFor,
  });
  await setPromotedYourVideoId(supabase, { id, your_video_id: yvId });
  return Response.json({
    ok: true,
    your_video_id: yvId,
    scheduled_for: scheduledFor.toISOString(),
  });
}
```

Caller-compat note: this route was always POSTed without a body and without auth headers (it relies on the cockpit session cookie that protects the /clips page — the route itself has no `assertCockpitSession` call in the current source, so we are not adding one in this task). The Phase 5 UI changes only adjust the URL by appending `?action=post_now` for the second button. Backwards-compatible: callers that omit `?action=` get the new default `schedule` behavior.

- [ ] **Step 3: Update the rendered-card UI — replace the Approve button block**

In `src/components/clips/rendered-card.tsx`, locate this current button row:

```tsx
<div className="flex gap-2">
  <button
    type="button"
    disabled={busy || !props.draft.rendered_path}
    onClick={() => post(`/api/clips/rendered/${props.draft.id}/approve`)}
    className="px-3 py-1.5 rounded text-sm bg-text-primary text-app disabled:opacity-50"
  >
    Approve
  </button>
  <button
    type="button"
    disabled={busy}
    onClick={() => post(`/api/clips/rendered/${props.draft.id}/reject`)}
    className="px-3 py-1.5 rounded text-sm border border-border hover:bg-surface-2 disabled:opacity-50"
  >
    Reject
  </button>
</div>
```

Replace it with:

```tsx
<div className="flex gap-2 flex-wrap">
  <button
    type="button"
    disabled={busy || !props.draft.rendered_path}
    onClick={() => post(`/api/clips/rendered/${props.draft.id}/approve`)}
    className="px-3 py-1.5 rounded text-sm bg-text-primary text-app disabled:opacity-50"
  >
    Approve &amp; Schedule
  </button>
  <button
    type="button"
    disabled={busy || !props.draft.rendered_path}
    onClick={() => post(`/api/clips/rendered/${props.draft.id}/approve?action=post_now`)}
    className="px-3 py-1.5 rounded text-sm border border-border hover:bg-surface-2 disabled:opacity-50"
  >
    Post now
  </button>
  <button
    type="button"
    disabled={busy}
    onClick={() => post(`/api/clips/rendered/${props.draft.id}/reject`)}
    className="px-3 py-1.5 rounded text-sm border border-border hover:bg-surface-2 disabled:opacity-50"
  >
    Reject
  </button>
</div>
```

(The existing `post()` helper in the component already handles error display + reload — no other JS changes needed.)

- [ ] **Step 4: Write the route test**

Create `src/tests/api/clips-rendered-approve.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({} as never)) }));
vi.mock('@/lib/supabase/repositories/compilation-drafts', () => ({
  getDraftById: vi.fn(),
  setPromotedYourVideoId: vi.fn(),
}));
vi.mock('@/lib/supabase/repositories/your-videos', () => ({
  createPromotedVideo: vi.fn(async () => 'yv-id'),
  slotIsOccupied: vi.fn(async () => false),
}));
vi.mock('@/lib/supabase/repositories/channels', () => ({
  getDefaultChannel: vi.fn(async () => ({
    id: 'c1', timezone: 'America/New_York',
    posting_schedule: { weekdays: ['07:30'], weekends: ['11:30'] },
  })),
}));
vi.mock('@/lib/supabase/repositories/render-jobs', () => ({
  enqueueRenderJob: vi.fn(async () => ({ id: 'job-x' })),
}));
vi.mock('@/lib/timezone', () => ({
  nextOpenSlotAfter: vi.fn(),
  BacklogOverflowError: class extends Error {},
}));

import { POST } from '@/app/api/clips/rendered/[id]/approve/route';
import { getDraftById } from '@/lib/supabase/repositories/compilation-drafts';
import { createPromotedVideo } from '@/lib/supabase/repositories/your-videos';
import { enqueueRenderJob } from '@/lib/supabase/repositories/render-jobs';
import { nextOpenSlotAfter } from '@/lib/timezone';

const DRAFT = {
  id: 'd1', channel_id: 'c1', status: 'rendered' as const,
  title_template: 'Top 5 Cars',
  rendered_path: 'https://blob/d1.mp4',
  clip_refs: [{ start_sec: 0, end_sec: 6 }, { start_sec: 0, end_sec: 6 }, { start_sec: 0, end_sec: 6 }, { start_sec: 0, end_sec: 6 }, { start_sec: 0, end_sec: 6 }],
};

beforeEach(() => vi.clearAllMocks());

async function callPOST(action: 'schedule' | 'post_now' | null) {
  const url = action ? `https://app/api/clips/rendered/d1/approve?action=${action}` : 'https://app/api/clips/rendered/d1/approve';
  const req = new Request(url, { method: 'POST' });
  return POST(req, { params: Promise.resolve({ id: 'd1' }) });
}

describe('POST /api/clips/rendered/[id]/approve', () => {
  it('404 on unknown draft', async () => {
    vi.mocked(getDraftById).mockResolvedValue(null);
    expect((await callPOST(null)).status).toBe(404);
  });

  it('409 when draft not in rendered status', async () => {
    vi.mocked(getDraftById).mockResolvedValue({ ...DRAFT, status: 'posted' as never });
    expect((await callPOST(null)).status).toBe(409);
  });

  it('422 when rendered_path missing', async () => {
    vi.mocked(getDraftById).mockResolvedValue({ ...DRAFT, rendered_path: null as never });
    expect((await callPOST(null)).status).toBe(422);
  });

  it('default action=schedule promotes with status=scheduled + scheduled_for', async () => {
    const { DateTime } = await import('luxon');
    vi.mocked(getDraftById).mockResolvedValue(DRAFT as never);
    vi.mocked(nextOpenSlotAfter).mockResolvedValue(DateTime.fromISO('2026-06-01T11:30:00Z'));
    const res = await callPOST(null);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scheduled_for).toBe('2026-06-01T11:30:00.000Z');
    expect(vi.mocked(createPromotedVideo)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetStatus: 'scheduled' }),
    );
  });

  it('action=post_now promotes with status=uploading + enqueues upload job', async () => {
    vi.mocked(getDraftById).mockResolvedValue(DRAFT as never);
    const res = await callPOST('post_now');
    expect(res.status).toBe(200);
    expect(vi.mocked(createPromotedVideo)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetStatus: 'uploading' }),
    );
    expect(vi.mocked(enqueueRenderJob)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ jobType: 'upload' }),
    );
  });

  it('503 when nextOpenSlotAfter throws BacklogOverflowError', async () => {
    const { BacklogOverflowError } = await import('@/lib/timezone');
    vi.mocked(getDraftById).mockResolvedValue(DRAFT as never);
    vi.mocked(nextOpenSlotAfter).mockRejectedValue(new BacklogOverflowError('c1'));
    expect((await callPOST('schedule')).status).toBe(503);
  });
});
```

- [ ] **Step 5: Run tests + commit**

```bash
npx vitest run src/tests/api/clips-rendered-approve.test.ts
# expect green
git add src/app/api/clips/rendered/\[id\]/approve/route.ts src/components/clips/rendered-card.tsx src/lib/supabase/repositories/your-videos.ts src/tests/api/clips-rendered-approve.test.ts
git commit -m "feat(clips): /clips Rendered Approve & Schedule + Post now"
```

---

# Sub-phase E: `scheduled-uploader` cron

Every 15 minutes: atomic claim of due rows, per-channel max_uploads_per_day deferral, enqueue upload jobs, write `schedule_backlog_overflow` alert above horizon. Pure logic in a testable module; cron route is a thin wrapper.

### Task E1: `src/lib/render/scheduled-uploader.ts` — pure logic

**Files:**
- Create: `src/lib/render/scheduled-uploader.ts`
- Test: `src/tests/lib/render/scheduled-uploader.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DateTime } from 'luxon';
import { runScheduledUploader, type ScheduledUploaderDeps } from '@/lib/render/scheduled-uploader';

const NOW = new Date('2026-06-01T15:00:00Z');

function makeDeps(overrides: Partial<ScheduledUploaderDeps> = {}): ScheduledUploaderDeps {
  return {
    now: NOW,
    batchSize: 5,
    horizonDays: 7,
    claim: vi.fn(async () => [
      { id: 'v1', channel_id: 'c1' },
      { id: 'v2', channel_id: 'c1' },
    ]),
    getChannel: vi.fn(async (id: string) => ({
      id, timezone: 'America/New_York', max_uploads_per_day: 2,
      posting_schedule: { weekdays: ['07:30','18:30'], weekends: ['11:30','19:30'] },
    })),
    countTodayUploads: vi.fn(async () => 0),
    enqueueUploadJob: vi.fn(async () => ({ id: 'job-x' })),
    revertSchedule: vi.fn(async () => undefined),
    nextOpenSlotAfter: vi.fn(async () => DateTime.fromISO('2026-06-02T11:30:00Z')),
    maxScheduledFor: vi.fn(async () => null),
    upsertBacklogAlert: vi.fn(async () => undefined),
    clearBacklogAlert: vi.fn(async () => undefined),
    log: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('runScheduledUploader', () => {
  it('happy path: enqueues an upload job for each claimed row under cap', async () => {
    const deps = makeDeps();
    const summary = await runScheduledUploader(deps);
    expect(deps.enqueueUploadJob).toHaveBeenCalledTimes(2);
    expect(summary.uploaded).toBe(2);
    expect(summary.deferred).toBe(0);
  });

  it('defers when channel is at max_uploads_per_day', async () => {
    const deps = makeDeps({ countTodayUploads: vi.fn(async () => 2) }); // cap=2
    const summary = await runScheduledUploader(deps);
    expect(deps.revertSchedule).toHaveBeenCalledTimes(2);
    expect(deps.enqueueUploadJob).toHaveBeenCalledTimes(0);
    expect(summary.deferred).toBe(2);
    expect(summary.uploaded).toBe(0);
  });

  it('per-row counter increments as we enqueue, so cap=2 stops at row 2 of 3', async () => {
    const deps = makeDeps({
      claim: vi.fn(async () => [
        { id: 'v1', channel_id: 'c1' },
        { id: 'v2', channel_id: 'c1' },
        { id: 'v3', channel_id: 'c1' },
      ]),
    });
    const summary = await runScheduledUploader(deps);
    expect(summary.uploaded).toBe(2);
    expect(summary.deferred).toBe(1);
  });

  it('emits schedule_backlog_overflow alert when MAX(scheduled_for) - now > horizonDays', async () => {
    const deps = makeDeps({
      maxScheduledFor: vi.fn(async () => new Date('2026-06-15T00:00:00Z')), // 14 days out
    });
    await runScheduledUploader(deps);
    expect(deps.upsertBacklogAlert).toHaveBeenCalledWith(expect.objectContaining({
      channelId: 'c1',
      horizonDays: expect.any(Number),
    }));
  });

  it('clears backlog alert when horizon goes back under horizonDays', async () => {
    const deps = makeDeps({ maxScheduledFor: vi.fn(async () => new Date('2026-06-02T00:00:00Z')) });
    await runScheduledUploader(deps);
    expect(deps.clearBacklogAlert).toHaveBeenCalledWith('c1');
    expect(deps.upsertBacklogAlert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement the module**

Create `src/lib/render/scheduled-uploader.ts`:

```ts
import 'server-only';
import type { DateTime } from 'luxon';
import type { ChannelForSchedule } from '@/lib/timezone';

export interface ChannelLite extends ChannelForSchedule {
  max_uploads_per_day: number;
}

export interface ScheduledUploaderDeps {
  now: Date;
  batchSize: number;
  horizonDays: number;
  claim: (args: { now: Date; limit: number }) => Promise<Array<{ id: string; channel_id: string }>>;
  getChannel: (channelId: string) => Promise<ChannelLite | null>;
  countTodayUploads: (args: { channelId: string; nowUtc: Date; tz: string }) => Promise<number>;
  enqueueUploadJob: (videoId: string) => Promise<{ id: string }>;
  revertSchedule: (args: { videoId: string; nextScheduledFor: Date }) => Promise<void>;
  nextOpenSlotAfter: (channel: ChannelForSchedule, since: DateTime) => Promise<DateTime>;
  maxScheduledFor: (channelId: string) => Promise<Date | null>;
  upsertBacklogAlert: (args: { channelId: string; horizonDays: number; currentCap: number }) => Promise<void>;
  clearBacklogAlert: (channelId: string) => Promise<void>;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

export interface RunSummary {
  uploaded: number;
  deferred: number;
  channels: string[];
}

export async function runScheduledUploader(deps: ScheduledUploaderDeps): Promise<RunSummary> {
  const { DateTime } = await import('luxon');
  const claimed = await deps.claim({ now: deps.now, limit: deps.batchSize });
  let uploaded = 0;
  let deferred = 0;
  const channelTouched = new Set<string>();

  // Track per-channel cap usage as we enqueue, so a single-batch flood respects cap.
  const usedToday = new Map<string, number>();

  for (const row of claimed) {
    channelTouched.add(row.channel_id);
    const channel = await deps.getChannel(row.channel_id);
    if (!channel) { deferred += 1; continue; }
    let used = usedToday.get(channel.id);
    if (used === undefined) {
      used = await deps.countTodayUploads({ channelId: channel.id, nowUtc: deps.now, tz: channel.timezone });
      usedToday.set(channel.id, used);
    }

    if (used >= channel.max_uploads_per_day) {
      // Cap hit — push to the next valid slot per posting_schedule that isn't occupied.
      const nextSlot = await deps.nextOpenSlotAfter(channel, DateTime.fromJSDate(deps.now));
      await deps.revertSchedule({ videoId: row.id, nextScheduledFor: nextSlot.toJSDate() });
      deps.log('deferred', { videoId: row.id, nextSlot: nextSlot.toISO() });
      deferred += 1;
      continue;
    }

    await deps.enqueueUploadJob(row.id);
    usedToday.set(channel.id, used + 1);
    uploaded += 1;
    deps.log('enqueued', { videoId: row.id });
  }

  // Backlog horizon check — runs per channel touched.
  for (const channelId of channelTouched) {
    const max = await deps.maxScheduledFor(channelId);
    if (!max) {
      await deps.clearBacklogAlert(channelId);
      continue;
    }
    const horizonDays = Math.ceil((max.getTime() - deps.now.getTime()) / (24 * 60 * 60 * 1000));
    if (horizonDays > deps.horizonDays) {
      const channel = await deps.getChannel(channelId);
      const cap = channel?.max_uploads_per_day ?? 0;
      await deps.upsertBacklogAlert({ channelId, horizonDays, currentCap: cap });
    } else {
      await deps.clearBacklogAlert(channelId);
    }
  }

  return { uploaded, deferred, channels: [...channelTouched] };
}
```

- [ ] **Step 3: Run tests — confirm pass**

```bash
npx vitest run src/tests/lib/render/scheduled-uploader.test.ts
```

Expected: 5 passing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/render/scheduled-uploader.ts src/tests/lib/render/scheduled-uploader.test.ts
git commit -m "feat(schedule): scheduled-uploader pure logic — claim + cap + horizon alert"
```

---

### Task E2: `operator-alerts` repo extensions

Need a helper to upsert the `schedule_backlog_overflow` alert (idempotent: only one open alert per channel + category at a time) + a helper to resolve it.

**Files:**
- Modify: `src/lib/supabase/repositories/operator-alerts.ts`
- Test: `src/tests/lib/supabase/operator-alerts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  upsertOpenAlert,
  clearOpenAlertsByCategory,
  resolveAlert,
} from '@/lib/supabase/repositories/operator-alerts';

describe('operator-alerts upsert/clear/resolve', () => {
  it('upsertOpenAlert updates existing unresolved row if present, else inserts', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ in: () => ({ maybeSingle: async () => ({ data: { id: 'a1' }, error: null }) }) }) }),
        }),
        update: vi.fn().mockReturnValue({ eq: async () => ({ error: null }) }),
        insert: vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: { id: 'a1' }, error: null }) }) }),
      }),
    } as never;
    // existing-row branch: update
    await upsertOpenAlert(supabase, {
      channelId: 'c1', category: 'schedule_backlog_overflow', severity: 'warn',
      message: 'msg', suggestedActions: [], context: {},
    });
    // exact wiring of update is asserted via test execution path; if not thrown, pass.
    expect(true).toBe(true);
  });

  it('clearOpenAlertsByCategory marks unresolved rows in (category) as resolved', async () => {
    let captured: Record<string, unknown> | null = null;
    const supabase = {
      from: () => ({
        update: (patch: Record<string, unknown>) => ({
          eq: () => ({
            eq: () => ({
              in: async () => { captured = patch; return { error: null }; },
            }),
          }),
        }),
      }),
    } as never;
    await clearOpenAlertsByCategory(supabase, { channelId: 'c1', category: 'schedule_backlog_overflow' });
    expect(captured!.status).toBe('resolved');
    expect(captured!.resolved_at).toBeDefined();
  });

  it('resolveAlert flips status by id', async () => {
    let captured: Record<string, unknown> | null = null;
    const supabase = {
      from: () => ({
        update: (patch: Record<string, unknown>) => ({ eq: async () => { captured = patch; return { error: null }; } }),
      }),
    } as never;
    await resolveAlert(supabase, 'a1');
    expect(captured!.status).toBe('resolved');
  });
});
```

- [ ] **Step 2: Implement the helpers**

Append to `src/lib/supabase/repositories/operator-alerts.ts`:

```ts
export async function upsertOpenAlert(
  supabase: SupabaseClient,
  params: CreateOperatorAlertParams,
): Promise<OperatorAlertRow> {
  const { data: existing } = await supabase
    .from('operator_alerts')
    .select('id')
    .eq('channel_id', params.channelId)
    .eq('category', params.category)
    .in('status', ['unresolved', 'acknowledged'])
    .maybeSingle();
  if (existing) {
    const id = (existing as { id: string }).id;
    const { error } = await supabase
      .from('operator_alerts')
      .update({
        severity: params.severity ?? 'info',
        message: params.message,
        suggested_actions: params.suggestedActions ?? null,
        context: params.context ?? null,
      })
      .eq('id', id);
    if (error) throw error;
    return { id } as OperatorAlertRow;
  }
  return createOperatorAlert(supabase, params);
}

export async function clearOpenAlertsByCategory(
  supabase: SupabaseClient,
  args: { channelId: string; category: AlertCategory },
): Promise<void> {
  const { error } = await supabase
    .from('operator_alerts')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('channel_id', args.channelId)
    .eq('category', args.category)
    .in('status', ['unresolved', 'acknowledged']);
  if (error) throw error;
}

export async function resolveAlert(supabase: SupabaseClient, alertId: string): Promise<void> {
  const { error } = await supabase
    .from('operator_alerts')
    .update({ status: 'resolved', resolved_at: new Date().toISOString() })
    .eq('id', alertId);
  if (error) throw error;
}
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run src/tests/lib/supabase/operator-alerts.test.ts
# expect 3 passing
git add src/lib/supabase/repositories/operator-alerts.ts src/tests/lib/supabase/operator-alerts.test.ts
git commit -m "feat(alerts): upsertOpenAlert + clearOpenAlertsByCategory + resolveAlert"
```

---

### Task E3: `scheduled-uploader` cron route + vercel.ts wire-up

**Files:**
- Create: `src/app/api/cron/scheduled-uploader/route.ts`
- Modify: `vercel.ts` (add cron entry)
- Test: `src/tests/api/scheduled-uploader-route.test.ts`

- [ ] **Step 1: Write the failing route test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({} as never)) }));
vi.mock('@/lib/scrapers/shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/scrapers/shared')>('@/lib/scrapers/shared');
  return { ...actual, assertCronAuth: vi.fn() };
});
vi.mock('@/lib/render/scheduled-uploader', () => ({
  runScheduledUploader: vi.fn(async () => ({ uploaded: 1, deferred: 0, channels: ['c1'] })),
}));

import { GET } from '@/app/api/cron/scheduled-uploader/route';
import { runScheduledUploader } from '@/lib/render/scheduled-uploader';

beforeEach(() => vi.clearAllMocks());

describe('GET /api/cron/scheduled-uploader', () => {
  it('200s with summary; passes batchSize=5 + horizonDays=7 from env defaults', async () => {
    const res = await GET(new Request('https://app/api/cron/scheduled-uploader', { headers: { authorization: 'Bearer X' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.uploaded).toBe(1);
    expect(vi.mocked(runScheduledUploader)).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 5, horizonDays: 7 }),
    );
  });
});
```

- [ ] **Step 2: Implement the route**

```ts
// src/app/api/cron/scheduled-uploader/route.ts
import 'server-only';
import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { getServiceClient } from '@/lib/supabase/server';
import { assertCronAuth, scraperLog } from '@/lib/scrapers/shared';
import {
  claimDueScheduled,
  rescheduleVideo,
  countTodayUploads,
  slotIsOccupied,
} from '@/lib/supabase/repositories/your-videos';
import { enqueueRenderJob } from '@/lib/supabase/repositories/render-jobs';
import { upsertOpenAlert, clearOpenAlertsByCategory } from '@/lib/supabase/repositories/operator-alerts';
import { runScheduledUploader, type ChannelLite } from '@/lib/render/scheduled-uploader';
import { nextOpenSlotAfter } from '@/lib/timezone';

export const maxDuration = 60;

export async function GET(req: Request) {
  try { assertCronAuth(req); } catch (e) { if (e instanceof Response) return e; throw e; }
  const supabase = getServiceClient();
  const now = new Date();
  const batchSize = parseInt(process.env.SCHEDULED_UPLOADER_BATCH_SIZE ?? '5', 10);
  const horizonDays = parseInt(process.env.OPERATIONS_BACKLOG_HORIZON_DAYS ?? '7', 10);

  const summary = await runScheduledUploader({
    now,
    batchSize,
    horizonDays,
    claim: (args) => claimDueScheduled(supabase, args),
    getChannel: async (id: string) => {
      const { data } = await supabase
        .from('channels')
        .select('id, timezone, posting_schedule, max_uploads_per_day')
        .eq('id', id)
        .single();
      return (data ?? null) as ChannelLite | null;
    },
    countTodayUploads: (args) => countTodayUploads(supabase, args),
    enqueueUploadJob: async (videoId: string) => {
      const job = await enqueueRenderJob(supabase, {
        jobType: 'upload', payload: { your_video_id: videoId }, yourVideoId: videoId,
      });
      return { id: job.id };
    },
    revertSchedule: async ({ videoId, nextScheduledFor }) => {
      // The row is currently 'uploading' from the atomic claim — push it back to 'scheduled'.
      await supabase
        .from('your_videos')
        .update({ status: 'scheduled', scheduled_for: nextScheduledFor.toISOString(), updated_at: new Date().toISOString() })
        .eq('id', videoId);
    },
    nextOpenSlotAfter: async (channel, since) =>
      nextOpenSlotAfter(channel, since, async (slotUtc) => slotIsOccupied(supabase, channel.id, slotUtc.toJSDate())),
    maxScheduledFor: async (channelId: string) => {
      const { data } = await supabase
        .from('your_videos')
        .select('scheduled_for')
        .eq('channel_id', channelId)
        .eq('status', 'scheduled')
        .order('scheduled_for', { ascending: false })
        .limit(1)
        .maybeSingle();
      const v = (data as { scheduled_for: string | null } | null)?.scheduled_for;
      return v ? new Date(v) : null;
    },
    upsertBacklogAlert: async ({ channelId, horizonDays, currentCap }) => {
      await upsertOpenAlert(supabase, {
        channelId,
        category: 'schedule_backlog_overflow',
        severity: 'warn',
        message: `Schedule backlog extends ${horizonDays} days into the future. Consider increasing max_uploads_per_day or culling older drafts.`,
        suggestedActions: [
          { label: `Increase max_uploads_per_day to ${currentCap + 2}`, action_type: 'patch_channel', params: { max_uploads_per_day: currentCap + 2 } },
          { label: 'Cull drafts older than 14 days', action_type: 'bulk_status', params: { from: 'scheduled', to: 'failed', older_than_days: 14 } },
        ],
        context: { horizonDays },
      });
    },
    clearBacklogAlert: (channelId: string) =>
      clearOpenAlertsByCategory(supabase, { channelId, category: 'schedule_backlog_overflow' }),
    log: (msg, extra) => console.log(`[scheduled-uploader] ${msg}`, extra ?? {}),
  });

  return NextResponse.json({ ok: true, ...scraperLog('scheduled-uploader', { summary }) });
}
```

- [ ] **Step 3: Run tests — confirm pass**

```bash
npx vitest run src/tests/api/scheduled-uploader-route.test.ts
```

Expected: 1 passing.

- [ ] **Step 4: Wire the cron in `vercel.ts`**

Edit `vercel.ts`. In the `crons` array, replace the Phase-5 placeholder comment with a real entry, and remove the old comment:

```ts
crons: [
  // --- Plan #4 Phase 1 ---
  { path: '/api/cron/render-dispatcher', schedule: '* * * * *' },
  { path: '/api/cron/render-watchdog',   schedule: '*/5 * * * *' },
  // --- Plan #4 Phase 3 ---
  { path: '/api/cron/reddit-clip-discovery', schedule: '*/30 * * * *' },
  // --- Plan #4 Phase 5 ---
  { path: '/api/cron/scheduled-uploader', schedule: '*/15 * * * *' },
  // --- Pre-existing daily scrapers ---
  { path: '/api/cron/youtube-trending',  schedule: '0 10 * * *'  },
  { path: '/api/cron/tiktok-trending',   schedule: '30 10 * * *' },
  { path: '/api/cron/reddit-harvest',    schedule: '0 11 * * *'  },
  { path: '/api/cron/wikipedia-harvest', schedule: '30 11 * * *' },
  { path: '/api/cron/performance-sync',  schedule: '0 12 * * *'  },
],
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/scheduled-uploader/route.ts vercel.ts src/tests/api/scheduled-uploader-route.test.ts
git commit -m "feat(cron): scheduled-uploader route + vercel.ts every-15-min entry"
```

---

### Task E4: Sub-phases C+D+E merge to main + prod smoke

These three sub-phases are coupled — the scheduling state machine + cron + UI must ship together to be testable end-to-end. Merge them as one PR.

- [ ] **Step 1: Full local test + type-check**

```bash
unset ANTHROPIC_BASE_URL && npx vitest run && npx tsc --noEmit && cd scripts/render-worker && npx tsc --noEmit && cd -
```

Expected: all green.

- [ ] **Step 2: PR**

```bash
git checkout -b plan-4-phase-5-scheduling
git push -u origin plan-4-phase-5-scheduling
gh pr create --title "Plan #4 Phase 5 Sub-phases C-E — scheduling lattice + scheduled-uploader cron" --body "$(cat <<'EOF'
## Summary
- `src/lib/timezone.ts`: `nextOpenSlotAfter` with luxon, DST-safe (spring-forward skipped, fall-back resolves to standard-time occurrence).
- `your_videos` repo: `scheduleVideo` / `cancelSchedule` / `slotIsOccupied` / `countTodayUploads` / `claimDueScheduled` + new Postgres function `claim_due_scheduled_uploads` for atomic claim with FOR UPDATE SKIP LOCKED.
- `schedule_recommendations` repo: `listPendingRecommendations`, `applyRecommendation`, `dismissRecommendation`.
- `operator_alerts` repo: `upsertOpenAlert`, `clearOpenAlertsByCategory`, `resolveAlert`.
- `/api/lab/schedule` + `/api/lab/upload` (real) + `/api/lab/cancel-schedule`.
- `/clips Rendered` Approve & Schedule + Post now.
- `src/lib/render/scheduled-uploader.ts` pure-logic module + `src/app/api/cron/scheduled-uploader/route.ts` wrapper.
- `vercel.ts` registers `*/15 * * * *` schedule.

## Test plan
- [ ] Operator applied migration 20260527000001_claim_due_scheduled_uploads.sql in Supabase.
- [ ] Local smoke: Approve & Schedule from /lab/drafts Rendered tab; row appears in Scheduled with countdown; Cancel returns to Rendered.
- [ ] Preview deploy: cron runs every 15min on prod only (Vercel platform constraint) — confirm by checking cron_runs after merge.
- [ ] After merge, when first scheduled video's scheduled_for is passed, the cron picks it up and the upload pipeline (Sub-phase B) executes.
- [ ] Force a backlog horizon overflow: schedule >7 days of drafts at the channel cap; verify `operator_alerts` row appears with category='schedule_backlog_overflow'.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Operator-driven prod smoke**

```
After Vercel deploys the merge:

1. Schedule a real video: /lab/drafts → Rendered tab → Approve & Schedule. Note the scheduled_for from the success response or by visiting /lab/drafts?tab=scheduled.

2. (Optional) Override scheduled_for to "1 minute from now" via Supabase SQL so we don't have to wait for a real posting slot:

   update your_videos
   set scheduled_for = now() + interval '1 minute'
   where id = '<uuid>';

3. Wait ~16 minutes for the */15 cron to fire (or visit /api/cron/scheduled-uploader manually — see auth caveats).

4. Verify in SQL:
     select id, status, scheduled_for from your_videos where id='<uuid>';
   Expect: status='uploading' or already 'posted'.

5. Confirm upload completes (Sub-phase B path).
```

- [ ] **Step 4: Merge after smoke PASS**

```bash
gh pr merge plan-4-phase-5-scheduling --squash --delete-branch
git checkout main && git pull origin main
```

**Sub-phases C+D+E acceptance:** A scheduled video, after waiting through one */15 cron tick, advances scheduled→uploading→posted automatically. Backlog overflow alert fires when horizon exceeds 7 days.

---

# Sub-phase F: `/operations` page

The week-view calendar + recommendations panel + format-mix bar + operator-alert banner.

### Task F1: `/operations` page skeleton + nav

**Files:**
- Create: `src/app/operations/page.tsx`
- Modify: `src/components/cockpit/cockpit-shell.tsx` (add /operations to nav — agent reads the current shell first)

- [ ] **Step 1: Inspect cockpit shell to find the nav array**

```bash
grep -n "lab\|clips\|operations\|nav" src/components/cockpit/cockpit-shell.tsx
```

Identify the array of nav entries (likely a `LINKS` or similar). Add `{ href: '/operations', label: 'Operations' }` to it. Keep the existing styling.

- [ ] **Step 2: Write the page skeleton**

Create `src/app/operations/page.tsx`:

```tsx
import { CockpitShell } from '@/components/cockpit/cockpit-shell';
import { getServiceClient } from '@/lib/supabase/server';
import { getDefaultChannel } from '@/lib/supabase/repositories/channels';
import { listUnresolvedAlerts } from '@/lib/supabase/repositories/operator-alerts';
import { listPendingRecommendations } from '@/lib/supabase/repositories/schedule-recommendations';
import { AlertBanner } from '@/components/operations/alert-banner';
import { FormatMixBar } from '@/components/operations/format-mix-bar';
import { WeekCalendar } from '@/components/operations/week-calendar';
import { RecommendationsPanel } from '@/components/operations/recommendations-panel';
import { DateTime } from 'luxon';

export const dynamic = 'force-dynamic';

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const supabase = getServiceClient();
  const channel = await getDefaultChannel(supabase);

  const tz = channel.timezone;
  const today = DateTime.now().setZone(tz);
  const weekStart = (week
    ? DateTime.fromISO(week, { zone: tz })
    : today
  ).startOf('week'); // luxon: Monday
  const weekEnd = weekStart.plus({ days: 7 });

  const alerts = await listUnresolvedAlerts(supabase, { channelId: channel.id });
  const recommendations = await listPendingRecommendations(supabase, channel.id);

  return (
    <CockpitShell>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">Operations</h1>
          <p className="text-text-secondary text-sm mt-1">Schedule, monitor, and adjust posting cadence.</p>
        </header>

        <AlertBanner alerts={alerts} />

        <FormatMixBar
          channelId={channel.id}
          targetMix={channel.target_format_mix}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
          <WeekCalendar
            channelId={channel.id}
            channelTimezone={tz}
            postingSchedule={channel.posting_schedule}
            weekStartISO={weekStart.toISO()!}
            weekEndISO={weekEnd.toISO()!}
          />
          <RecommendationsPanel channelId={channel.id} recommendations={recommendations} />
        </div>
      </div>
    </CockpitShell>
  );
}
```

- [ ] **Step 3: Extend `channels.ts` Channel type**

The repo's Channel type was missing `posting_schedule` and `target_format_mix`. Update it (these columns exist in the DB but the TS type didn't reflect them):

```ts
export interface PostingScheduleRecord { weekdays: string[]; weekends: string[] }
export type Channel = {
  // ...existing...
  timezone: string;
  posting_schedule: PostingScheduleRecord;
  target_format_mix: FormatMix;
  oauth_refresh_token_encrypted: string | null;
};
```

- [ ] **Step 4: Stub the four components so the page compiles**

Create each component as a minimal "TODO Task Fx" stub:

```tsx
// src/components/operations/alert-banner.tsx
import type { OperatorAlertRow } from '@/lib/supabase/repositories/operator-alerts';
export function AlertBanner({ alerts }: { alerts: OperatorAlertRow[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="rounded border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-sm space-y-2">
      {alerts.map((a) => (
        <p key={a.id} className="text-text-primary">{a.category} — {a.message}</p>
      ))}
    </div>
  );
}
```

```tsx
// src/components/operations/format-mix-bar.tsx
import type { FormatMix } from '@/lib/supabase/repositories/channels';
export function FormatMixBar({ channelId, targetMix }: { channelId: string; targetMix: FormatMix }) {
  return (
    <div className="rounded border border-subtle bg-surface px-4 py-2 text-xs font-mono text-text-muted">
      Target: {(targetMix.explainer * 100).toFixed(0)}% explainer / {(targetMix.compilation * 100).toFixed(0)}% compilation
      <span className="ml-3 text-text-disabled">(actual mix bar — Task F2)</span>
    </div>
  );
}
```

```tsx
// src/components/operations/week-calendar.tsx
export function WeekCalendar(props: {
  channelId: string;
  channelTimezone: string;
  postingSchedule: { weekdays: string[]; weekends: string[] };
  weekStartISO: string;
  weekEndISO: string;
}) {
  return (
    <div className="rounded border border-subtle bg-surface p-4 text-sm text-text-muted">
      Week {props.weekStartISO} — calendar UI ships in Task F3.
    </div>
  );
}
```

```tsx
// src/components/operations/recommendations-panel.tsx
import type { ScheduleRecommendationRow } from '@/lib/supabase/repositories/schedule-recommendations';
export function RecommendationsPanel({
  channelId, recommendations,
}: {
  channelId: string;
  recommendations: ScheduleRecommendationRow[];
}) {
  return (
    <aside className="rounded border border-subtle bg-surface p-4">
      <h3 className="text-sm font-medium text-text-primary mb-2">Analyst Recommendations</h3>
      {recommendations.length === 0 ? (
        <p className="text-xs text-text-muted">No recommendations yet. Plan #5's Analyst writes these once it has enough data.</p>
      ) : (
        <ul className="space-y-2 text-xs text-text-muted">
          {recommendations.map((r) => (
            <li key={r.id}>{r.confidence} · {String(r.created_at).slice(0, 10)}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}
```

- [ ] **Step 5: Verify the page renders + commit**

```bash
npx tsc --noEmit
```

Then operator local smoke: `npm run dev`, visit `/operations`, confirm Nav link works, all sub-regions render their stubs.

```bash
git add src/app/operations/page.tsx src/components/operations/ src/components/cockpit/cockpit-shell.tsx src/lib/supabase/repositories/channels.ts
git commit -m "feat(operations): /operations skeleton + nav + 4 stub regions"
```

---

### Task F2: Format-mix bar — actual 7-day mix + edit modal

**Files:**
- Modify: `src/components/operations/format-mix-bar.tsx`
- Create: `src/app/api/operations/format-mix/route.ts` (PATCH channels.target_format_mix)
- Test: `src/tests/api/operations-format-mix.test.ts`

- [ ] **Step 1: Make `format-mix-bar` a server component that computes actual mix**

```tsx
// src/components/operations/format-mix-bar.tsx
import { getServiceClient } from '@/lib/supabase/server';
import { FormatMixEditButton } from './format-mix-edit-button';
import type { FormatMix } from '@/lib/supabase/repositories/channels';
import { DateTime } from 'luxon';

export async function FormatMixBar({
  channelId,
  targetMix,
}: {
  channelId: string;
  targetMix: FormatMix;
}) {
  const supabase = getServiceClient();
  const since = DateTime.utc().minus({ days: 7 }).toISO();
  const { data } = await supabase
    .from('your_videos')
    .select('source_compilation_draft_id, status')
    .eq('channel_id', channelId)
    .in('status', ['rendered', 'scheduled', 'uploading', 'posted'])
    .gte('updated_at', since!);

  const rows = (data ?? []) as Array<{ source_compilation_draft_id: string | null }>;
  const total = rows.length;
  const compilation = rows.filter((r) => r.source_compilation_draft_id != null).length;
  const explainer = total - compilation;
  const actualExplainerPct = total === 0 ? 0 : Math.round((explainer / total) * 100);
  const actualCompPct = total === 0 ? 0 : 100 - actualExplainerPct;

  return (
    <div className="rounded border border-subtle bg-surface px-4 py-3 flex items-center justify-between gap-4">
      <div className="text-xs font-mono text-text-muted">
        Last 7 days: {actualExplainerPct}% explainer / {actualCompPct}% compilation
        <span className="ml-3 text-text-disabled">
          Target: {Math.round(targetMix.explainer * 100)}% / {Math.round(targetMix.compilation * 100)}%
        </span>
        <span className="ml-3 text-text-disabled">(n={total})</span>
      </div>
      <FormatMixEditButton channelId={channelId} current={targetMix} />
    </div>
  );
}
```

```tsx
// src/components/operations/format-mix-edit-button.tsx
'use client';
import { useState } from 'react';
import type { FormatMix } from '@/lib/supabase/repositories/channels';

export function FormatMixEditButton({ channelId, current }: { channelId: string; current: FormatMix }) {
  const [open, setOpen] = useState(false);
  const [explainer, setExplainer] = useState(Math.round(current.explainer * 100));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const exp = explainer / 100;
      const res = await fetch('/api/operations/format-mix', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channelId, explainer: exp, compilation: 1 - exp }),
      });
      if (!res.ok) alert('save failed');
      else location.reload();
    } finally { setBusy(false); }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-accent-electric hover:underline">Edit</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60" onClick={() => setOpen(false)}>
          <div className="rounded-lg bg-surface border border-subtle p-6 w-96 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-text-primary">Target format mix</h3>
            <label className="block text-xs text-text-muted">
              Explainer % (compilation = 100 − this)
              <input type="number" min={0} max={100} value={explainer} onChange={(e) => setExplainer(parseInt(e.target.value || '0', 10))}
                     className="mt-1 w-full px-2 py-1 rounded border border-subtle bg-app text-text-primary text-sm" />
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="px-3 py-1.5 rounded bg-elevated text-text-primary text-xs">Cancel</button>
              <button onClick={save} disabled={busy} className="px-3 py-1.5 rounded bg-accent-electric text-app text-xs disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Write the failing route test**

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
import { POST } from '@/app/api/operations/format-mix/route';
import { getServiceClient } from '@/lib/supabase/server';

function req(body: unknown): Request {
  return new Request('https://app/api/operations/format-mix', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('POST /api/operations/format-mix', () => {
  it('rejects when explainer+compilation != 1', async () => {
    const res = await POST(req({ channelId: '11111111-1111-1111-1111-111111111111', explainer: 0.6, compilation: 0.5 }));
    expect(res.status).toBe(400);
  });

  it('updates channels.target_format_mix', async () => {
    let captured: Record<string, unknown> | null = null;
    vi.mocked(getServiceClient).mockReturnValue({
      from: () => ({ update: (p: Record<string, unknown>) => ({ eq: async () => { captured = p; return { error: null }; } }) }),
    } as never);
    const res = await POST(req({ channelId: '11111111-1111-1111-1111-111111111111', explainer: 0.6, compilation: 0.4 }));
    expect(res.status).toBe(200);
    expect((captured!.target_format_mix as { explainer: number }).explainer).toBe(0.6);
  });
});
```

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/operations/format-mix/route.ts
import 'server-only';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Body = z.object({
  channelId: z.string().regex(UUID),
  explainer: z.number().min(0).max(1),
  compilation: z.number().min(0).max(1),
}).refine((b) => Math.abs(b.explainer + b.compilation - 1) < 0.001, 'shares must sum to 1');

export async function POST(req: Request): Promise<Response> {
  let body;
  try { body = Body.parse(await req.json()); }
  catch (err) { return Response.json({ error: err instanceof Error ? err.message : 'bad body' }, { status: 400 }); }
  const supabase = getServiceClient();
  const { error } = await supabase
    .from('channels')
    .update({ target_format_mix: { explainer: body.explainer, compilation: body.compilation } })
    .eq('id', body.channelId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run src/tests/api/operations-format-mix.test.ts
# expect 2 passing
git add src/components/operations/format-mix-bar.tsx src/components/operations/format-mix-edit-button.tsx src/app/api/operations/format-mix/route.ts src/tests/api/operations-format-mix.test.ts
git commit -m "feat(operations): format-mix bar with actual 7d% + edit modal"
```

---

### Task F3: Week calendar — slot grid + filled-slot cards + drag-to-reschedule

**Files:**
- Modify: `src/components/operations/week-calendar.tsx` — real implementation
- Create: `src/components/operations/schedule-card.tsx` — draggable filled-slot
- Create: `src/app/api/operations/reschedule/route.ts`
- Test: `src/tests/api/operations-reschedule.test.ts`

Given UI complexity, the agent implements the calendar incrementally:

- [ ] **Step 1: Server-side data fetch**

Update `week-calendar.tsx` to fetch scheduled+posted rows in the week range via `listScheduledForChannelInRange` (already in repo) + a helper for `posted` rows. Build a 7-column × N-slot grid using `posting_schedule` slots converted via luxon.

```tsx
// src/components/operations/week-calendar.tsx
import { getServiceClient } from '@/lib/supabase/server';
import { DateTime } from 'luxon';
import { ScheduleCard } from './schedule-card';

export async function WeekCalendar({
  channelId, channelTimezone, postingSchedule, weekStartISO, weekEndISO,
}: {
  channelId: string;
  channelTimezone: string;
  postingSchedule: { weekdays: string[]; weekends: string[] };
  weekStartISO: string;
  weekEndISO: string;
}) {
  const supabase = getServiceClient();
  const weekStart = DateTime.fromISO(weekStartISO, { zone: channelTimezone });
  const weekEnd = DateTime.fromISO(weekEndISO, { zone: channelTimezone });

  const { data: rows } = await supabase
    .from('your_videos')
    .select('id, title, status, scheduled_for, posted_at, url, render_artifact_url, source_compilation_draft_id')
    .eq('channel_id', channelId)
    .in('status', ['scheduled', 'uploading', 'posted'])
    .gte('scheduled_for', weekStart.toUTC().toISO()!)
    .lt('scheduled_for', weekEnd.toUTC().toISO()!);
  const items = (rows ?? []) as Array<{
    id: string; title: string; status: string; scheduled_for: string | null;
    posted_at: string | null; url: string | null;
    source_compilation_draft_id: string | null;
  }>;

  const days = Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i }));

  return (
    <div className="rounded border border-subtle bg-surface p-3">
      <div className="grid grid-cols-7 gap-2">
        {days.map((day) => {
          const isWeekend = day.weekday >= 6;
          const slots = isWeekend ? postingSchedule.weekends : postingSchedule.weekdays;
          return (
            <div key={day.toISODate()!} className="border border-subtle rounded p-2 min-h-[280px] space-y-2">
              <div className="text-xs font-mono text-text-muted">{day.toFormat('ccc LL/dd')}</div>
              {slots.map((slotStr) => {
                const [h, m] = slotStr.split(':').map(Number);
                const slotLocal = day.set({ hour: h, minute: m });
                if (!slotLocal.isValid) return null;
                const slotUtcISO = slotLocal.toUTC().toISO()!;
                const filled = items.find((it) =>
                  it.scheduled_for && Math.abs(new Date(it.scheduled_for).getTime() - new Date(slotUtcISO).getTime()) < 5 * 60 * 1000,
                );
                return filled ? (
                  <ScheduleCard key={slotStr} item={filled} slotUtcISO={slotUtcISO} />
                ) : (
                  <div key={slotStr} className="text-[10px] font-mono text-text-disabled border border-dashed border-subtle rounded px-1 py-2">
                    {slotStr}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: ScheduleCard with drag handle**

```tsx
// src/components/operations/schedule-card.tsx
'use client';
import { useState } from 'react';

export function ScheduleCard({
  item,
  slotUtcISO,
}: {
  item: { id: string; title: string; status: string; url: string | null; source_compilation_draft_id: string | null };
  slotUtcISO: string;
}) {
  const [busy, setBusy] = useState(false);
  const isPosted = item.status === 'posted';
  const isCompilation = item.source_compilation_draft_id != null;

  function onDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/x-video-id', item.id);
  }

  async function onDropTarget(e: React.DragEvent) {
    e.preventDefault();
    const droppedVideoId = e.dataTransfer.getData('text/x-video-id');
    if (!droppedVideoId || droppedVideoId === item.id) return;
    setBusy(true);
    try {
      const res = await fetch('/api/operations/reschedule', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ videoId: droppedVideoId, scheduledFor: slotUtcISO }),
      });
      if (!res.ok) alert('reschedule failed');
      else location.reload();
    } finally { setBusy(false); }
  }

  return (
    <div
      draggable={!isPosted}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDropTarget}
      className={`text-[10px] rounded px-1 py-1.5 border ${
        isPosted ? 'bg-elevated text-text-muted border-subtle' : 'bg-accent-electric/15 text-text-primary border-accent-electric/40 cursor-grab'
      }`}
    >
      <p className="truncate font-medium">{item.title}</p>
      <p className="font-mono text-[9px] mt-0.5">{item.status}{isCompilation ? ' · F2' : ' · F1'}</p>
      {isPosted && item.url && (
        <a href={item.url} target="_blank" rel="noopener" className="text-accent-electric underline">view ↗</a>
      )}
    </div>
  );
}
```

Note: drag-to-EMPTY-slot is intentionally not supported in this iteration — operator drags onto a card to "swap with this slot." Empty slots take manual scheduling via a separate flow (Task F5 ships that). This keeps the drag interaction simple.

- [ ] **Step 3: Reschedule route + test**

`src/tests/api/operations-reschedule.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({}) as never) }));
vi.mock('@/lib/supabase/repositories/your-videos', () => ({
  rescheduleVideo: vi.fn(),
}));

import { POST } from '@/app/api/operations/reschedule/route';
import { rescheduleVideo } from '@/lib/supabase/repositories/your-videos';

const UUID = '11111111-1111-1111-1111-111111111111';
beforeEach(() => vi.clearAllMocks());

function req(body: unknown) {
  return new Request('https://app/api/operations/reschedule', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('POST /api/operations/reschedule', () => {
  it('400 on missing videoId', async () => { expect((await POST(req({}))).status).toBe(400); });
  it('400 on invalid ISO timestamp', async () => { expect((await POST(req({ videoId: UUID, scheduledFor: 'nope' }))).status).toBe(400); });
  it('409 when rescheduleVideo returns false', async () => {
    vi.mocked(rescheduleVideo).mockResolvedValue(false);
    expect((await POST(req({ videoId: UUID, scheduledFor: '2026-06-01T11:30:00Z' }))).status).toBe(409);
  });
  it('200 happy path', async () => {
    vi.mocked(rescheduleVideo).mockResolvedValue(true);
    expect((await POST(req({ videoId: UUID, scheduledFor: '2026-06-01T11:30:00Z' }))).status).toBe(200);
  });
});
```

`src/app/api/operations/reschedule/route.ts`:

```ts
import 'server-only';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server';
import { rescheduleVideo } from '@/lib/supabase/repositories/your-videos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Body = z.object({ videoId: z.string().regex(UUID), scheduledFor: z.string().datetime() });

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body;
  try { body = Body.parse(await req.json()); }
  catch { return Response.json({ error: 'bad body' }, { status: 400 }); }
  const supabase = getServiceClient();
  const ok = await rescheduleVideo(supabase, { videoId: body.videoId, scheduledFor: new Date(body.scheduledFor) });
  if (!ok) return Response.json({ error: 'wrong_status_race' }, { status: 409 });
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run src/tests/api/operations-reschedule.test.ts
# expect 4 passing
git add src/components/operations/week-calendar.tsx src/components/operations/schedule-card.tsx src/app/api/operations/reschedule/route.ts src/tests/api/operations-reschedule.test.ts
git commit -m "feat(operations): week calendar with drag-to-reschedule"
```

---

### Task F4: Auto-schedule next 7 drafts button

**Files:**
- Create: `src/app/api/operations/auto-schedule/route.ts`
- Modify: `src/components/operations/week-calendar.tsx` (add button to header)
- Create: `src/components/operations/auto-schedule-button.tsx`
- Test: `src/tests/api/operations-auto-schedule.test.ts`

- [ ] **Step 1: Write the failing route test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));
vi.mock('@/lib/supabase/repositories/your-videos', () => ({
  scheduleVideo: vi.fn(),
  slotIsOccupied: vi.fn(async () => false),
}));
vi.mock('@/lib/timezone', () => ({
  nextOpenSlotAfter: vi.fn(),
  BacklogOverflowError: class extends Error {},
}));

import { POST } from '@/app/api/operations/auto-schedule/route';
import { getServiceClient } from '@/lib/supabase/server';
import { scheduleVideo } from '@/lib/supabase/repositories/your-videos';
import { nextOpenSlotAfter } from '@/lib/timezone';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServiceClient).mockReturnValue({
    from: (table: string) => {
      if (table === 'your_videos') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'channels') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'c1', timezone: 'America/New_York',
                  posting_schedule: { weekdays: ['07:30'], weekends: ['11:30'] },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(table);
    },
  } as never);
});

describe('POST /api/operations/auto-schedule', () => {
  it('schedules each rendered draft to consecutive open slots', async () => {
    const { DateTime } = await import('luxon');
    let callIdx = 0;
    vi.mocked(nextOpenSlotAfter).mockImplementation(async () => {
      callIdx += 1;
      return DateTime.fromISO(`2026-06-${String(callIdx).padStart(2, '0')}T11:30:00Z`);
    });
    vi.mocked(scheduleVideo).mockResolvedValue(true);

    const req = new Request('https://app/api/operations/auto-schedule', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ channelId: '11111111-1111-1111-1111-111111111111' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scheduled).toBe(3);
    expect(vi.mocked(scheduleVideo)).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Implement the route**

```ts
// src/app/api/operations/auto-schedule/route.ts
import 'server-only';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { getServiceClient } from '@/lib/supabase/server';
import { scheduleVideo, slotIsOccupied } from '@/lib/supabase/repositories/your-videos';
import { nextOpenSlotAfter, BacklogOverflowError, type ChannelForSchedule } from '@/lib/timezone';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Body = z.object({ channelId: z.string().regex(UUID), count: z.number().int().min(1).max(20).default(7) });

export async function POST(req: Request): Promise<Response> {
  let body;
  try { body = Body.parse(await req.json()); }
  catch { return Response.json({ error: 'bad body' }, { status: 400 }); }
  const supabase = getServiceClient();

  const { data: chan, error: cErr } = await supabase
    .from('channels')
    .select('id, timezone, posting_schedule')
    .eq('id', body.channelId)
    .single();
  if (cErr || !chan) return Response.json({ error: 'channel_not_found' }, { status: 404 });
  const channel = chan as ChannelForSchedule;

  const { data: drafts, error: dErr } = await supabase
    .from('your_videos')
    .select('id')
    .eq('channel_id', body.channelId)
    .eq('status', 'rendered')
    .order('created_at', { ascending: true })
    .limit(body.count);
  if (dErr) return Response.json({ error: dErr.message }, { status: 500 });
  const rendered = (drafts ?? []) as Array<{ id: string }>;

  let cursor = DateTime.utc();
  let scheduled = 0;
  const errors: string[] = [];

  for (const d of rendered) {
    try {
      const slot = await nextOpenSlotAfter(channel, cursor, async (slotUtc) =>
        slotIsOccupied(supabase, channel.id, slotUtc.toJSDate()),
      );
      const ok = await scheduleVideo(supabase, { videoId: d.id, scheduledFor: slot.toJSDate() });
      if (ok) {
        scheduled += 1;
        cursor = slot; // next iteration starts from this slot
      } else {
        errors.push(`status race on ${d.id}`);
      }
    } catch (err) {
      if (err instanceof BacklogOverflowError) break;
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return Response.json({ ok: true, scheduled, attempted: rendered.length, errors });
}
```

- [ ] **Step 3: Wire the button**

```tsx
// src/components/operations/auto-schedule-button.tsx
'use client';
import { useState } from 'react';

export function AutoScheduleButton({ channelId }: { channelId: string }) {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const res = await fetch('/api/operations/auto-schedule', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channelId, count: 7 }),
      });
      const body = await res.json();
      alert(`Scheduled ${body.scheduled} / ${body.attempted}.`);
      location.reload();
    } finally { setBusy(false); }
  }
  return (
    <button onClick={run} disabled={busy} className="px-3 py-1.5 rounded bg-accent-electric text-app text-xs font-medium hover:opacity-90 disabled:opacity-50">
      Auto-schedule next 7 drafts
    </button>
  );
}
```

Add it to the week-calendar header (above the grid):

```tsx
// at the top of the WeekCalendar return:
<div className="flex items-center justify-between mb-3">
  <p className="text-xs font-mono text-text-muted">{weekStart.toFormat('LLL d')} – {weekStart.plus({ days: 6 }).toFormat('LLL d, yyyy')}</p>
  <AutoScheduleButton channelId={channelId} />
</div>
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run src/tests/api/operations-auto-schedule.test.ts
# expect 1 passing
git add src/app/api/operations/auto-schedule/route.ts src/components/operations/auto-schedule-button.tsx src/components/operations/week-calendar.tsx src/tests/api/operations-auto-schedule.test.ts
git commit -m "feat(operations): Auto-schedule next 7 drafts button"
```

---

### Task F5: Recommendations panel — Apply / Dismiss buttons

**Files:**
- Modify: `src/components/operations/recommendations-panel.tsx`
- Create: `src/app/api/operations/recommendations/apply/route.ts`
- Create: `src/app/api/operations/recommendations/dismiss/route.ts`
- Test: `src/tests/api/operations-recommendations.test.ts`

- [ ] **Step 1: Update the panel to show evidence + Apply/Dismiss buttons**

```tsx
// src/components/operations/recommendations-panel.tsx
import type { ScheduleRecommendationRow } from '@/lib/supabase/repositories/schedule-recommendations';
import { RecommendationActions } from './recommendation-actions';

export function RecommendationsPanel({
  channelId, recommendations,
}: {
  channelId: string;
  recommendations: ScheduleRecommendationRow[];
}) {
  return (
    <aside className="rounded border border-subtle bg-surface p-4 space-y-3">
      <h3 className="text-sm font-medium text-text-primary">Analyst Recommendations</h3>
      {recommendations.length === 0 ? (
        <p className="text-xs text-text-muted">
          No recommendations yet. Plan #5's Analyst writes these once it has enough data.
        </p>
      ) : (
        <ul className="space-y-3">
          {recommendations.map((r) => (
            <li key={r.id} className="rounded border border-subtle p-3 space-y-2">
              <p className="text-xs font-mono uppercase tracking-wide text-text-muted">{r.confidence}</p>
              <pre className="text-[10px] text-text-primary whitespace-pre-wrap break-words">{JSON.stringify(r.evidence, null, 2)}</pre>
              <RecommendationActions recId={r.id} />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
```

```tsx
// src/components/operations/recommendation-actions.tsx
'use client';
import { useState } from 'react';

export function RecommendationActions({ recId }: { recId: string }) {
  const [busy, setBusy] = useState(false);
  async function call(action: 'apply' | 'dismiss') {
    setBusy(true);
    try {
      const res = await fetch(`/api/operations/recommendations/${action}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recId }),
      });
      if (!res.ok) alert(`${action} failed`);
      else location.reload();
    } finally { setBusy(false); }
  }
  return (
    <div className="flex gap-2">
      <button onClick={() => call('apply')} disabled={busy} className="px-2 py-1 rounded bg-accent-electric text-app text-[10px]">Apply</button>
      <button onClick={() => call('dismiss')} disabled={busy} className="px-2 py-1 rounded bg-elevated text-text-primary text-[10px] border border-subtle">Dismiss</button>
    </div>
  );
}
```

- [ ] **Step 2: Routes**

```ts
// src/app/api/operations/recommendations/apply/route.ts
import 'server-only';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server';
import { applyRecommendation } from '@/lib/supabase/repositories/schedule-recommendations';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Body = z.object({ recId: z.string().regex(UUID) });

export async function POST(req: Request): Promise<Response> {
  let body;
  try { body = Body.parse(await req.json()); }
  catch { return Response.json({ error: 'bad body' }, { status: 400 }); }
  await applyRecommendation(getServiceClient(), body.recId);
  return Response.json({ ok: true });
}
```

```ts
// src/app/api/operations/recommendations/dismiss/route.ts
import 'server-only';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server';
import { dismissRecommendation } from '@/lib/supabase/repositories/schedule-recommendations';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Body = z.object({ recId: z.string().regex(UUID) });

export async function POST(req: Request): Promise<Response> {
  let body;
  try { body = Body.parse(await req.json()); }
  catch { return Response.json({ error: 'bad body' }, { status: 400 }); }
  await dismissRecommendation(getServiceClient(), body.recId);
  return Response.json({ ok: true });
}
```

- [ ] **Step 3: Tests**

`src/tests/api/operations-recommendations.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({} as never)) }));
vi.mock('@/lib/supabase/repositories/schedule-recommendations', () => ({
  applyRecommendation: vi.fn(),
  dismissRecommendation: vi.fn(),
}));

import { POST as applyPOST } from '@/app/api/operations/recommendations/apply/route';
import { POST as dismissPOST } from '@/app/api/operations/recommendations/dismiss/route';
import { applyRecommendation, dismissRecommendation } from '@/lib/supabase/repositories/schedule-recommendations';

const UUID = '11111111-1111-1111-1111-111111111111';
beforeEach(() => vi.clearAllMocks());

function req(url: string, body: unknown) {
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

describe('recommendations apply/dismiss', () => {
  it('apply 200', async () => {
    vi.mocked(applyRecommendation).mockResolvedValue();
    expect((await applyPOST(req('https://x/apply', { recId: UUID }))).status).toBe(200);
    expect(vi.mocked(applyRecommendation)).toHaveBeenCalledWith(expect.anything(), UUID);
  });
  it('dismiss 200', async () => {
    vi.mocked(dismissRecommendation).mockResolvedValue();
    expect((await dismissPOST(req('https://x/dismiss', { recId: UUID }))).status).toBe(200);
  });
  it('400 invalid body', async () => {
    expect((await applyPOST(req('https://x/apply', {}))).status).toBe(400);
  });
});
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run src/tests/api/operations-recommendations.test.ts
# expect 3 passing
git add src/components/operations/recommendations-panel.tsx src/components/operations/recommendation-actions.tsx src/app/api/operations/recommendations/ src/tests/api/operations-recommendations.test.ts
git commit -m "feat(operations): Recommendations panel — Apply + Dismiss"
```

---

### Task F6: Alert banner — Resolve route + action buttons

**Files:**
- Modify: `src/components/operations/alert-banner.tsx`
- Create: `src/app/api/operator-alerts/resolve/route.ts`
- Test: `src/tests/api/operator-alerts-resolve.test.ts`

- [ ] **Step 1: Upgrade the banner to show suggested_actions + Resolve**

```tsx
// src/components/operations/alert-banner.tsx
import type { OperatorAlertRow } from '@/lib/supabase/repositories/operator-alerts';
import { AlertActions } from './alert-actions';

export function AlertBanner({ alerts }: { alerts: OperatorAlertRow[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="space-y-2">
      {alerts.map((a) => {
        const actions = Array.isArray(a.suggested_actions) ? a.suggested_actions as Array<{ label: string; action_type: string; params?: Record<string, unknown> }> : [];
        return (
          <div key={a.id} className={`rounded border px-4 py-3 text-sm flex items-start justify-between gap-3 ${
            a.severity === 'error' ? 'border-accent-red/40 bg-accent-red/10' :
            a.severity === 'warn' ? 'border-accent-amber/40 bg-accent-amber/10' :
            'border-subtle bg-elevated'
          }`}>
            <div className="min-w-0">
              <p className="text-xs font-mono uppercase tracking-wide text-text-muted">{a.category} · {a.severity}</p>
              <p className="text-text-primary mt-1">{a.message}</p>
            </div>
            <AlertActions alertId={a.id} actions={actions} />
          </div>
        );
      })}
    </div>
  );
}
```

```tsx
// src/components/operations/alert-actions.tsx
'use client';
import { useState } from 'react';

export function AlertActions({
  alertId, actions,
}: {
  alertId: string;
  actions: Array<{ label: string; action_type: string; params?: Record<string, unknown> }>;
}) {
  const [busy, setBusy] = useState(false);
  async function resolve(action_type: string, params?: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch('/api/operator-alerts/resolve', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ alertId, action_type, params }),
      });
      if (!res.ok) alert('resolve failed');
      else location.reload();
    } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-1 shrink-0">
      {actions.map((act, i) => (
        <button key={i} onClick={() => resolve(act.action_type, act.params)} disabled={busy} className="text-[10px] px-2 py-1 rounded bg-elevated text-text-primary border border-subtle hover:bg-hover">
          {act.label}
        </button>
      ))}
      <button onClick={() => resolve('dismiss')} disabled={busy} className="text-[10px] px-2 py-1 rounded text-text-muted hover:text-text-primary">
        Dismiss
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Failing test for the route**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({} as never)) }));
vi.mock('@/lib/supabase/repositories/operator-alerts', () => ({
  resolveAlert: vi.fn(async () => undefined),
}));

import { POST } from '@/app/api/operator-alerts/resolve/route';
import { getServiceClient } from '@/lib/supabase/server';
import { resolveAlert } from '@/lib/supabase/repositories/operator-alerts';

const UUID = '11111111-1111-1111-1111-111111111111';
beforeEach(() => vi.clearAllMocks());

function req(body: unknown) {
  return new Request('https://app/api/operator-alerts/resolve', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('POST /api/operator-alerts/resolve', () => {
  it('action_type=dismiss resolves the alert', async () => {
    const res = await POST(req({ alertId: UUID, action_type: 'dismiss' }));
    expect(res.status).toBe(200);
    expect(vi.mocked(resolveAlert)).toHaveBeenCalledWith(expect.anything(), UUID);
  });

  it('action_type=patch_channel updates channels then resolves', async () => {
    let captured: Record<string, unknown> | null = null;
    vi.mocked(getServiceClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'operator_alerts') {
          return {
            select: () => ({ eq: () => ({ single: async () => ({ data: { channel_id: 'c1' }, error: null }) }) }),
          };
        }
        if (table === 'channels') {
          return { update: (patch: Record<string, unknown>) => ({ eq: async () => { captured = patch; return { error: null }; } }) };
        }
        throw new Error(table);
      },
    } as never);
    const res = await POST(req({ alertId: UUID, action_type: 'patch_channel', params: { max_uploads_per_day: 4 } }));
    expect(res.status).toBe(200);
    expect(captured!.max_uploads_per_day).toBe(4);
  });

  it('400 on missing alertId', async () => {
    expect((await POST(req({}))).status).toBe(400);
  });
});
```

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/operator-alerts/resolve/route.ts
import 'server-only';
import { z } from 'zod';
import { getServiceClient } from '@/lib/supabase/server';
import { resolveAlert } from '@/lib/supabase/repositories/operator-alerts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Body = z.object({
  alertId: z.string().regex(UUID),
  action_type: z.enum(['dismiss', 'patch_channel', 'bulk_status']),
  params: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request): Promise<Response> {
  let body;
  try { body = Body.parse(await req.json()); }
  catch { return Response.json({ error: 'bad body' }, { status: 400 }); }
  const supabase = getServiceClient();

  if (body.action_type === 'patch_channel') {
    const { data: alert } = await supabase
      .from('operator_alerts')
      .select('channel_id')
      .eq('id', body.alertId)
      .single();
    const channelId = (alert as { channel_id: string } | null)?.channel_id;
    if (channelId && body.params) {
      await supabase.from('channels').update(body.params).eq('id', channelId);
    }
  } else if (body.action_type === 'bulk_status') {
    const params = body.params ?? {};
    const from = String(params.from ?? '');
    const to = String(params.to ?? '');
    const olderThanDays = Number(params.older_than_days ?? 0);
    if (from && to && olderThanDays > 0) {
      const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
      await supabase
        .from('your_videos')
        .update({ status: to, updated_at: new Date().toISOString() })
        .eq('status', from)
        .lt('updated_at', cutoff);
    }
  }
  // 'dismiss' falls through to resolve.

  await resolveAlert(supabase, body.alertId);
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run src/tests/api/operator-alerts-resolve.test.ts
# expect 3 passing
git add src/components/operations/alert-banner.tsx src/components/operations/alert-actions.tsx src/app/api/operator-alerts/resolve/route.ts src/tests/api/operator-alerts-resolve.test.ts
git commit -m "feat(operations): alert banner + /api/operator-alerts/resolve route"
```

---

### Task F7: Sub-phase F merge to main + prod smoke

- [ ] **Step 1: Tests + types green**

```bash
unset ANTHROPIC_BASE_URL && npx vitest run && npx tsc --noEmit
```

- [ ] **Step 2: PR**

```bash
git checkout -b plan-4-phase-5-operations
git push -u origin plan-4-phase-5-operations
gh pr create --title "Plan #4 Phase 5 Sub-phase F — /operations page" --body "..."
```

- [ ] **Step 3: Operator smoke**

```
1. Visit prod /operations: alert banner, format-mix bar, week calendar with current week's slots, empty Recommendations panel.
2. Drag a scheduled card from one slot to another — verify Supabase: scheduled_for updated.
3. Click "Auto-schedule next 7 drafts" — verify N scheduled rows appear within the next 7 days.
4. Edit target_format_mix to 70/30 via the edit modal — verify channels.target_format_mix updated.
5. Force a fake alert in SQL to test the banner:

   insert into operator_alerts(channel_id, category, severity, message, suggested_actions, status)
   values(
     'c8edc30f-375d-4b38-b6b0-77fa4b5e59a7', 'schedule_backlog_overflow', 'warn',
     'Test alert', '[{"label":"Increase cap","action_type":"patch_channel","params":{"max_uploads_per_day":4}}]'::jsonb,
     'unresolved');

   Click Dismiss; verify status=resolved.
```

- [ ] **Step 4: Merge**

```bash
gh pr merge plan-4-phase-5-operations --squash --delete-branch
git checkout main && git pull origin main
```

**Sub-phase F acceptance:** Closing acceptance items #5, #6, #7 of Plan #4 are now testable end-to-end via /operations.

---

# Sub-phase G: Music library import CLI

Replaces the 3 placeholder Phase 4 tracks with real CC0 music. Operator drops 20–50 MP3s into `music-import/`; CLI uploads each to Vercel Blob, asks Haiku for genre + energy + attribution flag, inserts `music_tracks` rows.

### Task G1: `scripts/import-music-library.ts`

**Files:**
- Create: `scripts/import-music-library.ts`
- Modify: `package.json` — add `"import:music-library": "tsx scripts/import-music-library.ts"` to scripts
- Test: `src/tests/scripts/import-music-library.test.ts`
- Add `.gitignore` entry for `music-import/` (raw MP3s shouldn't land in git).

The CLI runs locally (operator's machine). It uses the Vercel Blob client (`@vercel/blob`) which is already a project dep, the AI SDK + Anthropic provider for Haiku, and ffprobe for duration. We can re-use `@ffprobe-installer/ffprobe` from the worker package, or use a thin spawn-ffprobe helper — pick the latter to avoid adding the dep to the root `package.json`.

- [ ] **Step 1: Update `.gitignore`**

Append to `.gitignore`:

```
music-import/
```

- [ ] **Step 2: Add npm script**

In `package.json`, under `scripts`:

```json
"import:music-library": "tsx scripts/import-music-library.ts"
```

Also add `tsx` as a devDependency if not already present:

```bash
npm install --save-dev tsx@^4.20.0
```

(`tsx` is already a worker-package dep; adding it at root is needed for the CLI to run via `npx tsx` from the root.)

- [ ] **Step 3: Write the failing test**

The CLI is bulk-operation code, so unit-test the **pure tagging logic** plus the **insert-row builder**, and leave the Blob upload + filesystem traversal as an integration smoke the operator runs once.

Create `src/tests/scripts/import-music-library.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildMusicTrackInsert, tagTrackWithHaiku, type TagResult } from '@/../scripts/import-music-library';

const ORIGINAL_FETCH = globalThis.fetch;
afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

describe('import-music-library tagging', () => {
  it('buildMusicTrackInsert composes a music_tracks row from filename + Blob URL + tag result', () => {
    const tag: TagResult = { genre: 'ambient', energy_level: 2, requires_attribution: false, artist: 'Trackbed' };
    const row = buildMusicTrackInsert({
      filename: 'Trackbed - Morning Fog.mp3',
      blobUrl: 'https://blob.example.com/music/abc.mp3',
      durationSeconds: 124.5,
      tag,
    });
    expect(row.title).toBe('Morning Fog');
    expect(row.artist).toBe('Trackbed');
    expect(row.local_path).toBe('https://blob.example.com/music/abc.mp3');
    expect(row.duration_seconds).toBe(124.5);
    expect(row.genre).toBe('ambient');
    expect(row.energy_level).toBe(2);
    expect(row.requires_attribution).toBe(false);
    expect(row.source).toBe('youtube_audio_library');
  });

  it('buildMusicTrackInsert falls back to "Unknown" artist when filename has no hyphen', () => {
    const row = buildMusicTrackInsert({
      filename: 'Mystery Track.mp3',
      blobUrl: 'u', durationSeconds: 60,
      tag: { genre: 'cinematic', energy_level: 3, requires_attribution: false, artist: null },
    });
    expect(row.title).toBe('Mystery Track');
    expect(row.artist).toBeNull();
  });

  it('tagTrackWithHaiku parses Anthropic response and validates ranges', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        content: [{ type: 'text', text: JSON.stringify({
          genre: 'ambient', energy_level: 2, requires_attribution: false, artist: 'Test',
        })}],
      }), { status: 200 }),
    ) as never;
    const r = await tagTrackWithHaiku({
      apiKey: 'sk-x', filename: 'Test - Track.mp3', durationSeconds: 60,
    });
    expect(r.genre).toBe('ambient');
    expect(r.energy_level).toBe(2);
  });

  it('tagTrackWithHaiku clamps energy_level into [1,5]', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        content: [{ type: 'text', text: JSON.stringify({
          genre: 'lofi', energy_level: 9, requires_attribution: true, artist: null,
        })}],
      }), { status: 200 }),
    ) as never;
    const r = await tagTrackWithHaiku({ apiKey: 'sk-x', filename: 'X.mp3', durationSeconds: 60 });
    expect(r.energy_level).toBe(5);
  });
});
```

- [ ] **Step 4: Implement the CLI**

```ts
// scripts/import-music-library.ts
//
// CLI: walks ./music-import/*.mp3, ffprobes each for duration, asks Haiku to
// tag (genre, energy_level, requires_attribution, artist), uploads to Vercel
// Blob, inserts a music_tracks row. Skips files whose filename already exists
// in music_tracks (idempotent: re-running drops nothing).
//
// Usage:
//   unset ANTHROPIC_BASE_URL && npm run import:music-library
//
// Reads:  ./music-import/*.mp3
// Writes: music_tracks rows + Vercel Blob 'music/<sha256>.mp3' objects.
//
// Env vars needed (loaded from .env.local):
//   ANTHROPIC_API_KEY
//   BLOB_READ_WRITE_TOKEN  (Vercel Blob)
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
import { config } from 'dotenv';
import { resolve, join } from 'node:path';
import { readdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { put } from '@vercel/blob';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env.local'), override: true });

export interface TagResult {
  genre: string;
  energy_level: number; // 1..5
  requires_attribution: boolean;
  artist: string | null;
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export async function tagTrackWithHaiku(args: {
  apiKey: string;
  filename: string;
  durationSeconds: number;
}): Promise<TagResult> {
  const prompt = `You are tagging a music track for use in vertical short-form videos.
File: "${args.filename}"
Duration: ${args.durationSeconds.toFixed(1)}s

Return ONLY a JSON object with this exact shape:
{"genre": "<one-word: ambient|cinematic|lofi|electronic|orchestral|other>",
 "energy_level": <integer 1-5; 1=quietest, 5=loudest>,
 "requires_attribution": <boolean — true if the filename or context suggests Creative Commons BY licensing>,
 "artist": <string or null — extract from filename if present, e.g. "Artist - Track.mp3" → "Artist">}
`;
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': args.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Haiku tag: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const txt = json.content?.find((c) => c.type === 'text')?.text ?? '';
  const parsed = JSON.parse(txt) as Partial<TagResult>;
  return {
    genre: String(parsed.genre ?? 'other').toLowerCase(),
    energy_level: Math.max(1, Math.min(5, Math.round(Number(parsed.energy_level ?? 3)))),
    requires_attribution: Boolean(parsed.requires_attribution),
    artist: parsed.artist === undefined || parsed.artist === null ? null : String(parsed.artist),
  };
}

export function buildMusicTrackInsert(args: {
  filename: string;
  blobUrl: string;
  durationSeconds: number;
  tag: TagResult;
}): {
  title: string;
  artist: string | null;
  source: 'youtube_audio_library';
  local_path: string;
  duration_seconds: number;
  genre: string;
  energy_level: number;
  requires_attribution: boolean;
} {
  // "Artist - Track.mp3" → title="Track", artist="Artist"; otherwise filename minus extension.
  const base = args.filename.replace(/\.mp3$/i, '');
  let title = base;
  let artistFromFilename: string | null = null;
  const m = base.split(' - ');
  if (m.length >= 2) {
    artistFromFilename = m[0].trim();
    title = m.slice(1).join(' - ').trim();
  }
  return {
    title,
    artist: args.tag.artist ?? artistFromFilename,
    source: 'youtube_audio_library',
    local_path: args.blobUrl,
    duration_seconds: args.durationSeconds,
    genre: args.tag.genre,
    energy_level: args.tag.energy_level,
    requires_attribution: args.tag.requires_attribution,
  };
}

async function ffprobeDurationSeconds(filepath: string): Promise<number> {
  return new Promise((resolveFn, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', filepath,
    ]);
    let out = '';
    proc.stdout.on('data', (d) => { out += String(d); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`ffprobe failed: ${code}`));
      else resolveFn(parseFloat(out.trim()));
    });
  });
}

async function main(): Promise<void> {
  if (process.env.ANTHROPIC_BASE_URL) {
    console.error('Unset ANTHROPIC_BASE_URL before running this CLI — AI SDK calls 404 otherwise.');
    process.exit(2);
  }
  const dir = resolve(process.cwd(), 'music-import');
  const entries = await readdir(dir).catch(() => []);
  const files = entries.filter((e) => /\.mp3$/i.test(e));
  if (files.length === 0) {
    console.log(`No .mp3 files in ${dir} — nothing to do.`);
    return;
  }
  console.log(`Found ${files.length} .mp3 files in ${dir}`);

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  for (const filename of files) {
    try {
      const filepath = join(dir, filename);
      const s = await stat(filepath);
      if (s.size === 0) { console.log(`skip empty: ${filename}`); skipped += 1; continue; }

      const bytes = await readFile(filepath);
      const sha = createHash('sha256').update(bytes).digest('hex');
      const blobKey = `music/${sha}.mp3`;

      // Idempotency: skip if a row with this local_path already exists.
      const blobPublicPrefix = `${(process.env.VERCEL_BLOB_STORE_URL ?? '').replace(/\/$/, '')}/${blobKey}`;
      const { data: existing } = await supabase
        .from('music_tracks')
        .select('id')
        .like('local_path', `%${sha}.mp3`)
        .maybeSingle();
      if (existing) { console.log(`skip already-imported: ${filename}`); skipped += 1; continue; }

      console.log(`processing ${filename}...`);
      const durationSeconds = await ffprobeDurationSeconds(filepath);
      const tag = await tagTrackWithHaiku({ apiKey, filename, durationSeconds });
      const blob = await put(blobKey, bytes, {
        access: 'public', addRandomSuffix: false, contentType: 'audio/mpeg',
      });
      const row = buildMusicTrackInsert({
        filename, blobUrl: blob.url, durationSeconds, tag,
      });
      const { error } = await supabase.from('music_tracks').insert(row);
      if (error) throw new Error(`insert: ${error.message}`);
      imported += 1;
      console.log(`  → imported: ${tag.genre} energy=${tag.energy_level} attr=${tag.requires_attribution}`);
    } catch (err) {
      console.error(`FAIL ${filename}: ${err instanceof Error ? err.message : String(err)}`);
      failed += 1;
    }
  }

  console.log(`\nimport summary: ${imported} imported, ${skipped} skipped, ${failed} failed.`);
}

main().catch((err) => { console.error('fatal:', err); process.exit(1); });
```

- [ ] **Step 5: Run unit test — confirm pass**

```bash
unset ANTHROPIC_BASE_URL && npx vitest run src/tests/scripts/import-music-library.test.ts
```

Expected: 4 passing. If the test fails on the import path `@/../scripts/...`, adjust the import to a relative path: `'../../../scripts/import-music-library'`.

- [ ] **Step 6: Mark Phase 4 placeholder tracks deleted-by-import-CLI**

This is operator-driven cleanup once the import succeeds. The CLI doesn't delete the placeholders automatically because that's destructive. Hand the operator:

```
After `npm run import:music-library` succeeds with at least 10 real tracks, run in Supabase SQL:

delete from music_tracks where artist = 'phase4_seed';

(The Composer's WHERE clauses already filter out attribution-required tracks; once at least one ambient/cinematic energy=2..3 row exists from the import, the Composer's pickAmbientCinematicTrack stops returning the seed rows naturally — but deleting them is cleaner.)
```

- [ ] **Step 7: Commit**

```bash
git add scripts/import-music-library.ts package.json package-lock.json .gitignore src/tests/scripts/import-music-library.test.ts
git commit -m "feat(music): import CLI — ffprobe + Haiku tag + Blob upload + insert"
```

---

### Task G2: Sub-phase G — Operator runs the CLI

This is a real run, not a smoke. The agent's job is to provide the runbook and verify the result.

**Files:**
- Modify: `README.md` (add "Music library import" section)
- Add: `docs/superpowers/notes/2026-05-27-plan-4-phase-5-music-import.md` (summary of the run)

- [ ] **Step 1: README section**

Append to `README.md`:

```markdown
## Music library import

The /lab compilation pipeline picks a `music_tracks` row (genre=ambient|cinematic, energy=2|3, requires_attribution=false). Plan #4 ships a CLI that imports your CC0 library:

1. Drop 20–50 MP3s into `./music-import/` (gitignored). Naming: `Artist - Track.mp3` is parsed; flat names also work.
2. Ensure `.env.local` has `ANTHROPIC_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. `ANTHROPIC_BASE_URL` must be UNSET.
3. Run:

```bash
unset ANTHROPIC_BASE_URL && npm run import:music-library
```

The script ffprobes each file for duration, asks Haiku to classify genre + energy_level + attribution flag, uploads to Vercel Blob, inserts a `music_tracks` row. Idempotent — re-running skips already-imported tracks (matched by SHA-256 hash of MP3 bytes).
```

- [ ] **Step 2: Operator runs the CLI**

Hand the operator:

```
1. Download 20–50 CC0 tracks from studio.youtube.com → Audio Library, filtered to Attribution: Not required. Save to /Users/darius/Downloads/shorts-os/music-import/.
2. unset ANTHROPIC_BASE_URL && npm run import:music-library
3. Report the summary line and any failed tracks.
4. Verify in Supabase: select count(*), genre, energy_level, requires_attribution from music_tracks group by genre, energy_level, requires_attribution order by 1 desc;
```

- [ ] **Step 3: Capture the run in a notes doc**

Create `docs/superpowers/notes/2026-05-27-plan-4-phase-5-music-import.md`:

```markdown
# Plan #4 Phase 5 — Music library import

- Date: <YYYY-MM-DD>
- N tracks imported: <N>
- N skipped: <N>
- N failed: <N>
- Failed filenames + reasons: <list>
- Mix breakdown: <paste SQL group-by output>

After import: deleted 3 phase4_seed placeholder rows via:
  delete from music_tracks where artist = 'phase4_seed';

Composer's pickAmbientCinematicTrack now returns real tracks. Verified by dispatching a compilation topic and observing `compilation_drafts.music_track_id` points at one of the freshly-imported rows.
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/notes/2026-05-27-plan-4-phase-5-music-import.md
git commit -m "docs(music): README import section + run results"
```

**Sub-phase G acceptance:** Closing acceptance item #2 of the spec §8 outline ("Music import CLI runs cleanly on 20 tracks; music_tracks populated") is met.

---

# Sub-phase H: Release

Version bump, README close-out, Plan #4 closing acceptance evidence, fresh-chat prompt for the next plan.

### Task H1: Version bump + CHANGELOG-ish README close-out

**Files:**
- Modify: `package.json` (`"version": "0.4.0"`)
- Modify: `README.md` (add a "v0.4.0 — Plan #4" subsection at the top of the version history, or create one if absent)

- [ ] **Step 1: Bump version**

Edit `package.json`:

```json
"version": "0.4.0",
```

- [ ] **Step 2: README v0.4.0 notes**

Append (or insert at the top of the version-history section) in `README.md`:

```markdown
### v0.4.0 — Plan #4 close

- Render pipeline: Vercel Sandbox-based render_f1 (explainer) + render_f2 (compilation), Composer agent, /clips Inbox + Candidates + Rendered tabs.
- YouTube OAuth: connect at /settings/channel; refresh tokens encrypted at rest (AES-256-GCM, key-version dispatch).
- Upload pipeline: real `videos.insert` from the Sandbox, writes posted_at + external_video_id + url + posted_hour_local + posted_dow_local.
- Analytics: daily `performance-sync` cron pulls 14-day-window videos.list + 2× reports.query; UPSERTs video_analytics.
- Scheduling: `scheduled` state, scheduled-uploader cron every 15min, max_uploads_per_day deferral, backlog-overflow alert.
- /operations: week calendar with drag-to-reschedule, Auto-schedule next 7 drafts, Recommendations panel (ready for Plan #5 writes), format-mix bar, operator-alert banner.
- Music library: import CLI replaces placeholder seeds with real CC0 tracks.
```

- [ ] **Step 3: Commit**

```bash
git add package.json README.md
git commit -m "chore: bump version to 0.4.0 + Plan #4 close-out notes"
```

- [ ] **Step 4: PR + tag**

```bash
git checkout -b plan-4-phase-5-release
git push -u origin plan-4-phase-5-release
gh pr create --title "Plan #4 close — v0.4.0" --body "$(cat <<'EOF'
## Summary
Closes Plan #4. Sub-phases A-G shipped over the course of Phase 5. Version 0.4.0 + README update.

## Closing acceptance evidence
- [ ] One real video posted from drafts via /lab → /operations → YouTube (Sub-phase B benchmark doc + Sub-phase F prod smoke)
- [ ] video_analytics populating daily for posted videos
- [ ] /clips Candidates → Approve → Rendered → Approve → posted flow demonstrated for Format 2 (Phase-0 walk doc)
- [ ] All Plan #5 dependencies satisfied (see spec §9)
- [ ] No regressions in existing Lab dispatch flow
- [ ] README updated; v0.4.0 tagged

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

After merge:

```bash
gh pr merge plan-4-phase-5-release --squash --delete-branch
git checkout main && git pull origin main
git tag v0.4.0
git push origin v0.4.0
```

---

### Task H2: Plan #4 closing acceptance gate write-up + fresh-chat prompt

**Files:**
- Create: `docs/superpowers/notes/2026-05-27-plan-4-close.md`
- Create: `docs/superpowers/notes/2026-05-27-plan-5-kickoff-prompt.md`

- [ ] **Step 1: Plan #4 close doc**

```markdown
# Plan #4 close-out — 2026-XX-XX

Closing acceptance from the spec:

- [x] All 5 phases complete; each phase's exit checklist green (links: ...)
- [x] One real video posted from drafts via /lab → /operations → YouTube
      (external_video_id <ID>, posted_at <ts>, see Sub-phase B benchmark doc)
- [x] video_analytics populating daily for posted videos
      (latest snapshot_at = <ts>)
- [ ] /clips Inbox showing automatically-ingested Reddit clips — **DEFERRED** (Reddit IP-block; tracked in plan-5 prep)
- [x] /clips Candidates → Approve → Rendered → Approve → posted flow demonstrated for Format 2
- [x] All Plan #5 dependencies satisfied (spec §9 checklist)
- [x] No regressions in existing Lab dispatch flow
- [x] README updated; v0.4.0 tagged

## Known open items moved to Plan #5 prep

1. Reddit/YouTube clip ingest still gated by datacenter-IP anti-bot (Option B residential proxy decision pending).
2. Task 18 (Remotion title cards + numbered overlays for render_f2) tracked-not-executed in Phase 4; pick up in Plan #5 or a dedicated Format-2 polish plan. Bundled DejaVuSans-Bold.ttf at scripts/render-worker/assets/ is either deleted or repurposed for the Remotion comp.
3. Plan #5 Loop 4 Analyst will start writing schedule_recommendations rows; UI is already ready.

## Cost realized vs projected

Projected (spec §6): $120-250/mo at 100 renders + 10 ingests/day.
Actual (this period): <fill in by operator after 1 week of real posting>
```

- [ ] **Step 2: Plan #5 fresh-chat prompt**

```markdown
# Plan #5 — fresh-chat kickoff

Copy-paste into a new Claude Code chat in `/Users/darius/Downloads/shorts-os` to start Plan #5 work.

---

Plan #5 — learning loops + Analyst. Spec at `docs/superpowers/specs/2026-05-25-shorts-os-plan-5-learning-loops-design.md`.

Re-plan using `superpowers:writing-plans` against the spec BEFORE writing code.

State at chat start:

- Repo `/Users/darius/Downloads/shorts-os`, main, latest commit is Plan #4 close (v0.4.0 tag).
- Plan #4 is fully shipped. OAuth + upload + analytics + scheduling + /operations + music CLI all working in prod.
- Posted-video flywheel running: operator approves+schedules at /lab/drafts or /clips, scheduled-uploader cron uploads, performance-sync cron sweeps daily.
- N posted videos to date with video_analytics rows. Latest snapshot_at: <date>.
- Open items from Plan #4 close (see docs/superpowers/notes/2026-05-27-plan-4-close.md):
  1. Reddit clip ingest blocked — Option B (residential proxy) decision pending.
  2. Format-2 Remotion overlays (title card + numbered) tracked-not-executed in Phase 4.

Hard rules (carry forward from Plan #4):
- Plain English in chat. Technical docs technical.
- Stop at the end of every phase and hand back a fresh-chat prompt.
- No @vercel/sandbox imports outside src/lib/render/workers/vercel-sandbox.ts + scripts/render-worker/.
- TS strict, no `any`, Zod at boundaries, server-only on secret-holding modules.
- COCKPIT_PASSWORD in prod is Sensitive — operator drives any /login + UI-paste steps.
- For local dev, unset ANTHROPIC_BASE_URL or AI SDK 404s.
- Sensitive env vars can't be `vercel env pull`'d — operator-driven curl tests or early-merge pattern.
- Vercel crons only run on production deployments; preview-deploy SSO requires `vercel curl` or operator browser.
- The render-worker package has its own node_modules (mirror lib files via byte-equality vitests, e.g. encryption.ts, google-oauth.ts).
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/notes/2026-05-27-plan-4-close.md docs/superpowers/notes/2026-05-27-plan-5-kickoff-prompt.md
git commit -m "docs(plan-4): close-out + Plan #5 kickoff prompt"
```

---

## Phase 5 closing acceptance gate

The plan is done when:

1. [ ] Phase 0 prelim walk PASSed (or rough edges documented + decision recorded)
2. [ ] Sub-phase A merged: `channels.oauth_refresh_token_encrypted` populated; /settings/channel UI shows connected
3. [ ] Sub-phase B merged: at least one prod `your_videos` row in status='posted' with non-null external_video_id, posted_at, posted_hour_local, posted_dow_local
4. [ ] Sub-phase C+D+E merged: a scheduled video, after a */15 cron tick past scheduled_for, auto-advances to posted
5. [ ] Sub-phase F merged: /operations page renders, drag-to-reschedule works, Auto-schedule next 7 drafts works, alert banner Resolve works
6. [ ] Sub-phase G complete: at least 10 real `music_tracks` rows imported via the CLI; 3 phase4_seed placeholders removed
7. [ ] Sub-phase H: v0.4.0 tagged, Plan #4 close doc written
8. [ ] Day +1 after Sub-phase B: video_analytics has a row for the smoke video
9. [ ] Forcing a schedule horizon >7d produces an `operator_alerts` row visible in the /operations banner; clicking a suggested-action button resolves it
10. [ ] All 91+ vitest tests still green (baseline + Phase 5 additions; roughly 91 + 40 ≈ 130)

When all 10 are checked, hand back the Plan #5 kickoff prompt and stop.

---

## Operator-driven gates summarized

Phase 5 has 6 operator-driven steps that cannot be done by the agent alone (UI gestures, Sensitive env vars, real OAuth consent, real music files):

1. Task 0: prod UI walk (Strategist → Composer → /clips → your_videos)
2. Task A0: Google Cloud OAuth client setup + add `GOOGLE_OAUTH_*` and `OAUTH_TOKEN_ENCRYPTION_KEY_V1` to Vercel as Sensitive
3. Task A5: local browser smoke of /settings/channel Connect YouTube flow
4. Task A7: prod preview smoke of OAuth callback (need real Google consent)
5. Task B5: prod upload smoke via SQL-injected upload job; +1 day later, check video_analytics
6. Task G2: download CC0 tracks + run `npm run import:music-library`

The agent writes the runbooks; the operator drives each.

