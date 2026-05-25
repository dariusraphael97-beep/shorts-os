# Shorts OS

Personal media operations system for running faceless YouTube Shorts channels.

**Status:** Plans #1, #2, and #3 complete. Memory Layer + Intel scrapers live. Studio Cockpit shipped. Live agent pipeline at `/lab`.

## What's running

- **Supabase** holds 11 tables (Memory Layer)
- **Vercel Cron** runs 5 background scrapers:
  - YouTube Shorts trending (every 6h)
  - TikTok trending via TikAPI (every 6h)
  - Reddit harvest (daily 08:00 UTC)
  - Wikipedia harvest (daily 08:30 UTC)
  - Performance sync (daily 09:00 UTC — stub until Plan #4)
- **Claude (Haiku 4.5)** scores topic candidates for hookability
- Health endpoint: `/api/health`
- ✅ **Plan #2 — Studio Cockpit MVP.** Password-gated dashboard at `/`. Topic Queue (review + accept/reject scored topics), Trending Panel (with lazy Claude breakdowns), Team Status sidebar (7 agents, live state via Realtime), Scraper Ticker footer (live events).
- ✅ **Plan #3 (The Lab) — shipped 2026-05-25.** Live agent pipeline at `/lab`: dispatch a reviewed topic and watch Strategist → Writer (streaming) → Voice Coach → Director assemble a draft in ~30-90 seconds. Drafts are saved as `your_videos.status='draft'` rows; render is Plan #4.

## Cockpit access

Production URL: https://shorts-os-roan.vercel.app/

The cockpit is password-gated. The password is in `.env.local` as `COCKPIT_PASSWORD` and mirrored to Vercel's env vars.

Forgot the password? Rotate it:
1. Vercel dashboard → shorts-os → Settings → Environment Variables → edit `COCKPIT_PASSWORD`
2. Generate new: `openssl rand -base64 32 | tr -d '/+=' | head -c 32`
3. Redeploy: `vercel --prod`
4. Update your local `.env.local` to match.

## Setup (when cloning fresh)

1. `npm install`
2. Copy `.env.example` → `.env.local`, fill in all keys
3. `npx supabase link --project-ref <ref>`
4. `npx supabase db push`
5. `npm run dev` → http://localhost:3000

To create your first niche:
```sql
insert into niches (slug, display_name, is_active, youtube_search_terms, tiktok_hashtags, subreddits)
values (
  'wikipedia-til',
  'Wikipedia / TIL',
  true,
  array['weird history fact','wild story unknown'],
  array['historyfacts','til'],
  array['todayilearned','interestingasfuck','Damnthatsinteresting','nextfuckinglevel']
);
```

## Project layout

See `docs/superpowers/specs/2026-05-24-shorts-os-design.md` for the full design.

## Plans (sequential)

- Plan #1 (this) — Foundation + Memory Layer + Intel scrapers ✅
- Plan #2 — Studio cockpit UI + visualization ✅
- Plan #3 — Agent framework + generation pipeline ✅
- Plan #4 — PC render agent + first videos live
