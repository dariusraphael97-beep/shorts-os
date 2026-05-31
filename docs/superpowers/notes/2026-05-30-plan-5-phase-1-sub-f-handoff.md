# Plan #5 Phase 1 Sub-phase F — handoff (2026-05-30)

Branch: `plan-5-phase-1-sub-f` (stacks on `plan-5-phase-1-sub-e` → D → C; main is at B).
Built via subagent-driven-development (fresh implementer + spec/quality review per task, final whole-branch review).

---

## ⚠️ MORNING TODO (operator-gated — do these first, in order)

1. **Apply the `channels_onboarding` migration to prod `jfmjppzjicvbpnlkmxbg`.**
   File: `supabase/migrations/20260530000001_channels_onboarding.sql` (adds `creator_goals text`,
   `interests text[] default '{}'`, `onboarding_completed_at timestamptz` to `channels`). Written but
   NOT applied (auto-mode safety needs your explicit, target-named in-chat OK). Apply via MCP
   `apply_migration` (name `channels_onboarding`) or the SQL editor.
   **Until applied:** `getDefaultChannel` returns rows without `onboarding_completed_at`, so the `/`
   guard treats it as falsy and redirects EVERY visit to `/onboarding`. Expected; self-resolves once
   the migration lands and the wizard finishes once (which stamps `onboarding_completed_at`).
2. **Regenerate `src/lib/supabase/types.ts`** after the apply (Supabase MCP `generate_typescript_types`
   for `jfmjppzjicvbpnlkmxbg`, overwrite the file). tsc stays clean either way (repos use the untyped
   service client), but this keeps the generated types honest. Confirm `npx tsc --noEmit` then commit.
3. **Preview screenshot / premium-UI pass (the visual bar).** Local pages 500 with blank `.env.local`
   (same wall as C/D/E), so the 9/10 UI verification is operator-gated on the Vercel preview. Capture:
   the onboarding wizard (all 6 steps — this is the operator's first impression, hold it to 9/10), the
   5 re-shelled legacy pages (sidebar persistent + correct active item + Cmd/Ctrl-K palette), and the 4
   admin pages (real-or-honest content, no fabricated data). A design-skill polish pass on the wizard
   especially is worthwhile.

---

## What Sub-phase F ships (three threads)

### Thread 1 — Legacy-page shell unification (the §10 "sidebar vanishes" wart, fixed)
- `AppShell` gained a `bare?: boolean` prop (full-bleed children, no max-width/padding wrapper).
- New pure `resolveActiveHref(pathname, hrefs)` (`src/components/layout/sidebar-active.ts`, tested) —
  longest-prefix match. `Sidebar` uses it; `AppSidebar`/`AdminSidebar` `activeHref` is now optional and
  defaults to `usePathname()`. So `/lab/drafts` highlights **Lab**, `/settings/*` highlights **Settings**,
  `/niches/watch-list` highlights **Watch-list** (not Niches).
- `/mission-control`, `/lab`, `/lab/drafts`, `/clips`, `/settings/channel` migrated off the deleted
  `CockpitShell` onto `<AppShell bare sidebar={<AppSidebar />}>` — bodies untouched.
- **`CockpitShell` retired** + its now-orphaned children deleted: `top-bar`, `team-status-sidebar`,
  `scraper-ticker-footer`, `agent-card`, `agent-drawer`, `health-pill`, `team-status-live`, and
  `ui/spotlight`. `src/components/cockpit/` now holds only the topic-queue + trending components
  mission-control still uses. The old agent-status surface (TeamStatusSidebar) is gone with **no
  replacement** until full Mission Control §4.8 (accepted decision).
- Settings nav href → `/settings`; new `src/app/settings/page.tsx` redirects to `/settings/niche-finder`.

### Thread 2 — First-run onboarding (§4.14)
- Migration adds `creator_goals` / `interests` / `onboarding_completed_at` to `channels`; repo gains
  `saveOnboarding` + `markOnboardingComplete` + the `CreatorGoal` type.
- `/` is now an async guard: no `onboarding_completed_at` → `redirect("/onboarding")`, else `/niches`.
- `/onboarding` — a **focused full-screen wizard** (own layout, no sidebar; premium, Framer Motion,
  6-step stepper). Steps: Welcome → Goals (4 single-select) → Interests (tag chips) → Admired channels
  (paste URLs → preview chips + per-row "also competitor" toggle) → Connect channel (reuses YouTube
  OAuth button, skippable) → Done.
- **Finish** (`POST /api/onboarding/complete`): seeds watch-list (`/api/watch-list/channels`) +
  competitors (`/api/watch-list/competitors`) per admired URL, persists goals/interests, marks
  onboarding complete, then **fire-and-forget** enqueues a small `youtube_shorts_search` scan (a scan
  failure can NOT fail completion — tested), and lands on `/mission-control?onboarded=1` with a
  "first niches arriving by Monday's digest" callout. **No live scan progress feed** (lightweight, by
  decision). "Re-run setup" link added to `/settings/niche-finder`.

### Thread 3 — Deferred admin pages (2 real + 2 honest stubs)
- `AdminSidebar` expanded to 6 entries.
- **`/admin/scoring-analysis`** (real, partial): averaged signal contributions + acted-vs-dismissed
  score-component correlation (`niche_actions`) + prediction-accuracy panel that honestly says
  "awaiting first closed prediction" until the +7d close-loop produces closed rows. Pure logic in
  `src/lib/admin/scoring-analysis.ts` (tested). Repo reads `listClosedPredictions`, `listRecentNicheActions`.
- **`/admin/moat-validation`** (real): the manual-log ENTRY form (`POST /api/admin/vidiq-appearances`)
  + per-`(topic, format)` lead-time lag table + average headline + honest empty state. Pure lag logic
  in `src/lib/admin/moat.ts` (tested). Repo read `listVidiqAppearances`.
- **`/admin/costs`** (honest gate): real YouTube quota chart from `ingestion_runs.quota_units`
  (`aggregateQuotaByDay`, tested) + "last 7 days" total; AI Gateway + Resend shown as labeled
  "tracked externally" link-out cards. **No fabricated numbers.**
- **`/admin/prompt-versions`** (honest stub): read-only display of the current classifier prompt
  version + model strings + an honest "versioned history/rollback arrives when the classifier captures
  versions" note. **No dead rollback button, no fake version list.**

---

## Autonomous deviations / decisions (flag any you dislike)
1. **`FORMAT_LABELS` server/client split.** `shorts-classifications.ts` is `server-only`, so the client
   onboarding form + moat log form import the runtime `FORMAT_LABELS` from the client-safe
   `@/lib/classifier/taxonomy` (which already had the identical 18-value array) and import `FormatLabel`
   as a type-only import from `shorts-classifications`. The server route uses the `shorts-classifications`
   const for its zod enum. The two arrays match exactly today — **a follow-up chip was spawned to unify
   them into one client-safe source** (drift risk, low but real).
2. **Removed 4 extra orphaned cockpit components** (`agent-card`, `agent-drawer`, `health-pill`,
   `team-status-live`) beyond the spec's named children — they became dead code when `TeamStatusSidebar`
   was deleted (zero importers). These are old pre-design-system agent primitives; §4.8 will rebuild fresh.
3. **`onboarded-callout.tsx`** added as a tiny client wrapper so the mission-control callout is
   dismissible (the plan explicitly allowed this as optional).
4. **`MonitorPlay` icon** substituted for the connect-channel header — this fork's `lucide-react` has no
   `Youtube` export. Cosmetic; swap for a brand mark later if desired.

## Verification state
- `npx tsc --noEmit`: **clean**. Sub-phase F introduced **zero** new `any`/`as unknown as` in source
  (the existing ones are all in pre-F files: orchestrator, shorts-observations, schemas, active-run-pane).
- `npx vitest run`: **520 passing / 11 failing**. The 11 are the **pre-existing** env-gated/live-DB
  suites (same baseline as C/D/E) — **no new failures**. New F tests (sidebar-active, channels-onboarding,
  landing guard, parse-channel-urls, onboarding-complete, scoring-analysis, moat, vidiq route, costs) all pass.
- `env -u ANTHROPIC_BASE_URL npm run build`: **passes**. New pages are `ƒ` (Dynamic); `/settings` is a
  static redirect (`○`).
- **Final whole-branch review: "Ready to merge"** — no Critical/Important/Minor issues; integration
  seams (sidebar callers, onboarding field/zod alignment, server/client boundary, FORMAT_LABELS parity,
  migration safety) all verified.
- **UI was NOT browser-verified** — operator-gated on the Vercel preview (MORNING TODO #3).

## Deferred out of F (→ Sub-phase G and later)
Full Mission Control §4.8 agent dashboard + a replacement for the retired agent-status surface; live
onboarding scan progress feed; classifier prompt-version capture + cost persistence (AI Gateway / Resend
usage); deeper redesign of `/lab` + `/clips` page interiors against the design system (F only re-shelled
them — the §4.16 "rebuilt against the new design system" criterion for those interiors is not yet met);
comment ingestion; Resend verified-domain sending; orchestrator auto-dispatch from Generate.

## Carry-forward
- Prod migrations need explicit, target-naming in-chat authorization (classifier rejects vague "yes").
  Phrase: "Apply migration `channels_onboarding` to prod `jfmjppzjicvbpnlkmxbg`."
- RLS still disabled on all public tables (pre-existing); the new `channels` columns inherit this.
- `FORMAT_LABELS` is duplicated in `shorts-classifications.ts` + `taxonomy.ts` (spawned cleanup chip).

---

## Fresh-chat kickoff prompt for Sub-phase G

> Continue Plan #5, Phase 1 — start **Sub-phase G**. Repo `/Users/darius/Downloads/shorts-os`.
> Sub-phase F is merged (first-run onboarding + legacy-page shell unification + the four admin pages).
> The big deferred piece is **full Mission Control (§4.8)** — the agent dashboard the master spec calls
> "the primary UI shell": the 6 `AgentCard`s (status + activity feed), per-agent pages (`/agents/[id]`
> with Activity / Chat / Memory / Settings tabs), the aggregate health pill, and the agent learning-loop
> wiring. This replaces the agent-status surface F retired with the old `TeamStatusSidebar`.
> Read the master spec `docs/superpowers/specs/2026-05-28-plan-5-creator-copilot-design.md` §4.8 (+ §4.5
> watch-list curator, §4.13 Niche Scout learning loop) and the F handoff
> (`docs/superpowers/notes/2026-05-30-plan-5-phase-1-sub-f-handoff.md`). Also in scope to consider/sequence:
> deeper design-system rebuild of `/lab` + `/clips` interiors (§4.16), and the live onboarding scan feed.
>
> Process: superpowers `writing-plans` → brainstorm scope/sequencing with me first, then
> subagent-driven-development. Hard rules carry forward: TS strict no `any`; this is NOT the Next.js you
> know (read `node_modules/next/dist/docs/` before Next code); premium UI 9/10; prod migrations are
> operator-gated (target-named in-chat OK); `-u ANTHROPIC_BASE_URL` for local `npm run dev`; do it
> yourself via Bash/MCP/CLI.
