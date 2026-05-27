-- Phase 4: replace the Phase 1 placeholder description + prompt for the composer agent
-- with the real Phase 4 implementation summary. The row itself was seeded by
-- 20260525000002_plan_4_schema.sql (section 14) with placeholder text. The actual
-- prompt the agent uses lives in code at src/lib/agents/composer.ts:buildPrompt().
-- This migration keeps the agents row description aligned with what the code does so
-- the cockpit UI shows accurate text.

update public.agents
set
  description = 'Assembles a 5-clip Top-5 compilation from clip_library candidates and one music_tracks track. Validates segment durations (4-9s each, 25-35s total), candidate/music membership, and a 3-of-4 pattern diff against the channel''s last 5 uploads. Retries the LLM once on validation failure, then falls back to a heuristic picker so the orchestrator always gets a draft to insert.',
  prompt_template = 'Real prompt lives in code at src/lib/agents/composer.ts:buildPrompt(). It is rebuilt per dispatch with the current candidate pool, music pool, recent patterns, strategist directive, and topic so the agents-table prompt_template is informational only.',
  prompt_version = 2
where id = 'composer';

insert into public.agent_prompt_versions (agent_id, version, prompt_template, changelog)
select id, prompt_version, prompt_template,
  'Phase 4: replace Phase 1 placeholder; real prompt lives in src/lib/agents/composer.ts (rebuilt per dispatch).'
from public.agents
where id = 'composer'
on conflict do nothing;
