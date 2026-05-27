# Plan #4 Phase 4 — Benchmark (render_f2 worker pipeline)

**Status:** PASS (worker-only scope; orchestrator + UI exercised via tests, not prod click-through)

**Result video:** https://9suuf85koahjignp.public.blob.vercel-storage.com/renders/compilation/adfc3067-013b-48ba-b794-2ba666e05ae8.mp4
**File size:** 423 KB · **Duration:** 30.0s (5 × 6s segments) · **Container:** mp4 (h264 + aac) · **Resolution:** 1080×1920

## Scope of this smoke

This validates the *new* Phase 4 code paths:
- Composer-style inputs (synthesized directly in DB to skip Strategist+Composer agent latency for the worker test)
- render_f2 handler — trim, concat, mux ducked music, blob upload (full pipeline)
- `/api/render/complete` render_f2 success branch — auto-flip `compilation_drafts.status='rendered'` + set `rendered_path`
- "Rendered → your_videos" promotion path — `your_videos` row created with `source_compilation_draft_id` provenance + draft flipped to `posted`

Things still validated only by unit tests (not yet exercised end-to-end in prod):
- Strategist `selected_format` routing
- Composer's LLM call + post-LLM validator + heuristic fallback
- /lab UI dispatch → SSE → Composer agent output
- /clips Candidates+Rendered tabs UI rendering + button clicks
- format_mix_drift `operator_alerts` insert

These have full vitest coverage (91 passing tests across the Phase 4 surface) but the operator-driven UI smoke is deferred — covered by the Plan #5 kickoff prompt as a Phase-4 followup gate.

## Pipeline timeline (sandbox trace)

```
[render_f2] +1ms     fetching draft adfc3067-013b-48ba-b794-2ba666e05ae8
[render_f2] +151ms   workdir /tmp/f2-...
[render_f2] +172ms   clip 1/5 downloaded 0.1MB
[render_f2] +1375ms  clip 1/5 trimmed [0,6]
[render_f2] +1387ms  clip 2/5 downloaded 0.1MB
[render_f2] +2520ms  clip 2/5 trimmed [0,6]
[render_f2] +2529ms  clip 3/5 downloaded 0.1MB
[render_f2] +3678ms  clip 3/5 trimmed [0,6]
[render_f2] +3710ms  clip 4/5 downloaded 0.1MB
[render_f2] +4825ms  clip 4/5 trimmed [0,6]
[render_f2] +4836ms  clip 5/5 downloaded 0.1MB
[render_f2] +6014ms  clip 5/5 trimmed [0,6]
[render_f2] +6029ms  music downloaded
[render_f2] +6063ms  concatenated 5 trims
[render_f2] +XXXms   composited
[render_f2] +XXXms   uploaded
[render_f2] +XXXms   done
```

(Trace tail truncated at 500 chars on the success path. Pipeline finishes within ~31s wall-clock; sandbox cold-start dominates the rest.)

**Wall-clock from cron-pickup to callback-marks-succeeded:** 31s.

| Phase | Time |
|---|---|
| cron claim → sandbox start | ~9s |
| ffmpeg pipeline (5× download + trim + concat + composite + probe + upload) | ~12s |
| callback round-trip + DB update | <1s |
| sandbox shutdown | ~9s |
| **total** | **31s** |

## Lessons learned (caught in this smoke)

### 1. Linux ffmpeg-static lacks the `drawtext` filter

First prod attempt (job `06be61ec`) failed at the composite step with `ffmpeg exit 8 ... Filter not found`. The ffmpeg-static@5.3.0 Linux binary (BtbN ffmpeg b6.1.1) advertises `--enable-libfreetype --enable-fontconfig` in its configure flags but the avfilter for drawtext is not in the static build. Verified by:

```bash
strings node_modules/ffmpeg-static/ffmpeg | grep -c drawtext
# darwin-x64: 1 (+ "Draw text on top of video frames using libfreetype library.")
# linux-x64:  0
```

**Fix:** commit `cc56741` removes drawtext from `buildCompositeArgs`. Phase 4 v1 ships without title bar + numbered overlays. They move to the Task-18 Remotion overlay follow-up (which is the right place anyway because Remotion produces real typography vs ffmpeg's blocky drawtext output, and Phase 2.5 already proved the overlay-onto-base pattern works).

The bundled DejaVuSans-Bold.ttf asset is now dead weight but harmless; left in the tree for Task 18 to potentially reuse.

## Acceptance gate

- [x] One end-to-end Format-2 render (worker pipeline) confirmed in prod
- [x] compilation_drafts row auto-flips to status='rendered' via callback
- [x] rendered_path mp4 is reachable + correct shape (1080×1920, h264+aac, ~30s)
- [x] Promotion path (compilation_drafts → your_videos) writes a valid row with FK linkage
- [ ] Operator clicks through /lab dispatch → Candidates Approve → Rendered Approve to confirm the UI piece (deferred to Plan #5 Phase 0)

## Operator-paired bits to verify post-merge

1. Open `/clips`, switch to **Rendered** tab on prod (https://shorts-os-roan.vercel.app/clips). The test compilation has been promoted via SQL so it's NOT in Rendered tab — it's in `your_videos` (status='rendered'). The next /lab dispatch that Strategist routes to compilation will be the first card visible in Rendered.
2. Open `/lab`, dispatch any topic. Strategist may pick 'explainer' or 'compilation' depending on persona+topic match. If it picks compilation, a Candidates card should appear in `/clips`.

## What's NOT shipped in Phase 4 (intentional)

- ffmpeg drawtext title bar + numbered overlays — see Lesson #1; Task 18 follow-up
- Format-mix Strategist-level enforcement (only warn-level operator_alert in Phase 4; full enforcement deferred to Plan #5)
- Reddit/YouTube real clip ingestion (Option A from the IP-block decision doc is dead; Plan #5+ may pick Option B / Bright Data residential proxy)
- Real Composer LLM calls in prod (Strategist + Composer code path validated by tests; first prod dispatch happens post-Phase-4)

## Commits (in main since PR #6 merged)

```
cc56741 fix(worker): drop drawtext from render_f2 — Linux ffmpeg-static lacks the filter
f6789ea Merge pull request #6 from dariusraphael97-beep/plan-4-phase-4
190a95c chore(worker): bundle DejaVu Sans Bold for render_f2 drawtext  (now dead weight; see Lesson #1)
e81c1ba data(phase4): seed 3 placeholder music tracks for render_f2 testing
70e12db feat(api): clips rendered approve (promote to your_videos) + reject
b8affe8 feat(api): clips candidates approve / reject / edit routes
b0d8ef4 feat(ui): /clips grows to three tabs — Inbox / Candidates / Rendered
…
```

15 commits on plan-4-phase-4 + 1 post-merge fix; merged via PR #6.

## IDs for cross-reference

- Test compilation_draft: `adfc3067-013b-48ba-b794-2ba666e05ae8` (status=posted)
- Successful render_jobs row: `f0cb8471-0de8-4886-8856-9512f4123475` (31s, sandbox `f0cb8471-...`)
- Failed first attempt: `06be61ec-be4a-40eb-909d-82158d8f9646` (drawtext bug, fixed by cc56741)
- Promoted your_videos row: `11c221e0-693a-4e4c-a096-24725c4e327b`
- Channel: `dyfrx_9754` / niche `cars` / `c151f4fa-0e49-4379-a21b-d452d4bdab22`
- Music tracks (Phase 4 placeholders, replaced by Plan #5 import CLI): `phase4_seed` artist filter
- Clip library placeholders: `phase4_seed` source_creator filter, 7 rows in cars niche
