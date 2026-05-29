# Plan #5 Phase 1 Sub-phase A — handoff (2026-05-28)

PR: https://github.com/dariusraphael97-beep/shorts-os/pull/13

Branch: `plan-5-phase-1-sub-a`. All migrations applied to prod Supabase project `jfmjppzjicvbpnlkmxbg`.

## What Sub-phase A ships

**21 new tables** (10 migrations):

- Niche-finder observations + classifier: `shorts_observations`, `shorts_classifications`, `classification_samples`
- Niche clusters + predictions + moat tracking: `niche_clusters`, `niche_actions`, `niche_predictions`, `vidiq_appearances`
- Watch-list + velocity + competitors: `watched_channels`, `video_velocity_snapshots`, `competitor_channels`
- Assistants (Plan #5 product personas — DB-renamed from "agents" to avoid collision with Plan #4's pipeline-agents table): `assistants`, `assistant_status`, `assistant_activity_log`, `assistant_memory`, `assistant_settings`, `assistant_chat_threads`, `assistant_chat_messages`
- Pre-publication QA: `video_reviews`, `video_review_feedback`
- Phase 2 reservation: `channel_personas` (table only; Phase 2 populates)
- Plan #5 viability tracking: `kill_criteria_log` (with the first seed row marking the Plan #5 start)

**4 additive columns on `your_videos`**: `source_niche_cluster_id`, `script_brief`, `review_id`, `editor_session_id`.

**1 data migration**: flipped the prod row `11c221e0-693a-4e4c-a096-24725c4e327b` from `'uploading'` → `'rendered'` so Darius can post it manually once Phase 4 ships. The corresponding `render_jobs` row was already failed before this migration ran; idempotency guard correctly left its `last_error` untouched.

**6 seeded assistants** in `public.assistants`: `niche_scout`, `watch_list_curator`, `generator`, `video_reviewer` (all enabled), plus `analyst` + `editor_copilot` (disabled placeholders for Phases 3/4).

**10 repository helper modules** in `src/lib/supabase/repositories/`:
- `shorts-observations.ts`, `shorts-classifications.ts`
- `niche-clusters.ts`, `niche-predictions.ts`, `vidiq-appearances.ts`
- `watched-channels.ts`, `competitor-channels.ts`
- `assistants.ts`
- `video-reviews.ts`
- `kill-criteria.ts`

Plus regenerated `src/lib/supabase/types.ts`.

**Tests**: ~30 new vitest tests (3-6 per repo); full suite at 334 passing / 11 pre-existing env-dependent failures (no regressions from Plan #4 baseline).

## What Sub-phase A does NOT ship

Zero UI. Zero ingestion crons. Zero API routes. The deliverable is **schema + types + repository helpers** — the foundation that subsequent Sub-phases B-J build on. Nothing user-visible changes after merging this PR.

## Naming decision recorded

Plan #5's user-facing product personas are called "agents" in the UI (per Darius's language and the product vision memory note). The database tables and repository code use the name `assistants` to avoid collision with Plan #4's `agents` table (which represents script-pipeline workers — strategist, scout, writer, director, voice_coach, etc.). This split keeps Plan #4 untouched and Plan #5 self-contained. The choice is documented inline in migration `20260528000004_assistants.sql`. The spec doc + product vision memory note will get updated post-merge to reflect this DB naming detail explicitly (the user-facing "Agents" terminology is unchanged).

## Next: Sub-phase B — Design System foundation (~5-7 days)

Tokens, motion layer (Framer Motion), layout primitives (translucent sidebar, command palette, empty states), product compositions (NicheCard, AssistantCard, ReviewScorecard, etc.). Built before any new pages so Sub-phases C-J can consume a stable visual language.

## Fresh-chat kickoff prompt for Sub-phase B

(See chat hand-back below — paste this into a new chat after the PR merges.)
