# Shorts OS — Clip-Based Formats Design (Pre-Plan #4 Sketch)

**Status:** Draft. Captures the format requirements that emerged from operator example URLs (2026-05-25), so Plan #4 (the Render pipeline) can be designed to actually produce these outputs instead of the original stock-b-roll-only design.

**Author:** Claude (chat session 2026-05-25), via Darius.

**Predecessors:**
- [Shorts OS master design](./2026-05-24-shorts-os-design.md)
- [The Lab design (Plan #3)](./2026-05-24-shorts-os-the-lab-design.md)
- [/watch skill integration proposal](./2026-05-25-watch-skill-integration.md)

**Legal note (on the record for future readers, not as advocacy):** Two of the three formats below are reverse-engineered from channels that use third-party copyrighted footage (CCTV / Ring fail clips, streamer livestream excerpts). Operator has decided to proceed knowing the YouTube Content ID / fair-use / DMCA risk profile. This spec describes the technical pipeline only; it does not assess legality or recommend any particular sourcing strategy. Source-selection decisions are operator-owned.

---

## What changed since the Lab design

The Lab design ([the-lab-design.md](./2026-05-24-shorts-os-the-lab-design.md)) assumed every Short is a **narrated explainer** — Writer generates script, Voice Coach picks TTS voice, Director assembles stock b-roll from Pexels/Storyblocks. That assumption is wrong for the formats the operator actually wants to produce.

Three distinct output formats are needed. Each has a different ingredient list, different pipeline, different agent set.

| Format | Source video | Audio | Text | Tool fit |
|---|---|---|---|---|
| **Narrated explainer** (current Lab design) | Stock b-roll from Pexels/Storyblocks | AI TTS over music bed | Burned captions of TTS narration | Already designed — Writer + Voice Coach + Director |
| **Compilation list ("Top 5")** | Third-party fail/highlight clips assembled in sequence | Original clip audio + music bed | Title bar + numbered list with per-clip captions | NEW — needs different pipeline |
| **Streamer edit (phonk style)** | Single third-party streamer clip | Original streamer audio + phonk music bed | Sticker + label overlays timed to action | NEW — needs different pipeline |

The current Lab orchestrator + four agents serve format #1 well. The agents need to be **extended or branched** to serve formats #2 and #3 — they share some pieces (Strategist for topic pick) but the Writer/Voice Coach/Director are not the right roles for clip-assembly work.

---

## Format 1 (existing — narrated explainer)

Already specified by the Lab design. Producible end-to-end once Plan #4 ships TTS synthesis + Pexels/Storyblocks fetch + ffmpeg render. Out of scope for this doc.

---

## Format 2 — Compilation list ("Top 5")

**Reference Short observed (2026-05-25):**
- URL: https://www.youtube.com/shorts/XulN4FZCqJ4
- Title: "RANKING BEST FALLING MOMENTS"
- Duration: ~30s (5 clips × ~6s each)

### Visual structure

Fixed template with three persistent regions:

1. **Title bar (top, ~10% of frame height)** — bold uppercase text, white with one accent-colored word ("RANKING BEST **FALLING** MOMENTS"). Stays for the full Short.
2. **Left sidebar (~25% width)** — vertical numbered list 1-5 in bold colored numerals. Each entry has a one-line caption that *appears as that item's clip plays*. Labels are persistent once revealed (by the end of the Short all 5 captions are visible).
3. **Main viewport (~65% width)** — the source clip plays, full-bleed within the area.

Reveal order in the observed example was **not** 5-to-1 countdown — labels appeared as #3 → #4 → #5 → #2 → #1, suggesting the creator chose dramatic order rather than strict ranking. Either pattern needs to be supported.

### Audio

- Original clip audio kept (natural-sound reactions like "Riley, be careful")
- Music bed underneath (low-tempo, doesn't overpower)
- No voiceover / narration

### Source clips

The clips themselves are third-party — CCTV, Ring doorbell, handheld phone footage of accidents/fails. **The operator does not film these.** Sourcing options the tool needs to support:

- (a) Operator drops URLs into a queue and Shorts OS downloads + clips them
- (b) Shorts OS scrapes a defined source pool (Reddit subreddits like `r/instant_regret`, `r/Whatcouldgowrong`, `r/youseeingthisshit`; specific YouTube/TikTok creators)
- (c) Operator uploads a folder of pre-downloaded clips and Shorts OS indexes them

For Phase 1 of this format, (a) is the simplest. (b) and (c) come later.

### Pipeline

```
                  ┌─ Strategist (picks the theme:
                  │   "ranking falling moments",
                  │   "5 worst dad fails", etc.)
                  ▼
Topic picker ──► Clip Selector (NEW AGENT)
                  - sources 5 candidate clips matching theme
                  - trims each to ~5-7s of "peak moment"
                  - orders them dramatically (not strict rank)
                  - writes one-line label for each
                  ▼
              Layout Renderer (NEW)
                  - composes the fixed title + sidebar template
                  - sequences the 5 clips into main viewport
                  - drops in labels timed to each clip's start
                  ▼
              Audio Mixer (NEW)
                  - preserves original clip audio
                  - layers music bed at ~20% volume
                  ▼
              ffmpeg render ─► .mp4 ─► YouTube upload
```

### New agents needed

- **Clip Selector** — replaces the Writer for this format. Takes a theme, returns 5 clip references (URL/path + start_sec + end_sec + label). Uses Claude to evaluate clip relevance + write labels. Critical that this agent never invents clip URLs — it must source from a passed-in candidate pool.
- **Layout Renderer** — replaces the Director for this format. The visual_treatment isn't picked from an enum; it's a fixed Top-5 template with parameters (title text, accent word, label list, clip list).
- **Audio Mixer** — was implicit in Plan #4 as part of ffmpeg assembly; for this format it stays simple (no TTS to time, just preserve + duck music).

### Schema additions

```sql
create table public.clip_library (
  id uuid primary key default uuid_generate_v4(),
  source_url text not null,                 -- original platform URL
  source_platform text not null check (source_platform in ('youtube', 'tiktok', 'reddit', 'twitch', 'upload')),
  source_creator text,                      -- credit field (NOT a legal defense, just for our records)
  local_path text not null,                 -- where the downloaded file lives
  duration_seconds numeric not null,
  width int,
  height int,
  description text,                         -- claude-generated description of what's in the clip
  tags text[] not null default '{}',        -- searchable tags (e.g. 'fall', 'snow', 'dog', 'car')
  niche_id uuid references public.niches(id) on delete set null,
  added_at timestamptz not null default now(),
  added_by text                             -- 'manual' | 'scraper:<name>'
);

create index clip_library_tags_idx on public.clip_library using gin (tags);
create index clip_library_niche_idx on public.clip_library (niche_id);

create table public.compilation_drafts (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  topic_queue_id uuid references public.topic_queue(id) on delete set null,
  theme text not null,                      -- "ranking falling moments"
  title_template text not null,             -- "RANKING BEST {ACCENT} MOMENTS"
  accent_word text not null,                -- "FALLING"
  clip_refs jsonb not null,                 -- [{clip_id, start_sec, end_sec, label, order}]
  music_track_id uuid,                      -- nullable; references public.music_tracks
  status text not null default 'draft',
  rendered_path text,
  created_at timestamptz not null default now()
);
```

---

## Format 3 — Streamer phonk edit

**Reference Short observed (2026-05-25):**
- URL: https://www.youtube.com/shorts/B4Xh4PzRtJM
- Title: "Even he was shocked 😂😂 #ishowspeed #edit"
- Duration: ~19s

### Visual structure

Single source clip throughout — no compilation. Modified by:

1. **Color grade** — saturation pushed hard (deep reds, pumped greens), contrast bumped, light red tint applied. The "sharpened" look the operator described.
2. **Stylized text overlays** — large bold labels ("ISHOWSPEED", "CONFUSED") appearing at key moments. White-with-red-stroke font. Drop-shadowed. Anchored to specific frames, not crawling.
3. **Sticker overlays** — small emoji-style stickers (skull, fire, etc.) placed over objects in the scene at peak moments.
4. **Speed ramps / motion blur** — slow-mo on reaction moments; speed-up on dead air.
5. **Watermark** — creator's tag (e.g. "deagzzzshorts") small in lower-right.

### Audio

- Original streamer audio preserved (so viewers hear what was said)
- Phonk music track underneath, mixed so the bass-drops hit on visual peak moments
- Drops timed to color-flash / text-overlay reveals

### Source clip

Single third-party livestream excerpt from a target streamer (IShowSpeed, Jynxzi, Kai Cenat, etc.). **Operator does not film.** Sourcing options:

- (a) Manual URL drop — operator finds a viral clip on Twitch/Kick/YouTube and submits it
- (b) Scraper monitors target streamers' VODs / clip pages and proposes candidates
- (c) Re-clip from operator's own clip library (built up over time)

### Pipeline

```
                  ┌─ Strategist (picks the streamer + moment type:
                  │   "Speed's funniest reactions",
                  │   "Jynxzi clutch moments")
                  ▼
Topic picker ──► Clip Selector (NEW AGENT, same one as Format 2)
                  - selects ONE clip from candidate pool
                  - trims to ~15-25s "peak moment"
                  - identifies 2-4 in-clip beat moments for text/sticker drops
                  ▼
              Edit Director (NEW AGENT)
                  - assigns text overlay phrases to beat moments
                  - picks sticker overlays from a library
                  - assigns speed-ramp markers
                  - picks color-grade preset
                  ▼
              Audio Mixer (NEW)
                  - preserves original clip audio
                  - selects phonk track (matching mood/energy)
                  - aligns track BPM to beat moments
                  ▼
              ffmpeg render ─► .mp4 ─► YouTube upload
```

### New agents needed

- **Clip Selector** — same agent as Format 2, branched on input. For phonk-edit mode it returns one clip with beat markers instead of five clips with labels.
- **Edit Director** — different responsibility from the Lab Director. Picks color-grade preset (from a curated enum), assigns text/sticker overlays to specific timestamps in the clip, marks speed-ramp regions. Output is a timeline of (timestamp, effect_type, params).
- **Audio Mixer** — same agent as Format 2. For phonk-edit it picks a phonk track and aligns drops to beat markers.

### Schema additions (beyond Format 2's `clip_library`)

```sql
create table public.music_tracks (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  artist text,
  source text not null check (source in ('library_paid', 'creator_commons', 'public_domain', 'youtube_audio_library', 'operator_upload')),
  license_notes text,                       -- for our records, not a legal claim
  local_path text not null,
  duration_seconds numeric,
  bpm int,
  genre text,                               -- 'phonk', 'lofi', 'cinematic', etc.
  energy_level int check (energy_level between 1 and 5),
  added_at timestamptz not null default now()
);

create index music_tracks_genre_idx on public.music_tracks (genre, energy_level);

create table public.streamer_edit_drafts (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  topic_queue_id uuid references public.topic_queue(id) on delete set null,
  source_clip_id uuid not null references public.clip_library(id),
  source_start_sec numeric not null,
  source_end_sec numeric not null,
  music_track_id uuid references public.music_tracks(id),
  color_grade text not null check (color_grade in (
    'phonk-red', 'phonk-blue', 'neon-cyberpunk',
    'desaturated-cinematic', 'high-contrast-saturated', 'vhs'
  )),
  overlay_timeline jsonb not null,          -- [{at_sec, type: 'text'|'sticker'|'speed', params}]
  status text not null default 'draft',
  rendered_path text,
  created_at timestamptz not null default now()
);
```

---

## Reuse across formats

| Component | Format 1 (explainer) | Format 2 (Top 5) | Format 3 (phonk edit) |
|---|---|---|---|
| Strategist | ✅ | ✅ | ✅ |
| Writer | ✅ | ❌ | ❌ |
| Voice Coach (TTS pick) | ✅ | ❌ | ❌ |
| Director (treatment enum + shot list) | ✅ | ❌ — Layout Renderer instead | ❌ — Edit Director instead |
| Clip Selector (NEW) | ❌ | ✅ | ✅ |
| Layout Renderer (NEW) | ❌ | ✅ | ❌ |
| Edit Director (NEW) | ❌ | ❌ | ✅ |
| Audio Mixer (NEW) | ✅ | ✅ | ✅ |
| Render (ffmpeg assembly) | ✅ | ✅ | ✅ |
| YouTube upload | ✅ | ✅ | ✅ |

So the agent set goes from 4 → 7 (Strategist, Writer, Voice Coach, Director, Clip Selector, Layout Renderer, Edit Director, Audio Mixer — minus 1 for "Audio Mixer is ffmpeg-stage, not a Claude-call agent").

The Orchestrator already shipped (Phase 2 of the Lab plan) needs a **format selector** at the top — once Strategist picks the topic, route to the right pipeline based on which format Strategist chose.

---

## How the Lab orchestrator changes

Today's orchestrator (shipped in commit `c5c564b`, `src/lib/agents/orchestrator.ts`) hardcodes the sequence Strategist → Writer → Voice Coach → Director. That needs to fork:

```
Strategist (decides format too — explainer | compilation | streamer_edit)
       │
       ▼
   ┌───┴────────────────┬──────────────┐
   │                    │              │
explainer flow     compilation flow   streamer_edit flow
   │                    │              │
Writer            Clip Selector       Clip Selector
Voice Coach       Layout Renderer     Edit Director
Director          Audio Mixer         Audio Mixer
       └──────────┬───────┴──────────────┘
                  ▼
              ffmpeg render
                  ▼
              YouTube upload
```

The Strategist's output schema needs a new field: `selected_format: 'explainer' | 'compilation' | 'streamer_edit'`. The orchestrator branches on it.

---

## Sourcing problem (the hard part)

Both formats #2 and #3 require a **clip library** populated with third-party footage. The mechanics are well-understood (yt-dlp + ffmpeg trim, store in Vercel Blob or local disk, index in `clip_library` table). The hard problem is sourcing strategy.

Operator paths to consider, in increasing order of risk and decreasing order of friction:

| Strategy | How it works | Status |
|---|---|---|
| **Operator manual drop** | Operator pastes URLs in a queue; Shorts OS downloads + indexes | Lowest friction; operator-controlled |
| **Public-domain / Creative Commons scrape** | Auto-pull from CC-BY YouTube channels, Pixabay video, etc. | Slowest growth; lowest risk |
| **Subreddit scrape** | Reddit allows scraping by API; many fail/highlight subs have user-uploaded clips of unclear provenance | Medium risk |
| **Direct streamer scrape** | yt-dlp against target streamer's VODs / official clips | Highest risk; this is what most "clip channels" do |
| **Licensed library** | Pay for Storyblocks / Pond5 / Artgrid (these typically don't have streamer content though) | Low risk for stock; doesn't help with streamer clips |

The Spec does not decide this. The operator picks. The tool needs to support whichever path they pick — building the pipeline doesn't commit the operator to a specific sourcing strategy.

---

## What Plan #4 needs to design

Given this, Plan #4 (Render pipeline) needs to cover:

1. **Three render pipelines**, one per format, all producing 1080×1920 vertical .mp4
2. **Clip library** infrastructure (download, store, index, search)
3. **Music library** infrastructure (same, with bpm/genre metadata)
4. **Font + sticker + color-grade preset library** for Format 3 overlays
5. **TTS provider integration** (still needed for Format 1)
6. **Format-routing orchestrator changes** (the fork above)
7. **YouTube upload** with OAuth + Data API v3 (same for all 3 formats)
8. **Render execution environment** — ffmpeg + 3-5 GB of intermediate files per render. Vercel Sandbox or external worker (Modal / Fly.io / Railway).

Plan #4 was already going to be the biggest plan; supporting all three formats roughly **doubles** its scope versus what the Lab design assumed. Mental model: it's three render pipelines that share infrastructure (download, ffmpeg, upload) but differ in their agent set and timeline structure.

---

## Decision points / open questions for next session

1. **Which format to build first?** Building all three in one Plan #4 is huge. Recommend building Format 2 (compilation) OR Format 3 (streamer edit) first — they're the operator's stated priority. Format 1 (explainer) is what's currently designed but is the operator's *lowest* priority based on this convo.

2. **Manual-drop vs scrape for v1?** Building scrape infrastructure for streamer clips is significant work. v1 could ship with manual URL drop only — operator finds clips, the tool produces the edit. Scraping comes later.

3. **Color grade presets — how many, defined how?** The phonk-edit reference used a specific "phonk-red" grade. Other looks (cinematic, VHS, neon) are different presets. Each is essentially a stack of ffmpeg filters. Need to either curate ~6 presets manually or let the Edit Director pick from a parametric space.

4. **Sticker / overlay library — built or sourced?** Stickers for the phonk-edit format need a library (skulls, fire, "💀", "🔥", custom designs). Either commission a set or curate from open licensed packs. Affects v1 quality significantly.

5. **Music track library — what's the source?** Phonk specifically: NoCopyrightSounds has some, but most "good" phonk used on YouTube edits is licensed from artists. Could subscribe to Epidemic Sound (broad library + clear license) or buy specific tracks. v1 could ship with 5-10 hand-picked tracks.

6. **Operator's existing dyfrx footage** — does it get an entry in `clip_library` as a sourcing option? If yes, we can produce wraps-content-style edits in Format 3 using operator's own clips, which is a much cleaner copyright story than streamer scraping.

---

## What to do BEFORE writing the Plan #4 implementation plan

Don't jump to Plan #4 yet. The next steps are:

1. **Operator picks format priority** (Format 2 or Format 3 first?)
2. **Operator picks v1 sourcing strategy** (manual drop vs scrape, for the chosen format)
3. **Curate the libraries** (music, color grades, stickers, fonts) — this can happen in parallel with anything else
4. **Then** write the Plan #4 implementation plan, scoped to the chosen format

The Lab Phase 3-5 (API routes, UI, smoke) can continue in parallel because they're producing Format 1 (explainer). It's still worth shipping — both for testing the orchestration end-to-end and because explainer-format Shorts are a legitimate output the operator might use even if their main focus is Format 2/3.

---

## References

- Top-5 reference: https://www.youtube.com/shorts/XulN4FZCqJ4
- Streamer-edit reference (IShowSpeed): https://www.youtube.com/shorts/B4Xh4PzRtJM
- Other examples provided: shorts/MrmFlBX3JU8, shorts/fazI6hff52c, shorts/WKV8Kbl-dvk, shorts/Evcv34v31_s, shorts/tfiLeyu02oo, shorts/jmMkgawb9Y0
- Lab design (currently designed for Format 1 only): `docs/superpowers/specs/2026-05-24-shorts-os-the-lab-design.md`
- /watch integration: `docs/superpowers/specs/2026-05-25-watch-skill-integration.md`
