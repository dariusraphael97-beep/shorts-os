# Plan #5 Phase 1 Sub-phase E — handoff (2026-05-29)

Branch: `plan-5-phase-1-sub-e` (stacks on `plan-5-phase-1-sub-d` → `plan-5-phase-1-sub-c`).
PR opened with base `plan-5-phase-1-sub-d` (retarget to `main` after C's #15 and D's #16 merge).
Built autonomously overnight via subagent-driven-development (UI surfaces) + controller TDD (logic).

---

## ⚠️ MORNING TODO (operator-gated — do these first, in order)

1. **Apply the `digest_runs` migration to prod `jfmjppzjicvbpnlkmxbg`.**
   File: `supabase/migrations/20260529000003_digest_runs.sql`. It was written but NOT applied
   (auto-mode safety classifier needs your explicit, target-named in-chat OK, which I didn't have
   while you were asleep). Apply it (MCP `apply_migration`, name `digest_runs`, or the SQL editor).
2. **Regenerate `src/lib/supabase/types.ts`** after the apply (Supabase MCP `generate_typescript_types`
   for project `jfmjppzjicvbpnlkmxbg`, overwrite the file). This adds the `digest_runs` table to the
   generated types.
3. **No cast to remove.** The plan anticipated a temporary `as unknown as` cast on the
   `digest-runs` repo. It turned out **none was needed**: `getServiceClient()` returns the *untyped*
   `SupabaseClient` (no `Database` generic), so `.from("digest_runs")` already compiles against an
   unknown table name — exactly like every other repo in this codebase. After step 2, just confirm
   `npx tsc --noEmit` is still clean (it will be). The repo is `src/lib/supabase/repositories/digest-runs.ts`
   and carries a comment explaining this.

Until step 1 lands, the digest-send cron and the digest-preview "Resend now" will throw at runtime
when they hit `digest_runs` (the table doesn't exist yet) — everything else (rendering the email,
the UI surfaces) works without it.

---

## What Sub-phase E ships

E is the first **user-facing** sub-phase: it turns D's scored `niche_clusters` into the Niche
Finder, a weekly Resend digest email, and the sealed-prediction close-loop. New surfaces mount the
design-system `AppShell` + a new `AppSidebar`; `/` now redirects to `/niches`.

### UI surfaces (§4.9) — all `force-dynamic`, premium design-system markup
- **`/` → `/niches` redirect**; legacy cockpit relocated to `/mission-control` (T1).
- **`/niches`** (`src/app/niches/`) — two-band hero feed (proven / trending-unproven), upgraded
  `NicheCard`s (thumbnails, stat row, "Why this niche?", Investigate/Generate/Dismiss CTAs),
  `j/k/Enter/x/g` shortcuts, empty + skeleton states.
- **`/niches/[id]`** (`src/app/niches/[id]/`) — 40/35/25 columns: expandable cluster videos · stacked
  `WhyThisNiche` cards · `DetailActions` panel (+ sealed-prediction band) · related-niches strip.
- **`/niches/watch-list`** (`src/app/niches/watch-list/`) — 320px filterable channel list + selected
  detail (growth/cadence/outlier) + add-channel modal → `POST /api/watch-list/channels`.
- **`/competitors`** (`src/app/competitors/`) — competitor list + recent-uploads/pattern placeholders
  + add-competitor modal → `POST /api/watch-list/competitors` + designed empty states.
- **`/niches/digest-preview`** (`src/app/niches/digest-preview/`) — week dropdown re-renders via
  `iframe srcDoc`, phone (375px) + desktop (640px) frames, rate-limited "Resend now".
- **`/settings/niche-finder`** (`src/app/settings/niche-finder/`) — honest **env-managed** digest
  toggle/recipient/model fields (no fake save), schedule display, "Reset this week" → cluster rerun.
- **Command palette**: `src/components/layout/app-command-palette.tsx` mounted in `AppShell`
  (Cmd/Ctrl-K), Niches command group + global `g n` → `/niches`. (It's in `AppShell`, so it also
  appears on the `/admin` pages — app-wide nav, intentional.)

### Digest email (§4.10)
- `src/lib/digest/build-email-props.ts` — pure cluster→props mapping (hero = `digest_rank` #1, rest
  condensed, band label). Tested.
- `src/emails/digest-email.tsx` — React Email component, light theme, hardcoded hex tokens (email
  clients ignore CSS vars), hero + condensed rows, unproven pills, `{APP_URL}/niches/{id}` links.
- `src/lib/digest/render-digest.ts` — `render()` → `{ html, text }`. Runtime render smoke-tested.
- `src/lib/supabase/repositories/digest-runs.ts` — `insertDigestRun` / `listDigestRuns` /
  `getLatestDigestRun` (see MORNING TODO for the table).
- **`/api/cron/digest-send`** (`0 12 * * 1`) — cron-auth OR `?force=1` (the preview resend). Renders →
  Resend send (`from: onboarding@resend.dev`) → `digest_runs` row → one sealed prediction per cluster.
  Degrades to `status:'skipped'` without `RESEND_API_KEY`/`DIGEST_RECIPIENT`; a send failure logs
  `status:'failed'` and never crashes. Logic is the injectable `src/lib/digest/send-digest.ts` (tested).
- **`/api/admin/digest-preview`** — render-only (no send), powers the preview page.

### Sealed predictions + close-loop (§4.13)
- `src/lib/digest/prediction-interval.ts` — cold-start band `[0.4×avg_views, (3.0 + velocityBoost)×]`,
  k-factors exported for auditability. Tested.
- **`POST /api/niches/actions`** (already in T2) logs `viewed|investigated|generated_from|dismissed|hidden`.
- **`POST /api/niches/[id]/generate`** — `clusterToBrief` (422 for non-native) → `insertManualTopic`
  (reviewed, `clusterId` in `raw_payload`) → `createVideoDraft` linked via `source_niche_cluster_id`
  (+ `script_brief`) → logs `generated_from`. Wired into the feed + detail Generate buttons.
- **`/api/cron/prediction-close`** (`0 13 * * *`) — `listCloseablePredictions` (open prediction →
  posted niche-sourced video ≥7d → analytics views) → `attachActualOutcome`. No-ops (`closed:0`) until
  data exists. Logic is `src/lib/niches/close-predictions.ts` (tested).
- Both crons registered in `vercel.ts`.

---

## Assumptions / deviations I made autonomously (you were asleep — flag any you dislike)

1. **`digest_runs` cast not needed** — see MORNING TODO #3. Compiles clean today; documented in the repo.
2. **Generate route seeds a draft stub, not a full pipeline run.** A cluster has no script/voice, so
   the route seeds a `topic_queue` row AND a `your_videos` draft whose `script` is the brief summary
   (placeholder) and whose voice/duration come from the default channel — the **point** is to set
   `source_niche_cluster_id` so the +7d close-loop is measurable. The operator opens the draft/topic
   in the **Lab** to run Strategist→Writer→Voice Coach→Director. **Auto-dispatch to the orchestrator
   is deliberately NOT wired** — `/api/lab/dispatch` is an SSE stream meant for the Lab UI, not
   server-to-server. Revisit when shell-unification lands. (Plan said "STOP if unclear"; per the
   overnight autonomy rules I made the reasonable call and kept going.)
3. **`prediction-close` uses the latest analytics snapshot as the "7-day views" proxy** (no dedicated
   7d column exists; snapshots accrue over time) for a video posted ≥7d ago. It also does **not**
   persist `actual_video_id` on close — `attachActualOutcome(predictionId, views)` only takes views
   (its existing signature, matched by the plan's adapter test). Closing still records
   `actual_views_7d` + `accuracy_verdict` + `closed_at`. Adding `actual_video_id` is a tiny follow-up
   if you want full provenance.
4. **`/mission-control` made `force-dynamic`** (one line, beyond T1's verbatim copy) so `npm run build`
   passes cleanly instead of failing prerender on the relocated legacy cockpit with blank local
   secrets. Correct anyway (it reads Supabase at render time).
5. **Command palette mounted globally in `AppShell`** (so it also shows on `/admin`). Reasonable for
   app-wide nav; move it to a niches-only wrapper if you'd rather scope it.
6. **The render smoke test asserts the plaintext case-insensitively** — `@react-email/render`'s
   plaintext mode uppercases headings.

---

## Verification state
- `npx tsc --noEmit`: **clean**, no `any` in source (the one allowed exception — the `digest_runs`
  cast — turned out unnecessary, so there is *zero* `as any`/`as unknown as` from E).
- `npx vitest run`: **493 passing, 11 failing**. The 11 are the **pre-existing** env-gated/live-DB
  suites (gateway, topic-scorer ×2, env loader, supabase server ×2, 4 schema tests) — same baseline
  as C/D, **no new failures**. New E logic tests (digest mapping/render, prediction-interval,
  send-digest, cluster-brief, close-predictions) all pass.
- `env -u ANTHROPIC_BASE_URL npm run build`: **passes**. All new pages are `ƒ` (Dynamic). No
  prerender errors after the `/mission-control` force-dynamic fix.
- **UI was NOT browser-verified** — local pages 500 with blank `.env.local` (same wall as C/D). The
  bar tonight was tsc + build compiling. **Live/visual verification is operator-gated on the Vercel
  preview** (see smoke checklist). A design-skill polish pass on the preview is worthwhile.

## Operator-gated live smoke (post-merge, needs real env)
Needs `RESEND_API_KEY` + `DIGEST_RECIPIENT` (plus the C/D secrets `AI_GATEWAY_API_KEY`/`YOUTUBE_API_KEY`
for upstream data), and the `digest_runs` migration applied (MORNING TODO).
1. `/niches`, `/niches/[id]`, `/niches/watch-list`, `/competitors`, `/niches/digest-preview`,
   `/settings/niche-finder` render against real data; `/` → `/niches`.
2. Trigger `digest-send` (cron or the preview "Resend now" = `?force=1`). Confirm a `digest_runs` row
   (`sent` with a real key, else `skipped`), an email in the Resend dashboard, and one
   `niche_predictions` row per surfaced cluster. (`onboarding@resend.dev` only delivers to the Resend
   account owner's own address in test mode — fine for emailing yourself; a verified domain is needed
   for arbitrary recipients, out of scope.)
3. Generate-from-niche on a `native` cluster creates a `topic_queue` row + a `your_videos` draft with
   `source_niche_cluster_id`, and logs `generated_from`.
4. `prediction-close` returns `closed:0` cleanly until a generated video has posted + accrued 7 days
   of analytics.

## Carry-forward
- **Prod migrations need explicit, target-naming in-chat authorization** (the classifier rejects vague
  "yes"). Phrase it like: "Apply migration `digest_runs` to prod `jfmjppzjicvbpnlkmxbg`."
- RLS still disabled on all public tables (pre-existing); `digest_runs` inherits this.
- Scoring components that are `null` today auto-activate as snapshots accumulate (no code change).
- The "sidebar vanishes on legacy `/lab`/`/clips` routes" wart persists until shell unification (F).

## Deferred out of E (→ Sub-phase F and later)
Onboarding (§4.14); legacy-page shell unification (`/lab`, `/clips`, `/mission-control`, settings onto
`AppShell`); the data-starved admin analysis pages (`/admin/scoring-analysis`, `/admin/moat-validation`,
`/admin/prompt-versions`, `/admin/costs`); full Mission Control agent dashboard (§4.8); comment
ingestion; Resend verified-domain sending; orchestrator auto-dispatch from Generate.

---

## Fresh-chat kickoff prompt for Sub-phase F

> Continue Plan #5, Phase 1 — start **Sub-phase F**. Repo `/Users/darius/Downloads/shorts-os`.
> Sub-phase E is merged (Niche Finder UI + weekly digest + sealed predictions). F has three threads:
>
> 1. **Onboarding (§4.14)** — first-run flow that captures the operator's channel(s), niche interests,
>    and digest recipient, and seeds the watch-list/competitors. Design it premium (frontend-design +
>    ui-ux-pro-max + shadcn, 9/10 bar; lead with the ONE thing). Read the master spec
>    `docs/superpowers/specs/2026-05-28-plan-5-creator-copilot-design.md` §4.14.
> 2. **Legacy-page shell unification** — wrap `/lab`, `/lab/drafts`, `/clips`, `/mission-control`, and
>    `/settings/*` in the design-system `AppShell` + `AppSidebar` so the sidebar stops vanishing on
>    those routes (the §10 "open risk" from the E design). Don't rewrite their internals — just adopt
>    the persistent shell. Reconcile `CockpitShell` vs `AppShell`.
> 3. **Deferred admin analysis pages** — `/admin/scoring-analysis`, `/admin/moat-validation`,
>    `/admin/prompt-versions`, `/admin/costs` (now that E's predictions/actions start producing data;
>    several may still be data-starved — gate or stub honestly, don't fake charts).
>
> Process: superpowers `writing-plans` → brainstorm scope/sequencing with me first, then
> subagent-driven-development. Hard rules carry forward: TS strict no `any`; this is NOT the Next.js
> you know (read `node_modules/next/dist/docs/` before Next code); premium UI; prod migrations are
> operator-gated (target-named in-chat OK); `-u ANTHROPIC_BASE_URL` for local `npm run dev`; do it
> yourself via Bash/MCP/CLI. Start by reading the E handoff
> (`docs/superpowers/notes/2026-05-29-plan-5-phase-1-sub-e-handoff.md`) and the master spec.
