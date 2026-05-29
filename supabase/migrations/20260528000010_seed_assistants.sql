-- Seed the six Plan #5 Phase-1 product assistants (user-facing personas, distinct from Plan #4 pipeline `agents`).
insert into public.assistants (id, display_name, role_description, icon_name, accent_color_var, is_enabled)
values
  ('niche_scout',         'Niche Scout',         'Finds and ranks proven + first-mover niches across all sources.', 'compass',    '--accent', true),
  ('watch_list_curator',  'Watch-list Curator',  'Manages the channel watch-list; auto-discovers and evicts.',      'eye',        '--accent', true),
  ('generator',           'Generator',           'Drafts videos from niche briefs. Native short-form in Phase 1; longform in Phase 2.', 'sparkles', '--accent', true),
  ('video_reviewer',      'Reviewer',            'Pre-publication QA scorecard and suggestions.',                    'shield-check','--accent', true),
  ('analyst',             'Analyst',             'Post-publication narrative analytics. Placeholder until Phase 4.', 'line-chart', '--text-tertiary', false),
  ('editor_copilot',      'Editor',              'CapCut / Premiere editing co-pilot. Placeholder until Phase 3.',   'scissors',   '--text-tertiary', false)
on conflict (id) do update set
  display_name = excluded.display_name,
  role_description = excluded.role_description,
  icon_name = excluded.icon_name,
  accent_color_var = excluded.accent_color_var,
  is_enabled = excluded.is_enabled;

-- Default assistant_status: all idle
insert into public.assistant_status (assistant_id, state, current_activity)
select id, 'idle', null from public.assistants
on conflict (assistant_id) do nothing;

-- Default assistant_settings: empty jsonb (each assistant reads/writes its own keys later)
insert into public.assistant_settings (assistant_id, settings)
select id, '{}'::jsonb from public.assistants
on conflict (assistant_id) do nothing;
