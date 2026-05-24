-- Enable Realtime publication for tables the cockpit will subscribe to
alter publication supabase_realtime add table public.agent_messages;
alter publication supabase_realtime add table public.decisions;
alter publication supabase_realtime add table public.jobs;
alter publication supabase_realtime add table public.viral_observations;
alter publication supabase_realtime add table public.topic_queue;
alter publication supabase_realtime add table public.agents;
