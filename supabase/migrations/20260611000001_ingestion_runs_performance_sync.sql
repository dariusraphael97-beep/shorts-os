-- Mission Control derives the Analyst's status from ingestion_runs; let
-- performance-sync log there (it previously wrote only video_analytics).
alter table public.ingestion_runs drop constraint if exists ingestion_runs_job_check;
alter table public.ingestion_runs add constraint ingestion_runs_job_check
  check (job in (
    'youtube_category_sweep','youtube_shorts_search','watch_list_sync',
    'reddit_topic_discovery','google_trends','tiktok_creative_center',
    'classify_observations','cluster_niches','performance_sync'
  ));
