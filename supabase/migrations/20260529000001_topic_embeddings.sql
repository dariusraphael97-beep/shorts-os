-- Cross-run cache of topic_label embeddings (Sub-phase D clustering fuzzy-merge).
-- Plain jsonb float[] — no pgvector; weekly batch scale is trivial.
create table if not exists public.topic_embeddings (
  topic_label text primary key,
  model       text not null,
  embedding   jsonb not null,
  created_at  timestamptz not null default now()
);
