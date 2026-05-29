-- Multi-row evaluation log for Plan #5 viability checks
create table if not exists public.kill_criteria_log (
  id uuid primary key default gen_random_uuid(),
  evaluated_at timestamptz not null default now(),
  criterion text not null,
  verdict text not null check (verdict in ('pass','fail','inconclusive')),
  evidence jsonb not null default '{}'::jsonb,
  decision_text text not null
);

create index if not exists kill_criteria_log_evaluated_at_idx
  on public.kill_criteria_log (evaluated_at desc);

-- Seed the first row marking the Plan #5 start
insert into public.kill_criteria_log (criterion, verdict, evidence, decision_text)
values (
  'plan_5_start',
  'inconclusive',
  '{"start_date":"2026-05-28","first_phase":"phase_1_sub_a"}'::jsonb,
  'Plan #5 brainstorm + spec complete. Implementation begins with Phase 1 Sub-phase A. First viability evaluation: 90 days post-Phase-1 launch.'
);
