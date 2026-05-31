-- Sub-phase F: first-run onboarding fields on channels.
alter table public.channels
  add column if not exists creator_goals text,
  add column if not exists interests text[] not null default '{}'::text[],
  add column if not exists onboarding_completed_at timestamptz;

comment on column public.channels.creator_goals is 'Onboarding goal: monetize | grow_subscribers | test_niche | other (validated in app).';
comment on column public.channels.interests is 'Onboarding free-text interest tags; seeds targeted-search terms (§4.2).';
comment on column public.channels.onboarding_completed_at is 'Set when the first-run wizard finishes; null = onboarding not yet done (drives the / guard).';
