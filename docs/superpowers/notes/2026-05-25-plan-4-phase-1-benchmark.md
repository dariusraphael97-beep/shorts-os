# Plan #4 Phase 1 — First Render Benchmark

**Date:** 2026-05-25
**Result:** **PASS** — total wall-clock **15s** (gate 240s)

## Per-stage timing (job `9cb7db10-970e-4a85-9e92-81c1cced82b8`)

| Stage | Time | Notes |
|---|---|---|
| Dispatcher claim → Sandbox.create return | ~4.6s | includes Vercel cron-handler + Sandbox API round-trip |
| Sandbox boot + git clone + npm ci | ~6s | measured separately via `/api/render/debug` |
| Cartesia TTS (~30s script) | ~3-4s | voice id `630ed21c-2c5c-41cf-9d82-10a7fd668370` (Corey - Supportive Buddy) |
| ffmpeg (1080×1920 black bg + audio mux) | ~3-5s | `ffmpeg-static` + libx264 + aac |
| Blob upload | <1s | ~500KB .mp4 |
| Callback → state transition | <1s | `/api/render/complete` → `your_videos.status='rendered'` |
| **Total (claimed_at → finished_at)** | **15s** | far under the 240s acceptance gate |

## Output

- `render_artifact_url`: https://9suuf85koahjignp.public.blob.vercel-storage.com/renders/689e530a-b380-40ca-bfef-f2ef299813e7.mp4
- HTTP 200, `content-type: video/mp4`, video plays.

## Critical adaptations from the spec that surfaced during the benchmark

1. **`@vercel/sandbox` SDK shape** — uses `sandbox.name` (not `id`), and `Sandbox.create({ source: { type: 'git', ... } })` natively handles git clone instead of explicit `runCommand('git', ['clone', ...])`. (commit `89c1e7e`)
2. **`BLOB_READ_WRITE_TOKEN` is the Vercel-convention env var name**, not `VERCEL_BLOB_READ_WRITE_TOKEN`. The `@vercel/blob` SDK auto-reads this. (commit `0dd6f75`)
3. **`VERCEL_GIT_REPO_URL` is not a Vercel runtime env var.** Only `VERCEL_GIT_REPO_OWNER` and `VERCEL_GIT_REPO_SLUG` are exposed — the URL must be constructed. (commit `c1c537a`)
4. **`scripts/render-worker/` had to be excluded from the root `tsconfig.json`** because it uses `.ts` import extensions (requires `allowImportingTsExtensions`), and Next.js's type-check pass doesn't enable that. (commit `40efd7a`)
5. **Cockpit auth proxy (`src/proxy.ts`) blocked `/api/render/complete`.** Sandbox callbacks were getting 307'd to `/login`, sandbox fetched the login HTML and thought it succeeded — job stuck in `running` forever. Added `/api/render` to `PUBLIC_PATH_PREFIXES`. **This was the root cause of the first 30-min hang.** (commit `877bb45`)
6. **Worker `node --import tsx run.ts` needs `cwd: '/vercel/sandbox/scripts/render-worker'`** so node resolves `tsx` from the worker package's `node_modules/`, not the repo root's. Without cwd, the worker crashed immediately with `ERR_MODULE_NOT_FOUND` and (because the dispatch was detached) never reported back. (commit `515a1dd`)
7. **Cartesia voice IDs must be UUIDs.** The seed migration's `'sonic-narrator-male-deadpan'` is the *name* of a preset; Cartesia's API returns 400 on non-UUID values. The benchmark used `630ed21c-2c5c-41cf-9d82-10a7fd668370` (Corey - Supportive Buddy) from Cartesia's public voice catalog.

## Diagnostic tooling left in place

- `src/app/api/render/debug/route.ts` — runs the same Sandbox + npm ci + tsx probe synchronously, captures stdout/stderr per step. Auth: `CRON_SECRET`. Pass `?job_id=<your_video_id>` to also run the real worker entrypoint synchronously. **Should be removed or admin-gated before Phase 5 ships** — it spins up a Sandbox on every hit.

## Soft warnings (none fired)

- Bootstrap (Sandbox + git clone + npm ci): ~6s, well under 60s.
- Render execution: ~10s for the minimal black-bg case. Phase 2 adds Pexels + caption alignment + music mix; need to remeasure once those land.
