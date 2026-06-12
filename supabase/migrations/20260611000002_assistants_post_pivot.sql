-- Post-pivot (2026-06-04) copy updates for the Mission Control assistants.
-- Analyst: performance-sync is live (deploy fixed 2026-06-11) — enable it.
update public.assistants set
  is_enabled = true,
  role_description = 'Tracks post-publication performance: views, CTR, retention curves.'
  where id = 'analyst';

-- Generator: longform-first on the Higgsfield engine (was short-form Phase 1 copy).
update public.assistants set
  role_description = 'Drafts longform videos from niche briefs on the Higgsfield engine.',
  icon_name = 'clapperboard'
  where id = 'generator';

-- editor_copilot stays disabled (Phase 3).
