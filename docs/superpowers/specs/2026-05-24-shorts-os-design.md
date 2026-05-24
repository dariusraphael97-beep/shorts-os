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
| `patterns` | Aggregated patterns by niche (winning hooks, lengths, b-roll cadence) | Script Generator |
| `your_videos` | Every video posted by operator + daily YouTube Analytics snapshots | Personal Loop |
| `pattern_performance` | Which patterns correlated with success in `your_videos` | Script Generator (personalized weighting) |
| `topic_queue` | Surfaced topic candidates with state (queued / used / rejected) | Topic Queue, Source Harvester |
| `channels` | Per-channel config + auth tokens for YouTube Data API | Channel Manager, Performance Sync |

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
| File storage | Vercel Blob (private tier) | MP4s, audio, b-roll cache |
| LLM | Claude via Vercel AI Gateway (AI SDK v6) | Gateway provides fallback + observability; Claude best for script quality |
| Voice generation | ElevenLabs API | Best voice quality; experiment with local XTTS-v2 in v1.5 |
| Video rendering | Remotion (React-based, programmable) | Code-as-video; runs on operator's 4090 |
| Caption timing | Whisper.cpp w/ CUDA on operator's PC | Free, fast, word-level timing |
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
| Claude API (via Gateway) | $20–50 |
| ElevenLabs Creator | $22–99 |
| TikAPI | $30 |
| Vercel Blob storage | $5–10 |
| Asset APIs (Pexels, Pixabay, etc.) | $0 |
| Local AI compute (4090) | $0 |
| **Total** | **~$80–210/mo** |

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

### Phase 0 — Setup (Days 1–3)
- Project skeleton at `~/Downloads/shorts-os` ✅ done
- Install Node.js 24 LTS + Git on MacBook
- Create accounts: Supabase, Vercel, ElevenLabs, TikAPI, Google Cloud (YouTube Data API), Reddit Developer
- Store all API keys in Vercel env vars
- Deploy a "Hello World" Next.js app

**Done when:** `npm run dev` works locally and `vercel deploy` works to production.

### Phase 1 — Memory Layer + Intel Scrapers (Week 1)
- Supabase schema (7 tables)
- Vercel Cron jobs for all 4 scrapers
- v1 niche selected (default: Wikipedia/TIL educational)

**Done when:** after 48h, Supabase contains hundreds of viral shorts with extracted metadata.

### Phase 2 — Studio Cockpit (Week 2)
- Next.js multi-panel dashboard
- Topic Queue, Trending Panel, Niche Health, Channel Manager, Manual Upload Logger

**Done when:** opening the cockpit every morning surfaces 10 fresh candidates + 5 trending breakdowns and feels useful even without generation.

### Phase 3 — Generation Pipeline (Week 3)
- Script Generator (Claude + Patterns Bank)
- Voice Studio (ElevenLabs)
- Asset Pipeline (Pexels + Pixabay + Wikimedia)
- Video Renderer (Remotion, running on MacBook initially)
- Caption burning (Whisper)

**Done when:** clicking "make this video" produces a downloadable MP4 in 3–5 min that's worth posting.

### Phase 4 — PC Render Agent + First Videos (Week 4)
- PC setup guide (Node, Python, CUDA, Whisper.cpp, render agent)
- Render agent polls Supabase queue, executes on 4090, uploads to Vercel Blob
- Renders drop to 30–60s
- First 10 videos generated + manually uploaded
- Performance Sync activated

**Done when:** new channel has 10 pipeline-generated videos posted; analytics flowing back daily.

### Phase 5 — Iterate + Learning Loop Activates (Weeks 5–8)
- Post 2–4 videos/day on first channel
- Patterns Bank fills with niche-specific viral data
- Personal Loop starts correlating performance
- After ~30 videos, suggestions noticeably better
- Weekly review of what's working
- A/B experiments within tool (same topic, different hooks)

**Done when:** channel approaches 1000 subs and tool's suggestions visibly outperform week 4.

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
