# Plan #4 Phase 5 Sub-phase B — prod smoke blocked

## Summary

Sub-phase B code is fully shipped to prod (PR [#8](https://github.com/dariusraphael97-beep/shorts-os/pull/8), HEAD `bb3541e`). 14 new vitest tests pass. Two follow-up hotfixes ([#9](https://github.com/dariusraphael97-beep/shorts-os/pull/9), [#10](https://github.com/dariusraphael97-beep/shorts-os/pull/10)) added fetch timeouts after the prod smoke pattern emerged.

**Three smoke attempts against `your_videos.id = 11c221e0-693a-4e4c-a096-24725c4e327b` (TOP 5 CAR MOMENTS, Phase 4-rendered, 433KB MP4) all hung the Sandbox without ever firing the `/api/render/complete` callback.**

The smoke target is correct: channel has `oauth_refresh_token_encrypted` populated, `external_channel_id = UCUXkixLGmtaKukPT3plv9YQ`, timezone `America/New_York`, video has `status='rendered'` and a valid public Blob URL.

## Attempts

| # | render_jobs.id | claimed_at | code SHA | outcome |
|---|---|---|---|---|
| 1 | `960cf047-9d3e-4554-b4e5-01aa7b4ac8ea` | 02:14 ET | `bb3541e` (Sub-B as-shipped) | Sandbox SIGKILL at 15min, no callback, no `last_error`. Manually marked failed. |
| 2 | `2eb6a5e9-d56f-4e3d-8224-a5d4bcaebb57` | 02:48 ET | `b3b0c76` (hotfix #1 — YouTube + Blob fetch timeouts) | Same. Manually marked failed after >5min. |
| 3 | `a32bc6f8-2c4c-4905-b136-c86c5047a5ef` | 02:58 ET | `b7a7dc9` (hotfix #2 — token-refresh + callback fetch timeouts) | Same. >9.5 min runtime with all fetches AbortController-bounded. Manually marked failed. |

In all three attempts: `claimed_at` set within ~15s of insert (render-dispatcher cron fast), `started_at` set ~10–22s later (Sandbox boot + `npm ci` + detached `node run.ts`), then silence. No `/api/render/complete` POST hits Vercel runtime logs.

## What's been ruled out

- **Worker code bug from B1-B4.** Spec + code review approved each task; 14/14 new unit tests pass. The handler trace string would have included `[upload] +Xms loading your_videos ...` etc. if execution reached the handler.
- **Fetch hangs.** All four fetches in the worker now have AbortController timeouts: token refresh 30s (`scripts/render-worker/lib/google-oauth.ts`), Blob mp4 download 60s (`scripts/render-worker/handlers/upload.ts`), YouTube upload init+PUT 90s each (`scripts/render-worker/lib/youtube-upload.ts`), callback POST 30s (`scripts/render-worker/lib/callback.ts`). Worst-case combined ≈ 360s. Attempt #3 ran 587s with `last_error` still NULL — meaning the hang is somewhere none of those timeouts catch.
- **Channel data missing.** `channels` row confirms refresh-token + external_channel_id + timezone are populated.
- **Bad render artifact.** `curl -sI` against the Blob URL returns 200, `content-type: video/mp4`, `content-length: 433627`.
- **Wrong code in deployed Sandbox.** Dispatcher passes `revision: VERCEL_GIT_COMMIT_SHA`. The cron Lambda that claimed each job ran on the matching production deploy.

## What's NOT been ruled out

1. **Supabase-js fetch hang.** `runUpload` does 2 supabase reads (your_videos + channels) before any fetch I time-bound. `supabase-js` uses `globalThis.fetch` with no internal timeout. If a connection to `jfmjppzjicvbpnlkmxbg.supabase.co` from this Sandbox region (`iad1`) hangs, the worker is pinned with no error surface. Phase 4's render_f2 Sandbox jobs hit Supabase fine 22h earlier, so this would have to be a network/regional change.
2. **`installChromiumDeps` yum hang.** `scripts/render-worker/run.ts` line 67 runs `sudo yum install ...` with `spawn` `timeout: 60_000`. Node's `child_process.spawn` timeout sends SIGTERM, but if the yum subprocess swallows the signal (rare) the await never completes.
3. **AbortSignal not honored by Node 24 fetch in Vercel Sandbox.** Theoretically possible but undocumented; would mean my timeouts compiled and threaded the signal but never aborted the actual request. Cheap to disprove with a controlled local-equivalent.
4. **Region-specific network policy.** The Sandbox runs `iad1`. Something between iad1 → googleapis.com or → vercel-storage public bucket could be misbehaving. Phase 4 successfully fetched via yt-dlp (also from iad1).

## What I need to unblock

Vercel CLI runtime logs (`vercel logs`) only surface Next.js Lambda requests, not Sandbox stdout. The Sandbox writes `console.log` output that's only visible on the inspector URL in the Vercel dashboard. Either:

- **A. Operator opens the Vercel inspector for any of the three stuck deployments and copies the Sandbox-specific log section back to chat.** Stuck Sandbox names = the `render_jobs.id` values above. Inspector URL format: `https://vercel.com/dariusraphael97-beeps-projects/shorts-os/<deploymentId>`. The deployment IDs that hosted each attempt:
  - #1: `dpl_9UTqRtTQHvTfLoyze5y6pUGagYst` (commit `bb3541e`)
  - #2: `dpl_3VGS6WEeHnaLvxtECw8rWANBUDNV` (commit `b3b0c76`)
  - #3: `dpl_CTn24EjZDvx7AY7SsLSka31fAW5n` (commit `b7a7dc9`)

- **B. Operator hands the agent `GOOGLE_OAUTH_CLIENT_SECRET` via a one-time channel (or runs the worker locally) so the agent can drive the upload locally against the same encrypted refresh token + real Google client, eliminating Sandbox as a variable.**

- **C. Defer the smoke to Sub-phase D's "Post now" button.** Sub-phase D ships the operator-facing dispatch button against the SAME `runUpload` handler; if the hang is environmental, by then either the platform issue resolves or we have a different failure surface to reason about. Sub-phase C (scheduling primitives) and most of D are pure Next.js (no Sandbox) and can land while this is parked.

## Recommendation

C — defer this prod smoke and proceed to Sub-phase C. Sub-phase B's code is unit-tested + on prod; the gap is observability of a Vercel Sandbox runtime issue that doesn't block any subsequent task. When Sub-phase D's UI dispatch button lands, attempting the upload from the cockpit will either:
- Work (the platform issue cleared up), in which case we're done.
- Fail with the same silence, at which point we open the Vercel dashboard inspector together to see the Sandbox stdout — the *one* observation we're missing.

The Sub-phase B acceptance criterion ("one real video posted from drafts via /lab → /operations → YouTube") was already understood to flow through Sub-phase D / F before formal sign-off, so this defer is consistent with plan boundaries.
