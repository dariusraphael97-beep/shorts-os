# Plan #5: Creator Co-pilot — Design Spec

**Date:** 2026-05-28
**Status:** Approved by Darius; pending writing-plans for implementation breakdown.
**Supersedes:** the abandoned "option-2 manual-posting" brainstorm; the never-implemented Sub-phases E + F of Plan #4 (scheduled-uploader cron + schedule recommendations UI).

This document is the authoritative design for the next major Shorts OS direction. It will be broken into executable phases by the writing-plans pass.

---

## 1. Executive Summary

Shorts OS pivots from "automated short-form factory for a chosen niche" to **a one-stop creator co-pilot for finding, generating, polishing, and shipping YouTube Shorts (and eventually longform).** The operator is a YouTube creator who hasn't yet locked their niche and whose channel isn't yet monetized.

Four product pillars, owned by named agents that you can see, talk to, and improve:

1. **Niche Finder** (Niche Scout + Watch-list Curator agents) — surface trending-AND-proven niches before competitor tools.
2. **Multi-format Generator** (Generator agent) — current short-form + future longform. (No AI avatars; that decision is recorded in `scope_decision_no_heygen.md`.)
3. **Editor Co-pilot** (Editor Co-pilot agent) — CapCut Web automation via Chrome MCP + Adobe UXP plugin for Premiere.
4. **Pre- and Post-publication Analytics** (Video Reviewer + Analyst agents) — narrative, actionable, agent-driven. Catch underperforming videos before posting; explain what worked / what didn't after.

Underlying the four pillars: a real **design system** (9/10 quality bar) and an **agents architecture** in which Mission Control is the primary shell.

Estimated effort: **~19–26 weeks (~4.5–6 months)** of focused single-developer work, shipped phase-by-phase production-ready.

---

## 2. Vision and Principles

Read these before any planning decision. They override convenience choices:

- **One-stop shop for a viral creator.** Every feature must visibly improve at least one of: finding niches, finishing videos. If not, deprioritize. (`product_vision_one_stop_shop.md`)
- **Quality over speed.** Don't strip features for an MVP cut. Phases are bounded by capability, not by quality reductions within a capability. (`feedback_quality_over_speed.md`)
- **Premium UI is first-class.** Target is 9/10 (Apple-system + Notion calm aesthetic, dark default, Apple-system blue accent). shadcn is the floor, not the ceiling. Real design system, motion layer, layout polish, product-specific compositions, designed empty/loading states. (`product_vision_premium_ui.md`, `feedback_shadcn_is_the_floor.md`)
- **Plain-English chat, technical docs.** Conversation in plain language; documents like this one stay technical. (`feedback_plain_english_docs.md`)
- **Phase-boundary handoff.** At the end of every phase, stop and give Darius a fresh-chat prompt to start the next. (`feedback_phase_boundary_handoff.md`)
- **Do it yourself.** Default to driving operator-gated work via tools (Supabase MCP, Vercel MCP, Bash, browser MCPs); only ask Darius for atomic inputs that genuinely need his accounts/eyes. (`feedback_do_it_yourself.md`)
- **HeyGen / AI avatars are out of scope.** Don't reintroduce. (`scope_decision_no_heygen.md`)

---

## 3. Phase Overview

| Phase | Capability | Estimated effort |
|---|---|---|
| **1** | Niche Finder + Design System + Pre-Pub QA + Mission Control | ~8–10 weeks |
| **2** | Longform pipeline | ~2–3 weeks |
| **3** | Editor Co-pilot (CapCut Web + Premiere UXP) | ~5–7 weeks |
| **4** | Posting + Reminders + Narrative Analytics | ~4–6 weeks |

Each phase ships production-ready. Code lands in `main` only when its phase's success criteria are met.

**Phase-1 "not done" rule:** Phase 1 is not shippable until Darius has posted at least 3 real videos generated from its niche output. Discipline against UI-perfecting forever.

**Plan #5 kill criteria:** If 90 days after Phase 1 launches Darius has fewer than 3 videos crossing 1000 views, the niche-finder thesis is wrong. Re-plan, don't push harder. Track in `kill_criteria_log` table.

---

## 4. Phase 1 — Niche Finder, Design System, Pre-Pub QA, Mission Control

### 4.1 Data model

**Niche-finder tables (all new):**

- `shorts_observations` — raw ingested videos from all sources.
  - `video_id` (PK, YT video ID for YT-sourced; synthetic for TikTok/Reddit)
  - `source` (`'youtube_most_popular' | 'youtube_search' | 'youtube_watch_list' | 'reddit_topic' | 'tiktok_creative_center' | 'google_trends'`)
  - `channel_id` (nullable for non-channel sources)
  - `channel_subscriber_count` (snapshot at observation)
  - `title`, `description` (varchar 2000), `tags` (jsonb), `thumbnail_url`
  - `duration_seconds`, `published_at`
  - `view_count`, `like_count`, `comment_count`
  - `observed_at`, `last_refreshed_at`
  - Index: `(source, observed_at)`, `(channel_id, published_at)`

- `shorts_classifications` — LLM-extracted labels per observation.
  - `video_id` (FK, PK)
  - `topic_label` (text, free-form 2-4 word noun phrase)
  - `format_label` (enum — see §4.4)
  - `audience_signal` (enum: `seniors | gen_z | millennials | kids | professionals | hobbyists | general`)
  - `confidence` (numeric 0-1)
  - `model` (text — the AI Gateway model string)
  - `prompt_version` (text)
  - `vision_used` (boolean)
  - `transcript_used` (boolean)
  - `classified_at`
  - Index: `(topic_label, format_label)`, `(prompt_version)`

- `classification_samples` — 5% sample retention for QC.
  - `id`, `video_id` (FK), `prompt_full` (text), `response_full` (text), `chosen_labels` (jsonb), `reviewed` (boolean), `review_verdict` (`'correct' | 'wrong' | 'partial' | null`), `reviewed_by`, `reviewed_at`.

- `niche_clusters` — weekly snapshots.
  - `id`, `week_start` (date)
  - `canonical_topic` (text), `format_label` (enum)
  - `example_video_ids` (jsonb array)
  - `channel_count`, `avg_views`, `avg_velocity_24h`, `outlier_density`
  - `first_seen_at` (timestamp — when this combo first appeared in any source)
  - `first_mover_score` (numeric), `proven_score` (numeric), `niche_score` (numeric)
  - `discovery_state` (`'pre_public' | 'public'`)
  - `production_fit` (`'native' | 'needs_manual_recording' | 'needs_manual_editing' | 'manual_only'`)
  - `audience_signal` (modal value across cluster)
  - `digest_rank` (integer, nullable)
  - `explainability_top_signals` (jsonb — for "Why this niche?" surface)
  - `created_at`

- `watched_channels` — channel watch-list.
  - `channel_id` (PK), `channel_handle`, `channel_title`, `channel_thumbnail_url`
  - `subscriber_count_at_add`, `current_subscriber_count`, `subscriber_growth_30d`, `subscriber_growth_90d`
  - `outlier_rate_60d`, `upload_cadence_per_week`
  - `added_at`, `discovery_source` (`'manual' | 'auto_breakout' | 'auto_outlier'`)
  - `is_active`, `last_snapshotted_at`
  - Index: `(is_active, last_snapshotted_at)`

- `video_velocity_snapshots` — daily view-count history for tracked videos.
  - `video_id`, `snapshot_at`, `view_count`, `like_count`, `comment_count`
  - Primary key: `(video_id, snapshot_at)`

- `niche_actions` — user interactions for scoring tune.
  - `id`, `niche_cluster_id` (FK), `action` (`'viewed' | 'investigated' | 'generated_from' | 'dismissed' | 'hidden'`)
  - `actor`, `timestamp`

- `niche_predictions` — sealed predictions for accuracy tracking.
  - `id`, `niche_cluster_id` (FK), `predicted_at`, `predicted_views_7d_lower`, `predicted_views_7d_upper`
  - `actual_video_id` (FK to your_videos, nullable until Darius posts from this niche)
  - `actual_views_7d` (nullable until measurement)
  - `accuracy_verdict` (`'within' | 'below' | 'above' | null`)

- `vidiq_appearances` — moat validation.
  - `id`, `canonical_topic`, `format_label`, `first_surfaced_by_shorts_os_at`, `first_surfaced_by_vidiq_at` (manual log), `first_surfaced_by_1of10_at` (manual log), `first_surfaced_by_exploding_topics_at` (manual log), `lag_days` (computed)

- `competitor_channels` — tracked channels for `/competitors` page.
  - `channel_id` (PK), `channel_handle`, `added_at`, `is_active`
  - One row per channel Darius is watching for pattern changes.

**Agent infrastructure tables (all new):**

- `agents` — registry of agent identities.
  - `id` (text PK, e.g. `'niche_scout'`), `display_name`, `role_description`, `icon_name`, `accent_color_var`, `is_enabled`, `created_at`

- `agent_status` — current status per agent.
  - `agent_id` (PK), `state` (`'idle' | 'working' | 'waiting' | 'errored'`), `current_activity` (text), `updated_at`

- `agent_activity_log` — every significant agent action.
  - `id`, `agent_id`, `activity_type`, `summary` (text), `payload` (jsonb), `created_at`
  - Index: `(agent_id, created_at)`

- `agent_memory` — learned preferences per agent.
  - `id`, `agent_id`, `memory_key`, `memory_value` (jsonb), `confidence`, `last_updated_at`, `editable_by_user` (boolean)
  - Unique: `(agent_id, memory_key)`

- `agent_settings` — configurable behavior per agent.
  - `agent_id` (PK), `settings` (jsonb — model, frequency, thresholds, taste sliders)

- `agent_chat_threads` — per-agent chat history.
  - `id`, `agent_id`, `started_at`, `last_message_at`, `title` (text)

- `agent_chat_messages`
  - `id`, `thread_id` (FK), `role` (`'user' | 'agent' | 'system'`), `content` (text), `created_at`

**Pre-publication QA tables (new):**

- `video_reviews` — Video Reviewer agent output per draft.
  - `id`, `your_video_id` (FK), `reviewed_at`
  - `title_score`, `thumbnail_score`, `hook_score`, `pacing_score`, `description_seo_score`, `audio_score`, `visual_score` (each `'pass' | 'needs_work' | 'fail'` + numeric 0-1)
  - `overall_verdict` (`'ship' | 'revise' | 'block'`)
  - `suggestions` (jsonb — array of `{component, severity, suggestion_text, ref_video_ids?}`)
  - `strengths` (jsonb — array of `{component, what_works_text}`)
  - `model`, `prompt_version`

- `video_review_feedback` — Darius's response to Reviewer suggestions (learning signal).
  - `id`, `video_review_id` (FK), `suggestion_index`, `action_taken` (`'accepted' | 'ignored' | 'partial'`), `recorded_at`

**Narrative analytics tables (new for Phase 4 but defined here for cross-phase clarity):**

- Existing `video_analytics` table (from Plan #4) stays.
- `video_narratives` — Analyst agent's written interpretation per snapshot.
  - `id`, `your_video_id` (FK), `snapshot_at`, `narrative_html` (rendered text), `key_findings` (jsonb), `recommendations` (jsonb), `compared_against` (jsonb — niche-cluster baselines), `model`, `prompt_version`

**Existing-schema additions:**

- `your_videos.source_niche_cluster_id` (uuid, nullable, FK to `niche_clusters.id`) — closed-loop tracking.
- `your_videos.script_brief` (jsonb) — structured generator input.
- `your_videos.editor_session_id` (uuid nullable, no FK constraint in Phase 1; FK to `editor_sessions.id` added in Phase 3 when the target table is created).
- `your_videos.review_id` (uuid, nullable, FK to `video_reviews.id`).
- `channels.avatar_config` — **not added.** HeyGen is out of scope (`scope_decision_no_heygen.md`).
- `kill_criteria_log` — one row per kill-criteria evaluation: `id`, `evaluated_at`, `criterion` (text — e.g., `'90d_videos_over_1000'`), `verdict` (`'pass' | 'fail' | 'inconclusive'`), `evidence_jsonb`, `decision_text`.

**Removals / migrations:**

- `your_videos.status` enum: keep `'uploading'` value for historical rows but stop writing it. No new uploads enqueued.
- `render_jobs.job_type` enum: `'upload'` stays for historical rows.
- `scripts/render-worker/handlers/upload.ts` deleted.
- The Sub-phase B–C upload worker code path is removed but the Sub-phase C scheduling primitives (timezone math, scheduleVideo helpers, `claim_due_scheduled_uploads` PG function) are kept and repurposed for the Phase 4 reminder queue.

### 4.2 Multi-source ingestion

Daily ingestion crons, scheduled in `vercel.ts`. Quota-conservative across the board.

**YouTube Data API (primary source, ~1,100 quota units/day):**

- **Category trending sweep** (every 6h): `videos.list?chart=mostPopular&videoCategoryId=<id>&regionCode=US&part=snippet,statistics,contentDetails` across 12 categories (Comedy, Entertainment, Education, Science & Tech, Howto & Style, News, Gaming, Sports, Film & Animation, Music, Pets & Animals, People & Blogs). Filter to ≤60s server-side. ~12 units per sweep × 4 sweeps = 48 units/day.
- **Targeted Shorts search** (1×/day, early-AM UTC): `search.list?type=video&videoDuration=short&q=<seed>&regionCode=US` for 8–10 rotating broad seeds. 800–1,000 units/day.
- **Watch-list velocity tracking** (every 6h): per watched channel, `playlistItems.list` on uploads playlist (1 unit) → `videos.list?part=statistics` batched 50 IDs/call (1 unit per 50). ~100 units/day across 1,000 channels.
- **Channel-stat enrichment** (on observation of new channel ID): `channels.list?part=snippet,statistics`. ~5 units/day expected.
- **Caption fetch** (on classifier need, throttled): `captions.list` + `captions.download` per video. Free quota.

**Reddit topic-discovery (no clip download — that path stays broken/deferred):**

- Source: Reddit JSON API (`r/<sub>.json`, `r/<sub>/top.json?t=week`). Free, ~60 req/min.
- Subs ingested: niche-relevant subreddits seeded by category (e.g., `r/NewTubers`, `r/PartneredYoutube`, niche-specific subs based on topic keywords).
- Daily cron: pull top + rising posts from ~30 seed subs. Extract titles + bodies as topic signal. Subscriber-count delta over 30d (where available) as growth signal.
- Resilience: retry with exponential backoff; on 503/429, mark `ingestion_runs` row as `partial`; fall back to last good snapshot for clustering.

**Google Trends (keyword interest):**

- Source: `google-trends-api` npm package (unofficial scraper). Free, ~30 req/hr throttled.
- Daily cron: query trending searches in `US-entertainment` + `US-people-and-society` categories. Augment niche-cluster context with rising-search signal.
- Resilience: snapshot last-good response; if scraper breaks for >24h, log alert and continue without Google Trends signal.

**TikTok Creative Center (cross-platform format signal):**

- Source: TikTok Creative Center web (`ads.tiktok.com/business/creativecenter/...`). Web-scrape via Chrome MCP, ~30 req/hr.
- Weekly cron (Sunday before clustering): pull trending hashtags + sounds + ad creative examples. Use for format-label corroboration.
- Resilience: scraper-failure tolerant; this is a secondary signal.

**Total daily quota budget: ~1,100 YouTube units (11% of free quota); Reddit + Trends + TikTok well within their free limits.**

### 4.3 LLM Classifier

Vision + transcript + metadata. Two LLM calls per video (one for topic, one for format) because combining hurt accuracy in early prototypes.

**Inputs per video:**
- Title, description (truncated 300 chars), tags, channel name, duration, view/like/comment counts, channel subscriber count.
- **Thumbnail image** (vision) — fetched from `thumbnail_url`, base64-encoded into the call.
- **Transcript** (when available) — YouTube auto-captions via Data API `captions.list` + `captions.download`. Skip transcript-fetch on errors; don't fail the classification.

**Outputs (structured via `generateObject`):**
- Pass 1 (topic): `{ topic_label: string (2-4 words), audience_signal: enum, confidence: 0-1 }`. Inputs: title + description + tags + transcript + channel context. (Vision not used for topic — the thumbnail is a clickbait artifact, not a topic source.)
- Pass 2 (format): `{ format_label: enum, confidence: 0-1 }`. Inputs: title + duration + visual cues + thumbnail (vision). Transcript optional.

**Format taxonomy (18 values):**
`narrated_storytelling`, `talking_head_facts`, `talking_head_advice`, `compilation_montage`, `transformation_reveal`, `ranking_list`, `before_after`, `tutorial_quick`, `pov_skit`, `screen_record_walkthrough`, `ai_voiceover_facts`, `reaction`, `interview_clip`, `news_recap`, `product_review`, `meme_format`, `live_capture`, `other`.

**Format → production_fit mapping** (deterministic, computed at classification time):

| format_label | production_fit |
|---|---|
| `ai_voiceover_facts`, `compilation_montage`, `ranking_list`, `news_recap`, `narrated_storytelling` | `native` |
| `talking_head_facts`, `talking_head_advice`, `tutorial_quick`, `product_review` | `needs_manual_recording` |
| `transformation_reveal`, `before_after`, `pov_skit`, `reaction`, `interview_clip`, `screen_record_walkthrough`, `meme_format`, `live_capture` | `needs_manual_editing` |
| `other` | `manual_only` |

**Provider:** Vercel AI Gateway. Default model `anthropic/claude-haiku-4-5` for cost; falls back to `openai/gpt-4o-mini` via gateway routing if Anthropic unavailable. Both vision-capable.

**Batching:** Classify 10 videos per call where prompt structure allows (topic pass batches well; format pass with vision batches less efficiently — process serially for format).

**Confidence floor:** classifications with `confidence < 0.5` excluded from clustering; row retained for re-classification on next prompt version.

**Sample review:** random 5% written to `classification_samples` with full prompt + response for manual review on `/admin/classification-review`.

**Versioning:** every prompt change bumps `prompt_version`. Cron re-classifies stale rows (rate-limited to 500/run).

### 4.4 Niche scoring — first-mover + proven

Per niche cluster, computed weekly:

**First-mover score components:**
- `niche_age_days` = days since the first observation matching this `(canonical_topic, format_label)` combo across all sources.
- `outlier_density` = fraction of cluster videos where `view_velocity_24h = views_at_24h / channel_28d_avg_views > 5.0`.
- `avg_velocity` = mean `view_velocity_24h` across cluster outliers.
- `first_mover_score = (1 / max(niche_age_days, 1)) × outlier_density × log(1 + avg_velocity)`, normalized.

**Proven score components:**
- `channel_growth_score` = % of cluster channels with positive 30d AND 60d AND 90d subscriber growth.
- `sub_to_view_ratio` = median of `subscribers / 28d_avg_views` across cluster channels (high = loyal audience).
- `comment_depth_score` = median average comment length × reply ratio across cluster videos (bot-resistant signal).
- `repeat_winner_density` = fraction of cluster channels with ≥3 outlier videos in the past 90 days in this niche.
- `monetization_signal_score` = fraction of cluster channels with membership/sponsorship/merch mentions in recent video descriptions.
- `proven_score = weighted_mean(channel_growth_score, sub_to_view_ratio_normalized, comment_depth_normalized, repeat_winner_density, monetization_signal_score)`, normalized.

**Final niche score:**
```
niche_score =
    0.25 × first_mover_score
  + 0.25 × proven_score
  + 0.15 × (1 / log(channel_count + 2))      // saturation inverse
  + 0.15 × production_fit_weight              // native=1.0, needs_manual_recording=0.7, needs_manual_editing=0.5, manual_only=0.2
  + 0.10 × discovery_state_weight             // pre_public=1.0, public=0.5
  + 0.10 × outlier_density
```

Weights are starting values; tune after 2-4 weeks of digest data via `/admin/scoring-analysis`.

**Two-band digest selection:**
- "Proven + trending" band: high `niche_score` AND `proven_score > 0.6`.
- "Trending, unproven" band: high `niche_score` AND `proven_score ≤ 0.6` AND `first_mover_score > 0.7`. Surfaced with explicit "unproven" badge.

MMR diversity selection picks the top-N from each band such that the final digest has 4–5 proven and 2–3 unproven niches.

### 4.5 Watch-list view-velocity tracking + auto-discovery

**Auto-add criteria** (evaluated on any newly observed channel):
- Subscriber count between 5k–500k.
- Upload cadence ≥1 video/week (computed from last 30 days).
- ≥10% of last 30 uploads are outliers (≥3× channel 28d_avg_views).

Adds with `discovery_source='auto_outlier'`.

**Auto-add via breakout detection** (subscriber growth signal):
- Channel previously not tracked, now showing 2× or greater subscriber count vs. 30 days ago.
- Adds with `discovery_source='auto_breakout'`.

**Eviction**: every 90 days, channels with zero outliers in 90 days marked `is_active=false`. Manual unfreeze available via `/niches/watch-list`.

**Cap**: 1,000 active channels initially.

**Velocity snapshots** (every 6h cron per §4.2): all `is_active=true` channels, all videos newer than 7 days. Stored in `video_velocity_snapshots`.

### 4.6 Clustering algorithm

1. **Input join**: `shorts_observations` × `shorts_classifications` for last 28 days, `confidence ≥ 0.5`.
2. **Topic fuzzy-merge**: embed `topic_label` via `openai/text-embedding-3-small` (Vercel AI Gateway). Cosine ≥ 0.85 → merge to canonical (most-frequent surface form).
3. **Cluster**: group by `(canonical_topic, format_label)`. Minimum 3 videos to qualify.
4. **Score**: compute per-cluster signals (§4.4).
5. **Diversity selection**: apply MMR to pick the top 10 for digest, mixing proven and unproven bands.

Weekly cron: Sunday 23:00 UTC. Output written to `niche_clusters` with `digest_rank` set on selected entries.

### 4.7 Design System foundation

Built first, before any specific page. Tokenized so later phases inherit zero rework.

**Typography:**
- UI: Inter (Variable, self-hosted via `next/font/google`). Falls back to system SF Pro / Segoe UI.
- Mono: Geist Mono.
- Scale (rem, 1.25 ratio): `xs 12 / sm 14 / base 16 / lg 20 / xl 24 / 2xl 32 / 3xl 48 / 4xl 64`.
- Weights: 400 / 500 / 600 only.
- Line-heights: body 1.55, display 1.2, controls 1.4.

**Color (dark default):**
- `bg #0a0a0b`, `surface-1 #131315`, `surface-2 #1b1b1e`, `surface-overlay rgba(28,28,32,0.7) + 20px blur`
- `border-subtle #26262a`, `border-strong #3a3a3f`
- `text-primary #f5f5f7`, `text-secondary #a8a8ad`, `text-tertiary #6e6e73`
- `accent #0a84ff` (Apple system blue), `accent-hover #1c95ff`, `accent-muted rgba(10,132,255,0.15)`, `accent-foreground #ffffff`
- `success #30d158`, `warning #ffd60a`, `danger #ff453a`

Light mode mirrors via the same token names with light values.

**Spacing (4px base):** `1 4 / 2 8 / 3 12 / 4 16 / 5 20 / 6 24 / 8 32 / 10 40 / 12 48 / 16 64 / 24 96`. Default page padding `8`; section gaps `10–12`.

**Radii:** `sm 6 / md 10 / lg 16 / xl 24`.

**Elevation:**
- `elev-1`: `0 0 0 1px rgba(255,255,255,0.04), 0 1px 2px rgba(0,0,0,0.4)`
- `elev-2`: `0 0 0 1px rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.5)`
- `elev-3`: `0 0 0 1px rgba(255,255,255,0.08), 0 24px 64px rgba(0,0,0,0.7)`

**Translucency:** `backdrop-filter: blur(20px) saturate(180%)` on sidebar + command palette + modals.

**Motion:**
- Durations: `instant 100ms / quick 200ms / smooth 320ms / slow 500ms`.
- Curves: `ease-out` entry, `cubic-bezier(0.4, 0, 0.2, 1)` state changes, springs (`stiffness 400, damping 30`) for delight.
- Framer Motion for component transitions; CSS for hover/focus; App Router shared layouts for route transitions.
- Skeleton loaders only — no spinners except for ≤200ms operations.

**Component baseline:** shadcn/ui via CLI, themed by overwriting `globals.css` with the tokens above. Use the `vercel:shadcn`, `frontend-design`, and `ui-ux-pro-max` skills when scaffolding.

**Components to install:** `button card input textarea select combobox command dialog sheet tabs dropdown-menu popover tooltip toast badge avatar progress skeleton separator scroll-area accordion radio-group switch slider calendar data-table` (TanStack Table for tables).

**Product-specific compositions to build:** `NicheCard`, `NicheDetailHeader`, `VelocitySparkline`, `OutlierBadge`, `DiscoveryStateBadge`, `ProductionFitBadge`, `ProvenBandBadge`, `ChannelWatchListItem`, `AgentCard`, `AgentStatusDot`, `AgentChatThread`, `ReviewScorecard`, `ReviewSuggestionItem`, `DigestEmailPreview`, `EmptyState`, `KeyboardShortcutHint`, `MissionControlGrid`.

**Layout primitives:**
- **Persistent left sidebar** (260px, collapsible to 64px icon-only, translucent surface, `surface-overlay` background).
- **No top bar.** Page title inside content area at the top.
- **Command palette** (`Cmd+K`, cmdk-based). Global navigation, quick actions, search across niches/videos/channels/agents.
- Content area max-width 1280px, padding `8`.

**Iconography:** Lucide icons (line, 1.5px stroke).

**Data viz:** Recharts for detail charts; custom SVG sparklines.

**Empty states:** every list/table/panel has a designed empty state with line illustration + one-line copy + one primary CTA.

**Migration:** existing `/lab`, `/lab/drafts`, `/clips`, admin pages, settings — **rebuilt** against this design system in Phase 1, not patched in place.

### 4.8 Mission Control + Agents architecture

The agent system is the primary UI shell of Plan #5.

**Mission Control** at `/` (replaces the current default landing):

- 6 `AgentCard`s in a 3×2 grid (1×6 on mobile). Each card:
  - Top: agent icon + name + role (1-line).
  - Middle: status indicator (`idle | working | waiting | errored`) with colored dot + current activity 1-line summary.
  - Bottom: latest 3 activity log entries (truncated). Click card → opens per-agent page.
- Top bar of Mission Control: aggregate system health pill (`all healthy` green / `N agents need attention` amber / red on critical). Click → opens `/admin/health`.
- Below the grid: chronological feed of significant activities across all agents (paginated).
- Refreshes every 15s via Server-Sent Events or polling.

**Per-agent page** at `/agents/[id]` (`niche-scout`, `generator`, `video-reviewer`, `editor-copilot`, `analyst`, `watch-list-curator`):

Tabs:
- **Activity** — full status feed for this agent. Filterable by activity_type.
- **Chat** — `AgentChatThread` interface. You ask questions, agent responds in context of its domain. Agent has access to its own tools/data (e.g., Niche Scout can query `niche_clusters`; Reviewer can query `video_reviews`). Multi-turn, persistent threads.
- **Memory** — visible `agent_memory` rows. Editable. Each row shows: key, value, confidence, last updated. Operator can delete or override values; agent's behavior adjusts.
- **Settings** — `agent_settings` form. Per-agent: model (AI Gateway string), frequency (cron schedule), thresholds (e.g., confidence floors), taste sliders (e.g., "more proven vs. more first-mover").

**Agent identities (Phase 1 set):**

| Agent ID | Display name | Role |
|---|---|---|
| `niche_scout` | Niche Scout | Finds + ranks niches (proven + first-mover). |
| `watch_list_curator` | Watch-list Curator | Manages tracked channels; suggests adds/evicts. |
| `generator` | Generator | Drafts videos from niche briefs. (Phase 1 = native short-form; Phase 2 adds longform.) |
| `video_reviewer` | Reviewer | Pre-publication QA scorecard + suggestions. |
| `analyst` | Analyst | Post-publication narrative analytics. (Activated in Phase 4 with full capability; placeholder in Phase 1.) |
| `editor_copilot` | Editor | CapCut/Premiere co-pilot. (Activated in Phase 3; placeholder card in Phase 1.) |

Each agent registers in `agents` table at first deploy. Disabled-state cards show a "Coming in Phase N" pill.

**Agent learning loops:**

Each agent has a feedback signal that updates `agent_memory`:
- Niche Scout — sealed predictions vs. actual outcomes (§4.10).
- Watch-list Curator — channel-level outlier counts over time; channels producing zero signal get suggested for eviction.
- Generator — script edits / overrides Darius makes vs. original drafts (tracked in `generator_edits` jsonb on `your_videos`).
- Video Reviewer — `video_review_feedback` per suggestion (accepted/ignored/partial).
- Analyst — Darius's "this insight was useful" thumb-up on `video_narratives` (recorded in `narrative_feedback` table to be added in Phase 4).
- Editor Co-pilot — accepted vs. rejected edit suggestions (Phase 3).

Slow continuous improvement. Not "trained once and frozen." Memory rows are key-value, editable.

### 4.9 Niche Finder UI surfaces

All on the new design system. Persistent translucent sidebar; Cmd+K palette.

**Sidebar nav** (Phase 1 set, top to bottom):
- Mission Control (default landing)
- Niches
- Lab
- Clips
- Watch-list
- Competitors
- Posted (placeholder; full Phase 4)
- Settings (bottom-pinned)

**Page: `/niches` dashboard**

- Header: `# This week's niches` (display-2xl). Subhead: `12 new clusters · refreshed Monday 7:00 AM` with status dot.
- Vertically scrolling feed of `NicheCard`s (one per top-ranked niche from latest weekly run).
- `NicheCard` structure:
  - Topic + format chip + discovery-state pill (top-right, `pre_public` glows accent-blue).
  - Proven-band badge (`proven` or `trending unproven`).
  - 3 example thumbnails (linked to YouTube on click, lift on hover, show velocity tooltip).
  - Stat row: `Channels: 12 · Avg velocity: 6.2× · First seen: 4d ago · Fit: native`.
  - VelocitySparkline (cluster aggregate, 14d).
  - Collapsible "Why this niche?" — top 2 contributing signals.
  - Footer CTAs: `Investigate` (primary) · `Generate now (current pipeline)` (secondary, only when `production_fit='native'`) · `Dismiss` (tertiary).
- Cards animate in staggered (50ms stagger, 280ms fade-up).
- Empty state: line illustration of a compass + `Looking for niches…` + `Open Watch-list` CTA.
- Loading: 5 skeleton cards with shimmer.

**Page: `/niches/[id]` niche detail**

- Header breadcrumb `Niches / This week / [topic + format]`. Title display-3xl. Discovery/fit/band badges.
- Three-column layout (40/35/25):
  - Left: paginated list of all cluster videos. Rows expandable inline (description + transcript snippet).
  - Middle: stacked "Why?" cards — first-mover, proven, saturation, velocity, audience.
  - Right: action panel — `Generate from this niche` (primary, accent-blue; in Phase 1 disabled for non-native formats with tooltip "Generation in Phase 2/3"), `Add to my niches`, `Hide cluster`.
- Below: `Related niches` strip.

**Page: `/niches/watch-list`**

- Left pane (320px): filterable list of `watched_channels`. Row: avatar, name, sub count + 30d delta sparkline, outlier-rate badge, source pill.
- Right pane: selected channel detail — sub-growth chart 90d, upload cadence, recent videos table with velocity scores, modal topic+format combos.
- `+ Add channel` modal: URL/handle input → fetch metadata → confirm → add.

**Page: `/niches/digest-preview`**

- Past digests dropdown (last 12 weeks).
- Side-by-side phone + desktop preview of selected digest's rendered HTML.
- `Resend this digest` button (rate-limited 1/hr).

**Page: `/competitors`** (sibling to niches)

- List of `competitor_channels` you've added (5–10).
- For each: avatar, name, recent uploads strip, pattern-change alerts ("Started using `narrated_pov` format this week").
- `+ Add competitor` modal.
- Same UX vocabulary as watch-list.

**Settings panel additions (`/settings#niche-finder`):**
- Toggle daily ingestion / weekly digest.
- Digest recipient email.
- Digest send time (UTC display; configurable in v2).
- Classifier model dropdown (vetted AI Gateway strings).
- `Reset weekly run` admin button.

**Command palette additions:**
- `Niches: this week`, `Niches: detail for [search]`, `Watch-list: add channel`, `Watch-list: jump to [search]`, `Digest: preview latest`, `Competitors: add channel`, `Settings: niche finder`, `Mission Control`, `Agents: [name]`.

**Keyboard shortcuts (page-scoped):**
- `/niches`: `j`/`k` navigate cards, `Enter` investigate, `g` generate, `x` dismiss.
- `/niches/[id]`: `j`/`k` example videos, `Enter` open YouTube, `Escape` back.
- `/niches/watch-list`: `j`/`k` channels, `a` add, `Enter` detail.
- Global: `Cmd+K` palette, `g n` to /niches, `g m` to Mission Control, `g a [n]` to agent N.

**Toasts (Sonner):**
- New pre-public niche detected mid-week → toast, click navigates to detail.
- Breakout on watched channel → toast.
- Rate-limited: max 1/hr, deduped.

### 4.10 Weekly digest email

React Email components rendered server-side via `@react-email/components`. Sent via Resend.

**Cron schedule:** `0 12 * * 1` (Monday 12:00 UTC = 7-8 AM ET).

**Email structure:**
- Header: small wordmark + week range in text-tertiary.
- Subject: dynamic — `<top niche topic> is leading this week` (or `5 pre-public niches to check`).
- Greeting + summary line (`12 new clusters · 5 are pre-public · highlights below`).
- Hero niche (top-scored): full treatment with 3 thumbnails, stat block, sparkline, "Why?" line, `Investigate` button.
- Secondary niches (4–7): condensed — topic + format chip line, single thumbnail + stat row, `View →` link.
- Footer: `View all niches`, `Pause weekly digest`, sent-time stamp.

**Visual:** matches app design system tokens (dark default with `prefers-color-scheme: light` fallback). Table-based layout for email-client compatibility. Inter via webfont with system-stack fallback.

**Plain-text fallback** auto-generated via React Email.

**Storage:** every send writes to `digest_runs` (`id`, `week_start`, `sent_at`, `recipient`, `niches_snapshot`, `html_snapshot`, `status`, `resend_message_id`, `last_error`).

**Skip-empty:** if zero qualifying clusters that week, no email; `/niches/digest-preview` shows empty state.

**Resend setup:**
- `RESEND_API_KEY` env var.
- Initial `From: onboarding@resend.dev`; upgrade to verified domain before broader rollout.

**Test mode:** `/api/cron/digest-preview` admin route returns rendered HTML without sending.

### 4.11 Pre-publication QA — Video Reviewer agent

New Phase 1 capability. Activated as soon as a video reaches `status='rendered'`.

**Pipeline (runs automatically on render-complete, output written to `video_reviews`):**

For each rendered video:

1. **Title score** — LLM with vision-of-thumbnail + reference titles from same niche cluster's top performers. Scores: clickability, keyword density vs. niche, length, curiosity-gap presence.
2. **Thumbnail score** — vision model + reference thumbnails from cluster. Visual hierarchy, face/text presence, contrast, similarity to winning thumbnails.
3. **Hook strength** — first 3 seconds: transcript (from script) + visual analysis. Curiosity gap, urgency, contrast.
4. **Pacing analysis** — cut frequency (ffmpeg scene-detect on the MP4), audio-energy curve (ffmpeg loudness), comparison against niche-winning pacing patterns.
5. **Description SEO** — keyword presence vs. niche, length, link/hashtag relevance.
6. **Audio quality** — ffmpeg-based RMS levels, clipping detection, background-noise estimate.
7. **Visual quality** — ffprobe resolution, frame-rate consistency, watermark detection (CV pass).

Each component returns: `pass | needs_work | fail` + numeric score 0–1 + 0–3 specific suggestions referencing example videos.

Overall verdict: `ship | revise | block`.

**UI: `/lab/[videoId]/review`**

Split-view:
- Left: rendered video player (with scrubber, transcript overlay toggle).
- Right: `ReviewScorecard` — 7 component rows, each expandable. Strengths band on top ("what's right"), suggestions band below ("what needs fixing"). Each suggestion has a `Reference: [thumbnail of winning video]` link to a comparator.
- Bottom: `Approve & Schedule` button (disabled if verdict is `block`; warning state if `revise`; active for `ship`).
- Operator can override with reason — written to `video_review_feedback` for learning.

**Learning loop:** every `video_review_feedback.action_taken` updates `agent_memory['video_reviewer']` weights — suggestions that get ignored consistently get down-ranked; suggestions that get accepted get up-ranked.

### 4.12 QC + iteration loop

Per §10 of the brainstorm — admin surfaces for the controller (Darius):

- `/admin/classification-review` — sample review with thumbs / verdict + accuracy aggregation per format_label.
- `/admin/prompt-versions` — version history, accuracy at sampling per version, rollback button.
- `/admin/scoring-analysis` — niche-score weight × action correlation (which weights produce niches you actually act on).
- `/admin/ingestion-health` — per-source last-run, success rate sparkline, color-coded freshness, manual trigger button.
- `/admin/costs` — YouTube quota usage, AI Gateway token usage, Resend usage.
- `/admin/health` — aggregate system status (called from Mission Control top bar).

**Daily alerts email** — only when a regression occurs (source red, classifier accuracy drop ≥10pts wow, quota > 80%, cron failed). Quiet success, loud failure.

### 4.13 Sealed predictions + moat validation

**Sealed predictions** (Niche Scout learning loop):
- At weekly digest time, for each surfaced niche, write a sealed `niche_predictions` row: `predicted_views_7d_lower`, `predicted_views_7d_upper` based on similar past niche outcomes.
- When Darius generates + posts a video tied to that cluster (`your_videos.source_niche_cluster_id`), record `actual_video_id`.
- 7 days after posting, populate `actual_views_7d` and `accuracy_verdict`.
- Aggregated on `/admin/scoring-analysis` → "Niche Scout prediction accuracy: 62% within range, 18% above, 20% below."

**Moat validation** (manual + structured):
- `vidiq_appearances` table tracks lag between Shorts OS surfacing a niche and external tools (VidIQ, 1of10, Exploding Topics) surfacing the same `(canonical_topic, format_label)`.
- Manual logging: weekly 10-minute task — open VidIQ free trial / 1of10 / Exploding Topics, check whether their current "hot niches" overlap our last 4 weeks. Log surfacing date in the table.
- `/admin/moat-validation` page surfaces average lag time. If <2 weeks consistently, claim is real; if 0 days, re-evaluate.

### 4.14 First-run onboarding

A 5–10 minute flow on first launch. Triggered when `agents.is_enabled = false` for all agents (i.e., first deploy).

Steps:
1. **Welcome** — short framing of what the tool does ("Find proven niches, generate videos, ship better"). One Next button.
2. **Your goals** — pick from 4 options: "Monetize my channel", "Grow subscribers", "Test a new niche", "Other". Stored on `channels.creator_goals`.
3. **Your interests** — free-text + tags (e.g., "AI", "productivity", "vintage cars"). Seeds the targeted-search query terms in §4.2 for the first 4 weeks; rotated thereafter.
4. **Admired channels** — paste 5–10 channel URLs you respect. Bootstraps `watched_channels` and `competitor_channels`.
5. **Connect channel** — link your YouTube channel for analytics (existing OAuth flow).
6. **First scan** — kick off an immediate small ingestion run (~5 minutes) using the seeded interests + admired channels. Shows progress with agent status feed.
7. **Done** — lands on Mission Control with a "First niches arriving by Monday's digest" callout.

### 4.15 Phase-1 contracts that support Phases 2–4

Built in Phase 1, used in later phases:

- `your_videos.source_niche_cluster_id` (FK to niche_clusters) — closed-loop tracking.
- `your_videos.script_brief` (jsonb) — `{ topic, audience, format_instructions, length_target_seconds, tone, reference_video_ids: [...] }`. Generator-agnostic.
- `your_videos.review_id` (FK to video_reviews) — Reviewer linkage.
- `your_videos.editor_session_id` (uuid nullable, no FK yet) — slot for Phase 3.
- `render_jobs.job_type` enum extensible — Phase 2 adds `'longform_render'`.
- `visual_treatment` taxonomy extensible — Phase 2 adds longform variants.
- Mission Control has slots for `analyst` (Phase 4) and `editor_copilot` (Phase 3) — placeholder cards with "Coming in Phase N" pills.
- `agent_memory` schema is generic — any future agent uses it without migration.
- `POST /api/lab/generate-from-niche` — route exists, returns 501 for non-native formats; Phase 2 fills in longform branch; Phase 3 fills in the editor-handoff.

### 4.16 Phase 1 success criteria — "not done" rule

Phase 1 is **not** shippable until **all** of the following hold:

- All §4.1 schema is migrated and indexed in prod.
- All §4.2 ingestion sources have produced ≥1 successful run in prod, persisted to `shorts_observations`.
- ≥1 weekly clustering run has produced ≥5 valid clusters with `niche_score > 0` and `production_fit` set.
- The digest email has sent successfully ≥1 time (real or test mode confirmed via Resend dashboard).
- Mission Control is the default landing; all 6 agent cards render with correct status.
- `/lab/[videoId]/review` works end-to-end on ≥1 real rendered video.
- Existing `/lab`, `/lab/drafts`, `/clips` pages rebuilt against the new design system (no remaining pre-design-system pages in user-facing routes).
- Onboarding flow tested end-to-end on a clean DB.
- **Darius has posted ≥3 real videos generated from Phase 1's niche output and observed their analytics for ≥7 days each.**

---

## 5. Phase 2 — Longform pipeline

Scope tight per `scope_decision_no_heygen.md`: longform only, no AI avatar.

**Additions:**
- New format taxonomy values for longform: `longform_explainer`, `longform_documentary`, `longform_tutorial`, `longform_video_essay`.
- `render_jobs.job_type` adds `'longform_render'`.
- New worker `scripts/render-worker/handlers/longform.ts`:
  - Multi-pass script: outline (cheap model) → research-augmented draft (vision-capable + tool-using model) → polish (strong writer model). 3 AI Gateway calls per video.
  - Chunked TTS via Cartesia or ElevenLabs.
  - B-roll selection from `clip_library` filtered by topic + tags; AI-image generation fills gaps.
  - Chapter markers extracted from outline.
  - Assembly with intro/outro templates.
- Generator UI: `/lab/generate` wizard adds longform-format card. Length input expands to support 8–20 minute targets.
- Generator agent memory: tracks Darius's editing-vs-original-draft delta per pass; learns prose voice over time.

**No avatar work. No HeyGen.**

**5.x Channel persona module** (Phase 2 addition per the brainstorm):

A per-channel coherent identity that gets reused across every generated video. Without this, every video feels generic and the channel lacks a recognizable voice.

- New table `channel_personas`: `id`, `channel_id` (FK), `intro_template` (jsonb — opening hook pattern + visual treatment + duration), `outro_template` (jsonb — CTA + watermark + visual style), `voice_profile` (jsonb — TTS provider + voice ID + pacing + tone), `brand_watermark_url`, `caption_style` (jsonb — font, position, animation, color), `signature_phrases` (string array — Darius's verbal habits to thread through scripts), `created_at`, `updated_at`.
- UI: `/settings/persona` — wizard that locks each persona element. Pre-populated from existing Plan #4 channel config; refined as Generator learns.
- Generator agent reads persona on every script generation and threads its elements into the output.
- Editing co-pilot (Phase 3) reads persona for caption styling + outro placement defaults.

**Phase 2 success criteria:**
- `channel_personas` row exists for the active channel; persona wizard usable end-to-end.
- Longform worker can produce ≥1 8-minute video end-to-end with chapter markers + B-roll.
- Generator agent's chat surface can answer "what voice/persona is this channel using?" accurately.
- ≥1 longform video posted from the pipeline (per the not-done discipline).

---

## 6. Phase 3 — Editor Co-pilot

Highest uncertainty. Two sub-paths shipped sequentially:

**6.1 CapCut Web automation (built first)**

- Driver lib: `src/lib/editor/capcut-web.ts` — Chrome MCP calls wrapped in domain-specific functions.
- Capabilities: open project, replace clip, generate captions, auto-trim filler (silence/ums detected via Whisper transcript timestamps), pacing adjustment, suggest cuts, export.
- `editor_sessions` table: `id`, `your_video_id`, `editor` (`capcut_web` or `premiere_uxp`), `state`, `created_at`.
- UI `/editor/[videoId]` split-view: session panel (left), chat thread with proposal previews (right), timeline scrubber (bottom).
- LLM-agent loop: chat command → LLM picks tools from a palette (`trim_silence`, `replace_clip`, `add_caption_layer`, `adjust_pacing`, etc.) → calls Chrome MCP → reports back with preview.

**6.2 Adobe UXP plugin for Premiere (built second)**

- Separate UXP plugin project at `uxp/shorts-os-copilot/`. Scaffolded with Adobe UXP Developer Tool. JavaScript/TypeScript.
- Runs inside Premiere with full API access (sequence manipulation, clip ops, effects, captions, audio).
- Plugin → Shorts OS communication via WebSocket or polling endpoint.
- Same capabilities as CapCut Web + Premiere-specific (effects presets, color grading, audio sweetening).
- Distribution: signed plugin installed manually for v1; Adobe Exchange listing considered later.

**6.3 Editor Co-pilot agent**
- Activated. `agent_memory` rows track Darius's editing taste: preferred caption styles, cut tightness, audio-music balance, transition vocabulary.
- Learning loop: accepted vs. rejected edit suggestions update memory weights.

**Phase-3 success criteria:**
- CapCut Web path ships first; can complete an end-to-end edit on ≥1 real video.
- Premiere UXP plugin ships second; can complete the same end-to-end edit.
- If Premiere UXP stalls (estimated +50% schedule risk), CapCut Web path alone is sufficient to call Phase 3 complete.

---

## 7. Phase 4 — Posting + Reminders + Narrative Analytics

**Mark-posted flow (replaces auto-upload):**
- `POST /api/lab/mark-posted` — body `{videoId, youtubeUrl}`; validates URL; sets `status='posted'`, `url`, `posted_at`.
- Mark-Posted dialog (modal): URL input + submit.
- "Post now" buttons trigger MP4 download + open YouTube Studio for channel + show dialog.
- The `'uploading'` status value stays in the enum for historical rows but is no longer written.
- Upload worker (`scripts/render-worker/handlers/upload.ts`) deleted.

**Daily reminder email:**
- `0 12 * * *` cron → query `your_videos` for rows where `status='scheduled'` AND `scheduled_for::date = today_in_channel_tz`.
- Sends one email per channel via Resend.
- Skip-empty.

**Narrative Analytics (Analyst agent):**

- Existing `video_analytics` snapshots stay.
- New worker generates `video_narratives` rows on each new snapshot:
  - 24h velocity vs. sealed prediction.
  - Retention curve interpretation (where viewers drop off, what's at that timestamp in the transcript).
  - CTR vs. niche median.
  - Comment sentiment.
  - Concrete next-video recommendations.
- LLM with multi-input: snapshot stats + transcript + niche comparison data.
- UI: `/lab/posted/[videoId]/analyst` — narrative panels with `thumbs up / down` per insight (writes to `narrative_feedback`).
- Analyst agent's memory learns which insight types Darius found actionable.

**Posted tab in `/lab/drafts`:**
- Rebuilt against design system.
- Each row: title, narrative one-liner (latest snapshot's key finding), YouTube link, "Open Analyst" button.

**Scheduling primitives (kept from Sub-phase C):**
- Timezone math, `scheduleVideo` helpers, `claim_due_scheduled_uploads` PG function — repurposed for the reminder queue.
- No scheduled-uploader cron (no auto-upload).

**Phase 4 success criteria:**
- Mark-Posted flow used by Darius on ≥3 real videos.
- Daily reminder email sent and received correctly.
- Analyst agent activated on Mission Control; produces narratives for ≥1 posted video.
- `/lab/posted/[videoId]/analyst` rendering correctly.

---

## 8. Cross-phase Concerns

**Auth:** Existing cockpit-session auth retained. Admin pages (`/admin/*`) gated. Single-operator scope — no multi-admin in Plan #5.

**Observability:**
- Sentry for client + server errors (existing).
- Vercel logs.
- `agent_activity_log` is the primary product-level observability layer; expose in Mission Control and `/admin/health`.

**Deployment:** Vercel Fluid Compute (default). Cron jobs in `vercel.ts`. Node.js 24 LTS.

**Database:** existing Supabase Postgres. New tables additive; migrations via Supabase CLI; reviewed before apply.

**AI infrastructure:**
- Vercel AI Gateway exclusively. No direct provider packages.
- Default models: `anthropic/claude-haiku-4-5` (classifier), `anthropic/claude-sonnet-4-5` (Reviewer, Analyst, agent chat), `openai/text-embedding-3-small` (topic fuzzy-merge).
- All model strings stored in `agent_settings.settings.model` — runtime swappable.

**Storage:** Supabase Storage for MP4 + thumbnails (existing). Vercel Blob considered for ephemeral preview assets if needed.

**Email:** Resend. `RESEND_API_KEY` env. Verified domain before broader rollout.

**External APIs:**
- YouTube Data API (free tier, quota-budgeted).
- Reddit JSON API (free).
- Google Trends via `google-trends-api` npm (free, scraper-based, resilience-wrapped).
- TikTok Creative Center via Chrome MCP (Chrome extension dependency; weekly run).

---

## 9. Migration Strategy

**Stays as-is (~80% of Plan #4 codebase):**
- All existing schema (channels, niches, topic_queue, your_videos, clip_library, render_jobs, video_analytics).
- Generation pipeline (script gen, voice, visuals).
- /clips compilation pipeline.
- Wikipedia topic discovery cron.
- Analytics ingestion.
- Auth + Supabase + Vercel infrastructure.
- Sub-phase C scheduling primitives (timezone, scheduleVideo, claim_due_scheduled_uploads PG function).

**Gets demolished (~5%):**
- `scripts/render-worker/handlers/upload.ts` and its tests.
- `POST /api/lab/upload` route as currently shaped (replaced by `/api/lab/mark-posted`).
- The `?action=post_now` upload-job path in `/api/clips/rendered/[id]/approve` (semantics change to "promote to rendered + open mark-posted dialog").
- Sub-phase E (scheduled-uploader cron) — never built, plan entry cancelled.

**Gets rebuilt against new design system (~15%):**
- All existing UI: `/lab`, `/lab/drafts`, `/clips`, `/admin/*`, `/settings`.
- Auth login flow.
- Cockpit shell layout.

**PR #12 (Sub-phase D) disposition:**
- Backend routes (`/api/lab/schedule`, `/api/lab/cancel-schedule`) and data-model fixes (`Channel.timezone`, `YourVideo.scheduled_for`) carry forward — merge.
- Frontend pieces (`drafts-tabs`, `rendered-row`, `scheduled-row`, `posted-row`) get superseded by Plan #5 design-system rebuilds.

**Existing stuck row in prod (`11c221e0... status='uploading'`):**
- Phase 1 migration script flips this back to `'rendered'` so Darius can post it manually after the mark-posted flow ships in Phase 4. Until then it sits as an inert row.

---

## 10. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Premiere UXP plugin schedule overrun | High | High | CapCut Web path alone is sufficient for Phase 3 success. Treat UXP as +50% estimate. |
| YouTube Data API quota tightening | Medium | High | 89% of quota is reserve. Monitor `/admin/costs`. Worst case: cut category-trending sweep frequency. |
| Reddit/Google Trends/TikTok scraper breakage | Medium | Medium | Each source is wrapped with retry + circuit-breaker. Failure of any one source doesn't kill the digest — clustering proceeds with remaining sources. |
| Classifier accuracy below 70% on launch | Medium | Medium | Sample-review at 5%; weekly prompt iteration. Phase 1 launch criteria does not require accuracy floor. |
| "First-mover" moat doesn't hold (we're not actually faster than VidIQ) | Medium | High | `vidiq_appearances` validation. If <2 weeks lag consistently, plan re-evaluation triggers. |
| Pre-pub QA flags too many false negatives (blocks shippable videos) | Medium | Medium | `video_review_feedback` loop down-ranks ignored suggestions over weeks. Operator override available. |
| AI Gateway pricing spikes | Low | Medium | All model choices stored in `agent_settings`. Swap to cheaper models without code change. |
| Niche-finder produces no useful output for Darius's niche | Medium | High | Kill criteria triggers at 90 days post-Phase 1. Re-plan, don't push harder. |
| Design system rework on existing pages is bigger than estimated | Medium | Medium | Phase 1 success criteria explicit. If rebuild stalls, ship niche-finder pages first, rebuild existing pages on a follow-up. |

---

## 11. Kill Criteria for Plan #5

Explicit failure conditions, evaluated post-Phase-1-launch:

- **90 days after Phase 1 launches**, if Darius has posted fewer than 3 videos that crossed 1,000 views, the niche-finder thesis is wrong. Trigger a fresh planning session. Do not "push harder" by adding features.
- **6 months in**, if Darius's channel has fewer than 100 subscribers gained since Plan #5 start, the broader creator-co-pilot thesis is wrong. Re-evaluate scope.
- **At any point**, if the `vidiq_appearances` table shows the average lag between Shorts OS surfacing a niche and VidIQ surfacing it is ≤0 days, the first-mover moat doesn't exist. Decide whether to (a) double down on signal R&D, or (b) deprioritize the moat claim and reposition as "comprehensive co-pilot" rather than "first to find."

Tracked in `kill_criteria_log` — one row per evaluation, with verdict + reasoning.

---

## 12. Discipline Rules

These are operational rules, not features. Enforced by Darius + the controller (Claude in a planning session):

- **Phase 1 not done until ≥3 videos posted from its output.** No moving to Phase 2 with a beautiful niche dashboard and zero posted videos.
- **Quality over speed.** Don't strip features for an MVP cut. Bound by capability, not by quality.
- **Stop at every phase boundary.** Hand Darius a fresh-chat prompt for the next phase. Don't try to do phases back-to-back in a single chat.
- **Operator-gated work is yours to drive.** Migrations via Supabase MCP, deploys via Vercel MCP, browser flows via Chrome MCP. Ask Darius only for atomic inputs that need his accounts/eyes.
- **TS strict, no `any`. Zod at HTTP boundaries. `server-only` on secret-holding modules.** Same as Plan #4.
- **For local dev, `unset ANTHROPIC_BASE_URL` before `npm run dev`.** Per memory note.

---

## 13. Open Questions

(Things deliberately left undecided in this spec — to be answered during implementation planning or in the moment.)

- **Resend verified domain.** Operator task; not in scope until Phase 1 nears digest-send. Until then, `onboarding@resend.dev` is acceptable.
- **TikTok Creative Center scraping legality.** TikTok TOS may restrict scraping. If a TOS-compliant API emerges or a third-party data provider becomes affordable, switch. Until then, scraper-based ingestion with respectful throttling.
- **Specific channel handles for the seed competitor list during onboarding.** Darius provides during first-run.
- **Generator agent's voice-of-Darius taste calibration.** Bootstrapped from existing Plan #4 video drafts; refined over Phase 2.
- **HeyGen revisit timing.** Deferred indefinitely per `scope_decision_no_heygen.md`. Revisit only if (a) HeyGen quality crosses uncanny-valley line, (b) Darius's chosen niche specifically demands talking-head and manual recording is the sustained bottleneck.

---

## 14. References

- `~/.claude/projects/-Users-darius-Downloads-shorts-os/memory/product_vision_one_stop_shop.md` — updated framing.
- `~/.claude/projects/-Users-darius-Downloads-shorts-os/memory/product_vision_premium_ui.md` — UI quality bar.
- `~/.claude/projects/-Users-darius-Downloads-shorts-os/memory/feedback_quality_over_speed.md` — scoping rule.
- `~/.claude/projects/-Users-darius-Downloads-shorts-os/memory/feedback_shadcn_is_the_floor.md` — UI layering rule.
- `~/.claude/projects/-Users-darius-Downloads-shorts-os/memory/scope_decision_no_heygen.md` — HeyGen dropped.
- `~/.claude/projects/-Users-darius-Downloads-shorts-os/memory/feedback_phase_boundary_handoff.md`, `feedback_do_it_yourself.md`, `feedback_plain_english_docs.md`, `feedback_anthropic_base_url_local.md`, `project_reddit_script_app_safari.md`.
- Plan #4 spec (`docs/superpowers/specs/2026-05-24-shorts-os-design.md`) and phase plans (`docs/superpowers/plans/2026-05-*.md`) — context for what carries forward.

---

**End of spec.** Next step: `writing-plans` skill to break Phase 1 into an executable task list. Phase 1 implementation begins after Darius reviews and approves this document.
