# Mission Control Agents Dashboard — Design

**Date:** 2026-06-11
**Status:** Approved
**Supersedes:** §4.8/§4.9 of `2026-05-28-plan-5-creator-copilot-design.md` where they conflict (that spec predates the 2026-06-04 niche-finder pivot).

## 1. Goal

Replace the legacy topic-queue cockpit at `/mission-control` with the agent command-center designed in Plan #5 §4.8: a 6-card agent grid + system-health pill + cross-agent activity feed, with per-agent pages at `/agents/[id]` (Activity / Chat / Memory / Settings). Adapted to the post-pivot product: `/niches` stays the home; the Generator is longform-first; every status is **derived from real job/cron ledgers — never faked**.

## 2. What already exists (reuse, do not rebuild)

| Layer | Asset | Path |
|---|---|---|
| DB | `assistants`, `assistant_status`, `assistant_activity_log`, `assistant_memory`, `assistant_settings`, `assistant_chat_threads`, `assistant_chat_messages` | `supabase/migrations/20260528000004_assistants.sql` |
| DB seed | The exact 6 product assistants | `supabase/migrations/20260528000010_seed_assistants.sql` |
| Repo | `listAssistants`, `getAssistantById`, `updateAssistantStatus`, `upsertAssistantMemory`, `listAssistantMemory` | `src/lib/supabase/repositories/assistants.ts` |
| UI | `AssistantCard` (icon/name/role + status dot + activity + last-3 entries + HoverLift/Tappable motion), `AssistantStatusDot`, `MissionControlGrid` | `src/components/compositions/` (currently sandbox-only) |
| Ledgers | `ingestion_runs`, `jobs`, `render_jobs`, `digest_runs`, `video_reviews`, `video_analytics`, `your_videos` | migrations + repos exist for all |
| Shell | `AppShell`, `AppSidebar`, design tokens in `globals.css`, framer-motion | `src/components/layout/`, `src/app/globals.css` |

The §4.8 "agent_memory + agent_settings tables to build" are **already built** (as `assistant_*`). The build is: status-derivation module + pages + chat API + wiring + sidebar cleanup + a small seed-update migration.

**Note:** the `agents` table (strategist/writer/voice_coach/…) is the Plan-#4 *pipeline-worker* registry. It is NOT the backing store for this feature and must not be conflated with `assistants`.

## 3. Architecture decisions

### 3.1 Status is derived on read (chosen over write-through)

A server-only module `src/lib/assistants/live-status.ts` computes, at request time, for each assistant:

```ts
type LiveAssistantStatus = {
  assistantId: string;
  state: 'idle' | 'working' | 'waiting' | 'errored';
  currentActivity: string | null;     // 1-line, human
  lastEventAt: string | null;
  overdue: boolean;                   // cron hasn't completed within 2× its schedule interval
  recentActivity: ActivityEvent[];    // last 3 for the card
};
type ActivityEvent = {
  id: string; assistantId: string; type: string;
  summary: string; status: 'success' | 'partial' | 'failed' | 'running' | 'info';
  at: string; href?: string;
};
```

Rejected alternative: instrumenting all 18 cron routes to write `assistant_status`. One missed write produces a permanently lying status — the exact failure mode this feature exists to avoid. `assistant_status` and `assistant_activity_log` stay in the schema, unused for now (reserved for future push events); the UI reads only derived truth.

### 3.2 Assistant → data-source mapping (the registry)

`src/lib/assistants/registry.ts` — a typed constant mapping each assistant id to: Lucide icon, accent, cron schedules (for display + overdue detection; mirror `vercel.ts` `crons`), ledger queries, chat tools, and chat context loaders.

| Assistant | Ledger sources | `working` | `errored` | `waiting` |
|---|---|---|---|---|
| `niche_scout` | `ingestion_runs` jobs: `youtube_category_sweep`, `youtube_shorts_search`, `reddit_topic_discovery`, `google_trends`, `tiktok_creative_center`, `classify_observations`, `cluster_niches`; plus `digest_runs` | any run in flight (`finished_at IS NULL`) | latest completed run of any *enabled* job failed | — |
| `watch_list_curator` | `ingestion_runs` job: `watch_list_sync` | run in flight | latest run failed | — |
| `generator` | `jobs` (kind `produce_longform_video`, `produce_video`) + `render_jobs` (all types) + `your_videos` | a job/render `running`/`claimed`/`queued` | latest job or render failed | a longform `your_videos` row in `rendered` status awaiting review/post |
| `video_reviewer` | `video_reviews` (+ `video_review_feedback`) | — | — | latest review verdict `revise`/`block` on a not-yet-posted video |
| `analyst` | `ingestion_runs` performance-sync rows + latest `video_analytics` snapshot | run in flight | latest sync failed | — |
| `editor_copilot` | none (disabled placeholder, "Phase 3" pill) | — | — | — |

Precedence: `errored` > `working` > `waiting` > `idle`. `overdue` is an orthogonal amber annotation ("last run 26h ago — overdue"), not a state.

Implementation note: verify which job names the `ingestion_runs` CHECK constraint actually allows (see `20260529000002_ingestion_runs_add_jobs.sql`) and whether performance-sync writes `ingestion_runs` or only `video_analytics`; derive the Analyst from whichever it truly writes.

`currentActivity` examples: "Clustering this week's niches (started 4m ago)", "Last sweep: 312 ingested, 18 skipped · 2h ago", "Draft 'The Truth About the B58' awaiting review".

### 3.3 Cross-agent feed

`listRecentActivity(supabase, { assistantId?, limit, before? })` in `live-status.ts`: a union of recent rows from all ledger sources mapped to `ActivityEvent`, merged + sorted desc, cursor-paginated ("Load more"). The same function powers the MC feed (all agents) and each agent's Activity tab (filtered, plus client-side type filter).

### 3.4 Refresh

A small `"use client"` `<AutoRefresh intervalMs={15000} />` calls `router.refresh()` on an interval, paused when `document.hidden`. Pages stay server components (`force-dynamic`, direct repo calls — the established pattern from `/niches`).

## 4. Routes & pages

### 4.1 Sidebar (`app-sidebar.tsx`)

New NAV order: **Niches · Mission Control · Longform (`/lab/longform`) · Watch-list · Competitors · Settings**. `Lab` and `Clips` entries removed (routes remain reachable by URL; their code is untouched — deleting it is a separate cleanup task). `/` keeps redirecting to `/niches`.

### 4.2 `/mission-control` (rewrite of `src/app/mission-control/page.tsx`)

Information hierarchy — the ONE primary thing is **"is anything broken / does anything need me?"**:

1. **Header row:** page title + system-health pill: green "All systems healthy" / amber-red "N agents need attention" (errored or overdue count). Clicking the pill scrolls to / focuses the first affected card.
2. **3×2 `MissionControlGrid` of `AssistantCard`s** (1-col mobile, 2-col md, 3-col lg), staggered entry (50ms, fade-up). Card → `/agents/[id]`. Disabled cards (Editor) render the "Phase 3" pill, 60% opacity, non-clickable.
3. **Cross-agent activity feed** below: chronological `ActivityEvent` rows (status icon, agent chip, summary, relative time, optional link), "Load more" pagination.

Loading: 6 skeleton cards + skeleton feed rows. Empty feed: designed empty state ("Agents haven't logged any runs yet"). `TopicQueuePanel`/`TrendingPanel` imports are dropped from this page (components left in place for the legacy `/lab` surface if referenced, else orphaned for the cleanup task).

### 4.3 `/agents/[id]` (new)

Server component; 404 via `notFound()` for unknown ids. Header: icon tile + display name + role + live status dot + health line. Tabs (shadcn `Tabs`, synced to `?tab=` so they're linkable; default `activity`):

- **Activity** — full feed for this agent (`listRecentActivity({ assistantId })`), client-side filter chips by event type, paginated.
- **Chat** — see §5.
- **Memory** — table of `assistant_memory` rows: key, value (pretty JSON, inline-editable), confidence, last updated, delete button; "Add memory" row. Server actions: `upsertAssistantMemory` (exists), add `deleteAssistantMemory` to the repo. Designed empty state ("No learned preferences yet — memories appear as agents learn from outcomes").
- **Settings** — honest subset only: enabled toggle (writes `assistants.is_enabled`; disabled card on MC), chat model select (writes `assistant_settings.settings.chat_model`), read-only schedule list from the registry ("Runs: every 6h · Sun 23:00 UTC"). Server actions; repo gains `getAssistantSettings`/`updateAssistantSettings`. No taste sliders in v1 — nothing consumes them yet.

## 5. Agent chat

- **API:** `POST /api/agents/[id]/chat` — AI SDK `streamText` via the existing `src/lib/ai/gateway.ts` pattern. Model from `assistant_settings.settings.chat_model`, default `claude-sonnet-4-6`. Honors the local-dev `ANTHROPIC_BASE_URL` caveat the lab routes already handle.
- **System prompt:** assistant role + product context + injected live context (its derived status + last ~10 activity events) + instructions to ground answers in tool results.
- **Read-only tools per agent** (AI SDK `tool()`s wrapping existing repos; 2–3 each):
  - `niche_scout`: `list_top_niches(week?)` (digest-ranked clusters), `get_niche(id)`.
  - `watch_list_curator`: `list_watched_channels()`, `get_channel_recent_outliers(channelId)`.
  - `generator`: `list_recent_drafts(format?)`, `get_job_status(jobId)`.
  - `video_reviewer`: `list_recent_reviews()`, `get_review(id)`.
  - `analyst`: `get_video_analytics(videoId)` (+ latest retention curve summary), `list_posted_videos()`.
  - `editor_copilot`: chat disabled with the placeholder state.
- **Persistence:** threads in `assistant_chat_threads` (auto-title from first user message), messages in `assistant_chat_messages` (user message on submit; assistant message after stream completes; tool calls not persisted in v1). Chat tab UI: thread list (left, collapsible) + message pane + composer; new-thread button. Repo additions: `createThread`, `listThreads`, `appendMessage`, `listMessages`.
- **Failure handling:** stream errors render an inline retry-able error bubble; the user message stays persisted.

## 6. Migration (one, additive)

`2026061200000X_assistants_post_pivot.sql`:
- `analyst`: `is_enabled = true`, role_description → "Post-publication performance & retention analytics (performance-sync)."
- `generator`: role_description → "Drafts longform videos from niche briefs on the Higgsfield engine.", icon `clapperboard`.
- Leave `editor_copilot` disabled.

Prod application requires Darius's in-chat OK per the standing prod-migration rule — flag at the gate, do not auto-apply. UI must render correctly against the **un-migrated** seed too (it only changes copy/enabled flags).

## 7. Quality bar (9/10, per product vision)

Design tokens only (no raw hex), translucent `surface-overlay` where layered, framer-motion stagger on the grid + tab transitions, skeletons (no spinners), designed empty states everywhere (feed, memory, chat, activity), Lucide 1.5px icons, relative timestamps with `title` absolute time. Use `frontend-design` / `ui-ux-pro-max` skill guidance during implementation. Verify in browser preview at desktop + mobile widths, light + dark.

## 8. Testing

- **Unit (vitest, follow existing repo-test patterns):** `live-status` state derivation (in-flight → working; failed latest → errored; rendered-draft → generator waiting; precedence; overdue math) with stubbed ledger rows; registry completeness (6 ids, schedules parse); new repo functions (settings CRUD, memory delete, chat threads/messages) against the local-Supabase harness the schema tests already use.
- **Route:** chat route streams + persists (mock model via existing gateway test pattern).
- **Browser preview:** MC renders 6 cards with real derived statuses; health pill math; card → agent page; all four tabs function; sidebar updated; empty states verified by filtering to an agent with no events.

## 9. Out of scope (explicitly)

- Learning loops that write `assistant_memory` (tables + UI ship; writers come later).
- Deleting `/lab`, `/clips` code (separate cleanup task; only the sidebar entries go).
- Push/SSE live status (polling at 15s is v1), `/admin/health`, taste sliders, per-agent cron editing.
