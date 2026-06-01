# Plan #5 Phase 1 — Sub-phase H — Design Spec (2026-05-31)

Branch base: `plan-5-sub-g-agents-reviewer` (G stacks on F→E→D→C→B; main at B).
New branch for H: `plan-5-sub-h-auto-dispatch` (off the G branch).

Reference: master spec `docs/superpowers/specs/2026-05-28-plan-5-creator-copilot-design.md`
(§4.8–4.16); G handoff `docs/superpowers/notes/2026-05-31-plan-5-phase-1-sub-g-handoff.md`.

---

## 0. Goal of this sub-phase

Three workstreams, **auto-dispatch first**:

1. **Niche → video auto-dispatch (priority).** Make the niche **Generate** action drive the
   orchestrator end-to-end (composed draft) and auto-enqueue the render, so videos arrive at
   `/lab/[videoId]/review` ready for the operator to approve & post — without manual Lab dispatch.
   This unblocks the §4.16 "≥3 real videos posted" criterion and feeds the niche_scout +
   video_reviewer learning loops real outcome data.
2. **Deeper design-system rebuild of `/lab` + `/clips` interiors (§4.16).** F/G only re-shelled
   them (AppShell + sidebar); the interiors are still Plan #3/#4 vintage. Rebuild to the 9/10 bar
   set by `/niches` and `/agents`.
3. **Live onboarding scan-progress feed (§4.14 step 6).** Replace "fire-and-forget then jump to
   /niches" with a live agent-status scan feed that runs a real mini-run and ends on actual niches.

Decisions locked in brainstorm (2026-05-31):
- **Auto-drive depth:** Compose → auto-render → review. Posting to YouTube stays operator-gated.
- **Concurrency:** reject a 2nd concurrent Generate (409 + toast); no queue this sub-phase.
- **Onboarding scan depth:** full mini-run (search → classify → cluster) so niches appear now.
- **/lab structure:** keep the 3-pane model; rebuild the interiors.

---

## 1. Pre-flight — verify the G chain (operator-gated, folded into Workstream 1)

The G handoff's OPERATOR TODO (browser pass) is still open. Auto-dispatch builds on the
orchestrator → render → review chain, so we establish ground truth before/while building it:

- **Self-serviceable (do first, via Supabase MCP, read-only):** query prod
  (`jfmjppzjicvbpnlkmxbg`) for whether any real render has already produced a `video_reviews`
  row + the `render_jobs` history (any `render_f1`/`render_f2` succeeded? any `review` job?). Record
  the finding in the H handoff.
- **Two cases:**
  - A real rendered+reviewed video already exists → confirm the row shape; operator does the
    browser eyeball (review UI + chat-streaming smoke) from the G checklist.
  - None exists yet → acceptable. **The first auto-dispatched video becomes the verification** —
    Workstream 1's first end-to-end run exercises Generate → render → review for real.
- G-verification is therefore **not a separate blocker**; it is satisfied by Workstream 1's first
  successful run, plus the operator browser checklist (carried into the H handoff OPERATOR TODO).

No code in this step. Read-only DB audit + checklist only.

---

## 2. Workstream 1 — Niche → video auto-dispatch

### 2.1 Current behavior (what we change)

`POST /api/niches/[id]/generate` (`src/app/api/niches/[id]/generate/route.ts`):
1. cluster → `clusterToBrief` (422 for non-native; UI only shows Generate on native).
2. `insertManualTopic` (state `reviewed`, `raw_payload` carries `clusterId`).
3. **creates a STUB `your_videos` draft** (`script = brief.summary`, `source_niche_cluster_id`,
   `script_brief`), status `draft`.
4. `recordNicheAction('generated_from')`.
5. returns `{ ok, topicId, draftId, dispatched: false }`.

The real pipeline `runPipeline` (`src/lib/agents/orchestrator.ts`, Strategist → Writer → Voice
Coach → Director, or → Composer for `compilation`) only runs when consumed by the SSE route
`POST /api/lab/dispatch`. It creates its OWN draft at the end via `createVideoDraft` — but **does
not set `source_niche_cluster_id` or `script_brief`** on it.

Render path (unchanged, reused): `enqueueRenderJob({ jobType: 'render_f1', yourVideoId })`
→ render-dispatcher cron (60s, `claim_render_jobs`) → worker → `POST /api/render/complete`
(auto-enqueues a `review` job; on success persists `video_reviews` + links `your_videos.review_id`).
Posting is a separate operator-gated `upload` job via `POST /api/lab/upload`.

Concurrency: `getActiveProduceVideoJob` — exactly one `produce_video` job at a time.
Job-progress read: `GET /api/lab/jobs/active` returns the active job (or `{ activeJob: null }`).
Prediction-close (`/api/cron/prediction-close`) finds **posted** niche-sourced videos by
`your_videos.source_niche_cluster_id` — so that column MUST be set on the draft that gets posted.

### 2.2 Target behavior

Clicking **Generate** on a `native` niche:
1. returns **instantly** with `{ ok: true, dispatched: true, topicId }` (no draftId yet — the
   orchestrator creates the real draft mid-pipeline);
2. runs the full orchestrator in the background (post-response);
3. on pipeline success, transitions the produced draft `draft → rendering` and enqueues
   `render_f1`;
4. the existing cron renders it, the reviewer auto-runs, and it lands at
   `/lab/[videoId]/review` ready for operator approve & post.

The Lab manual-dispatch SSE path is **untouched** (operator can still observe a run live there).

### 2.3 Architecture — `after()` background drain (chosen approach)

**Primitive:** Next 16.2.6 `after` from `next/server` (stable; runs after the response is sent,
bounded by the route's `maxDuration`; on Vercel backed by `waitUntil`). Confirmed available
(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`,
`node_modules/next/server.d.ts: export { after }`). This is the "respond fast, keep working"
primitive — no held-open stream, no second HTTP hop, no fire-and-forget fetch (unreliable on
serverless).

**Rejected alternatives:** (a) reuse `/api/lab/dispatch` server-to-server — SSE consumed and
discarded, plus fire-and-forget unreliability; (b) full job-queue + drain cron — overkill for a
single operator and the concurrency decision is "reject", not "queue".

### 2.4 Changes

**(a) New shared driver — `src/lib/agents/auto-dispatch.ts`**
```
export async function drainPipeline(args: {
  topicId: string;
  sourceNicheClusterId: string;
  scriptBrief: Record<string, unknown>;
  supabase: SupabaseClient;
}): Promise<void>
```
- `for await (const ev of runPipeline({ topicId, supabase, sourceNicheClusterId, scriptBrief }))`
  — drains the generator, capturing the `job_completed.videoId`.
- **The orchestrator has two success branches** and `job_completed.videoId` is ambiguous:
  - **Explainer branch** (Strategist→Writer→Voice→Director) → `createVideoDraft` → a `your_videos`
    row (render_f1 path). This is the auto-render target.
  - **Compilation branch** (Strategist→Composer) → `runComposer`→`insertCompilationDraft` → a
    `compilation_drafts` row (render_f2 + /clips promotion path). NOT a `your_videos` row.
  The strategist picks `selected_format: 'explainer' | 'compilation'` from the channel's
  `target_format_mix`, so a native-niche Generate CAN reach either branch.
- On `job_completed`: **branch on what was produced** by looking up `your_videos` by the returned id
  (`getYourVideoById`):
  - **Found (your_videos, status `draft`)** → atomically transition `draft → rendering` (mirror
    `/api/lab/render` guard: update `.eq('status','draft')` with `count: 'exact'`; skip enqueue if
    `!count`) and `enqueueRenderJob({ jobType: 'render_f1', yourVideoId: id, payload: { your_video_id: id } })`.
  - **Not found (it was a `compilation_drafts` id)** → **skip auto-render**; the compilation draft
    lands in `/clips` → Candidates for the operator (render_f2 + promotion happen there). Log + return.
- On `job_failed` (or no `job_completed`): do nothing further (the orchestrator already marked the
  produce_video job + generator assistant `errored`). Everything here is non-fatal / swallowed —
  `after()` runs even on error and must never throw unhandled.

**(b) Thread cluster linkage through the orchestrator — `src/lib/agents/orchestrator.ts`**
- Add optional `sourceNicheClusterId?: string | null` and `scriptBrief?: Record<string, unknown> | null`
  to `runPipeline` args.
- Pass them into the **explainer-branch `createVideoDraft` call ONLY** (orchestrator.ts ~line 257),
  so the `your_videos` draft carries `source_niche_cluster_id` + `script_brief` (`createVideoDraft`
  already accepts both optional args — just forward them). The **compilation branch is out of scope**
  for cluster-linked auto-dispatch: `compilation_drafts` has no `source_niche_cluster_id` column, and
  the cluster→outcome link would have to survive promotion to `your_videos` — deferred (consistent
  with "cut by capability boundary, not stripped quality"). Do NOT modify `runComposer`.
- Manual Lab dispatch passes neither (stays `null`) — unchanged behavior for that path.

**(c) Refactor `POST /api/niches/[id]/generate`**
- Keep steps 1, 2, 4 (cluster → brief → `insertManualTopic` → `recordNicheAction`).
- **DELETE** step 3 (stub `createVideoDraft`) — the orchestrator now creates the real draft.
- Add preflight: `getActiveProduceVideoJob`; if active → return
  `409 { ok: false, error: 'generation_in_progress', activeJobId }`.
- `export const maxDuration = 300;`
- Schedule the run: `after(() => drainPipeline({ topicId, sourceNicheClusterId: cluster.id,
  scriptBrief: brief.rawPayload, supabase }))`.
- Return `200 { ok: true, dispatched: true, topicId }`.
- Keep the 422 non-native guard and 404 cluster-not-found.

**(d) New topic-keyed status endpoint — `GET /api/niches/[id]/generation?topicId=<id>`**
The `jobs` row has NO `your_video_id` column (it has `topic_queue_id`, `current_agent`,
`progress_pct`, `status`, `metadata`). So the poll is **keyed by topicId** and resolves the produced
output across both tables:
```
{
  job: { status, currentAgent, progressPct } | null,   // latest produce_video job WHERE topic_queue_id = topicId
  result:                                                // only when job.status === 'succeeded'
    | { kind: 'your_video', videoId }                    // your_videos WHERE topic_queue_id = topicId (latest)
    | { kind: 'compilation', draftId }                   // else compilation_drafts WHERE topic_queue_id = topicId (latest)
    | null
}
```
Needs two small repo reads: `getProduceVideoJobByTopic(supabase, topicId)` and resolvers over
`your_videos` / `compilation_drafts` by `topic_queue_id`. No schema change. (`GET /api/lab/jobs/active`
stays as-is for the global concurrency gate / DispatchButton.)

**(e) Niche UI — Generate becomes a live state**
Both existing consumers today only read `{ ok, error }` and toast "Seeded a draft — finish it in the
Lab" (so dropping `draftId` from the response is safe). Both must get the new live-progress + 409
handling:
- `src/app/niches/niches-feed.tsx` (`handleGenerate`, the `/niches` card CTA).
- `src/app/niches/[id]/detail-actions.tsx` (`handleGenerate`, the `/niches/[id]` action panel).

- On click: POST, then enter a **Generating…** state. Poll
  `GET /api/niches/[id]/generation?topicId=<id>` (~2–3s, using the `topicId` from the POST response)
  and render a compact pipeline-progress strip reusing the Lab's `pipeline-strip` vocabulary
  (Strategist → Writer → Voice → Director, current agent highlighted, % bar).
- 409 `generation_in_progress` → toast "A generation is already running — finish it first" (Sonner,
  deduped) and keep the button enabled.
- When the run completes (`job.status === 'succeeded'` + `result` present) → success toast + the CTA
  becomes the right deep-link for the produced kind:
  - `result.kind === 'your_video'` → **"Review →"** to `/lab/${result.videoId}/review` (the review
    page already polls while render+review run — G's `review-in-progress`).
  - `result.kind === 'compilation'` → **"Open Clips →"** to `/clips` (Candidates tab).
- `job.status === 'failed'` → error toast + "Try again" (re-enable). Respect reduced-motion.

### 2.5 Concurrency, idempotency, failure

- One generation at a time (existing gate). 2nd concurrent Generate → 409 (decision).
- The render auto-enqueue mirrors the manual `/api/lab/render` atomic guard so a double callback or
  race can't double-render.
- `drainPipeline` is best-effort: a render-enqueue blip must not throw out of `after()`. The draft
  still exists as `draft` and the operator can render it manually from the Lab (fallback path).

### 2.6 Tests (TDD where pure)

- `drainPipeline` outcome mapping (inject a fake `runPipeline` async-iterable + fake supabase):
  - yields `job_completed` whose id IS a `your_videos` draft → asserts `draft → rendering` transition
    + `render_f1` enqueue.
  - yields `job_completed` whose id is NOT in `your_videos` (a compilation draft) → asserts NO
    `render_f1` enqueue (skip → /clips).
  - yields `job_failed` → asserts NO enqueue. Mid-run throw → swallowed (no rethrow).
  - Use the repo's fake-supabase-client convention (cast `as never`, as in `video-reviews.test.ts`),
    not env-gated live DB.
- orchestrator: assert the **explainer-branch** `createVideoDraft` receives `source_niche_cluster_id`
  + `script_brief` when passed, and `null` when omitted. (Composer branch unchanged.)
- generate route: 409 when a job is active; 200 `{ dispatched: true, topicId }` + `after` scheduled
  when not; 422 non-native; 404 missing cluster; no stub draft created.
- `generation` status endpoint resolver: succeeded job + your_videos row → `{ kind: 'your_video' }`;
  succeeded + only compilation_drafts row → `{ kind: 'compilation' }`; running job → `result: null`.

---

## 3. Workstream 2 — `/lab` + `/clips` interior redesign (§4.16)

**Bar:** "no remaining pre-design-system pages in user-facing routes." Reference surfaces =
`/niches`, `/agents` (the existing 9/10 pages). Vocabulary: design tokens, `PageHeader`, translucent
surfaces, `fadeRise` staggered entrance, `HoverLift`, skeleton shimmer loading, designed empty
states, status pills. Use frontend-design + ui-ux-pro-max + shadcn skills in implementation.
Browser-verify on the Vercel preview (local pages 500 with blank `.env.local`).

### 3.1 `/lab` — keep 3-pane model, rebuild interiors
Files: `src/app/lab/page.tsx`, `src/components/lab/{ready-to-dispatch-pane,active-run-pane,
recent-drafts-pane,...}.tsx`.
- **Information hierarchy:** lead with the ONE primary thing — the active run when live; else
  "drafts needing your review" / "dispatch next".
- **Ready-to-dispatch:** premium queue cards with niche provenance (source cluster topic + format
  chip), brief preview, primary Dispatch. (Auto-dispatch lands rows here via the niche flow too.)
- **Active run:** elevate the live pipeline view — per-agent cards, current-agent emphasis, output
  peeks, motion. (`pipeline-strip` already exists; raise its fidelity.)
- **Recent drafts:** a real drafts table — thumbnail, title, status pill, **review-verdict badge**
  (ship/revise/block — reviews exist now via G), and row CTAs (Review / Render / Upload) gated by
  status. Designed empty + loading (skeleton) states.

### 3.2 `/lab/drafts` — same premium drafts table
File: `src/app/lab/drafts/page.tsx` (+ `src/components/lab/{drafts-list,draft-row,drafts-tabs,
rendered-row,scheduled-row,posted-row}.tsx`).
- Status-grouped tabs (draft / rendering / rendered / scheduled / posted / failed), each row the
  same premium composition with verdict badges and status-appropriate actions. Empty/loading states.

### 3.3 `/clips` — header + tab interiors
Files: `src/app/clips/page.tsx`, `src/components/clips/{inbox-tab,candidates-tab,rendered-tab,
clips-tabs}.tsx`.
- Replace the bare `<h1 className="text-2xl …">` with `PageHeader`.
- Rebuild Inbox / Candidates / Rendered into premium card/table compositions: thumbnails, velocity,
  source pills, clear primary action per row, designed empty + loading states.

### 3.4 Tests
- Any new pure view-model assembler (e.g. drafts-table row mapping, verdict→badge mapping) is TDD'd.
- Visual/interaction quality is preview-verified by the operator (cannot be unit-tested).

---

## 4. Workstream 3 — Live onboarding scan-progress feed (§4.14 step 6)

### 4.1 Current behavior
`POST /api/onboarding/complete` saves onboarding, marks complete, then **awaits** a single
`triggerIngestion('youtube_shorts_search')` (blocks for the full ingestion run) inside try/catch,
returns `{ ok: true }`. The client (`onboarding-setup.tsx`) then `router.push('/niches')`. No live
feed; raw observations only (no classify/cluster), so niches do not appear until Monday's run.

### 4.2 Target behavior
- `complete` returns **instantly**; the scan runs in the background via `after()`.
- Background **mini-run chain** (best-effort, sequential): `youtube_shorts_search` →
  `classify_observations` → `cluster_niches`, so real niches materialize at the end of onboarding
  (the §4.14 payoff). Each step via the existing `triggerIngestion(job, origin, secret)`; chain
  continues on partial failure where sensible, recorded in `ingestion_runs`.
- A new **"First scan" step** in the onboarding flow (after finish, before /niches): a live
  agent-status feed (reuse the agents activity-feed vocabulary) + a progress checklist
  (Searching YouTube → Classifying → Clustering → **N niches found**), then a **"See your niches →"**
  CTA. Honors reduced-motion. Designed slow/error states (e.g. "Still scanning — your niches will be
  ready by Monday's digest" fallback so the operator is never stuck).

### 4.3 Changes
- `src/app/api/onboarding/complete/route.ts`: `export const maxDuration = 300`; replace the awaited
  single-job trigger with `after(() => runOnboardingScan({ origin, secret }))` where
  `runOnboardingScan` runs the 3-job chain best-effort. (New helper, e.g.
  `src/lib/onboarding/scan.ts`, pure-ish + unit-testable via injected `triggerIngestion`/fetch.)
- New `GET /api/onboarding/scan-status`: returns the live state of the in-flight scan —
  per-source `ingestion_runs` status + counts (observations ingested, clusters formed) + recent
  niche_scout assistant activity lines. Shape e.g.
  `{ steps: [{ job, status, startedAt, finishedAt, count }], clustersFound, done }`.
- `src/app/onboarding/onboarding-setup.tsx`: insert the First-scan step; on finish, POST complete,
  switch to the scan step, poll `scan-status` (~2–3s), render the checklist + feed; route to
  `/niches` on the CTA (or auto when `done`).

### 4.4 Tests
- `runOnboardingScan` sequencing: injected `triggerIngestion` asserts order + continue-on-failure.
- `scan-status` assembler: maps `ingestion_runs` rows + counts → the status payload (fake client).

---

## 5. Migrations

**Expected: zero prod migrations.** Everything reuses existing schema:
- auto-dispatch: `your_videos.source_niche_cluster_id`, `your_videos.script_brief`,
  `produce_video` jobs, `render_jobs`.
- onboarding scan-status: `ingestion_runs`, `assistant` activity.

To confirm during planning: that `GET /api/lab/jobs/active` can return a `your_video_id` for the
in-flight run without schema change (else the UI falls back to "latest draft for topic_id" — still
no migration). If any column is genuinely missing, raise it for an operator-gated, target-named
migration (`Apply migration <name> to prod jfmjppzjicvbpnlkmxbg.`) before writing it.

---

## 6. Sequencing

1. **Pre-flight** — read-only prod audit (render/review state) + record G browser checklist into the
   H handoff.
2. **Workstream 1 — auto-dispatch** (priority; also produces the first real rendered+reviewed video,
   closing G verification).
3. **Workstream 2 — `/lab` + `/clips` redesign.**
4. **Workstream 3 — onboarding scan feed.**

Built via **subagent-driven-development**: fresh implementer per task + per-task two-stage review
(spec compliance + quality), as in G.

---

## 7. Hard rules (carry-forward)

- TS strict, **no `any`** / no `as unknown as` (idiomatic jsonb-read casts only).
- **This is NOT the Next.js you know** — read `node_modules/next/dist/docs/` before any Next code
  (already done for `after`; do likewise for anything else new).
- Premium UI **9/10**; every user-facing surface gets a design pass; preview-verified.
- Prod migrations **operator-gated** (target-named in-chat OK). Expected: none.
- **`-u ANTHROPIC_BASE_URL`** for local dev/test (`env -u ANTHROPIC_BASE_URL npm run …`).
- The render worker (`scripts/render-worker`) **cannot import `src/*`** — copy pure helpers and keep
  in sync. (Workstream 1 does not touch the worker; do not break this if it comes up.)
- Do-it-yourself via Bash/MCP/CLI; only ask the operator for atomic inputs (accounts, eyes,
  irreversible publishes).

---

## 8. Verification gates (per task + end of sub-phase)

- `npx tsc --noEmit` clean (root). Worker `tsc` only if touched (it shouldn't be).
- `npx vitest run` — no NEW failures vs. the G baseline (619 passing / 11 pre-existing env-gated
  failures). New pure-logic tests pass.
- `env -u ANTHROPIC_BASE_URL npm run build` passes; new routes register.
- **Operator browser pass (preview):** niche Generate → live progress → lands at review; `/lab`,
  `/lab/drafts`, `/clips` premium pass; onboarding first-scan feed on a clean DB.
- **End-to-end outcome:** at least one niche-Generated video rendered + reviewed (G verification
  closed); progress toward §4.16's ≥3 posted.

---

## 9. Phase-boundary handoff (carry-forward feedback)

At the end of H, stop and give Darius a copy-pasteable fresh-chat kickoff prompt for the next
sub-phase, plus an H handoff note in `docs/superpowers/notes/` listing what shipped, autonomous
deviations, the OPERATOR TODO (browser pass + any posting), and what's deferred.
