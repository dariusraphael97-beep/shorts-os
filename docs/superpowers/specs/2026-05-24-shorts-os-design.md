# Shorts OS — Design Spec

**Date:** 2026-05-24
**Owner:** Darius
**Status:** Approved through brainstorming, ready for implementation planning
**Working name:** `shorts-os` (can be renamed before public launch)

---

## 1. What This Is

A personal media operations system for running multiple faceless YouTube Shorts channels (and later TikTok / Reels / long-form). Built first as an internal tool — the operator (Darius) uses it to grow channels to monetization. Once proven, a stripped-down version becomes a SaaS product sold to other faceless creators while Darius keeps the full-power "private" version for his own use.

### Why This Exists

Darius already attempted a faceless YouTube Shorts channel (`@dyfrx_9754`, 695 subs, 15 videos) and hit a hard wall: source content for his niches (bikes / cars / ASMR) was scarce, watermarked, or copyrighted. The model only works when source content is abundant and legally clean. This tool solves exactly that bottleneck by combining trending signals, legal source pipelines, AI generation, and a learning loop into one cockpit.

### Goals

- **Income:** $1–8k/mo from operated channels within 6 months (stretch: $20k+/mo from channels + productized tool)
- **College story:** real founder narrative for business-school applications — provable revenue, real users, novel product
- **Skill compounding:** every video posted teaches the tool what works for *Darius's* channels specifically

### Non-Goals (v1)

- Multi-tenant SaaS (just one operator)
- Auth/billing infra
- Mobile app
- Pretty marketing site
- Cross-platform posting (YouTube only for v1; TikTok/Reels in v2)
- Long-form / AI sleep mode (v2)

### Hard Rules

1. **All source content must be legally clean.** No torrents, no pirated movie clips, no copyright-aggressive niches. Reddit text / Wikipedia / public domain / AI-generated / royalty-free stock only.
2. **The operator stays in the approval loop.** Tool *suggests*; human *decides*. No fully-autonomous posting in v1.
3. **The personalization data is sauce.** When the SaaS version ships, the Patterns Bank + Performance Memory stay private to the operator's own instance.

---

## 2. Architecture (3 Layers)

```
┌──────────────────────────────────────────────────────────────┐
│  STUDIO LAYER — interactive cockpit you use daily            │
│  Next.js web app (looks/feels like desktop dashboard)        │
│  Topic Queue · Script Gen · Voice Studio · Asset Pipeline    │
│  · Video Renderer · Manual Upload Logger · Channel Manager   │
└────────────────────────────┬─────────────────────────────────┘
                             │
                  reads/writes
                             ↓
┌──────────────────────────────────────────────────────────────┐
│  MEMORY LAYER — shared database, the brain                   │
│  Supabase Postgres                                           │
│  niches · viral_observations · patterns · your_videos        │
│  · pattern_performance · channels · topic_queue              │
└────────────────────────────↑─────────────────────────────────┘
                             │
                  writes (continuous)
                             │
┌──────────────────────────────────────────────────────────────┐
│  INTEL LAYER — background scrapers, no UI                    │
│  Vercel Cron functions                                       │
│  Trending Radar · Source Harvester · Performance Sync        │
│  · TikAPI trend pull · Niche Health Tracker                  │
└──────────────────────────────────────────────────────────────┘
```

### Why this shape

- **Separation of "always-running" from "interactive"** means scrapers don't block the UI
- **Single shared database** means every part learns from every other part
- **All on existing stack** (Supabase + Vercel) — no new platforms to learn

---

## 3. Modules

### Intel Layer (background, no UI)

| Module | What it does | Cadence |
|---|---|---|
| **Trending Radar** | Scans top-50 shorts per active niche on YouTube. Records views/24h, length, hook style, captions, audio | Every 6h |
| **TikAPI Trend Pull** | Pulls trending sounds + topics in active niches from TikTok | Every 6h |
| **Source Harvester** | Pulls candidate topics from Reddit (TIL, interestingasfuck, Damnthatsinteresting, nextfuckinglevel), Wikipedia random + curated, news APIs. Scored by Claude for hook-ability | Daily |
| **Performance Sync** | Pulls YouTube Analytics for operator's channels (views, retention, CTR per video) | Daily |
| **Niche Health Tracker** | Aggregates Trending Radar data into per-niche growth metrics | Daily snapshot, weekly report |

### Studio Layer (interactive cockpit)

| Module | What it does |
|---|---|
| **Topic Queue** | Morning dashboard of 10–20 candidate topics, scored & sorted. Operator clicks "make this" or "reject" |
| **Trending Panel** | Top viral shorts in active niches, with Claude-generated breakdowns of *why* each worked |
| **Niche Health Panel** | Per-niche health: daily snapshot card + weekly trend report |
| **Script Generator** | Claude generates hook-first 45–60s script for chosen topic, conditioned on current winning patterns from Patterns Bank |
| **Voice Studio** | ElevenLabs voice generation with preview. Saved favorite voice per channel |
| **Asset Pipeline** | Auto-selects 8–15 b-roll clips from Pexels / Pixabay / Wikimedia based on script segments. Manual swap allowed |
| **Video Renderer** | Remotion job: voice + b-roll + auto-captions + music bed → vertical 1080×1920 MP4 |
| **Manual Upload + Logger** | Operator uploads to YouTube manually; tool logs topic/script/voice/render config posted, when, to which channel |
| **Channel Manager** | Per-channel config: niche, voice, script style, branding, target post times |
| **Manual Refresh** | On-demand "refresh now" button to pull all sources outside scheduled cadences |

### Memory Layer (shared database)

| Table | Stores | Used by |
|---|---|---|
| `niches` | Niche definitions, health metrics over time | Niche Loop, Niche Health Panel |
| `viral_observations` | Every viral short analyzed, with extracted patterns | Pattern Loop, Trending Panel |
| `patterns` | Aggregated patterns by niche (winning hooks, lengths, b-roll cadence) | Script Generator, all agents |
| `your_videos` | Every video posted by operator + daily YouTube Analytics snapshots | Personal Loop |
| `pattern_performance` | Which patterns correlated with success in `your_videos` | Script Generator (personalized weighting) |
| `topic_queue` | Surfaced topic candidates with state (queued / used / rejected) | Topic Queue, Source Harvester |
| `channels` | Per-channel config + auth tokens for YouTube Data API | Channel Manager, Performance Sync |
| `agents` | Per-agent config: prompt template (versioned), skill metrics, performance history | All agents, Team Status panel |
| `agent_messages` | Every inter-agent message: from / to / intent / payload / timestamp | Agents (subscribe), Team Chat feed |
| `decisions` | Every AI decision: inputs, output chosen, alternatives considered, scores, reasoning | Decision Explainer panels |
| `jobs` | Pipeline progress per video: status / current step / progress % / agent currently active | Pipeline Graph panel |

---

## 3.5 Show the Work — AI Visualization Principles

**Principle:** Functional, not pretty — but every AI decision, scraper pull, and pipeline step is visible to the operator in real time. This is a deliberate design choice, not polish.

**Why this matters:**
- **Understanding:** operator learns *why* the AI picks what it picks, gets better at directing it
- **Trust:** glass box beats black box — you can verify what's happening
- **Debugging:** when output is wrong, the visualization shows exactly where it went off
- **Differentiation:** competitors (Opus Clip, Submagic) hide their internals; we show them. When productized, "watch your AI work in real time" becomes a strong selling point
- **It's genuinely cool to watch**

### What gets visualized

1. **Live AI streams** — every Claude call streams its output token-by-token in the cockpit. You watch scripts get written.
2. **Pipeline graph** — animated node-edge diagram per video showing current stage (topic → script → voice → b-roll → render → ready). Lights up green as stages complete. Click any node to see what happened there.
3. **Decision explainers** — wherever an agent picks something (topic, voice, b-roll clip, hook variation), a side panel shows WHY: which patterns matched, which alternatives were considered, what scores each option got.
4. **Pattern Bank Explorer** — visual dashboard of what the Patterns Bank currently believes is winning in each niche. Top hooks, average lengths, b-roll cadence trends. Updates live as scrapers find new viral content.
5. **Scraper Ticker** — bottom-of-screen live feed of what Intel Layer is pulling right now. Example: `[12:33] Trending Radar — "How a typo caused a $2B disaster" — 8.4M views in 18h — hook: "How a [trigger] caused a [scale]"`
6. **Performance correlations** — once 30+ videos posted, charts showing your channel's empirical winners: "Your 47s + male voice + question-hook combo performs 2.3x baseline."
7. **AI thinking states** — when a process runs, the cockpit shows current step in plain language: `Analyzing top-50 viral hooks…` / `Selecting b-roll for segment 3 of 8…`
8. **Cost meter** — running tally per video and per day: `$0.034 this video / $1.21 today`.

### Technical approach

- **Vercel AI SDK v6** streamText / generative UI for live token-by-token rendering
- **Supabase Realtime** subscriptions for live database event feeds (scraper ticker, pipeline updates, agent messages)
- **React Flow** library for animated pipeline graphs and agent topology diagrams
- **`decisions` table** in Memory Layer — every AI decision is logged with inputs, alternatives, scores, reasoning. Decision Explainer reads from it.
- **`jobs` table** in Memory Layer — pipeline progress per video. Pipeline Graph reads from it.

### Build cost

Adds ~30% to total build time. Worth it for operator experience and SaaS differentiation.

---

## 3.6 The Agent System

The Studio Layer is operated by **7 specialized AI agents**, each with a clear role, evolving prompt template, and visible status in the cockpit. Agents are persistent and reactive (available 24/7 but only burn tokens when actually working on a triggered task). They coordinate through the Memory Layer and Supabase Realtime.

### Agent roster

| Agent | Role | Always thinking about... | Activates when... |
|---|---|---|---|
| 🧭 **The Strategist** | Conductor. Receives goals from operator, dispatches tasks to specialists, decides what to make and when, requests reports from other agents | Daily plan, channel-level strategy, when to pivot | Operator goal received OR scheduled daily planning run |
| 🔭 **The Scout** | Niche / trend intelligence | Which niches are growing, which patterns emerging, which competitors gaining traction | New Trending Radar data arrives (every 6h) |
| 📚 **The Archivist** | Source content discovery | Cataloging hook-able topics from Reddit / Wikipedia / news, scoring topic candidates | New source data arrives (daily) |
| ✍️ **The Writer** | Hook-first script writing | Story structure, hook patterns, pacing, retention | A topic is dispatched for production |
| 🎬 **The Director** | B-roll + visual composition | Matching visuals to script, cinematic patterns, music selection | A script is ready for visual assembly |
| 🎙️ **The Voice Coach** | Voice selection + ElevenLabs settings tuning | Which voice / speed / stability settings work for which script types | A script needs voice generation |
| 📊 **The Analyst** | Performance analysis + personalization | Channel performance, correlations, what's working vs dying | Daily Performance Sync arrives, or operator requests report |

### Each agent has

- **A prompt template** stored in `agents` table — versioned, evolves over time
- **A memory of past work** — every decision the agent made, with outcomes
- **Performance metrics** visible in the cockpit (e.g., "The Writer's last 20 scripts: avg 41% retention, +0.8% above baseline")
- **A current state** indicator: `idle` / `thinking` / `working` / `awaiting input`
- **A skill level** that ticks up as it accumulates wins (purely a visualization layer, not a real ML metric)

### Inter-agent communication

Three coordination patterns:

1. **Shared state via Memory Layer** — agents read each other's outputs from the database (persistent). Example: The Writer reads the current top hook patterns from `patterns` (written by The Scout).
2. **Event bus via Supabase Realtime** — agents emit events; others subscribe. Example: when The Writer finishes a script, it emits `script.ready`; The Director and Voice Coach both wake up.
3. **Direct dispatch by The Strategist** — for multi-step workflows, Strategist explicitly hands off: `@Writer write a script for topic X with hook pattern Y` → `@Director assemble b-roll for script Z`.

**All inter-agent messages logged** to `agent_messages` table — fully visible in the cockpit as a live "team chat" feed. The operator can read every conversation the agents have with each other.

### Agent improvement over time

In v1, "improvement" = **prompt context evolution**, not literal fine-tuning:

- Each agent's prompt template gets enriched as the Patterns Bank grows (more examples, more recent winners, more niche-specific context)
- Each agent's prompt also incorporates feedback from The Analyst ("The Writer's question-hook scripts outperform statement-hook scripts 1.8x — bias toward question hooks")
- Prompt versions tracked in `agents.prompt_version`; the cockpit shows which version is live and a diff to prior versions

Fine-tuning small models per agent is v3 territory, once we have enough data.

### Cost discipline (critical)

Agents are **always available, only active when needed**. They subscribe to triggers via Supabase Realtime; they don't poll. A sleeping agent costs $0. This is non-negotiable — multi-agent systems that "always think" become expensive fast.

Estimated token impact: agents add ~20–30% to per-video Claude cost (because Strategist + Scout + Analyst do meta-level reasoning on top of Writer/Director/Voice Coach doing the production work). Still well within budget.

### Visualization of the agent system

The cockpit has a dedicated **Team Status panel**:
- Avatar grid of all 7 agents with current state badges
- Click an agent → opens that agent's profile (current prompt version, recent decisions, performance metrics, what it's working on)
- Live **Team Chat feed** showing inter-agent messages in real time
- Pipeline Graph (per video) shows which agent is at each stage

---

## 4. Source Strategy (Trend & Topic Sources)

**Tier 1 — Primary trend signal (robust, in v1):**
- **YouTube Shorts** (official Data API) — main "what's working" data (it's where we post)
- **Reddit** (official API) — both topic ideas and leading indicator (often precedes YouTube by days)

**Tier 2 — Secondary trend signal (in v1, accepting some fragility):**
- **TikTok** via TikAPI (~$30/mo) — leading indicator for YouTube Shorts by 1–2 weeks

**Tier 3 — Background topic source (in v1, low priority):**
- **Wikipedia** — evergreen "weird historical fact" topics as backup

**Deferred to v1.5:**
- **Instagram Reels** — added once core pipeline is proven

### v1 Operating Niche

**Wikipedia/TIL-style educational shorts** ("Things you didn't know about X" / "The wild true story of Y"). Chosen because:
- Source supply is infinite (6M+ Wikipedia articles + Reddit TIL)
- Less saturated than Reddit-drama narrations
- Higher CPM (educational audience skews older)
- Better college story than relationship drama
- Genuinely less competition for the *shorts* format specifically

Other niches can be activated later — the pipeline is niche-agnostic; only the source feed + script template differ.

---

## 5. Tech Stack

| Piece | Choice | Why |
|---|---|---|
| Frontend | Next.js 16 App Router | Operator already knows it; best dashboard ergonomics; deploys to Vercel |
| Backend / API | Next.js API routes (no separate backend) | Single codebase |
| Background jobs | Vercel Cron | Built-in, free tier covers our needs |
| Database | Supabase Postgres | Operator already knows it from DealSense |
| Realtime updates | Supabase Realtime | Live scraper ticker, pipeline graph, agent team chat, decision streams |
| File storage | Vercel Blob (private tier) | MP4s, audio, b-roll cache |
| LLM | Claude via Vercel AI Gateway (AI SDK v6) | Gateway provides fallback + observability; AI SDK v6 streaming for live token-by-token visualization |
| Voice generation | ElevenLabs API | Best voice quality; experiment with local XTTS-v2 in v1.5 |
| Video rendering | Remotion (React-based, programmable) | Code-as-video; runs on operator's 4090 |
| Caption timing | Whisper.cpp w/ CUDA on operator's PC | Free, fast, word-level timing |
| Pipeline / agent graphs (UI) | React Flow | Animated node-edge diagrams for video pipeline and agent topology |
| Agent framework | Custom-built on AI SDK v6 + Supabase Realtime (no heavyweight framework) | LangGraph / AutoGen / CrewAI are overkill for 7 agents; we build a thin coordinator and let AI SDK handle the LLM streaming |
| Trend sources | YouTube Data API v3, Reddit API, TikAPI, Wikipedia API | See Section 4 |
| Asset libraries | Pexels API, Pixabay, Wikimedia Commons, Mixkit (music) | All free |

### Hosting / Compute Split

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│  MacBook Air        │    │  Windows PC         │    │  Cloud              │
│  (development +     │    │  (i9-13900k + 4090) │    │  (always-on)        │
│   light use)        │    │                     │    │                     │
├─────────────────────┤    ├─────────────────────┤    ├─────────────────────┤
│ - Code editor       │    │ - Render agent      │    │ - Vercel web app    │
│ - npm run dev       │    │   (polls queue)     │    │ - Vercel Cron       │
│ - Light rendering   │    │ - Remotion renders  │    │   (scrapers)        │
│   for testing       │    │ - Local Whisper     │    │ - Supabase DB       │
│                     │    │ - v1.5: local TTS,  │    │ - API services      │
│                     │    │   local Flux        │    │ - Vercel Blob       │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

### Cross-Platform Discipline (Windows + Mac)

- Use Node's `path` module everywhere — never hardcode `/` or `\`
- Avoid shell scripts; use Node scripts for OS-touching ops
- Pin Node.js 24 LTS on both environments
- Document local AI setup separately for Windows (CUDA) and Mac (Metal)
- Web app is browser-only — identical experience on both OSes

### Estimated Monthly Run Cost (v1)

| Item | Cost |
|---|---|
| Vercel (Hobby) | $0–20 |
| Supabase (free tier) | $0 |
| Claude API (via Gateway) — 7-agent system adds ~25% vs single-pipeline | $30–70 |
| ElevenLabs Creator | $22–99 |
| TikAPI | $30 |
| Vercel Blob storage | $5–10 |
| Asset APIs (Pexels, Pixabay, etc.) | $0 |
| Local AI compute (4090) | $0 |
| **Total** | **~$90–230/mo** |

v1.5 drops ~$50/mo more when ElevenLabs is replaced by local XTTS-v2.

---

## 6. The Learning Loop (Three Feedback Loops)

This is what makes the tool *get smarter over time* and why the operator's instance becomes more valuable than any SaaS buyer's instance ever will.

### Loop 1: The Niche Loop (data continuous, report weekly)

- Trending Radar collects top-50 shorts per niche every 6h
- Niche Health Tracker aggregates: total views/24h, average length, retention proxy, competitor growth
- After 4 weeks of data, growth curves per niche are visible
- Real-time alerts for outliers ("Niche X jumped 40% in 24h")
- Daily snapshot card in cockpit
- Weekly strategic trend report

### Loop 2: The Pattern Loop (per video, continuous)

For every viral short the tool scrapes, extract into the Patterns Bank:
- Hook structure (question / statement / number / "wait until you see")
- Hook duration (exact seconds before first visual/voice change)
- B-roll cadence (cuts per second)
- Caption style (single word / phrase / none)
- Audio type (voiceover only / + music / music only)
- Title format and emoji usage

Every script the Script Generator writes is *conditioned* on the current top patterns for that niche. Not generic AI scripts — scripts using patterns currently winning in the operator's niche.

### Loop 3: The Personal Loop (per video posted)

- Performance Sync pulls operator's YouTube Analytics daily
- For each posted video: log views, retention curve, CTR, average view duration, subscriber gain
- Correlate each video's metadata (topic, hook, voice, length, b-roll, post time) with its performance
- After 30–50 posted videos, identify operator-specific patterns ("Your channel performs 2x better with male voice + question hooks + 47s videos posted at 6pm EST")

**Personalization output:** topic suggestions, voice picks, and script styles get reweighted toward what empirically works for the operator's channels — not what works in general.

### Loop 4: The Agent Loop (per agent, continuous)

Each of the 7 agents has its own private feedback loop:

- Every decision an agent makes is logged in `decisions` with the eventual outcome (when known — e.g., a Writer script eventually has retention data attached)
- Per-agent metrics computed daily: average outcome score, decisions made, alternatives considered, drift over time
- Each agent's prompt template gets enriched: more Pattern Bank examples, more "what worked for us" context from The Analyst
- Prompt versions tracked in `agents.prompt_version` — operator can see diffs and roll back if a version regresses

**Per-agent improvement output:** as each agent accumulates experience, its prompts get richer and more niche-specific. The Writer at month 6 has seen thousands of viral hooks and dozens of your top-performing scripts baked into its context. New SaaS buyers' Writers start blank.

### Why This Is The Moat

- Month 1: tool is generic, uses public best practices
- Month 3: 100+ data points of operator's own performance, suggestions sharply personalized
- Month 6: tool knows the operator's channels better than the operator does

When the SaaS version ships, new buyers start from generic. The operator stays months of personalization ahead.

### Explicitly NOT in v1 learning loop

- ❌ True ML/RL or model fine-tuning (overkill at this data scale)
- ❌ Cross-user pattern sharing (single user)
- ❌ Auto-decision making (operator stays in approval loop)

---

## 7. Rollout Plan (Phased Build → Monetization)

**Total build time: ~6–8 weeks** (extended from 4 weeks due to visualization layer + multi-agent architecture additions). Operational rollout to monetization continues for several months after.

### Phase 0 — Setup (Days 1–3)
- Project skeleton at `~/Downloads/shorts-os` ✅ done
- Install Node.js 24 LTS + Git on MacBook
- Create accounts: Supabase, Vercel, ElevenLabs, TikAPI, Google Cloud (YouTube Data API), Reddit Developer
- Store all API keys in Vercel env vars
- Deploy a "Hello World" Next.js app

**Done when:** `npm run dev` works locally and `vercel deploy` works to production.

### Phase 1 — Memory Layer + Intel Scrapers (Week 1)
- Supabase schema (11 tables — includes agent tables: `agents`, `agent_messages`, `decisions`, `jobs`)
- Supabase Realtime enabled on the four "live" tables (`agent_messages`, `decisions`, `jobs`, `viral_observations`)
- Vercel Cron jobs for all 4 scrapers (Trending Radar, Source Harvester, TikAPI, Performance Sync)
- Seed `agents` table with initial prompt templates for all 7 agents
- v1 niche selected (default: Wikipedia/TIL educational)

**Done when:** after 48h, Supabase contains hundreds of viral shorts with extracted metadata, and the 7 agents exist with their v1 prompt templates.

### Phase 2 — Studio Cockpit + Visualization Scaffolding (Weeks 2–3)
- Next.js multi-panel dashboard
- Topic Queue, Trending Panel, Niche Health, Channel Manager, Manual Upload Logger
- **Team Status panel** (7 agents shown, current state badges)
- **Scraper Ticker** (live feed via Supabase Realtime)
- **Pattern Bank Explorer** (read-only at first)
- React Flow integrated for future Pipeline Graph
- Cost meter

**Done when:** opening the cockpit every morning surfaces 10 fresh candidates + 5 trending breakdowns + you can see all 7 agents and the scraper ticker streaming live, even before generation works.

### Phase 3 — Agent Framework + Generation Pipeline (Weeks 4–5)
- Agent coordinator: subscription wiring (Supabase Realtime), inter-agent message passing, decision logging
- The Strategist agent (operator-facing, coordinator)
- The Scout, Archivist, Writer, Director, Voice Coach, Analyst agents wired to the pipeline
- Live AI streaming for The Writer (token-by-token script display)
- Decision Explainer side panels for every agent decision
- Pipeline Graph fully animated per video
- Team Chat feed live
- Video Renderer (Remotion, running on MacBook initially)
- Caption burning (Whisper, runs in cloud for v1, moves to PC in Phase 4)

**Done when:** operator clicks a topic, watches Strategist dispatch the work, sees Writer stream a script live, sees Director pick b-roll with reasoning, sees Voice Coach generate audio, gets an MP4 in 3–5 min that's worth posting.

### Phase 4 — PC Render Agent + First Videos (Week 6)
- PC setup guide (Node, Python, CUDA, Whisper.cpp, render agent)
- Render agent polls Supabase queue, executes on 4090, uploads to Vercel Blob
- Local Whisper moves from cloud to PC
- Renders drop to 30–60s
- First 10 videos generated + manually uploaded
- Performance Sync activated
- The Analyst starts producing daily reports

**Done when:** new channel has 10 pipeline-generated videos posted; analytics flowing back daily; The Analyst's first weekly report is visible in cockpit.

### Phase 5 — Iterate + Learning Loops Activate (Weeks 7–10)
- Post 2–4 videos/day on first channel
- Patterns Bank fills with niche-specific viral data (Loops 1, 2)
- Personal Loop starts correlating performance (Loop 3)
- Agent Loop activates — first prompt template enrichments roll out (Loop 4)
- After ~30 videos, suggestions noticeably better
- Weekly review of what's working
- A/B experiments within tool (same topic, different hooks)
- The Analyst surfaces first cross-agent insights ("The Writer + male voice combo outperforms by X")

**Done when:** channel approaches 1000 subs and tool's suggestions visibly outperform Phase 4.

### Phase 6 — Hit Monetization Threshold (Months 2–4)
- Target: 10M Shorts views in 90 days (YouTube Partner Program eligibility)
- If first niche working → push, add 2nd niche channel
- If plateauing after 4 weeks → pivot niche using Intel Layer data

**Done when:** at least one channel monetized.

### Phase 7 — Scale + v1.5 Features (Months 4–6)
- Scheduled auto-upload
- Cross-platform posting (TikTok, Reels)
- Swap ElevenLabs → local XTTS-v2
- Local Flux for custom AI b-roll
- Long-form mode (AI sleep channels)

**Done when:** 3–5 monetized channels.

### Phase 8 — Productize (Month 6+)
- Public stripped-down version of tool
- Keep private: Patterns Bank, Performance Memory, personalization model
- Ship public: script gen, voice gen, basic trending, render pipeline (generic)
- Price: $49–99/mo
- Distribution: post about own channel success → people ask → reveal product

**Done when:** SaaS MRR is real and growing.

### Revenue Expectations (Realistic)

| Month | State | Expected $ |
|---|---|---|
| 1 | Building, first videos | $0 |
| 2 | Posting daily, watching for traction | $0 |
| 3 | Possibly first monetization | $0–500 |
| 4 | 1 monetized channel, 2nd starting | $500–2k |
| 5–6 | Multiple channels, sponsorships | $2k–8k |
| 7+ | Tool productized, MRR layered on | $5k–20k+ |

Optimistic if a video pops in month 2. Pessimistic if 6 months pass with no monetization and a niche pivot is needed.

---

## 8. Open Questions / Future Decisions

- **Naming:** `shorts-os` is the working name. Both the operator's private brand (channel namespace) and the eventual SaaS brand can be decided later.
- **v1 niche commitment:** Wikipedia/TIL educational is the default v1 niche. Operator may pivot once Intel Layer data reveals what's actually growing.
- **YouTube channel reuse vs fresh start:** Existing `@dyfrx_9754` channel (bikes/cars/ASMR) has 695 subs but the wrong niche. Recommendation: start fresh channels for new niches; treat old channel's 15 videos as learning artifacts.
- **Friend's funding:** Operator has a friend who may partially fund. Recommendation: don't take money for v1 — costs are ~$80–210/mo, well within operator's own means. Revisit only if friend brings a specific skill (design, marketing, sales) as co-founder, not as passive capital.

---

## 9. Constraints That Shaped This Design

- **Operator preferences:** no face on camera, no cold sales calls, no AI-slop products, prefers text/faceless distribution
- **Operator strengths:** tech-comfortable with Claude, top grades, private school network, knows car culture, has tried YouTube Shorts before (real learning data)
- **Operator hardware:** MacBook Air (current) + Windows PC with i9-13900k + RTX 4090 (render workhorse)
- **Budget:** $0–500/mo realistic, $80–210 expected
- **Time horizon:** 6+ months commitment, college applications in ~18 months
- **Operator goal:** $1–8k/mo income + strong founder story for top business schools; $20k+/mo is stretch
