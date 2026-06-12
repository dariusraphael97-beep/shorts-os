-- Productize the dominatable-niche sweep:
--  1) let the new cron log to the ingestion_runs ledger (Mission Control reads it)
--  2) allow its observation source
--  3) capture channel age for the first-mover recency signal
alter table public.ingestion_runs drop constraint if exists ingestion_runs_job_check;
alter table public.ingestion_runs add constraint ingestion_runs_job_check
  check (job in (
    'youtube_category_sweep','youtube_shorts_search','watch_list_sync',
    'reddit_topic_discovery','google_trends','tiktok_creative_center',
    'classify_observations','cluster_niches','performance_sync',
    'youtube_dominatable_sweep'
  ));

alter table public.shorts_observations drop constraint if exists shorts_observations_source_check;
alter table public.shorts_observations add constraint shorts_observations_source_check
  check (source in (
    'youtube_most_popular','youtube_search','youtube_watch_list',
    'reddit_topic','tiktok_creative_center','google_trends',
    'youtube_dominatable'
  ));

alter table public.shorts_observations add column if not exists channel_published_at timestamptz;
