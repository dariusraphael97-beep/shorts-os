# Plan #5 Phase 1 Sub-phase E — Niche Finder UI + weekly digest email + sealed predictions (design)

**Date:** 2026-05-29
**Depends on:** Sub-phase D (classifier + clustering + scoring) — consumes `niche_clusters` (scored, `digest_rank`, `explainability_top_signals`), `shorts_observations`, `watched_channels`, `competitor_channels`, `niche_predictions`, `niche_actions`.
**Master spec:** `docs/superpowers/specs/2026-05-28-plan-5-creator-copilot-design.md` — §4.9 (UI surfaces), §4.10 (digest email), §4.13 (sealed predictions + moat validation).

This is the first **user-facing** Sub-phase: it turns D's ranked niches into premium surfaces Darius sees and acts on, plus the weekly digest email and the prediction close-loop.

---

## 1. Locked decisions

- **All five §4.9 surfaces** ship in E.
- **Landing:** `/` redirects to `/niches` (de-facto landing). Full Mission Control (§4.8 agent dashboard) is **deferred** to a later sub-phase. Reversible.
- **Onboarding (§4.14) deferred to Sub-phase F.**
- **Digest email:** full **env-gated Resend** send path (degrades gracefully without `RESEND_API_KEY`, like C/D).
- **Predictions:** write sealed predictions at digest time + `niche_actions` logging + a **+7d close-loop cron**. The data-starved admin analysis pages (`/admin/scoring-analysis`, `/admin/moat-validation`, `/admin/prompt-versions`, `/admin/costs`) are **deferred**.
- **Legacy pages** (`/`, `/lab`, `/lab/drafts`, `/clips`, settings) are **not** refactored onto the new shell in E — that "shell unification" is separable future work. Consequence: sidebar links to Lab/Clips load the older `CockpitShell` chrome (the sidebar disappears on those routes). Accepted for E; the niche surfaces are the premium hero.

---

## 2. Architecture & shell

- New surfaces use the **design-system shell**: `AppShell` (`src/components/layout/app-shell.tsx`) + a new **`AppSidebar`** — a thin config wrapper around the existing `Sidebar` primitive (`src/components/layout/sidebar.tsx`), exactly like `AdminSidebar` from Sub-phase D. Nav items: Mission Control · Niches · Lab · Clips · Watch-list · Competitors · Posted · Settings (Lab/Clips/Mission Control/Posted are cross-links into legacy chrome for now).
- Mounted on every new `/niches/*`, `/competitors`, `/settings/niche-finder` page. Each page is an async Server Component (`export const dynamic = "force-dynamic"`, no inline session check — matches the app's existing convention; no middleware).
- **`/` redirect:** `src/app/page.tsx` currently renders the legacy cockpit. E changes the landing so the root lands on `/niches`. Implementation: a redirect (`redirect("/niches")` from `next/navigation`) OR move the legacy cockpit to an explicit route. **Decision: keep the legacy cockpit reachable at `/mission-control` (placeholder) and `redirect("/niches")` from `/`** — preserves the old screen without deleting it, and makes `/niches` the open-the-app experience.
- **Command palette:** wire niche commands into the existing generic `CommandPalette` (`src/components/layout/command-palette.tsx`): `Niches: this week`, `Niches: detail for [search]`, `Watch-list: add channel`, `Digest: preview latest`, `Competitors: add channel`, `Settings: niche finder`. Global `g n` → `/niches`.
- **Toasts:** Sonner is already mounted in `src/app/layout.tsx`.

---

## 3. §4.9 surfaces

### 3.1 `/niches` (hero)
Two-band feed (proven / trending-unproven). Header: "This week's niches · {N} clusters · refreshed Monday". Staggered `NicheCard`s (extend the existing `src/components/compositions/niche-card.tsx` to the full spec):
- 3 example thumbnails (`https://i.ytimg.com/vi/{videoId}/hqdefault.jpg`) — use a plain `<img>` (no `next/image` remotePatterns config needed); hover-lift; click → YouTube.
- Stat row: channels · avg velocity24h · first seen · production_fit badge.
- Velocity sparkline.
- Collapsible **"Why this niche?"** reading `explainability_top_signals` (the per-component contributions + signal values D persisted).
- Footer CTAs: Investigate (→ detail) · Generate now (native `production_fit` only) · Dismiss.
- Empty state, loading skeletons, keyboard shortcuts (`j`/`k`/`Enter`/`g`/`x`).

Data: `listDigestRankedClusters(weekStart)` (exists) for the current week; fall back to most-recent week with clusters.

### 3.2 `/niches/[id]`
40 / 35 / 25 column layout:
- **Cluster videos** (expandable rows) — fetched from `shorts_observations` by `example_video_ids`.
- **"Why?" cards** (stacked) from `explainability_top_signals`.
- **Action panel:** Generate (native only) · Add to my niches · Hide.
- Related-niches strip (same `canonical_topic` or `format_label`, current week).
- Sealed-prediction range shown if a `niche_predictions` row exists for the cluster.

### 3.3 `/niches/watch-list`
320px filterable `watched_channels` list (`listActiveWatchedChannels`) + selected-channel detail: subscriber growth from `channel_stat_snapshots` / velocity from `video_velocity_snapshots`, upload cadence, recent videos. `+ Add channel` modal → existing `POST /api/watch-list/channels`.

### 3.4 `/competitors`
`competitor_channels` list, recent-uploads strip, pattern-change hints. `+ Add competitor` → existing `POST /api/watch-list/competitors`.

### 3.5 `/niches/digest-preview`
Past-digests dropdown (from `digest_runs`), phone + desktop HTML preview of the rendered email, rate-limited "Resend" button (calls the admin preview/send route).

### 3.6 `/settings/niche-finder`
Digest toggle, recipient email, send-time display, classifier-model dropdown (display of the runtime-swappable model strings), reset-week button. **Storage:** recipient email + toggle persist via env (`DIGEST_RECIPIENT`) with an optional `channels`-level override; the settings UI must be honest about env-driven values (no false "saved" affordance for env-only fields). No new column required for E.

---

## 4. §4.10 weekly digest email

- **`DigestEmail`** React Email component (`@react-email/components`), rendered server-side via `@react-email/render`. Hero niche + 4–7 condensed niches, design-system tokens, table layout, plaintext fallback.
- **`digest_runs`** table (the single new migration — prod apply operator-gated, target named explicitly before applying): `id`, `week_start` (date), `sent_at`, `recipient`, `status` (`'sent' | 'skipped' | 'failed' | 'preview'`), `cluster_ids` (jsonb), `html` (text, for preview replay), `error` (text, nullable). + `digest-runs` repo (`insertDigestRun`, `listDigestRuns`, `getLatestDigestRun`).
- **`/api/cron/digest-send`** (`0 12 * * 1` — Monday 12:00 UTC, after `cluster-niches`): latest week's digest-ranked clusters → skip if empty (`status:'skipped'`) → render → Resend send (`from: onboarding@resend.dev`, recipient from settings/env) → write `digest_runs` → **write sealed predictions** (§5). Degrades gracefully (skip + log) without `RESEND_API_KEY`. Wrapped so a send failure is recorded as `status:'failed'`, never crashes.
- **`/api/admin/digest-preview`** — render-only test route (no send), powers the preview page's render + the rate-limited manual resend.
- Both registered in `vercel.ts`.

> Note: `onboarding@resend.dev` only delivers to the Resend account owner's own address in test mode — fine for Darius emailing himself; a verified domain is needed before sending to arbitrary recipients (out of scope for E).

---

## 5. §4.13 sealed predictions + niche_actions + close-loop

- **Sealed predictions:** at digest-send time, `insertNichePrediction` per surfaced niche with a **cold-start heuristic interval** derived from cluster `avg_views`/`avg_velocity_24h` (documented formula; no historical outcomes exist yet, so the interval is a transparent band, e.g. `[avg_views × lower_k, avg_views × upper_k]` with k's recorded in the row's rationale).
- **`niche_actions`:** `POST /api/niches/actions` logs `viewed | investigated | generated_from | dismissed | hidden` (called by the cards + detail). `generated_from` additionally seeds a `topic_queue` row from the cluster brief (topic/format/audience → the existing `topic-queue` repo), sets `your_videos.source_niche_cluster_id` on the resulting draft, and hands off to the existing Lab dispatch. **This API is built before the `/niches` hero** so the cards wire to a real endpoint (the `generated_from`→queue handoff can be feature-gated until the Lab wiring lands).
- **`/api/cron/prediction-close`** (`0 13 * * *` — daily): finds posted niche-sourced videos (`your_videos.source_niche_cluster_id` set, posted ≥7d ago) with an open prediction, links `actual_video_id`, and populates `actual_views_7d` + `accuracy_verdict` via existing `attachActualOutcome`. No-ops gracefully until generation→post→analytics data exists.
- **Deferred:** `/admin/scoring-analysis` + `/admin/moat-validation` pages (no data yet). The `vidiq_appearances` manual-log path stays available via its repo.

---

## 6. Data + dependencies

- **1 migration:** `digest_runs` (operator-gated prod apply; regenerate `types.ts` after). Everything else exists.
- **New deps:** `resend`, `@react-email/components`, `@react-email/render`. New env (optional, gated): `RESEND_API_KEY`, `DIGEST_RECIPIENT`.
- **RLS:** unchanged (pre-existing posture).

---

## 7. Task shape (subagent-driven; one implementer + spec/quality review each)

Ordered to respect dependencies (the two corrections from review are baked in — `digest_runs` migration precedes the preview page; `niche_actions` API precedes the `/niches` hero):

1. `AppSidebar` (wrapper over `Sidebar`) + `/` → `/niches` redirect (legacy cockpit moved to `/mission-control`).
2. `niche_actions` API (`POST /api/niches/actions`) + repo writes (logging only; `generated_from`→queue handoff stubbed/feature-gated).
3. `NicheCard` upgrade to full spec (thumbnails, stat row, sparkline, "Why?", CTAs, states, shortcuts).
4. `/niches` hero (two-band feed, wires cards → niche_actions).
5. `/niches/[id]` detail.
6. `/niches/watch-list`.
7. `/competitors`.
8. `digest_runs` migration + repo. **(operator-gated prod apply)**
9. `DigestEmail` React Email component + `@react-email/render` wiring (+ snapshot test).
10. `/niches/digest-preview` page + `/api/admin/digest-preview` route.
11. `/api/cron/digest-send` cron (render → send → `digest_runs` → sealed predictions write).
12. `/settings/niche-finder` section + command-palette niche commands.
13. `generated_from` → `topic_queue` seed + `your_videos.source_niche_cluster_id` + Lab dispatch handoff.
14. `/api/cron/prediction-close` (+7d close-loop).
15. `vercel.ts` cron registration + full verification + handoff.

---

## 8. Testing & verification

- Pure logic unit-tested: prediction-interval heuristic, digest cluster→email-props mapping, two-band partitioning, `generated_from`→topic-queue seed shape. TS strict, no `any`.
- `DigestEmail` rendered + snapshot-checked.
- **Per-task premium-UI pass** uses frontend-design + ui-ux-pro-max + shadcn skills, ending with a screenshot. **These verifications run against the Vercel preview deployment (real env) or a seeded local `.env.local`** — the pages 500 with blank local secrets (same wall as D), so don't rely on a bare local dev server.
- Live send + crons operator-gated on real secrets (`RESEND_API_KEY`, plus the existing `AI_GATEWAY_API_KEY`/`YOUTUBE_API_KEY` for upstream data); documented smoke checklist, same pattern as C/D.

---

## 9. Deferred out of E
Onboarding (§4.14 → Sub-phase F); `/admin/scoring-analysis`, `/admin/moat-validation`, `/admin/prompt-versions`, `/admin/costs`; full Mission Control agent dashboard (§4.8); shell-unification of legacy `/lab`/`/clips`/settings; comment ingestion; Resend verified-domain sending.

---

## 10. Open risk
- The "sidebar vanishes on legacy routes" UX wart persists until shell unification. Optional cheap mitigation (not in E scope): wrap legacy pages' existing content in `AppShell` without touching their internals — keeps the sidebar persistent. Flagged as fast-follow.
- Cold-start prediction intervals are heuristic until ≥1 generation→post→7d-analytics loop completes; the close-loop cron is a no-op until then. Expected; not a blocker.
