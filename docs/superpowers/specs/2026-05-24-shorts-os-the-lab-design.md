# Shorts OS — The Lab (Plan #3 design)

**Status:** Design draft 2026-05-24. Awaiting operator review before implementation plan.
**Predecessor:** [Studio Cockpit MVP](./2026-05-24-shorts-os-studio-cockpit-mvp-design.md), live at `https://shorts-os-roan.vercel.app/`.
**Successor:** Plan #4 — Render pipeline (actual TTS audio via Cartesia/ElevenLabs, b-roll fetching from Pexels/Storyblocks, ffmpeg compose). Plan #5 — Upload + format-variation enforcement.

---

## 1. Goal & Done-When

A live agent pipeline at `/lab` that turns a reviewed topic into a saved `your_videos` draft. Operator clicks "Dispatch to Strategist" on a reviewed topic → watches the four agents (Strategist, Writer, Voice Coach, Director) assemble the draft in front of them in 30–90 seconds → reviews the draft → optionally re-dispatches.

**Done when:** Darius opens `/lab` on `https://shorts-os-roan.vercel.app/`, picks one of the reviewed topics from the top pane, clicks **Dispatch**. He then sees:

1. The 4 agent chips at the top of the page light up in sequence (Strategist green → Writer green → Voice Coach green → Director green).
2. The Writer's script streams token-by-token into the middle of the page over ~10–25 seconds.
3. The Voice Coach card fills in with the chosen voice + reasoning.
4. The Director card fills in with the visual treatment + shot list.
5. The completed draft slides into a "Recent Drafts" pane at the bottom.
6. Clicking the draft expands it inline to re-read the script, voice choice, and shot list.

In parallel, the existing Cockpit (at `/`) shows the same four agents going from `idle` → `working` → `idle` in its Team Status sidebar, because all that data is written to the database and the sidebar already subscribes to it.

---

## 2. Scope

### 2.1 In scope

1. **Strategist agent** — receives a topic + channel, decides the angle/dispatch directive, logs it. Real Claude call.
2. **Writer agent** — receives the dispatch + persona, streams a 45–60 second faceless YouTube Shorts script word-by-word via Claude Sonnet 4.6. Real Claude call.
3. **Voice Coach agent** — picks a voice ID from a **curated pool of 6 voices** (3 Cartesia + 3 ElevenLabs) based on the script + persona. Real Claude call, but does NOT actually call the TTS provider — that's Plan #4.
4. **Director agent** — picks a visual treatment from a **curated enum of 6 treatments**, decides music mood, and produces a shot list (4–12 segments, each with a search query for stock footage Plan #4 will fetch). Real Claude call.
5. **Lab UI at `/lab`** — three panes: Ready to Dispatch (top) / Active Run (middle, only during a run) / Recent Drafts (bottom).
6. **One seeded channel** — placeholder `default` channel inserted via SQL migration so the pipeline has a persona to read.
7. **Database writeback** — every Lab run writes to `jobs`, `agent_messages`, `decisions`, and `agents.current_state` so the existing Cockpit Team Status sidebar lights up automatically.
8. **Orchestration via SSE** — one long-running API route runs the 4 agents in sequence and streams events to the Lab UI over a single open connection.
9. **Tests** for repositories and agent runners (mocked Claude). No UI snapshot tests.

### 2.2 Explicitly out of scope (deferred)

- **Cartesia / ElevenLabs API calls** — Voice Coach picks the voice; Plan #4 actually generates the audio file.
- **Pexels / Storyblocks fetching** — Director writes search queries; Plan #4 actually fetches the clips.
- **ffmpeg video render** — Plan #4 or Plan #5.
- **YouTube upload / OAuth** — Plan #5.
- **Format-variation enforcement** — the Strategist's seeded prompt mentions it as "survival, not preference" but we have zero historical videos to compare against, so we skip the check. Director's chosen `visual_treatment` IS stored on `your_videos.visual_treatment` so the data exists for Plan #5 to start enforcing.
- **Multi-channel** — Plan #3 hardcodes the one seeded `default` channel as the target. A real Channel Manager (multi-channel CRUD + persona editor) is a future plan.
- **Cost meter wiring** — the Cockpit's top bar still shows static `$0.00 today`. Real spend tracking is a separate plan.
- **Decision Explainer panels in the Cockpit** — `decisions` table will fill up with rows, but Plan #3 doesn't build a UI to browse them.
- **Pipeline graph (React Flow)** — the linear 4-step pipeline doesn't need a node-graph library; a sticky strip of 4 chips is enough.
- **Durable workflows / retries** — if the connection drops mid-run, the run dies and the operator clicks Dispatch again. No background-job survival.
- **Channel persona editor** — operator hand-edits the seeded channel's persona JSONB via Supabase Studio for now.

---

## 3. User Experience

### 3.1 The Lab daily flow

1. Darius finishes morning Cockpit triage (approves 2–3 topics from the Topic Queue — those become `topic_queue.state='reviewed'`).
2. Clicks **Lab** in the top bar.
3. `/lab` loads. Top pane shows the 2–3 reviewed topics, each with a `Dispatch` button. Bottom pane shows the last 10 drafts from prior days.
4. Picks the most interesting reviewed topic. Clicks **Dispatch**.
5. Top pane collapses. Middle pane appears: a sticky strip of 4 agent chips at the top, four output cards stacked below.
6. The Strategist chip turns amber (`thinking`) for ~1 second, then green (`done`), and its card fills with the dispatch directive.
7. The Writer chip turns amber, then green, and its card starts streaming the script text token-by-token. Word count + estimated duration update live.
8. When Writer finishes, Voice Coach chip activates. ~1 sec. Card fills with voice choice + reasoning.
9. Director chip activates. ~2 sec. Card fills with visual treatment + shot list.
10. All chips done. The Active Run pane animates into a saved draft and slides into the top of Recent Drafts.
11. Darius reads the script. Either he's happy, or he clicks **Re-dispatch** on the same topic to try again, or he clicks **Discard**.
12. Closes laptop. Total time: 1–2 minutes per dispatch.

### 3.2 Visual aesthetic

Reuses Plan #2's design tokens (dark surfaces, electric green for active, amber for thinking, mono font for numbers/timestamps). Reuses the same UI primitives (shadcn for base components, Aceternity for `moving-border` / `spotlight`, Magic UI for `number-ticker` / `border-beam`).

Specific Lab applications:
- **Pipeline strip chip — active state:** Aceternity `moving-border` around the chip.
- **Pipeline strip chip — just-completed flash:** Magic UI `border-beam` one-shot.
- **Writer card word counter:** Magic UI `number-ticker` updates as new tokens arrive.
- **Streaming text caret:** simple blinking cursor at the end of the appended script.
- **Failure card:** red accent border, no motion (intentionally jarring).
- **Empty Ready pane:** "No topics reviewed yet. Approve some in the [Cockpit](/) first." with a link back.

### 3.3 The Cockpit's free upgrade

The Cockpit's `TeamStatusSidebar` (built in Plan #2) already subscribes to the `agents` table via Supabase Realtime. Plan #3's orchestrator updates `agents.current_state` (`idle` → `thinking` → `working` → `idle`) as it runs each agent. The sidebar automatically reflects this without any Plan #3 code touching Cockpit components.

---

## 4. Architecture

### 4.1 The orchestration model

**Technology:** Server-Sent Events (SSE — a one-way live stream from the server to the browser, HTTP-native, no WebSockets). The browser uses `EventSource` to read events from `/api/lab/dispatch`. The server route streams a `text/event-stream` response.

**Compute target:** Vercel Functions on Fluid Compute (default Node.js runtime, 300-second default timeout). Pipeline target is ≤90 seconds total, so timeout is not a concern.

**Concurrency:** **Exactly one** Lab run at a time across the whole system. Before opening the stream, the dispatch route checks for any `jobs` row with `kind='produce_video'` AND `status IN ('queued','running')`. If one exists, the route returns 409 Conflict and the Dispatch button stays disabled. (The button also polls `/api/lab/jobs/active` every 5 seconds to keep its disabled state accurate across multiple open tabs.)

### 4.2 SSE event protocol

```
event: job_started
data: { jobId: string, topicId: string, channelId: string, startedAt: ISO8601 }

event: agent_state
data: { agent: 'strategist'|'writer'|'voice_coach'|'director', state: 'thinking'|'working'|'idle' }

event: agent_output
data: { agent: 'strategist'|'voice_coach'|'director', output: <agent-specific JSON> }
// NOTE: Writer does NOT emit agent_output during streaming.
// Writer emits writer_chunk events, then on completion emits agent_output with the full parsed result.

event: writer_chunk
data: { text: string }   // raw token text. Many of these per run.

event: agent_done
data: { agent: 'strategist'|'writer'|'voice_coach'|'director', durationMs: number }

event: job_completed
data: { videoId: string }   // the new your_videos.id

event: job_failed
data: { agent: 'strategist'|'writer'|'voice_coach'|'director', error: string }
```

Event ordering for a successful run: `job_started` → (for each of the 4 agents in order: `agent_state:thinking` → `agent_state:working` → [Writer only: many `writer_chunk`] → `agent_output` → `agent_done`) → `job_completed` → connection closes.

Event ordering for a failed run: same up to the failing agent → `job_failed` → connection closes. No `job_completed`.

### 4.3 Data flow

**Database writeback during a run:**
- At start: `INSERT INTO jobs (kind='produce_video', status='running', topic_queue_id, channel_id, current_step='strategist', current_agent='strategist', started_at=now())`. Returns `jobId`.
- Before each agent runs: `UPDATE agents SET current_state='thinking', current_task='Dispatching topic X' WHERE id='<agent>'`, then `UPDATE jobs SET current_agent='<agent>', current_step='<agent>', progress_pct=...`.
- After each agent finishes: `INSERT INTO agent_messages (from_agent, to_agent, job_id, intent, payload)` + `INSERT INTO decisions (agent_id, job_id, decision_type, inputs, chosen, reasoning)` + `UPDATE agents SET current_state='idle', current_task=NULL`.
- On success: `INSERT INTO your_videos (channel_id, topic_queue_id, title, script, voice_provider, voice_id, visual_treatment, status='draft')` + `UPDATE jobs SET status='succeeded', progress_pct=100, finished_at=now()` + emit `job_completed`.
- On failure: `UPDATE jobs SET status='failed', error='<message>', finished_at=now()` + reset the failing agent to idle + emit `job_failed`. No `your_videos` row is created.

**Cockpit auto-update:**
- Cockpit's `TeamStatusSidebar` already subscribes to `postgres_changes` on `agents`. The state updates above fan out via Realtime to any open Cockpit tab — no Plan #3 cockpit code changes needed.

**Reads from the Lab page:**
- Server Component fetches initial Ready-to-Dispatch list (reviewed topics) and Recent Drafts list at page load.
- Client polls `/api/lab/jobs/active` every 5s for "is a job running?" — used to keep the Dispatch button correctly disabled across tabs.

### 4.4 Failure & retries

- Each agent runner wraps its Claude call in try/catch.
- Any thrown error → orchestrator catches, updates DB (jobs.status='failed', error column), emits `job_failed` event, closes stream.
- Failed runs leave NO `your_videos` row. The `jobs` row is preserved as a record (status='failed') so you can audit failures via Supabase.
- The reviewed topic stays in `state='reviewed'` (not consumed). Operator can re-dispatch immediately.
- Validation errors (e.g., Voice Coach picks a `voice_id` not in the pool) are caught by Zod and surface as the same agent failure.

---

## 5. Components

### 5.1 File structure

```
src/app/
├── lab/
│   └── page.tsx                       # MODIFIED — replaces placeholder; 3-pane layout
└── api/lab/
    ├── dispatch/route.ts              # NEW — POST, opens SSE, runs orchestrator
    ├── drafts/route.ts                # NEW — GET, lists recent your_videos (status='draft')
    └── jobs/active/route.ts           # NEW — GET, returns current running job if any

src/components/lab/                    # NEW — all Lab-specific composed components
├── ready-to-dispatch-pane.tsx        # Server: lists reviewed topics with Dispatch button
├── dispatch-button.tsx               # Client: opens EventSource on click
├── active-run-pane.tsx               # Client: orchestrates the live view, owns the EventSource
├── pipeline-strip.tsx                # 4 agent chips with state badges
├── strategist-card.tsx               # Output card for Strategist
├── writer-card.tsx                   # Streaming text + word/duration counter
├── voice-coach-card.tsx              # Voice pick + reasoning
├── director-card.tsx                 # Treatment + shot list
├── recent-drafts-pane.tsx            # Server: last 10 your_videos status='draft'
└── draft-row.tsx                     # Client: click to expand inline

src/lib/agents/                       # NEW — agent runners + orchestrator
├── types.ts                          # Shared: AgentRunContext, StreamEvent, agent output schemas
├── constants.ts                      # VISUAL_TREATMENTS, VOICE_POOL enums
├── strategist.ts                     # runStrategist(ctx)
├── writer.ts                         # runWriter(ctx) — async generator yielding tokens
├── voice-coach.ts                    # runVoiceCoach(ctx)
├── director.ts                       # runDirector(ctx)
└── orchestrator.ts                   # The pipeline driver — calls the 4 in order, emits events, writes DB

src/lib/supabase/repositories/        # NEW additions to existing folder
├── channels.ts                       # NEW — getDefaultChannel(), listChannels()
├── jobs.ts                           # NEW — createJob, updateJobStatus, getActiveJob, finishJob
├── agent-messages.ts                 # NEW — recordMessage
├── decisions.ts                      # NEW — recordDecision
├── your-videos.ts                    # NEW — createDraft, listRecentDrafts
├── topic-queue.ts                    # MODIFIED — add listReviewedTopics()
└── agents.ts                         # MODIFIED — add updateAgentState()

supabase/migrations/
└── 20260525000001_seed_default_channel.sql   # NEW — inserts one placeholder channel

src/tests/
├── lib/agents/
│   ├── strategist.test.ts
│   ├── voice-coach.test.ts
│   ├── director.test.ts
│   └── orchestrator.test.ts          # Verifies sequencing + DB writeback + failure path
└── lib/supabase/repositories/
    └── {channels,jobs,agent-messages,decisions,your-videos}.test.ts
```

### 5.2 File-responsibility conventions (continued from Plan #2)

- `src/components/ui/*` — third-party copy-paste pool (shadcn/Aceternity/Magic UI). Never edited directly.
- `src/components/lab/*` — Lab composition. Composes `ui/*` primitives. Plain-English comments at top of each file explaining what the component does for a non-coder reader.
- `src/lib/agents/*` — server-only. Each agent file is `import "server-only"` at the top. No browser code touches this folder.
- `src/lib/supabase/repositories/*` — server-only. Mocked in unit tests.
- Server Components by default; `"use client"` only for the panes that own the EventSource or expand-on-click behavior.

### 5.3 Key component behaviors

**`ReadyToDispatchPane` (server):**
- Fetches `listReviewedTopics(supabase, limit=20)` at request time.
- Renders one `<DispatchRow>` per topic.
- Each row: hookability score · title · niche · source badge · `<DispatchButton topicId={topic.id} />`.
- Empty state: "No topics reviewed yet. Approve some in the Cockpit first." with link to `/`.

**`DispatchButton` (client):**
- On mount, polls `/api/lab/jobs/active` every 5s.
- If active job exists → button is disabled with tooltip "A run is already in progress — wait for it to finish or refresh the active tab."
- On click: POSTs to `/api/lab/dispatch` with `{ topicId }`, immediately notifies parent to switch to active-run mode and pass the open `EventSource` (well, technically `fetch` with streaming response since `EventSource` doesn't support POST — we'll use a `ReadableStream` reader pattern, but the operator-facing model is "open a live stream").

**`ActiveRunPane` (client):**
- Owns the streaming `fetch` reader.
- Maintains local state: `{ strategist: {state, output}, writer: {state, streamedText, output}, voiceCoach: {state, output}, director: {state, output}, failure: null }`.
- On each event: updates the relevant slot.
- When `job_completed` arrives: brief 1s fade transition, then notifies parent to refresh Recent Drafts and clear the active-run state.
- When `job_failed` arrives: shows the failed agent card in red with the error string + an inline `Re-dispatch` button that re-POSTs to `/api/lab/dispatch` with the same `topicId`.

**`WriterCard` (client):**
- Displays the accumulated `streamedText` in a monospace-ish but readable typography block.
- Blinking caret at the end while `state='working'`.
- Below: word count (`<NumberTicker value={wordCount} />`) and estimated duration in seconds (`wordCount / 2.5`).
- When `agent_output` for writer arrives, replaces the accumulated text with the canonical `output.script` (should match, but the canonical version wins).

**`PipelineStrip` (client):**
- 4 chips, fixed order: Strategist, Writer, Voice Coach, Director.
- Each chip: emoji (from agent row) + name + state badge.
- Active chip wrapped in `<MovingBorder>` from Aceternity.
- Just-completed chip plays a one-shot `<BorderBeam>` from Magic UI (300ms).
- Sticky to top of the Active Run pane.

**`RecentDraftsPane` (server):**
- Fetches `listRecentDrafts(supabase, limit=10)` at request time.
- Re-renders when the Active Run pane signals completion (the page is RSC + a small client island that triggers a `router.refresh()` after `job_completed`).

**`DraftRow` (client):**
- Collapsed: timestamp · title · niche · voice ID · "Click to expand".
- Expanded: full script · voice card · shot list table · `Re-dispatch` button (recreates job from same topic) · `Discard` button (sets `your_videos.status='failed'`, no real delete).

---

## 6. The Agents

All agents use the existing `getClaudeModel(modelId)` helper from Plan #1 and use the AI SDK v6 (`generateObject` for structured output, `streamText` for the Writer's live tokens).

### 6.1 Shared types

```ts
// src/lib/agents/types.ts
export type AgentId = 'strategist' | 'writer' | 'voice_coach' | 'director';

export type AgentRunContext = {
  job: Job;                          // the jobs row
  topic: QueuedTopic;                // the topic_queue row
  channel: Channel;                  // the seeded default channel row
  previousOutputs: {
    strategist?: StrategistOutput;
    writer?: WriterOutput;
    voiceCoach?: VoiceCoachOutput;
  };
};

export type StreamEvent =
  | { type: 'job_started';  data: { jobId: string; topicId: string; channelId: string; startedAt: string } }
  | { type: 'agent_state';  data: { agent: AgentId; state: 'thinking'|'working'|'idle' } }
  | { type: 'agent_output'; data: { agent: AgentId; output: unknown } }
  | { type: 'writer_chunk'; data: { text: string } }
  | { type: 'agent_done';   data: { agent: AgentId; durationMs: number } }
  | { type: 'job_completed'; data: { videoId: string } }
  | { type: 'job_failed';   data: { agent: AgentId; error: string } };
```

### 6.2 Strategist — Claude Haiku 4.5

**Model:** `claude-haiku-4-5` (cheap, fast, synthesis task).
**Method:** `generateObject` with Zod schema.

**Input:** `{ topic, channel }` from context.

**Output schema:**
```ts
export const StrategistOutputSchema = z.object({
  dispatch_directive: z.string().min(20).max(400),  // 1-2 sentences for the Writer
  format_hints: z.array(z.string()).min(1).max(5),  // e.g., ["open with a year", "single surprising claim"]
  selected_channel_id: z.string().uuid(),
  rationale: z.string().min(20).max(600),
});
export type StrategistOutput = z.infer<typeof StrategistOutputSchema>;
```

**Prompt skeleton** (final wording authored during implementation):
> You are The Strategist. You're assigning a video topic to The Writer.
> Topic: `<title>` — `<summary>`
> Channel: `<display_name>` — Persona: `<persona JSON>`
> Output: a dispatch directive (1-2 sentences for the Writer), format hints (concrete writing constraints), and your rationale. Pick the angle that best fits the channel persona AND maximizes hookability.

**DB writeback after success:**
- `agent_messages` row: `from='strategist', to='writer', intent='dispatch', payload=<output>`
- `decisions` row: `agent_id='strategist', decision_type='topic_dispatch', inputs={topic, channel}, chosen=<output>, reasoning=output.rationale`

**Expected latency:** ~1–2 seconds.

### 6.3 Writer — Claude Sonnet 4.6 (streaming)

**Model:** `claude-sonnet-4-5` (note: gateway helper currently lists this — bump to `claude-sonnet-4-6` at impl time if the gateway is updated).
**Method:** `streamText` (raw text streaming, not structured object) + post-processing to extract fields.

**Why not `streamObject`:** `streamObject` is good for incrementally building structured JSON. We want the Writer's output rendered live as flowing prose, not as a partially-typed JSON object. So we use `streamText` for raw narration text, then derive the structured fields (`script`, `hook_first_3_seconds`, `word_count`, `estimated_duration_seconds`) deterministically from the final text after the stream completes.

**Input:** `{ topic, channel, previousOutputs.strategist }`.

**Output schema (post-processed from the streamed text):**
```ts
export const WriterOutputSchema = z.object({
  script: z.string().min(200).max(2500),
  hook_first_3_seconds: z.string().min(10).max(200),       // first sentence of script
  word_count: z.number().int().min(50).max(400),
  estimated_duration_seconds: z.number().min(20).max(120), // word_count / 2.5
});
export type WriterOutput = z.infer<typeof WriterOutputSchema>;
```

**Streaming shape:** `runWriter` is an `async function*` that:
1. Calls `streamText({ model, prompt })`.
2. For each text delta yielded by the stream, `yield { type: 'chunk', text }`.
3. After stream end, builds the `WriterOutput` and `yield { type: 'done', output }`.

**Prompt skeleton:**
> You are The Writer. Produce a 45–60 second faceless YouTube Short script.
> Persona: `<channel.persona JSON>`
> Strategist directive: `<dispatch_directive>`
> Format hints: `<format_hints>`
> Topic: `<title>` — `<summary>`
> Rules: hook in first 3 seconds (question, surprising claim, or specific number/year), concrete visual scenes (1 visual change per 3-5 seconds), satisfying close. Output ONLY the narration text — no scene labels, no markdown, no commentary.

**DB writeback after success:**
- `agent_messages` row: `from='writer', to='voice_coach', intent='script', payload={script, word_count, ...}`
- `decisions` row: `agent_id='writer', decision_type='script', inputs={topic, dispatch_directive}, chosen={script, hook_first_3_seconds, word_count}, reasoning=null` (Writer's reasoning is the script itself)

**Expected latency:** ~10–25 seconds for the full stream.

### 6.4 Voice Coach — Claude Haiku 4.5

**Model:** `claude-haiku-4-5`.
**Method:** `generateObject` with Zod schema that enforces the voice pool.

**Input:** `{ topic, channel, previousOutputs.writer.script }`.

**Output schema:**
```ts
export const VoiceCoachOutputSchema = z.object({
  voice_id: z.enum(VOICE_POOL_IDS),                            // forced enum from constants
  provider: z.enum(['cartesia', 'elevenlabs']),
  speed: z.number().min(0.8).max(1.2),
  stability: z.number().min(0).max(1),
  rationale: z.string().min(20).max(400),
});
export type VoiceCoachOutput = z.infer<typeof VoiceCoachOutputSchema>;
```

**`VOICE_POOL` constant (`src/lib/agents/constants.ts`):**
```ts
export const VOICE_POOL = [
  { id: 'sonic-narrator-male-deadpan',    provider: 'cartesia',   description: 'Dry deadpan male, mid-pace, slightly skeptical' },
  { id: 'sonic-narrator-female-warm',     provider: 'cartesia',   description: 'Warm conversational female, friendly storyteller' },
  { id: 'sonic-narrator-male-urgent',     provider: 'cartesia',   description: 'Punchy urgent male, news-bulletin energy' },
  { id: 'eleven-narrator-female-curious', provider: 'elevenlabs', description: 'Curious storytelling female, leans into mystery' },
  { id: 'eleven-narrator-male-gravelly',  provider: 'elevenlabs', description: 'Gravelly documentary male, "60 Minutes" weight' },
  { id: 'eleven-narrator-female-young',   provider: 'elevenlabs', description: 'Energetic young female, TikTok-native pace' },
] as const;

export const VOICE_POOL_IDS = VOICE_POOL.map(v => v.id) as [string, ...string[]];
```

(Real Cartesia / ElevenLabs voice IDs get filled in at implementation time — placeholder names are fine until Plan #4 wires the TTS calls.)

**Prompt skeleton:**
> You are The Voice Coach. Pick ONE voice from the pool below for this script.
> Script: `<script>`
> Channel persona: `<channel.persona JSON>`
> Voice pool: `<VOICE_POOL JSON>`
> Pick the voice_id that best matches script tone (urgency, sincerity, humor) and channel persona. Set speed (0.8–1.2) and stability (0–1). Explain in 1-2 sentences.

**DB writeback:**
- `agent_messages`: `from='voice_coach', to='director', intent='voice_pick', payload=<output>`
- `decisions`: `agent_id='voice_coach', decision_type='voice_pick', inputs={script_preview, channel_persona}, alternatives=VOICE_POOL, chosen=<output>, reasoning=output.rationale`

**Expected latency:** ~1 second.

### 6.5 Director — Claude Haiku 4.5

**Model:** `claude-haiku-4-5`.
**Method:** `generateObject`.

**Input:** `{ topic, channel, previousOutputs.writer.script, previousOutputs.voiceCoach.voice_id }`.

**Output schema:**
```ts
export const DirectorOutputSchema = z.object({
  visual_treatment: z.enum(VISUAL_TREATMENTS),
  music_mood: z.string().min(3).max(100),                       // free-form e.g. "low-key tension"
  shot_list: z.array(z.object({
    segment_text: z.string().min(5).max(400),                   // chunk of the script
    broll_search_query: z.string().min(3).max(120),             // for Plan #4's Pexels/Storyblocks search
    duration_seconds: z.number().min(1).max(15),
  })).min(4).max(12),
  rationale: z.string().min(20).max(600),
});
export type DirectorOutput = z.infer<typeof DirectorOutputSchema>;
```

**`VISUAL_TREATMENTS` constant:**
```ts
export const VISUAL_TREATMENTS = [
  'kinetic-typography',   // text flying / animated, words highlighted as spoken
  'stock-montage',        // sequence of stock video clips matching script beats
  'data-viz',             // animated charts, graphs, numbers
  'archive-collage',      // old photos, newspaper clippings, grainy footage
  'satellite-zoom',       // Google-Earth-style zooms into locations
  'split-screen',         // two clips side by side, comparison-style
] as const;
```

**Prompt skeleton:**
> You are The Director. Pick ONE visual treatment from the enum, decide a music mood, and produce a shot list of 4-12 segments covering the full script.
> Script: `<script>`
> Voice: `<voice_id>` (use to inform pacing of cuts)
> Channel persona: `<channel.persona JSON>`
> Treatments available: `<VISUAL_TREATMENTS list with descriptions>`
> Each shot_list entry should have a `broll_search_query` (3-6 words) usable against Pexels/Storyblocks. Aim for 1 visual change every 3-5 seconds.

**DB writeback:**
- `agent_messages`: `from='director', to=null, intent='shot_list', payload=<output>`
- `decisions`: `agent_id='director', decision_type='shot_list', inputs={script_preview, voice_id}, alternatives=VISUAL_TREATMENTS, chosen=<output>, reasoning=output.rationale`  (stored as a JSON array of treatment names, matching the array convention used by Voice Coach)

**Expected latency:** ~2–3 seconds.

### 6.6 Orchestrator

```ts
// Pseudocode for src/lib/agents/orchestrator.ts
export async function* runPipeline(args: {
  topicId: string;
  supabase: SupabaseClient;
}): AsyncGenerator<StreamEvent> {
  // 1. Check concurrency. If active job exists, throw immediately.
  // 2. Fetch topic + default channel.
  // 3. Create jobs row. Emit job_started.
  // 4. For each agent in [strategist, writer, voiceCoach, director]:
  //    a. Update agents.current_state='thinking'. Emit agent_state:thinking.
  //    b. Update agents.current_state='working'. Emit agent_state:working.
  //    c. Call the agent runner.
  //       - For Writer: iterate the async generator, yielding writer_chunk per token. Accumulate full text.
  //       - For others: await the runner, get the output.
  //    d. Record agent_messages + decisions rows.
  //    e. Update agents.current_state='idle', current_task=null. Emit agent_state:idle.
  //    f. Emit agent_output + agent_done.
  // 5. Insert your_videos row with the assembled draft.
  // 6. Update jobs.status='succeeded', finished_at=now(). Emit job_completed.
  // 7. On any thrown error in the loop:
  //    - Update agents.current_state='idle' for the failing agent.
  //    - Update jobs.status='failed', error=<message>.
  //    - Emit job_failed and stop.
}
```

The API route at `/api/lab/dispatch` does the SSE wrapping:
```ts
// Pseudocode for src/app/api/lab/dispatch/route.ts
export async function POST(req: Request) {
  const { topicId } = await req.json();
  const supabase = getServiceClient();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runPipeline({ topicId, supabase })) {
          controller.enqueue(encodeSseEvent(event));
        }
      } catch (err) {
        // runPipeline's own error handling already emitted job_failed; we just close.
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
```

---

## 7. Database

### 7.1 No schema changes

### 7.2 One seed migration

**File:** `supabase/migrations/20260525000001_seed_default_channel.sql`

```sql
insert into public.channels (slug, display_name, platform, persona, default_voice_id, default_tts_provider, max_uploads_per_day)
values (
  'default',
  'Default Channel',
  'youtube',
  jsonb_build_object(
    'niche', 'history',
    'voice', 'dry deadpan, slightly skeptical',
    'pov', 'historical patterns repeat in unexpected places',
    'style_guide', 'open with a year or specific number, end with a question',
    'forbidden', array['breaking news', 'celebrity gossip', 'political hot takes']
  ),
  'sonic-narrator-male-deadpan',
  'cartesia',
  2
)
on conflict (slug) do nothing;
```

`on conflict (slug) do nothing` makes the migration idempotent — running it twice doesn't error.

### 7.3 Realtime usage

`supabase_realtime` publication already includes `agents`, `jobs`, `agent_messages`, `decisions`, `topic_queue`, `viral_observations` (per Plan #1's `20260524000012_enable_realtime.sql`). Plan #3 doesn't add anything to the publication.

---

## 8. Authentication

The middleware allowlist (from Plan #2) is `/api/health`, `/api/cron`, `/api/auth`, `/login`, plus static assets. Anything else — including `/lab`, `/api/lab/dispatch`, `/api/lab/drafts`, `/api/lab/jobs/active` — requires a valid `cockpit_session` cookie. No changes to `src/middleware.ts`.

---

## 9. Testing

### 9.1 What we test

- **Repositories** (`src/lib/supabase/repositories/*`) — each new file gets a test with a mocked Supabase client. Tests verify the query shape and error propagation. Following Plan #2's mock-chain pattern.
- **Agent runners** (`src/lib/agents/{strategist,voice-coach,director}.ts`) — mock `generateObject` from `ai` to return a fixture; verify the runner returns the parsed output and that schema validation rejects malformed responses.
- **Orchestrator** (`src/lib/agents/orchestrator.ts`) — mock the 4 agent runners + Supabase. Verify:
  - Successful path: events emitted in correct order, every expected DB row written, `your_videos` row created.
  - Failure path: failing agent's exception causes `job_failed` event, `jobs.status='failed'`, agent state reset to idle, no `your_videos` row created.
  - Concurrency: throws if an active `produce_video` job already exists.
  - Writer streaming: a mocked async-generator yielding 3 tokens results in 3 `writer_chunk` events in order, then `agent_output` with the assembled script.

### 9.2 What we explicitly DON'T test

- **The actual Writer's streaming with a real Claude call** — too brittle, too expensive in test runs.
- **UI snapshot tests** — same posture as Plan #2.
- **End-to-end with real Claude + real Supabase** — optional integration test gated by `INTEGRATION=1` env. Not required for merge.

### 9.3 Manual smoke test after deploy

1. Visit `/lab` → password gate → enter cockpit.
2. If no reviewed topics exist: visit `/`, approve one, return to `/lab`.
3. Ready pane shows the reviewed topic. Click **Dispatch**.
4. Active pane appears. Within ~3 sec, Strategist chip turns green; its card has a dispatch directive.
5. Writer chip turns amber → text starts appearing word-by-word within ~3 sec.
6. After ~15-25 sec total, Writer chip turns green; full script visible; word count + duration shown.
7. Voice Coach chip activates, completes in ~2 sec with a voice from the pool + reasoning.
8. Director chip activates, completes in ~3 sec with a treatment + ≥4 shot list rows.
9. Active pane collapses into Recent Drafts; the new draft is at the top of the list.
10. Click the draft → expands inline → script + voice + shot list visible.
11. Open `/` in another tab during steps 4-8 → Team Status sidebar shows the active agent's badge changing in real time.
12. Trigger a deliberate failure: hand-edit the Writer's prompt to produce an empty string (or use the integration test stub) → confirm `job_failed` surfaces in red with `Re-dispatch` button.

If steps 1-10 + 11 pass, Plan #3 is shipped. Step 12 is a stretch verification.

---

## 10. Cost & Performance

**Per-run estimated cost (Claude API only, no TTS in Plan #3):**

| Agent | Model | Input tokens (est) | Output tokens (est) | Cost (est) |
|---|---|---|---|---|
| Strategist | Haiku 4.5 | ~500 | ~200 | ~$0.001 |
| Writer | Sonnet 4.6 | ~800 | ~400 | ~$0.018 |
| Voice Coach | Haiku 4.5 | ~700 | ~150 | ~$0.001 |
| Director | Haiku 4.5 | ~900 | ~500 | ~$0.003 |
| **Total** | | | | **~$0.023** |

Roughly **2-3 cents per Lab run**. Twenty runs per day = ~$0.50/day = ~$15/month.

**Per-run estimated wall time:** 15-40 seconds for a typical run (Strategist ~1s, Writer ~15-25s, Voice Coach ~1s, Director ~3s, plus ~3-5s of orchestration overhead). Worst case ~90s. Vercel Fluid Compute's 300s default timeout is comfortable.

No cost guardrails in Plan #3 (single-operator, low volume). If Plan #5 onwards adds auto-dispatch, a daily spend cap belongs there.

---

## 11. Open Questions / Future Work

- **Format variation enforcement (deferred to Plan #5):** Strategist's prompt mentions it as critical for YouTube monetization. Director's `visual_treatment` choice IS stored on every `your_videos` row, so Plan #5 can implement the check by looking at the last N posted videos.
- **Per-step retries with backoff:** A failed Claude call (rate limit, transient 500) currently kills the whole run. A future improvement is per-agent retry with exponential backoff before propagating to job failure. Probably 1-2 tasks of work.
- **Durable runs:** SSE is fragile. If the operator's connection drops, the run is lost. Plan #4 or #5 could swap orchestration to Vercel Workflow DevKit for crash-safe runs. Decision can wait until we see whether dropped runs are actually a problem in practice.
- **Channel persona editor UI:** Operator hand-edits the seeded channel's persona via Supabase Studio. A real editor (probably under a `/settings/channels` route) is a future plan.
- **Decision Explainer in Cockpit:** Plan #2 deferred this. Plan #3 produces `decisions` rows but no UI surfaces them. A "Why did Voice Coach pick X for this draft?" panel could go on either the Cockpit or the Lab draft expand-view.
- **Multi-channel support:** Hardcoded to one channel for now. Adding a channel picker to the dispatch flow is straightforward (~2 tasks) once the operator has real multi-channel needs.
- **Re-dispatch vs. fork:** Re-dispatch creates a fresh job from the same topic, throwing away the previous draft. A "fork from this draft to tweak the prompt" mode would be valuable later but is out of scope here.

---

## 12. Summary

**Phase outline for the implementation plan (writing-plans will detail each):**
1. **Phase 0 — DB seed + new repositories** (channels, jobs, agent_messages, decisions, your_videos, plus reviewed-topics list on topic-queue).
2. **Phase 1 — Constants + agent types + individual agent runners** (TDD for each).
3. **Phase 2 — Orchestrator** (TDD: sequencing, DB writeback, failure path, concurrency check).
4. **Phase 3 — SSE API route + auxiliary API routes** (`/api/lab/dispatch`, `/api/lab/drafts`, `/api/lab/jobs/active`).
5. **Phase 4 — Lab UI** (3 panes, pipeline strip, 4 output cards, streaming Writer card, recent drafts expand).
6. **Phase 5 — Manual smoke test + deploy** (the §9.3 checklist + `vercel --prod`).
