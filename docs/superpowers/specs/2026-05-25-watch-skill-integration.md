# `/watch` Skill — Integration Proposal for Shorts OS

**Status:** Proposal. No code changes yet.
**Author:** Claude (chat session 2026-05-25), via Darius.
**Predecessors referenced:** [Studio Cockpit MVP](./2026-05-24-shorts-os-studio-cockpit-mvp-design.md), [The Lab (Plan #3 design)](./2026-05-24-shorts-os-the-lab-design.md).
**Context for receiving agent:** A Claude Code skill called `/watch` is now installed on Darius's machine. This doc explains what it is, how it works, and how it should slot into the Shorts OS pipeline. Read this end-to-end before proposing changes.

---

## TL;DR

`/watch` gives Claude the ability to *see and hear* a video by downloading it, extracting frames, pulling a transcript, and feeding both into Claude's context. It's a local CLI pipeline wrapped in a Claude Code skill — no third-party video model, no Gemini, no managed service.

For Shorts OS this closes the single biggest blind spot in the Intel layer: we currently scrape YouTube Shorts / TikTok metadata (title, thumbnail, view counts) but cannot actually *analyze the artifact itself*. `/watch` lets us extract hook structure, on-screen text, pacing, visual style, and beat alignment, then persist it as structured intel.

The integration has three sequential phases:

- **Phase A — Manual enrichment (immediate, zero infra changes).** Use `/watch` interactively in dev/Claude Code sessions to enrich top trending Shorts with structured "hook anatomy" records. Drop them into a new Supabase table. Validates value before automation.
- **Phase B — Strategist/Director feed (during or after Plan #3 ships).** Wire the breakdowns table into Lab's Strategist + Director agents so they have real reference patterns to mimic instead of inferring from titles.
- **Phase C — Automation (after Plan #4 / Render pipeline ships).** Vercel cron + Sandbox runs the `/watch` pipeline automatically against trending Shorts as the scrapers ingest them. Also: QA loop on the rendered drafts themselves.

---

## What `/watch` is

A skill bundled in [`bradautomates/claude-video`](https://github.com/bradautomates/claude-video). Installed locally at `~/.claude/skills/watch/`. Exposes a single user-invocable command:

```
/watch <video-url-or-path> [optional question]
```

Sources it handles:

- Any URL `yt-dlp` supports (~1,000+ sites: YouTube, TikTok, Vimeo, X, Instagram, Reddit, Twitch, Loom, etc.)
- Local files (`.mp4`, `.mov`, `.mkv`, `.webm`)

Output shape (what Claude receives back):

- A directory of timestamped JPEG frames (`frames/frame_NNNN.jpg`, with `t=MM:SS` markers)
- A timestamped transcript (native captions when available, Whisper-via-Groq fallback otherwise)
- Claude `Read`s each frame inline → images render in context → Claude can describe what's on screen at any moment and align it with what was said.

This is fundamentally different from analyzing a thumbnail + title. Claude actually sees frame 1, frame 2, frame 3 of the hook.

---

## Pipeline (technical)

```
URL or local path
       │
       ▼
   yt-dlp ──────────► video.mp4 + native subtitles (.vtt) if available
       │
       ▼
   ffprobe ─────────► duration → frame-budget decision
       │
       ▼
   ffmpeg ──────────► frames/frame_NNNN.jpg (512px wide, auto fps, cap 2 fps / 100 frames)
       │
       ▼  (only if no native captions)
   ffmpeg ──────────► audio.m4a (mono 16kHz, ~0.5 MB/min)
       │
       ▼
   Whisper API ─────► transcript with timestamps
   (Groq whisper-large-v3 preferred — free tier;
    OpenAI whisper-1 fallback)
       │
       ▼
   Markdown report ─► frame paths + transcript handed to Claude
```

**Frame budget (full-video mode):**

| Duration | Frames | Notes |
|---|---|---|
| ≤30s | ~30 | Dense — basically every key moment |
| 30s–1min | ~40 | Still dense |
| 1–3min | ~60 | Comfortable |
| 3–10min | ~80 | Sparse but workable |
| >10min | 100 (hard cap) | "Sparse scan" warning |

**Focused mode** (when `--start` / `--end` are set) gets denser per-second budgets, still capped at 2 fps. Use this for "what happens in the first 3 seconds" type questions — exactly the shape of most hook-analysis work for Shorts.

**Working directory** lives under `$TMPDIR/watch-*` and is cleaned up after each session. Frame JPEGs are not persisted by default.

**Local vs. remote:**

- yt-dlp, ffmpeg run **locally** — no third party in the loop for download or frame extraction.
- The only thing that crosses the network (besides yt-dlp fetching the source) is the audio clip when captions are missing — sent to Groq (or OpenAI). Frames never leave the machine until Claude `Read`s them.

---

## Installation status (Darius's machine)

Already done in the chat session that produced this doc:

- ✅ Skill cloned to `~/.claude/skills/watch/` (loads as `/watch` after Claude Code restart)
- ✅ Homebrew installed
- ✅ `ffmpeg` 8.1.1 + `yt-dlp` 2026.3.17 installed via brew
- ✅ `GROQ_API_KEY` set in `~/.zshrc` (Whisper fallback works)
- ✅ Preflight passes (`python3 ~/.claude/skills/watch/scripts/setup.py --check` → exit 0)

**Outstanding:** `eval "$(/opt/homebrew/bin/brew shellenv)"` is not yet in `~/.zprofile`. Brew falls off PATH in fresh login shells until that line is added. Won't affect `/watch` invocations from Claude Code as long as the skill's own preflight catches it (it does).

---

## Invocation surface

### Basic

```
/watch https://www.youtube.com/shorts/ABC123 "what's the hook structure?"
```

### Common flags

| Flag | Use |
|---|---|
| `--start MM:SS --end MM:SS` | Focus on a section. Dense fps. Best for hook-only analysis on long videos. |
| `--max-frames N` | Lower the cap to save tokens. e.g. `--max-frames 30` for a quick scan. |
| `--resolution 1024` | Bump from default 512px. Only when on-screen text matters (small captions, code snippets). 4x the image tokens per frame. |
| `--fps F` | Override auto-fps. Capped at 2. |
| `--whisper groq\|openai` | Force backend. Default = Groq if `GROQ_API_KEY` set. |
| `--no-whisper` | Skip transcript fallback. Frames-only. Useful for batch jobs where audio isn't needed. |
| `--out-dir DIR` | Keep working files in a specific location instead of `$TMPDIR`. Needed if we want to persist frames/transcript to Supabase Storage. |

### Direct script (for non-Claude-Code callers)

```bash
python3 ~/.claude/skills/watch/scripts/watch.py "<url>" [flags]
```

This is the bridge for Phase C — the script can be invoked from any Node/Python runtime that has yt-dlp + ffmpeg on PATH and the Whisper key set. No Claude Code required.

### Output (what gets printed to stdout)

A markdown report with two main sections:

1. **Frames table** — one row per frame, with absolute path and `t=MM:SS`.
2. **Transcript** — timestamped, source-tagged (`captions` vs `whisper (groq)` vs `whisper (openai)`).

Followed by a working-directory path the caller should `rm -rf` when done.

---

## Cost model

Per Brad's published numbers (independently consistent with the SKILL.md frame-budget math):

| Video length | Frames pulled | Approx. token cost |
|---|---|---|
| 1 min | ~60 | ~$0.70 |
| 10 min | ~80 | ~$0.82 |
| 30 min | 100 (cap) | ~$0.95 |
| 1 hr | 100 (cap) | ~$1.62 |

Frames dominate cost. Transcript is negligible. For Shorts (≤60s) the cost is the bottom of that curve — call it ~$0.30–0.70 per Short to do a full pass.

**Whisper cost:** Groq free tier gives ~2 hours of transcription per hour. For typical Shorts volumes this is effectively free.

**Implication for batch jobs (Phase C):** scoring 100 trending Shorts a day with `/watch` costs roughly $30–70/day in Claude API. Not nothing, but cheaper than Gemini video and arguably the highest-leverage spend in the whole stack — it's the difference between scoring topics by metadata vs. by *what actually makes the video work*.

---

## How `/watch` maps to Shorts OS (architecture-aware)

This is the load-bearing section. Each integration is mapped to specific existing or planned components.

### A. Trending Panel "lazy Claude breakdowns" (Plan #2, already shipped)

**Current state per README:** "Trending Panel (with lazy Claude breakdowns)" exists on the Cockpit at `/`.

**Unknown to me:** what those breakdowns actually contain and where they're stored. Receiving agent: please check `src/app/` and `src/components/` for the trending panel, find the breakdown server action or API route, and identify the storage layer. The proposal below assumes breakdowns are either (a) computed on-demand and not persisted, or (b) stored in a column on the existing trending tables. If they're already in a dedicated table, that table should be extended rather than creating a new one.

**With `/watch`:** When a user expands a trending Short for the first time, run `/watch <url>` with a structured hook-breakdown prompt. Persist the structured result keyed on `(source, external_id)`. Subsequent expansions hit cache.

**Why first:** already a user-initiated, latency-tolerant action. No cron infra needed. Validates output quality before any automation. Plays nicely with the existing UI affordance.

### B. Topic Queue scoring (Plan #1, Haiku 4.5 already wired)

**Current state:** Haiku 4.5 scores topic candidates for hookability based on metadata.

**With `/watch`:** Once breakdowns exist for the *reference videos* a topic was derived from, the scoring prompt can include "here's the actual hook anatomy of the 3 trending videos this topic emerged from." Score quality goes up substantially — the model is reasoning about real patterns instead of inferring from titles.

Depends on (A) being populated first.

### C. Lab Strategist + Director (Plan #3, designed not built)

**This is the highest-leverage integration.** Per the Lab design doc, two of the four agents make pattern-based decisions that today must be inferred:

- **Strategist** receives topic + channel, decides angle + dispatch directive.
- **Director** picks visual treatment from a **curated enum of 6 treatments**, decides music mood, produces a shot list.

Both of these are *exactly* the decisions that benefit most from "here are the breakdowns of the top 5 trending Shorts in this niche right now":

- Strategist gets real hook structures to instruct the Writer with ("open with X visual, Y opening line, pattern interrupt at Z seconds").
- Director picks the visual_treatment with concrete evidence ("4 of the 5 trending refs in this niche use treatment #3, here's why").

**Concrete proposal:** Both agents' system prompts get a `reference_breakdowns` block populated from the `video_breakdowns` table, filtered by niche + recency. The Strategist's `decisions` table entry then carries `references_used: [breakdown_id, ...]` so the Cockpit can later show "Strategist saw these 5 reference Shorts" in a Decision Explainer (out of scope for Plan #3 per the design doc, but the data exists).

**This means the breakdowns schema needs to land before Lab ships, or Lab ships without this and we retrofit afterward.** Retrofitting is fine — Lab's contract is "real Claude call, with whatever prompt the orchestrator hands it" — but doing it concurrently is cleaner.

### D. QA on rendered drafts (Plan #4, not designed yet)

**Current state:** Plan #4 (Render pipeline) hasn't started. There are no rendered video files yet — only scripts, voice choices, and shot lists.

**With `/watch`:** When Plan #4 produces a rendered `.mp4`, run `/watch ./drafts/<id>.mp4 "does the actual rendered hook match the dispatch directive the Strategist set?"`. Closes the assembly→review loop without a human watching every iteration. Defer entirely until Plan #4 lands.

### E. Intel scrapers (Plan #1, cron-driven) — Phase C only

**Current state:** 5 scrapers run on cron (YT Shorts 6h, TikTok 6h, Reddit/Wikipedia daily, Performance sync daily).

**With `/watch`:** A 6th scraper or augmentation. After the YouTube/TikTok scrapers ingest a new trending video, enqueue a "watch this" job. A cron handler:

1. Pops the queue
2. Invokes the `/watch` pipeline (see Productionization section)
3. Writes the breakdown to `intel.video_breakdowns`
4. Emits an event the Cockpit can subscribe to via Realtime

Rate-limit at the cron level. See cost model — uncapped this gets expensive fast.

### F. Bug repro / dev loop (operational, always available)

When someone records a screen recording of a Cockpit or Lab bug, `/watch screen-recording.mov "what's broken?"` in Claude Code. Claude finds the frame where the issue appears, describes the state, often catches the cause. Saves the "let me re-watch this 20 times" tax. No integration needed — it just works once the skill is installed.

---

## Phase A — Quick-win experiments (no infra changes)

Order matters. Each builds confidence for the next.

### Experiment 1: Manual breakdown of one trending Short

Pick any current entry from the Trending Panel. In a Claude Code session at this repo root:

```
/watch <url> "break down the hook in three layers: (1) what's on screen second-by-second
for the first 3 seconds, (2) the exact opening words, (3) the pattern interrupt and where
it lands"
```

Goal: validate that the output is usable as structured intel, not just prose.

### Experiment 2: Compare 3 winners in the same niche

Run Experiment 1 on the top 3 trending Shorts in one niche (e.g. `wikipedia-til` from the README's seed example). Ask Claude to identify the common hook pattern across all three.

Goal: confirm `/watch` can power competitive intel synthesis, not just single-video analysis.

### Experiment 3: Design + migrate the `video_breakdowns` table

Only after Experiments 1–2 stabilize the output shape. Schema sketch (treat as starting point, not final):

```sql
-- Adjust schema namespace to match existing conventions in supabase/migrations/
create table video_breakdowns (
  id uuid primary key default gen_random_uuid(),
  source text not null,            -- 'youtube_shorts' | 'tiktok' | 'local'
  external_id text,                -- video id (null for local files)
  content_hash text,               -- fallback unique key for local files
  url text,
  niche_slug text references niches(slug),
  duration_sec int,
  hook_structure jsonb,            -- { opening_visual, opening_words, pattern_interrupt_at_sec, ... }
  visual_style jsonb,              -- { camera_setup, cuts_per_10s, on_screen_text_density, ... }
  transcript text,
  transcript_source text,          -- 'captions' | 'whisper-groq' | 'whisper-openai'
  frames_analyzed int,
  raw_report text,                 -- full /watch output for re-analysis
  watched_at timestamptz default now(),
  unique (source, external_id),
  check (external_id is not null or content_hash is not null)
);
```

Receiving agent: cross-check the namespace (bare `public` vs. dedicated schema) against existing migrations before writing this. Check `supabase/migrations/` for the prevailing convention.

### Experiment 4: Wire into Trending Panel

When user clicks expand on a Short, if no `video_breakdowns` row exists, show a "Watch this" button. Button invokes a server action that either:

- (a) hits a queue table the user manually drains via Claude Code, or
- (b) calls a `/api/watch` route that shells out (only works locally, not on Vercel — see Phase C).

**(a) is the right move for Phase A** — it keeps `/watch` invocation inside Claude Code where it works, while building UX that's ready for the Phase C automation.

### Experiment 5: Feed breakdowns into Lab Strategist prompt

If Lab is in flight by the time Experiments 1–4 land, the Strategist's prompt template gets a `reference_breakdowns` block. Easy retrofit if Lab ships first; concurrent if not.

---

## Phase B — Lab integration (during Plan #3)

If Lab is being built around the same time, two specific touchpoints:

1. **Strategist input.** Add a step before the Strategist runs that queries `video_breakdowns` filtered to the topic's niche, ordered by `watched_at desc`, limit 5. Inject them into the Strategist's user message as structured reference patterns. The Strategist's existing `decisions` row gets a `references_used` array field added.

2. **Director input.** Same pattern — query the same 5 breakdowns, present `visual_style` blocks to the Director. The Director's enum of 6 visual_treatments doesn't change; the *reasoning* for picking one becomes evidence-based.

Both touchpoints are pure prompt enrichment — they don't change the orchestration shape Lab's design doc spec'd out. The breakdowns just become richer context.

---

## Phase C — Productionization (after Plan #4)

Once the manual data set is proving its value, the question is: how do we run the `/watch` pipeline without a human in the loop?

The pipeline has four pieces:

### yt-dlp

- **Local CLI binary.** Not pre-installed on Vercel Functions.
- **Options:**
  1. **Vercel Sandbox (GA Jan 2026).** Ephemeral Firecracker microVM, can `apt-get install yt-dlp ffmpeg`, run pipeline, return output. Clean isolation, no binary-on-Function constraints. **Best fit.**
  2. **Bundle as Python dep.** `yt-dlp` ships as pure-Python, runs on Vercel's Python 3.13/3.14 runtime (Fluid Compute). Smaller blast radius than Sandbox but no ffmpeg.
  3. **External worker.** Fly.io / Railway always-on box. Overkill.

### ffmpeg

- **Native binary.** Not on Vercel Functions by default.
- **Options:**
  1. **Vercel Sandbox** — `apt-get install ffmpeg` in the VM.
  2. **`@ffmpeg-installer/ffmpeg` npm package** — ships a static binary. Works on Vercel Functions for small jobs but has size limits.
  3. **External worker** (as above).

### Whisper API call

- Trivial. HTTPS POST. Works anywhere.

### Claude vision call (the frame analysis)

- Today this happens "inside Claude Code." For productionization, becomes a direct AI SDK call via the AI Gateway:

```ts
import { generateText } from 'ai';

const result = await generateText({
  model: 'anthropic/claude-haiku-4.5',  // via Vercel AI Gateway
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: HOOK_BREAKDOWN_PROMPT },
      { type: 'text', text: `Transcript:\n${transcript}` },
      ...frames.map(path => ({
        type: 'image',
        image: fs.readFileSync(path),
      })),
    ],
  }],
});
```

**Recommended Phase C architecture:**

```
Vercel Cron (every N min)
       │
       ▼
SELECT urls FROM video_watch_queue WHERE status='pending' LIMIT 5
       │
       ▼
For each url:
  ─► Vercel Sandbox: yt-dlp + ffmpeg, returns frames + transcript
       │
       ▼
  ─► AI SDK call (Claude Haiku 4.5 via AI Gateway) with frames + transcript
       │
       ▼
  ─► INSERT INTO video_breakdowns
       │
       ▼
  ─► UPDATE video_watch_queue SET status='done'
```

**Why Vercel Sandbox over bundling binaries:** Sandboxes are ephemeral, isolated, can run untrusted code (and yt-dlp parsing arbitrary URLs is exactly that — it executes JS challenges from the source site). Per the Vercel knowledge updates, Sandbox is GA since Jan 2026 and built for this kind of pipeline.

**Cost ceiling:** rate-limit at the cron handler. At ~$0.50/Short × 5/hour × 24h = ~$60/day worst case. Tune down based on actual signal value.

---

## Risks / caveats / what `/watch` can't do

- **Frame budget is duration-driven, not content-driven.** A 3-min video with 40 cuts and a 3-min video with 1 cut get the same number of frames. For Shorts (≤60s) this is fine.

- **Whisper has a 25 MB upload limit.** Long audio clips (>~50 min mono 16kHz) fail. Not an issue for Shorts.

- **Login-walled / region-locked content fails.** yt-dlp can't auth most platforms. Won't get private Loom links, age-gated YouTube, etc.

- **TikTok specifically can be flaky.** yt-dlp's TikTok extractor breaks every few months when TikTok rotates anti-scrape. The existing TikAPI integration (per README) is the reliable TikTok path — yt-dlp should be treated as the YouTube path. For Phase C, route TikTok through TikAPI and only use yt-dlp for YouTube.

- **The `/watch` skill is for Claude Code, not for production.** Phase C requires reimplementing the pipeline (or calling its scripts directly) from server code. The skill itself is the spec; not the deployable.

- **Caption quality varies.** YouTube auto-captions are usable but imperfect, especially for fast speakers. For high-stakes analysis, force `--whisper groq` to get Whisper transcription regardless.

- **Brad's "free Groq tier" claim.** True today (2026-05-25). Groq's pricing has changed before. Don't bake "free transcription forever" into the long-term cost model.

- **No video model under the hood.** `/watch` doesn't understand motion — it sees frames, not movement. For Shorts where pacing matters, dense frame extraction (focused mode, 2 fps) is a close enough approximation, but it's not the same as a true video model. Mostly fine for hook analysis; possibly limiting for "what's the energy of this clip" type questions.

---

## Decision points / open questions for the receiving agent

1. **Trending Panel breakdown storage** — where do the existing "lazy Claude breakdowns" go? If they're already persisted, extend; if not, the `video_breakdowns` table is net new.

2. **Schema namespace** — does this table belong under `public`, an `intel` schema, or somewhere else? Check existing migration conventions in `supabase/migrations/`.

3. **Niche linkage** — the schema sketch references `niches(slug)`. Confirm that's the right FK shape against the actual `niches` table.

4. **Lab timing** — Plan #3 is "Awaiting operator review before implementation plan" per the Lab design doc. If the operator approves Lab soon, Phase A and Phase B can run concurrently and the Strategist/Director land with reference-breakdown support from day one. If Lab is paused, Phase A runs alone and Phase B becomes a Plan #3.5 retrofit. **Receiving agent: confirm Lab's status before sequencing the work.**

5. **AI Gateway model choice** — Haiku 4.5 for the vision/transcript synthesis call vs. Sonnet 4.6 for higher quality. Lab's Writer already uses Sonnet 4.6. Worth A/B-ing on 10 reference Shorts before committing. Vision quality matters a lot here — Sonnet may be worth the cost.

6. **Phase B trigger** — what's the threshold to invest in Phase C? Suggest: when manual `/watch` usage has populated ≥50 `video_breakdowns` rows AND a clear quality bar exists in the resulting Strategist/Director outputs.

7. **TikTok path** — confirm yt-dlp's TikTok extractor works right now, or whether productionization should route TikTok exclusively through TikAPI.

---

## Recommended first move

Don't start with code. Start with a manual `/watch` pass on the top 3 trending Shorts currently in the Topic Queue (one niche). Drop the raw outputs into this doc as appendices. Use them to:

1. Decide whether the structured prompt in Experiment 1 produces JSON-shaped output worth persisting.
2. Lock down the `video_breakdowns` schema fields based on what the actual outputs look like, not what we think they'll look like.
3. Then — and only then — write the migration and the first Trending Panel integration.

"Data shape first, schema second, code third." Don't invert it.

---

## References

- Plugin repo: https://github.com/bradautomates/claude-video
- Local install: `~/.claude/skills/watch/`
- Skill manifest: `~/.claude/skills/watch/SKILL.md`
- Demo video that prompted this proposal: https://www.youtube.com/watch?v=QZMljuD10sU
- Groq Whisper docs: https://console.groq.com/docs/speech-to-text
- Vercel Sandbox docs: https://vercel.com/docs/sandbox
- AI SDK vision messages: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#image-input
- The Lab design (Plan #3): `docs/superpowers/specs/2026-05-24-shorts-os-the-lab-design.md`
- Studio Cockpit MVP design (Plan #2): `docs/superpowers/specs/2026-05-24-shorts-os-studio-cockpit-mvp-design.md`

---

## Appendix A — Experiment 1 raw outputs (2026-05-25)

Three YouTube Shorts from the `ai-explained` niche in `public.viral_observations`, each run through `/watch` with a structured hook-anatomy prompt. Picks were the top 3 by view count after excluding non-Short-length items (the OpenAI Hide & Seek video at 178s was filtered out).

The `pacing_cuts_first_3sec`, `on_screen_text_density`, `genre`, and `pattern_interrupt_at_sec` fields all varied non-trivially across the 3 — meaningful signal, not just noise.

### Subject 1 — Jaden Williams · "ChatGPT, hack into the Pentagon" (74s, 14.3M views)

- `viral_observations.id`: `1e654b6b-ce0d-406c-8939-f3616b0100f3`
- URL: https://www.youtube.com/shorts/9eO-LqtoGps
- Transcript source: native captions
- Frames analyzed: 60 @ 0.81 fps (full mode)

```json
{
  "opening_visual": "Single actor in iPhone selfie framing with ChatGPT logo overlaid on chest; warm indoor backdrop",
  "opening_words": "I'm the new ChatGPT agent!",
  "pattern_interrupt_at_sec": 2,
  "pattern_interrupt_description": "Hard costume-cut from ChatGPT character to a tinfoil-hat-wearing 'paranoid user' asking ChatGPT to hack the Pentagon",
  "hook_summary": "Sets up a wholesome AI-assistant persona for 2 seconds, then cuts to a tinfoil-hat user making an absurd request that the AI immediately and earnestly complies with — the comedy is the gap between AI's helpful framing and what it agrees to do.",
  "on_screen_text_density": "high",
  "pacing_cuts_first_3sec": 1,
  "visual_style": "iPhone selfie + costume-swap two-hander, single actor playing both roles, ChatGPT-logo overlay as identity tag",
  "genre": "skit"
}
```

### Subject 2 — Anton Pidkuiko · "Two AI agents on a phone call realize they're both AI" (70s, 12.0M views)

- `viral_observations.id`: `e7290331-c30e-479f-b859-f928508c10c2`
- URL: https://www.youtube.com/shorts/EtNagNezo8w
- Transcript source: Whisper (Groq) — no native captions
- Frames analyzed: 60 @ 0.85 fps (full mode)

```json
{
  "opening_visual": "Locked-down wide product shot: MacBook screen showing a pulsing blue orb beside an iPhone showing a red orb, on a wooden desk. No motion, no host on screen.",
  "opening_words": "(silence for ~1s, then) Thanks for calling Leonardo Hotel. How can I help you today?",
  "pattern_interrupt_at_sec": 14,
  "pattern_interrupt_description": "The receiving AI realizes the caller is also an AI and proposes 'switching to gibber link mode' — the two devices then switch to modem-like audio handshake sounds, which is the viral payoff.",
  "hook_summary": "Withholds the punchline by opening on an ordinary-sounding business call between two AI agents, letting the viewer notice the absurdity themselves over 14 seconds before the AIs explicitly switch to a machine-only language.",
  "on_screen_text_density": "low",
  "pacing_cuts_first_3sec": 0,
  "visual_style": "Locked-down wide product shot of two devices, color-coded speaker captions (blue=Mac, red=phone), zero camera movement, zero cuts",
  "genre": "tech_demo"
}
```

### Subject 3 — Dan Martell · "AI Tools for every task in 2026" (17s, 10.1M views)

- `viral_observations.id`: `d61dcf5f-9e36-47f3-bf48-3a7f4d22fa7e`
- URL: https://www.youtube.com/shorts/UH0pqsq2i80
- Transcript source: Whisper (Groq) — but transcript is the lyrics of Stromae's "Papaoutai" (French backing track), not narration
- Frames analyzed: 17 @ 1.01 fps (full mode)

```json
{
  "opening_visual": "Locked-down medium shot: host in blue T-shirt at a whiteboard. Title 'Writing' at top; rows 'Bad:' (red), 'Good:' (yellow), 'Best:' (green). ChatGPT icon resolved on Bad row; Good and Best rows show blurred placeholder icons. Host pointing.",
  "opening_words": "(no narration — Stromae's 'Papaoutai' as backing track. On-screen text only.)",
  "pattern_interrupt_at_sec": null,
  "pattern_interrupt_description": "No single interrupt — uses a recurring micro-payoff structure: every ~3-4 seconds a new category title appears and three apps progressively un-blur on Bad/Good/Best rows. The 'hook' is the implied controversy of each ranking (e.g. Claude ranked above ChatGPT for writing), which is what drives comments.",
  "hook_summary": "Inverts the standard listicle by withholding the verdict via blurred icons, then rhythmically un-blurring them on the beat — every Bad→Good→Best reveal is a small dopamine hit, and the ranking itself is contrarian enough to drive engagement.",
  "on_screen_text_density": "high",
  "pacing_cuts_first_3sec": 0,
  "visual_style": "Locked-down medium shot in front of whiteboard, sticker-style category title, color-coded Bad/Good/Best row labels, animated icon reveals over blurred placeholders, song-synced beat",
  "genre": "listicle"
}
```

### Observations across the 3 (= schema implications)

1. **`pattern_interrupt_at_sec` cannot be NOT NULL.** Subject 3 (listicle) has no single interrupt — its structure is rhythmic micro-reveals. Schema should keep this nullable and pair it with `pattern_interrupt_description` so the structural type is captured even when timing isn't.

2. **`opening_words` is sometimes literal silence or non-language.** Subject 2 opens silent then narrates; Subject 3 has only a non-English song (and Whisper happily transcribed it, which is technically correct but useless as "hook copy"). The field is more accurate as `opening_audio` or `opening_words_or_audio_description` — what hits the viewer's ears in second 0, including "silence" or "instrumental music." If kept as `opening_words`, allow empty string and document the convention.

3. **The `genre` enum from the experiment held up.** All 3 picks fell cleanly into `skit | tech_demo | listicle`. Worth keeping. `explainer | reaction | other` haven't been tested yet.

4. **`pacing_cuts_first_3sec` is a strong signal.** Subject 1 = 1 cut (skit pivot), Subjects 2 + 3 = 0 cuts. Counter-intuitive: two of the three viral hooks have *zero* cuts in the first 3 seconds. This is actually evidence the Director's bias toward "1 visual change every 3–5 seconds" (per Plan #3 spec line 285) may be wrong for some Shorts — sometimes the best hook is a held shot with the *content* changing (on-screen text, audio reveals).

5. **`visual_style` is too freeform to be useful as-is.** The three values came out as long prose. To be queryable, this needs to be either (a) an enum of treatments like Plan #3's `VISUAL_TREATMENTS` constant, or (b) a structured object with discrete fields: `camera_setup` (selfie | locked-medium | product-shot | …), `host_on_screen` (boolean), `overlay_style` (caption-burned | sticker-labels | none), etc. The freeform string version is fine for human reading but won't help the Director agent pick a treatment.

6. **Whisper-Groq fallback worked transparently on Subjects 2 and 3** — no native captions, audio extracted and transcribed in seconds. The cost claim ("effectively free for typical Shorts volumes") held for this run.

7. **The `transcript` field needs a `transcript_language` field.** Subject 3's transcript came back in French (song lyrics, not narration). Without a language flag, downstream agents could be fed irrelevant lyrics as if they were "what the creator said."

8. **`raw_report` (the full /watch output) is bigger than expected.** Each report includes ~60 frame paths × ~80 chars + transcript + metadata = ~5–8 KB. Fine for `text` column. Don't try to compress.

### Suggested schema diff vs. the proposal's Experiment 3 sketch

```sql
-- vs. proposal lines 257-274:
create table public.video_breakdowns (
  id uuid primary key default uuid_generate_v4(),
  viral_observation_id uuid references public.viral_observations(id) on delete cascade,  -- NEW: primary FK for trending-row lookup
  niche_id uuid references public.niches(id) on delete set null,    -- CHANGED: was niche_slug → niches(slug); repo uses id everywhere
  source text not null check (source in ('youtube', 'tiktok', 'reddit', 'instagram', 'local')),
  external_id text,
  url text,
  duration_sec int,
  hook_structure jsonb not null,            -- holds the structured fields from this experiment
  visual_style jsonb not null,              -- STRUCTURED object, not freeform string (per observation 5)
  transcript text,
  transcript_source text check (transcript_source in ('captions', 'whisper-groq', 'whisper-openai', 'none')),
  transcript_language text,                 -- NEW: e.g. 'en', 'fr' — observation 7
  frames_analyzed int,
  raw_report text,
  watched_at timestamptz not null default now(),
  unique (source, external_id),
  check (viral_observation_id is not null or (external_id is not null))
);

create index video_breakdowns_viral_obs_idx on public.video_breakdowns (viral_observation_id);
create index video_breakdowns_niche_watched_idx on public.video_breakdowns (niche_id, watched_at desc);
```

Key differences from the proposal:
- `public.` schema (no new `intel` schema — matches the 14 existing migrations)
- `niche_id uuid` references `niches(id)`, not `niche_slug → niches(slug)`
- Added `viral_observation_id` FK so the existing `/api/trending/[id]/explain` route can lookup directly
- `hook_structure` and `visual_style` both NOT NULL since every breakdown produces them
- Added `transcript_language`
- Dropped `content_hash` since `viral_observation_id OR external_id` covers all cases

### Next concrete step

The schema above is grounded in real outputs. Worth one more validation pass: rerun this experiment on 3 Shorts from a *different* niche (when the scrapers add one) to make sure the field set generalizes beyond `ai-explained`. After that, write the migration and wire `/api/trending/[id]/explain` to check the table first and fall back to today's metadata-only Haiku call when no breakdown exists.
