-- supabase/migrations/20260525000003_reseed_dyfrx_channel.sql
--
-- Reseeds the placeholder 'default' channel to dyfrx_9754/cars per operator decision.
-- Master design "start fresh" guidance is intentionally overridden by operator:
-- existing dyfrx_9754 channel keeps its subscriber base + age; old wrong-niche
-- videos remain public. See spec §"Pivot 1" for tradeoff documentation.

insert into public.niches (slug, display_name, description,
  subreddits, youtube_search_terms, tiktok_hashtags) values
('cars', 'Cars', 'Car crashes, street racing, mechanic fails, driving content',
  array['IdiotsInCars','JustRolledIntoTheShop','Cartalk','cars','RoastMyCar',
        'spotted','formuladank','carporn'],
  array['car crash compilation','street race fails','mechanic fail',
        'driver fail','dashcam','car review shorts'],
  array['carcrash','dashcam','streetrace','idiotsindriving','carfail'])
on conflict (slug) do nothing;

update public.channels
  set slug='dyfrx_9754',
      display_name='dyfrx_9754',
      external_channel_id='UCXXXXXXXXXXXXXXXXXXXX',  -- TODO operator: replace with real UC id
      niche_id=(select id from public.niches where slug='cars'),
      persona=jsonb_build_object(
        'niche', 'cars',
        'voice', 'matter-of-fact, slight edge, casual not corporate',
        'pov', 'these crashes and mechanic fails reveal car culture truths',
        'style_guide', 'open with a specific make+model or year, end with a question or a callout',
        'forbidden', array['fatal crashes with visible injuries', 'doxxing drivers',
                          'glorifying dangerous street racing', 'political angle on car culture']
      ),
      default_voice_id='sonic-narrator-male-deadpan',
      default_tts_provider='cartesia',
      timezone='America/New_York',
      max_clip_ingest_per_day=10
  where slug='default';
