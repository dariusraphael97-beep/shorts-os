# Plan #5 Phase 1 Sub-phase F — onboarding + legacy-page shell unification + deferred admin pages (design)

**Date:** 2026-05-30
**Depends on:** Sub-phase E (Niche Finder UI + weekly digest + sealed predictions). Consumes the design-system `AppShell` / `AppSidebar`, `niche_clusters`, `niche_actions`, `niche_predictions`, `vidiq_appearances`, `ingestion_runs`, the watch-list/competitor POST routes, and the existing YouTube OAuth flow.
**Master spec:** `docs/superpowers/specs/2026-05-28-plan-5-creator-copilot-design.md` — §4.7 (design system), §4.8 (Mission Control), §4.12 (admin/QC surfaces), §4.13 (sealed predictions + moat validation), §4.14 (first-run onboarding).
**Branch:** `plan-5-phase-1-sub-f` (stacks on `plan-5-phase-1-sub-e` → D → C; main is at B).

Sub-phase F closes the three threads deferred out of E: a premium first-run **onboarding** flow, **shell unification** of the legacy pages onto the design-system `AppShell` (the §10 "sidebar vanishes" open risk), and the four **deferred admin analysis pages** — built honestly against the data that actually exists.

---

## 1. Locked decisions (brainstorm, 2026-05-30)

- **Sequence: Shell unification → Onboarding → Admin.** Shell goes first: it removes the §10 wart and reconciles `AppShell` so the onboarding landing and the admin pages inherit a clean, consistent shell.
- **Onboarding "first scan" (§4.14 step 6) is lightweight:** seed interests/admired channels, enqueue a small ingestion run fire-and-forget, land on Mission Control with a "First niches arriving by Monday's digest" callout. **No live agent-status progress feed** (deferred with §4.8).
- **Retire the legacy `CockpitShell` chrome entirely:** drop `TopBar` + `TeamStatusSidebar` + `ScraperTickerFooter` + `Spotlight`; adopt the persistent `AppSidebar` + command palette on every route, per §4.7 ("no top bar"). Page bodies are not rewritten.
- **Admin: 2 real + 2 honest stubs.** `scoring-analysis` and `moat-validation` are real pages; `costs` and `prompt-versions` are honestly gated (show what we actually track / link out; no fake charts or dead controls).

### Spec-vs-reality gaps found during exploration (these shape the design)

1. **Onboarding trigger.** §4.14 says trigger when `agents.is_enabled = false` for all agents. That column does **not exist** (the table has `is_active`, default `true`); agents are seeded active and a default channel (`dyfrx`) is already seeded in prod. So "first run" cannot be detected that way. F adds an explicit `channels.onboarding_completed_at` flag and gates on it.
2. **Onboarding storage columns.** `channels.creator_goals` and `channels.interests` do **not exist** — one migration adds them.
3. **Reusable backings exist.** `POST /api/watch-list/channels` + `/api/watch-list/competitors` (admired-channel seeding) and the YouTube OAuth flow (connect channel) are already built and are reused as-is.
4. **`AppShell` hardcodes** `max-w-[1280px] px-8 py-8`. Legacy pages carry their own containers and `/mission-control` is full-bleed two-column — so `AppShell` needs a `bare` variant to wrap them without double-padding.
5. **Admin data reality:** `niche_actions` (E) exists but is thin until the operator uses the feed; closed `niche_predictions` are **zero** until a generate→post→7d loop completes; `vidiq_appearances` repo exists but is empty (the page is the data-entry surface); only `ingestion_runs.quota_units` (YouTube) is persisted for cost; classifier prompt-versioning has **no capture layer** (an `agent_prompt_versions` table exists but it is for the Plan #3/#4 *pipeline* agents, not the classifier).

---

## 2. Thread 1 — Legacy-page shell unification (ships first)

**Goal:** the legacy routes `/lab`, `/lab/drafts`, `/clips`, `/mission-control`, `/settings/channel` adopt the design-system `AppShell` + `AppSidebar` so the persistent sidebar + command palette are present everywhere; the `CockpitShell` chrome is retired. Internals are not rewritten.

### 2.1 Reconcile `AppShell`
- Add `bare?: boolean` to `AppShell` (`src/components/layout/app-shell.tsx`). When `bare`, the component renders `sidebar` + `<main>` + command palette but **skips** the inner `<div className="mx-auto max-w-[1280px] px-8 py-8">` wrapper. Default (`bare` unset) is unchanged — the niche/admin pages keep their current behavior.
- Legacy pages pass `bare` and keep their existing inner containers verbatim (`p-6 space-y-6 max-w-5xl mx-auto`, `max-w-2xl`, mission-control's `h-full flex` two-column). No body edits beyond swapping the wrapper element.

### 2.2 Prefix-aware active state in `AppSidebar`
- Today active state is exact-match (`item.href === activeHref`), so `/lab/drafts` and `/settings/channel` would not highlight their parent nav item.
- `AppSidebar` (`src/components/layout/app-sidebar.tsx`) computes active state from `usePathname()` with prefix matching: a route is active when `pathname === item.href` **or** `pathname.startsWith(item.href + "/")`. This lights up **Lab** for `/lab/*` and **Settings** for `/settings/*`. The existing `activeHref` prop on `AppSidebar`/`AdminSidebar` call sites stays supported (optional) for back-compat; pathname is the fallback. (Implementation may consolidate to pathname-only if cleaner — both niche and admin call sites are updated together if so.)

### 2.3 Migrate the five pages
Per page: replace the `CockpitShell` import + wrapper with `<AppShell bare sidebar={<AppSidebar />}>`; leave the body untouched.
- `/mission-control` (`src/app/mission-control/page.tsx`) — full-bleed two-column.
- `/lab` (`src/app/lab/page.tsx`).
- `/lab/drafts` (`src/app/lab/drafts/page.tsx`).
- `/clips` (`src/app/clips/page.tsx`).
- `/settings/channel` (`src/app/settings/channel/page.tsx`).

### 2.4 Retire `CockpitShell`
- After the five swaps, grep for remaining importers. Delete `src/components/cockpit/cockpit-shell.tsx` and any now-orphaned children (`top-bar`, `team-status-sidebar`, `scraper-ticker-footer`, and `Spotlight` **iff** unused elsewhere — grep before deleting; keep any still referenced).
- The old agent-status surface (TeamStatusSidebar) is retired with **no replacement** until full Mission Control (§4.8). `/mission-control` keeps its current panels (`TopicQueuePanel` + `TrendingPanel`). Accepted per the locked decision.
- The command palette is already mounted globally inside `AppShell`, so it now works on every unified route (consistent with E's global mount).

**Risk:** legacy bodies were sized for cockpit-chrome width; minor visual regressions possible. Caught by the per-page preview screenshot pass (§6).

---

## 3. Thread 2 — First-run onboarding (§4.14)

### 3.1 Migration `onboarding_fields` (operator-gated prod apply)
Add to `public.channels`:
- `creator_goals text` (nullable; one of `monetize | grow_subscribers | test_niche | other`, enforced in app, not a DB check, to stay flexible).
- `interests text[] not null default '{}'`.
- `onboarding_completed_at timestamptz` (nullable).

Regenerate `src/lib/supabase/types.ts` after apply (Supabase MCP `generate_typescript_types` for `jfmjppzjicvbpnlkmxbg`). Prod apply is operator-gated — the target is named explicitly in chat before applying.

### 3.2 Guard + entry
- `/` (`src/app/page.tsx`, currently `redirect("/niches")`) becomes: read the default channel; if `onboarding_completed_at` is null → `redirect("/onboarding")`, else → `redirect("/niches")`. No middleware (matches the app convention).
- Re-runnable: a "Re-run setup" link in `/settings/niche-finder` routes to `/onboarding` (the finish step just re-stamps `onboarding_completed_at`).

### 3.3 `/onboarding` — focused wizard (own layout, no sidebar)
"Lead with the ONE thing" → onboarding uses its **own focused full-screen layout** (centered stepper, no `AppSidebar`), not the full app shell. Premium build via frontend-design + ui-ux-pro-max + shadcn: stepper/progress, Framer motion between steps, one primary action per step, designed skip states.

Steps (lightweight scan):
1. **Welcome** — one-line framing ("Find proven niches, generate videos, ship better") + Start.
2. **Goals** — single-select 4 options → `creator_goals`.
3. **Interests** — tag input (chips + free-text) → `interests[]`. Seeds targeted-search terms (§4.2) downstream.
4. **Admired channels** — paste 5–10 channel URLs; each POSTs to the existing `/api/watch-list/channels`, with a per-row checkbox to also flag as a competitor (`/api/watch-list/competitors`). Channel-URL → external-id parsing is a pure, unit-tested helper.
5. **Connect channel** — existing YouTube OAuth link/button; **skippable** ("I'll do this later").
6. **Finish** — `POST /api/onboarding/complete`: persist goals/interests on the default channel, set `onboarding_completed_at`, **enqueue a small ingestion run** (reuse the `trigger-ingestion` job path, fire-and-forget, no progress UI), then land on `/mission-control` (now `AppShell`'d) with a "First niches arriving by Monday's digest" callout.

### 3.4 Repos / routes
- `channels` repo gains `saveOnboarding({ channelId, creatorGoals, interests })` and `markOnboardingComplete(channelId)`.
- `POST /api/onboarding/complete` orchestrates persist → mark complete → enqueue scan. Steps 2–4 may persist incrementally or all-at-once at finish; finish is the source of truth for `onboarding_completed_at`.

---

## 4. Thread 3 — Deferred admin analysis pages (2 real + 2 honest stubs)

`AdminSidebar` (`src/app/admin/_components/admin-sidebar.tsx`) nav expands to six entries (existing Ingestion Health + Classification Review, plus the four below). All pages use `AppShell` + `AdminSidebar` + `PageHeader` (D's pattern).

### 4.1 `/admin/scoring-analysis` — real, partial
- **Score-weight breakdown:** average per-signal contribution across recent weeks from `niche_clusters.explainability_top_signals` (the per-component contributions D persisted).
- **Action correlation:** join `niche_actions` (acted-on = `investigated | generated_from` vs. negative = `dismissed | hidden`) against cluster score components → which weights correlate with niches the operator acts on (§4.13 "weights that produce niches you actually act on"). Designed empty state when no actions yet.
- **Prediction accuracy:** read `niche_predictions`; show "Awaiting first closed prediction" until closed rows exist (the +7d close-loop is a no-op until a generate→post→7d-analytics loop completes). When closed rows exist, render within/above/below-range percentages.
- Repos: `niche-clusters`, `niche-actions`, `niche-predictions` (all exist). Aggregation logic is a pure, unit-tested function.

### 4.2 `/admin/moat-validation` — real
- **Manual-log entry form** → `vidiq_appearances` insert (the repo exists). This is the page's primary value: it is the data-entry surface for the weekly 10-minute logging task.
- **Lag table + headline:** per `(canonical_topic, format_label)`, days between Shorts OS surfacing and the external tool's surfacing; average-lag headline (§4.13). Designed empty state (the table is empty until logs exist). Lag computation is a pure, unit-tested function.

### 4.3 `/admin/costs` — honest gate
- **YouTube quota (real):** aggregate `ingestion_runs.quota_units` by day/week — a real chart/table from data we persist.
- **AI Gateway + Resend (external):** clearly labeled "tracked externally" cards linking to the AI Gateway dashboard and the Resend dashboard. **No fabricated numbers.**

### 4.4 `/admin/prompt-versions` — honest gate
- The §4.12 intent (classifier prompt version history + accuracy-at-sampling + rollback) has **no capture layer** today (the classifier prompt is a constant in `src/lib/classifier` / `src/lib/ingestion/classify-observations.ts`; `agent_prompt_versions` is the pipeline agents' table, not the classifier's).
- Honest page: **read-only view of the current classifier prompt/config** + a clear note that versioned history + rollback arrive when the classifier starts capturing versions. **No dead rollback button.**

---

## 5. Data + dependencies

- **1 migration:** `channels` onboarding columns (`creator_goals`, `interests`, `onboarding_completed_at`) — operator-gated prod apply; regenerate `types.ts` after. Admin pages read existing tables only (`niche_clusters`, `niche_actions`, `niche_predictions`, `vidiq_appearances`, `ingestion_runs`).
- **No new deps.** Onboarding reuses existing watch-list/competitor routes, YouTube OAuth, and the ingestion-trigger path. Charts use the design system's existing Recharts/SVG primitives.
- **RLS:** unchanged (pre-existing posture; new columns inherit it).

---

## 6. Testing & verification

- **Pure logic unit-tested (TS strict, no `any`):** channel-URL → external-id parsing; goals/interests validation; scoring-analysis action-correlation aggregation; moat lag computation.
- **Per-task premium-UI pass** uses frontend-design + ui-ux-pro-max + shadcn, ending in a screenshot. Verification runs against the **Vercel preview deployment** (real env) — local pages 500 with blank `.env.local` (same wall as C/D/E), so don't rely on a bare local dev server. Local `npm run dev` needs `-u ANTHROPIC_BASE_URL`.
- **Baseline to hold:** `npx tsc --noEmit` clean; `npx vitest run` 493 pass / 11 pre-existing env-gated fails (no new failures); `env -u ANTHROPIC_BASE_URL npm run build` passes (new pages `ƒ` Dynamic).
- **Operator-gated live smoke (post-merge):** onboarding end-to-end on a channel with `onboarding_completed_at = null` (guard → wizard → seeds watch-list/competitors → enqueues scan → lands on Mission Control); legacy pages render with the persistent sidebar + working command palette; admin pages render real-or-honest content with no fabricated data.

---

## 7. Task shape (subagent-driven; one implementer + spec/quality review each)

Ordered Shell → Onboarding → Admin:

1. `AppShell` `bare` variant + `AppSidebar` prefix-aware active state.
2. Migrate `/mission-control` to `AppShell bare`.
3. Migrate `/lab` + `/lab/drafts` to `AppShell bare`.
4. Migrate `/clips` to `AppShell bare`.
5. Migrate `/settings/channel` to `AppShell bare`; retire `CockpitShell` + grep-verified orphaned cockpit components.
6. `channels` onboarding-columns migration + repo fns (`saveOnboarding`, `markOnboardingComplete`) + `types.ts` regen. **(operator-gated prod apply)**
7. `/` onboarding guard + `/onboarding` focused layout + steps 1–3 (welcome / goals / interests).
8. Onboarding steps 4–5 (admired-channels → watch-list/competitor POSTs; connect-channel reuse; skip states) + URL-parse helper.
9. Onboarding finish: `POST /api/onboarding/complete` (persist + mark complete + enqueue scan) + landing callout + Settings "Re-run setup" link.
10. `AdminSidebar` nav expansion (4 new entries).
11. `/admin/scoring-analysis` (real, partial) + aggregation logic.
12. `/admin/moat-validation` (real: log form + lag table) + lag logic.
13. `/admin/costs` (quota chart + external links) + `/admin/prompt-versions` (read-only current + honest note).
14. Full verification (tsc / vitest baseline / build) + premium-UI screenshot pass on preview + handoff note + Sub-phase G kickoff prompt.

---

## 8. Deferred out of F (→ later sub-phases)
Full Mission Control agent dashboard (§4.8) and any replacement for the retired team-status surface; live onboarding scan progress feed; classifier prompt-version capture + cost persistence (AI Gateway / Resend usage); comment ingestion; Resend verified-domain sending; orchestrator auto-dispatch from Generate.

## 9. Open risks
- Legacy page bodies were sized for cockpit chrome — visual regressions possible after the `bare` swap; mitigated by per-page preview screenshots. The pages are not redesigned in F (only re-shelled), so any deeper design polish of `/lab`/`/clips` interiors against the design system (the §4.16 "rebuilt against the new design system" criterion) is a separate pass, not F's scope.
- `scoring-analysis` action-correlation and prediction-accuracy panels render mostly empty until the operator uses the feed and ≥1 generate→post→7d loop completes; expected, surfaced via honest empty states, not a blocker.
