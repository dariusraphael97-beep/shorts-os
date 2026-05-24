# Shorts OS — Studio Cockpit MVP (Plan #2 design)

**Status:** Design approved 2026-05-24. Ready for implementation plan.
**Predecessor:** [Phase 0+1 foundation](./2026-05-24-shorts-os-design.md), shipped as `v0.1.0` on 2026-05-24.
**Successor:** Plan #3 — Agent runtime + generation pipeline (Writer, Director, Voice Coach actually running).

---

## 1. Goal

A single-page **Studio Cockpit** the operator opens every morning. Co-equal Topic Queue and Trending Panel in the main area, persistent Team Status sidebar showing the 7 agents (even though they're not running yet — placeholder state), live Scraper Ticker footer streaming new ingestions. Dark, maximalist, "show the work" aesthetic. Password-gated (single env var). Plus a `/lab` route placeholder for Plan #3's production workflow.

**Done when:** Darius opens `https://shorts-os-roan.vercel.app/`, enters the cockpit password, sees the day's top-scored topics + trending shorts at a glance, can accept/reject topics, sees all 7 agents listed with state badges, and watches new ingestions scroll past in the ticker as the Reddit/Wikipedia/YouTube/TikTok crons fire.

---

## 2. Scope

### In scope (Tight MVP)

1. **Layout shell** — top bar, left sidebar, main area, footer. Persistent across routes.
2. **Auth middleware** — single password gate, cookie-based session.
3. **Topic Queue panel** — list scored topics, accept/reject actions writing to `topic_queue.state`.
4. **Trending Panel** — list `viral_observations`, click-out to source URL, lazy Claude breakdown on demand.
5. **Team Status sidebar** — 7 agent cards reading from `agents` table, Realtime-subscribed to state changes.
6. **Scraper Ticker footer** — live event feed from `topic_queue` + `viral_observations` inserts via Realtime.
7. **`/lab` placeholder route** — empty page that establishes the IA for Plan #3.
8. **Top bar** — brand, today's date, basic system-health pill (links to `/api/health`).
9. **Tailwind CSS + shadcn/ui** — bring in the styling stack.
10. **Tests** for data fetchers, auth middleware, repository functions. UI snapshot tests deferred.

### Explicitly out of scope (deferred)

- **Channel Manager** — Plan #2b (no agents yet to use channels).
- **Manual Upload Logger** — Plan #2b (operator isn't shipping videos yet).
- **Niche Health Panel** — Plan #2b (need more data first).
- **Pattern Bank Explorer** — Plan #3 (depends on Pattern Loop populating `patterns`).
- **Quick Access Hub** — Plan #2b (nice-to-have, not core).
- **Cost Meter** — Plan #2b (rough placeholder only in MVP top bar).
- **Pipeline Graph (React Flow)** — Plan #3 (nothing to graph until agents are running).
- **Decision Explainer panels** — Plan #3 (no decisions logged yet).
- **Live AI streaming UI** — Plan #3 (no Writer agent generating yet).
- **Mobile-first design** — desktop-first; mobile gets a serviceable but secondary stack-collapse.

---

## 3. User Experience

### 3.1 Daily morning flow

1. Operator opens `https://shorts-os-roan.vercel.app/` on MacBook Air.
2. First visit (or expired cookie): password prompt page → enter `COCKPIT_PASSWORD` → cookie set → cockpit loads.
3. Cockpit homepage renders:
   - **Top bar** shows today's date and a green "system healthy" pill.
   - **Left sidebar** shows 7 agent avatars + names, mostly "idle" (until Plan #3).
   - **Main area** shows Topic Queue (left) and Trending Panel (right).
   - **Footer ticker** is already scrolling past the morning's freshest ingestions.
4. Operator scans top 5 Topic Queue rows by hookability score (highest first), hits "Queue for production" on 2–3, "Reject" on 1.
5. Glances at Trending — clicks "explain" on one with surprising metrics; Claude breakdown appears inline (~3s).
6. Closes laptop. Total time: 5–10 min.

### 3.2 Visual aesthetic — "show the work" maximalist

- **Dark theme only.** Background near-black (`#0a0a0a`), surfaces a shade lighter (`#141414`, `#1c1c1c`).
- **Single bold accent color:** electric green (`#00ff88` or similar) used sparingly for: agent "working" state pulse, active CTA buttons, ticker highlights, hookability-score numbers ≥80.
- **Secondary accent:** warm amber for "thinking" states, neutral gray for "idle" / "deferred."
- **Typography:** sans for UI (Inter or system-ui), mono for numerical/code-ish bits (scores, timestamps, raw IDs).
- **Motion principles (specific library mapping):**
  - Agent state badges pulse slowly when not idle (1.5s ease-in-out loop). Active agents get an Aceternity `moving-border` effect around their card. Hover any agent → Aceternity `spotlight` follows the cursor.
  - Ticker uses Magic UI `marquee` (auto-pause on hover for readability) over an Aceternity `background-beams` subtle ambient motion.
  - Hookability scores use Magic UI `number-ticker` — count up 300ms when freshly scored.
  - Topic queue uses Magic UI `animated-list` — newly arrived items slide in from the top.
  - Active panel (the one you last interacted with) gets an Aceternity `border-beam` highlight.
  - No gratuitous animation; every motion conveys actual state change.
- **Density:** information-rich, not spaced out. The point is "command bridge," not "Notion document."
- **Empty states are first-class.** Topic Queue empty: *"Scrapers haven't queued anything yet — they fire daily at 7 AM ET. Or trigger now: `curl -H 'Authorization: Bearer $CRON_SECRET' /api/cron/reddit-harvest`"* — useful, not just decorative.

### 3.3 The `/lab` route (placeholder)

A second top-bar tab labeled **"Lab"**. Clicking it loads `/lab`. Page renders:

> **The Lab — Coming in Plan #3**
>
> This is where the agents actually make videos. The Strategist will dispatch a topic from the queue → Writer streams a script live → Voice Coach previews voices → Director picks b-roll → you'll watch the whole pipeline assemble in front of you.
>
> Nothing here yet. Drop a topic into the queue from the cockpit; when Plan #3 ships, the queued topics become the Lab's input.

Just text. No interactive elements. Establishes IA so future work doesn't break URL structure or sidebar shape.

---

## 4. Architecture

### 4.1 Routes

```
/                       → Cockpit homepage (auth-gated)
/login                  → Password prompt (only place auth check is bypassed)
/lab                    → Placeholder (auth-gated)
/api/health             → existing, unchanged, NOT auth-gated
/api/cron/*             → existing, unchanged, CRON_SECRET-gated
/api/topics/[id]/state  → NEW. POST to update topic_queue.state (auth-gated)
/api/trending/[id]/explain → NEW. POST to lazily Claude-generate a viral-short breakdown (auth-gated, returns JSON)
```

### 4.2 Layout component tree

```
<RootLayout>             // existing src/app/layout.tsx, augmented
  <CockpitShell>         // NEW. Wraps every auth-gated route.
    <TopBar />           // logo, date, health pill, /lab tab
    <div class="cockpit-body">
      <TeamStatusSidebar />  // 240px left, persistent, Realtime
      <main>{children}</main>
      <ScraperTickerFooter /> // 60px bottom, persistent, Realtime
    </div>
  </CockpitShell>
</RootLayout>
```

### 4.3 Data flow

**Server-side fetches (page load):**
- Topic Queue: `select * from topic_queue where state='queued' and hookability_score is not null order by hookability_score desc limit 30`
- Trending Panel: `select * from viral_observations order by observed_at desc limit 25`
- Team Status initial state: `select id, display_name, emoji, current_state, current_task from agents order by id`

Server Components do these reads via `getServiceClient()`. Results passed to client components as props.

**Client-side Realtime subscriptions:**
- Team Status: subscribes to `postgres_changes` on `agents` table, updates the affected card's badge.
- Scraper Ticker: subscribes to `postgres_changes` on `topic_queue` (INSERT) and `viral_observations` (INSERT), prepends new rows to a capped 50-event list.

**Client-side mutations:**
- Accept/Reject topic: `POST /api/topics/[id]/state` with `{ state: 'reviewed' | 'rejected', reason?: string }`. Server updates row. Optimistic UI updates the row's local state immediately.
- Lazy explain trending: `POST /api/trending/[id]/explain` → server calls Claude (via existing `getClaudeModel`) with the observation's title + raw_payload, returns `{ breakdown: string }`. Cached client-side per session.

### 4.4 Auth model

- **Single shared password** in `COCKPIT_PASSWORD` env var (32+ chars, generated by operator with `openssl rand -base64 32`).
- `/login` page: form with one password field, POST to `/api/auth/login`.
- On correct password, server sets an HTTP-only signed cookie `cockpit_session=<HMAC>` valid for 30 days.
- `src/middleware.ts` checks the cookie on every request to `/`, `/lab`, and `/api/topics/*`, `/api/trending/*`. Missing or invalid → redirect to `/login`.
- `/api/health` and `/api/cron/*` are NOT auth-gated (they have their own gating: cron uses `CRON_SECRET`, health is intentionally public for uptime monitoring).
- Cookie signing uses HMAC-SHA256 over a server-side `COCKPIT_SESSION_SECRET` env var (separate from password — generated once, never rotated unless compromised).
- No "logout" UI in MVP. Operator clears cookies in browser if they need to.

---

## 5. Components

### 5.1 `TopBar`

- Left: brand wordmark "Shorts OS" with small version pill `v0.1.0`.
- Center: today's date in `Sat May 24, 2026` format, plus a slim divider, plus "Lab" tab link.
- Right: health pill (green dot + "Healthy" / red dot + "Degraded") — clickable, links to `/api/health` JSON in a new tab. The pill polls `/api/health` once on mount + every 60s; status comes from the response's `status` field. Cost meter placeholder reads `$0.00 today` (text only, no real tracking in MVP — real cost tracking is Plan #2b).

Height: ~56px. Sticky on scroll.

### 5.2 `TeamStatusSidebar`

- 240px wide, full viewport height minus top bar and ticker.
- Top: small "Agents" label.
- 7 agent cards, vertically stacked, ~80px tall each:
  - Avatar circle with emoji (from `agents.emoji`), 40px diameter.
  - To the right: bold agent name (display_name), beneath it a state badge.
  - State badge styles:
    - `idle` — gray bg, gray text, no animation
    - `thinking` — amber bg, amber text, slow pulse
    - `working` — green bg, green text, slow pulse + glow
    - `awaiting_input` — orange bg, orange text, fast pulse
  - If `current_task` is non-null, show it as a 1-line truncated subtitle.
- Card is clickable → opens a drawer (slide-in from left) with:
  - Full prompt template (collapsible, read-only)
  - Prompt version number (`v1`)
  - Placeholder metrics: "Total decisions: 0 · Wins: 0" (real numbers in Plan #3)
- Bottom of sidebar: small "All agents idle — they'll wake up in Plan #3" note (replace when agents go live).

### 5.3 `MainArea` — Topics + Trending

Two-column flex layout. On screens narrower than 1280px, columns stack vertically (topics first).

#### `TopicQueuePanel` (left ~60%)

- Header: "Topic Queue" + count badge ("30 queued") + small refresh icon button.
- Filter bar (collapsed by default): source dropdown (all/reddit/wikipedia), min-score slider.
- Rows: one card per topic, ~96px tall:
  - Left: large hookability score (e.g. `87`), color-coded (≥80 green, 60-79 amber, <60 gray).
  - Center: title (bold, ~16px, line-clamp 2), source badge (`reddit r/singularity` etc.), one-line summary excerpt or reasoning excerpt.
  - Right: two icon buttons — green checkmark "Queue for production", red X "Reject."
- Click anywhere else on the row → expand inline to show: full raw payload (json viewer), full reasoning, sub-scores (hookability/novelty/visual_richness if scored that way).
- Action behavior:
  - Accept → optimistic update (row fades to green, then collapses out of list). API call. On failure, snap back + toast error.
  - Reject → opens small inline reason input (optional), then same behavior, fades red.
- Empty state: see §3.2.

#### `TrendingPanel` (right ~40%)

- Header: "Trending Shorts" + count + refresh icon.
- Source filter chips: All · YouTube · TikTok · Reddit · Instagram.
- Rows: ~88px tall each:
  - Left: source platform icon (YT play, TT music note, Reddit alien, IG camera).
  - Center: title (line-clamp 2), channel name, formatted view count (`8.4M views`), timestamp ("2h ago").
  - Right: "Open" icon button → opens source URL in new tab. "Explain" button → triggers lazy Claude breakdown.
- Click on row → expand inline:
  - If breakdown not generated: shows "Click Explain to ask Claude why this might be working."
  - Once generated: streams in Claude's analysis (~2-4 short paragraphs). Cached per session.
- Empty state: similar tone to Topic Queue.

### 5.4 `ScraperTickerFooter`

- 60px tall, sticky bottom, dark background slightly darker than main area.
- Horizontal scrolling marquee OR vertical newest-first list (decide during impl; vertical is simpler and gives more space for context).
- Each event row:
  - Timestamp (`14:32:08`)
  - Source label (`reddit-harvest`, `youtube-trending`, etc.) — color-coded
  - Title truncated, maybe with niche tag
- **Layout decision: vertical newest-first list, not horizontal marquee.** Vertical gives more room for context and avoids the readability problems of a side-scrolling ticker.
- Capacity: 50 most recent events kept in memory (older drop off as new ones arrive).
- Realtime: subscribes to `postgres_changes` `INSERT` on `topic_queue` AND `viral_observations`. Each insert becomes one ticker event.
- If no events in last 24h: shows "Scrapers are quiet. Next fire: 7:00 AM ET." (text computed from the cron schedule).

---

## 6. Authentication detail

### 6.1 Files

```
src/middleware.ts                          // NEW — runs on every request, checks cookie
src/app/login/page.tsx                     // NEW — password form
src/app/login/actions.ts                   // NEW — server action: verify password, set cookie
src/app/api/auth/logout/route.ts           // NEW — POST, clears cookie. No UI button in MVP, but route exists for dev/testing (e.g., curl to clear session)
src/lib/auth/session.ts                    // NEW — HMAC sign/verify, cookie helpers
src/tests/lib/auth/session.test.ts         // NEW — tests for sign/verify edge cases
```

### 6.2 Cookie format

`cockpit_session=<base64url(timestamp)>.<base64url(HMAC-SHA256(timestamp, SECRET))>`

- timestamp: ms-since-epoch of when the session was created
- Verify: HMAC matches AND `(now - timestamp) < 30 days`

### 6.3 New env vars

Append to `src/lib/env.ts` `envSchema`:

```ts
COCKPIT_PASSWORD: z.string().min(20),
COCKPIT_SESSION_SECRET: z.string().min(32),
```

Both **required** in all environments (including local). Generation instructions documented in `.env.example` and `SETUP_CHECKLIST.md`:

```
COCKPIT_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
COCKPIT_SESSION_SECRET=$(openssl rand -hex 32)
```

Plan implementation task adds them to `.env.local` first, then to Vercel via dashboard. Failing to set them errors loudly at startup (Zod validation) — better than a silent insecure default.

### 6.4 Middleware behavior

```
For every request:
  if path startswith /api/health     → pass
  if path startswith /api/cron       → pass (cron handlers do their own auth)
  if path startswith /api/auth       → pass
  if path startswith /login          → pass
  if path startswith /_next, /favicon, static assets → pass
  Otherwise:
    Read `cockpit_session` cookie.
    Verify HMAC, check age.
    If valid → pass.
    If invalid/missing → 302 redirect to /login?next=<originalPath>
```

---

## 7. Visual design language (token list)

For shadcn theming consistency. These become Tailwind CSS variables.

| Token | Value | Used for |
|---|---|---|
| `--bg-app` | `#0a0a0a` | Page background |
| `--bg-surface` | `#141414` | Cards, panels |
| `--bg-elevated` | `#1c1c1c` | Top bar, sidebar bg |
| `--bg-hover` | `#252525` | Row hover |
| `--border-subtle` | `#262626` | Card borders, dividers |
| `--text-primary` | `#f5f5f5` | Body text |
| `--text-secondary` | `#a3a3a3` | Subtitles, timestamps |
| `--text-muted` | `#666` | Empty states, hints |
| `--accent-electric` | `#00ff88` | Working, active CTAs, top scores |
| `--accent-amber` | `#ffa500` | Thinking, mid scores |
| `--accent-orange` | `#ff7043` | Awaiting input, warnings |
| `--accent-red` | `#ff4444` | Reject, errors |
| `--font-sans` | `Inter, system-ui, sans-serif` | UI |
| `--font-mono` | `JetBrains Mono, ui-monospace, monospace` | Numbers, IDs, timestamps |

---

## 8. Tech additions

### Already in repo (from Phase 0+1)
- Next.js 16 App Router + TypeScript strict
- Supabase JS client + service-role client
- AI SDK v6 + Anthropic provider
- Zod env loading
- Vitest + setup file loading .env.local
- `server-only` guard on secret-holding modules

### New in Plan #2

**Styling foundation**
- `tailwindcss` + `postcss` + `autoprefixer`
- `shadcn/ui` initialized via `npx shadcn@latest init` with the dark theme tokens from §7
- `lucide-react` for icons (shadcn's default; tree-shakable)
- `framer-motion` (runtime dep, ~50kb gzipped) — required by Aceternity components

**Component stack — three copy-paste ecosystems, composed:**

| Layer | Source | Role | Specific components we copy in |
|---|---|---|---|
| Base | **shadcn/ui** (https://ui.shadcn.com/) | Structural primitives | `button`, `card`, `badge`, `dropdown-menu`, `tabs`, `tooltip`, `dialog`, `scroll-area`, `toast`, `sheet` |
| Presence | **Aceternity UI** (https://ui.aceternity.com/) | Make agents and active states feel alive | `spotlight` or `card-hover-effect` (agent cards), `background-beams` (subtle motion behind ticker), `border-beam` (active panel highlight), `moving-border` (working-state agent border) |
| Motion | **Magic UI** (https://magicui.design/) | Specific motion primitives | `marquee` (scraper ticker), `number-ticker` (hookability scores counting up), `animated-list` (topic queue prepend animations), `shimmer-button` (primary CTAs) |

All three are MIT-licensed, copy-paste (not runtime npm deps except for framer-motion). Bundle stays lean because tree-shaking ships only what's imported.

**Other additions**
- Browser Supabase client (already installed; initialize with **anon key** — not service role — for Realtime subscriptions from client side)
- A small Realtime wrapper at `src/lib/supabase/browser-client.ts` and `src/lib/supabase/realtime-subscribe.ts`

### Not added
- React Flow (deferred to Plan #3 — nothing to graph yet)
- Tremor (deferred to Plan #2b when Niche Health charts arrive)
- Any analytics / telemetry library

---

## 9. Testing strategy

- **Unit tests** for: `auth/session.ts` sign/verify, repository functions for topics + trending, the lazy-explain Claude wrapper (mocked).
- **Route-handler tests** for `/api/topics/[id]/state` and `/api/trending/[id]/explain` (mocked supabase + mocked Claude).
- **Middleware test** — verify cookie validation logic in isolation.
- **No snapshot tests for UI components in MVP.** UI is iterating fast; visual regression tooling overhead isn't worth it yet.
- **One end-to-end smoke** after deploy: curl `/` without cookie → 302 to `/login`; POST to `/api/auth/login` with correct password → 200 + cookie set; subsequent GET `/` → 200 HTML. Document as a manual checklist in the implementation plan, not an automated CI test.

Total expected new tests: ~10–15.

---

## 10. Risk & mitigations

| Risk | Mitigation |
|---|---|
| Realtime subscriptions add to Supabase free-tier connection pool | Free tier allows 200 concurrent Realtime connections; we'll use 2 (agents + ticker). 1% utilization. |
| Browser bundle bloat from shadcn + Aceternity + Magic UI + framer-motion | Tailwind v4 generates ~10kb gzipped CSS. shadcn / Aceternity / Magic UI components are all copy-paste — only what you import ships. Framer-motion is the one runtime dep at ~50kb gzipped. Expected total cockpit bundle: under 250kb gzipped. If we cross 300kb we revisit. |
| Framer-motion bloat if every component animates | Only Aceternity components touch framer-motion. We use ~3-5 of them total (agent cards, ticker background, panel borders). Magic UI motion primitives use CSS transforms, not framer-motion. shadcn is animation-free. |
| `COCKPIT_PASSWORD` leak via deployed code | Read only on the server (login action). Never sent to client. Cookie carries HMAC, not the password itself. |
| Operator forgets `COCKPIT_PASSWORD` | Document in `SETUP_CHECKLIST.md` how to rotate via Vercel dashboard. Cookie invalidation requires rotating `COCKPIT_SESSION_SECRET`. |
| Lazy Claude explain endpoint becomes a cost vector if abused | Auth-gated (only the logged-in operator can call it). Each call ~$0.001 with Haiku 4.5. Cache per browser session client-side. Worst case: $0.10/day if operator clicks Explain 100 times. |

---

## 11. Out-of-scope explicitly noted

Re-listing from §2 for emphasis. None of these are bugs to fix later — they're **deliberate cuts**:

- Channel Manager, Manual Upload Logger, Niche Health, Pattern Bank Explorer, Quick Access Hub, real Cost Meter, Pipeline Graph, Decision Explainer, live AI streaming, agent message live feed.
- Mobile-first design (mobile works, but desktop is the design target).
- "Logout" UI (clear cookies works).
- Multi-user / RBAC (this is a personal tool).
- Analytics on cockpit usage.

---

## 12. Open questions

None — defaults all locked.

---

## 13. Done definition

Plan #2 is complete when:

1. `https://shorts-os-roan.vercel.app/` redirects to `/login`.
2. Entering the password sets a cookie and loads the cockpit.
3. The cockpit shows: top bar with date + health pill, left sidebar with all 7 agents (idle state), Topic Queue panel with currently-scored topics, Trending Panel with currently-observed viral shorts, footer ticker streaming live.
4. Clicking "Queue for production" on a topic updates `topic_queue.state` and the row disappears from the queue.
5. Clicking "Explain" on a trending row produces a Claude breakdown.
6. New cron-ingested rows appear in the ticker without page refresh.
7. `/lab` route loads the placeholder.
8. `npm test` passes including all new tests.
9. `npm run build` succeeds.
10. Deployed to Vercel production.
