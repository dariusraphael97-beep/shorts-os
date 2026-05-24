# Shorts OS

Personal media operations system for running faceless YouTube Shorts channels.

**Status:** Phase 0 + 1 (Foundation) complete. Memory Layer + Intel scrapers live.
Next: Plan #2 (Studio cockpit UI).

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
- Plan #2 — Studio cockpit UI + visualization (next)
- Plan #3 — Agent framework + generation pipeline
- Plan #4 — PC render agent + first videos live
