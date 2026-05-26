# Plan #4 Phase 2 — First Full-Pipeline Render Benchmark

**Date:** 2026-05-26 (UTC)
**Result:** **PASS** — wall-clock **90.5s** (gate 120s)

## Per-stage timing (job `20d59a11-4280-40e5-97c9-c5161064b534`)

Captured from the worker's `[render_f1] +Xms ...` trace persisted to `render_jobs.last_error` on success.

| Stage | Elapsed | Notes |
|---|---|---|
| Dispatcher claim → Sandbox.create return + git clone + npm ci | ~4.4s | claim 02:19:36.7, started 02:19:41.1 |
| Shot-list fetch (decisions table) | ~0.16s | 10 shots returned |
| Cartesia TTS (60.6s of audio) | ~11.6s | voice id `87286a8d-7ea7-4235-a41a-dd9fa6630feb` (Henry — Plainspoken Guy); Voice Coach overrode channel default (Corey) |
| Per-shot Pexels search + download + normalize × 10 | ~64s | mixed: 7 hit Pexels (~5-10s each), 3 fell to colored-bg fallback due to `quality: null` Zod bug (now fixed in commit below) |
| Whisper alignment + SRT write | not separately timed | Folded into the post-shot tail; total tail ~10s before final compose |
| Music pick (table empty → skipped) | <1s | best-effort path |
| Final compose ffmpeg + Blob upload + callback | ~10s | concat 10 normalized clips + voice + subtitles overlay |
| **Total (claimed_at → finished_at)** | **90.5s** | comfortably under the 120s gate |

## Acceptance gate

- [x] End-to-end render <120s — **passed at 90.5s**
- [x] Video plays at /lab/drafts?tab=rendered
- [x] Captions visible (Whisper + SRT burn-in worked; see Phase 3 prompt note on quality)
- [x] Music skipped gracefully (table empty)
- [x] No regression in 167 unit tests

## Pexels `quality: null` bug

The first end-to-end run revealed Pexels' API occasionally returns `null` for the `quality` field on individual `video_files` entries. The worker's Zod schema required `quality: string` and threw on null. The try/catch around per-shot work then fell back to colored-bg, producing the "random gray spaces" the operator observed across roughly 30% of shots.

**Fix:** `quality: z.string().nullable()` in both `scripts/render-worker/lib/pexels.ts` and `src/lib/clients/pexels.ts`. File selection still picks by width × height; the quality string isn't used in the picker.

Committed as part of the same PR.

## Adaptations from the plan that surfaced during the smoke

1. **`ffmpeg-static` does not ship `ffprobe`.** Plan Task 6's `probe.ts` assumed colocation; truth is they're separate npm packages. Worker added `@ffprobe-installer/ffprobe@^2.1.2` as a dep. (commit `f292c99`)
2. **`jobs` table columns are `kind` + `topic_queue_id`, not `job_type` + `payload->>topicId`.** The plan + repo helper had the wrong column names; worker's `fetchShotList` silently returned no shots before the fix. (commit `45cfe9a`)
3. **`getDefaultChannel` queried `slug='default'`** but Phase 1's reseed migration renamed the channel to `dyfrx_9754`. Switched to `is_active=true` selector for single-channel mode. (commit `fc883a1`)
4. **Vercel cron only fires on Production**, not Preview. Initial smoke runs hit Phase 1's old code because the branch wasn't merged. Merged + redeployed to Production. (PR #1 + cherry-picks)
5. **`@vercel/sandbox` SDK** required for diagnosing the silent-hang: `Sandbox.get({ name })` + `runCommand("ps auxf; ls /tmp")` was the only way to see that the worker process had died at module-load time (esbuild zombie + no node process).
6. **VOICE_POOL Phase-1 preset names** (`sonic-narrator-male-deadpan`, etc.) were not real Cartesia UUIDs. Replaced with 6 real UUIDs picked from the public catalog. Voice Coach prompt now defaults to `channel.default_voice_id` in 95% of dispatches. (commit `bfcc375`)
7. **Pre-existing test baseline:** 11 env-related test failures exist because `.env.local` carries placeholder values. They're unrelated to Phase 2 and unchanged.
8. **CARTESIA / PEXELS / GROQ env vars** were never set in Vercel Production. Added during smoke setup.
9. **Sandbox stdout is not captured anywhere queryable.** Phase 2 hijacks `render_jobs.last_error` to persist a per-stage trace on both success and failure. To revert: drop `debug_trace` from worker handler output + remove the trace-write branches in `src/app/api/render/complete/route.ts`. Worth keeping until at least the end of Phase 3.

## Operator UI feedback

> "It worked. There is random grey spaces in between clips, some clips aren't super relevant, and there is no TTS or anything interesting going on, just basic AI voice over and b-roll."

- **Gray spaces:** Pexels `quality: null` bug, fixed above.
- **Clip relevance:** Director's `broll_search_query` is short (3-6 words). Pexels' catalog quality varies. Future improvement: have the Director iterate on misses (Phase 3+).
- **"No TTS or anything interesting":** Phase 2 only burns SRT captions over b-roll; SFX, music ducking, animated transitions are out of scope (Phase 3+).

## What this benchmark unlocks

Phase 2 acceptance gate is **passed**. Phase 3 (Reddit clip ingest + /clips Inbox + Stage-1 triage) can begin.
