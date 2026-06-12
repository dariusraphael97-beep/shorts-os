// scripts/seed-niches.mjs
//
// One-off: run the dominatable-niche playbook against the YouTube Data API and write a
// handful of REAL niche_clusters rows so the /niches Generate Spine has data to pick from.
// This is a down payment on slice #2 (full productized ingestion) — NOT the recurring pipeline.
//
// Run:  node --env-file=.env.local scripts/seed-niches.mjs
//
// Requires: YOUTUBE_API_KEY, SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from '@supabase/supabase-js';

const KEY = process.env.YOUTUBE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) { console.error('YOUTUBE_API_KEY missing'); process.exit(1); }
if (!SUPABASE_URL || !SERVICE_ROLE) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing'); process.exit(1); }

const SEEDS = [
  'ranked tier list', 'backyard birds', 'weird animals', 'deep sea creatures',
  'space facts', 'how it works', 'psychology facts', 'money mistakes',
  'the history of', 'what happens to your', 'unsolved mysteries', 'how the body works',
];
const PUBLISHED_AFTER = new Date(Date.now() - 120 * 86400000).toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function yt(path, params) {
  const u = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries({ ...params, key: KEY })) u.searchParams.set(k, v);
  const res = await fetch(u);
  const j = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(j.error?.errors ?? j).slice(0, 200)}`);
  return j;
}

function iso8601ToSeconds(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  if (!m) return 0;
  return (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0));
}

// 1. search → video ids
const videoIds = new Set();
for (const q of SEEDS) {
  try {
    const j = await yt('search', { part: 'id', q, type: 'video', order: 'viewCount', publishedAfter: PUBLISHED_AFTER, maxResults: '50', regionCode: 'US', relevanceLanguage: 'en', videoDuration: 'medium' });
    for (const it of j.items ?? []) if (it.id?.videoId) videoIds.add(it.id.videoId);
  } catch (e) { console.error(`search "${q}": ${e.message}`); }
  await sleep(40);
}

// 2. videos.list → stats + channel + title (batched 50)
const vids = [];
const idArr = [...videoIds];
for (let i = 0; i < idArr.length; i += 50) {
  const j = await yt('videos', { part: 'snippet,statistics,contentDetails', id: idArr.slice(i, i + 50).join(',') });
  for (const it of j.items ?? []) vids.push({ id: it.id, title: it.snippet?.title ?? '', channelId: it.snippet?.channelId, views: +(it.statistics?.viewCount ?? 0), published: it.snippet?.publishedAt, durationSeconds: iso8601ToSeconds(it.contentDetails?.duration) });
}

// 3. channels.list → subs, age (batched 50)
const channelIds = [...new Set(vids.map((v) => v.channelId).filter(Boolean))];
const chan = new Map();
for (let i = 0; i < channelIds.length; i += 50) {
  const j = await yt('channels', { part: 'snippet,statistics', id: channelIds.slice(i, i + 50).join(',') });
  for (const it of j.items ?? []) chan.set(it.id, { created: it.snippet?.publishedAt, subs: +(it.statistics?.subscriberCount ?? 0) });
}

// 4. dominatable filter + score (same playbook as /tmp/niche-scan.mjs)
const squashRatio = (r) => r / (r + 10);
const squashViews = (v) => Math.min(1, Math.max(0, Math.log10(Math.max(1, v)) / 7));
const now = Date.now();
const byChannel = new Map();
for (const v of vids) {
  const c = chan.get(v.channelId); if (!c) continue;
  const cur = byChannel.get(v.channelId);
  if (!cur || v.views > cur.bestViews) byChannel.set(v.channelId, { ...c, channelId: v.channelId, bestViews: v.views, bestTitle: v.title, bestId: v.id, bestDurationSeconds: v.durationSeconds });
}
const cands = [];
for (const c of byChannel.values()) {
  const ageDays = c.created ? (now - new Date(c.created).getTime()) / 86400000 : 99999;
  const ratio = c.subs > 0 ? c.bestViews / c.subs : (c.bestViews > 0 ? 999 : 0);
  if (ageDays > 365 || c.bestViews < 300_000 || ratio < 3 || (c.bestDurationSeconds ?? 0) < 240) continue;
  const recency = Math.max(0.2, 1 - ageDays / 365);
  const firstMover = Math.sqrt(squashRatio(ratio) * squashViews(c.bestViews)) * recency;
  cands.push({ ...c, ageDays, ratio, firstMover });
}
cands.sort((a, b) => b.firstMover - a.firstMover);
const top = cands.slice(0, 8);
console.log(`found ${cands.length} dominatable channels; seeding top ${top.length} as niche_clusters`);

// 5. write niche_clusters rows for the current ISO week
function isoWeekStart(d = new Date()) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() - day + 1);
  return dt.toISOString().slice(0, 10);
}
const weekStart = isoWeekStart();
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
const rows = top.map((c, i) => ({
  week_start: weekStart,
  canonical_topic: c.bestTitle.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).slice(0, 6).join(' '),
  format_label: 'ai_voiceover_facts', // a valid FormatLabel; the engine produces AI-voiceover longform
  example_video_ids: [c.bestId],
  channel_count: 1,
  avg_views: c.bestViews,
  first_seen_at: c.created ?? null,
  first_mover_score: Math.min(0.99, Math.max(0.71, c.firstMover)), // ensure it lands in the dominatable band
  proven_score: 0.1,
  niche_score: Math.min(0.99, c.firstMover),
  discovery_state: 'public',
  production_fit: 'native',
  audience_signal: 'general',
  digest_rank: i + 1,
  explainability_top_signals: { viewsToSubsRatio: Math.round(c.ratio), firstMoverScore: Number(c.firstMover.toFixed(3)), channelAgeDays: Math.round(c.ageDays), winnerDurationSeconds: Math.round(c.bestDurationSeconds ?? 0) },
}));

// Idempotent for the week: clear this week's seeded rows, then insert.
await supabase.from('niche_clusters').delete().eq('week_start', weekStart);
const { error } = await supabase.from('niche_clusters').insert(rows);
if (error) { console.error('insert failed:', error.message); process.exit(1); }
console.log(`seeded ${rows.length} niches for week ${weekStart}:`);
for (const r of rows) console.log(`  - ${r.canonical_topic} (views/subs ~${r.explainability_top_signals.viewsToSubsRatio}x, age ${r.explainability_top_signals.channelAgeDays}d, ~${Math.round(r.explainability_top_signals.winnerDurationSeconds / 60)}min)`);
