-- supabase/migrations/20260525000001_seed_default_channel.sql
--
-- Plan #3 (The Lab) requires at least one channel row so the agent pipeline
-- has a persona to read. This seeds a single placeholder channel that the
-- operator can hand-edit via Supabase Studio later. A real Channel Manager
-- UI is a future plan.

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
