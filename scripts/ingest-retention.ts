// Manually ingest a YouTube audience-retention curve into video_analytics.
// Run from the repo root (relative imports resolve src/ + root node_modules):
//   npm run ingest-retention -- --video GwC66BSw7wU --file curve.csv
//   pbpaste | npm run ingest-retention -- --video GwC66BSw7wU --stdin
//   npm run ingest-retention -- --video GwC66BSw7wU --file c.csv --views 16 --avd 58 --ctr 2.9 --impressions 280
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { parseRetentionCurve } from '../src/lib/clients/retention-parser.ts';
import { ingestManualRetention } from '../src/lib/supabase/repositories/video-analytics.ts';
import { getVideoForRetentionIngest } from '../src/lib/supabase/repositories/your-videos.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function numArg(name: string): number | undefined {
  const v = arg(name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${name} must be a number (got "${v}")`);
  return n;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const video = arg('video');
  if (!video) throw new Error('Missing --video <externalVideoId|uuid>');

  const file = arg('file');
  const raw = file ? readFileSync(file, 'utf8') : flag('stdin') ? readFileSync(0, 'utf8') : undefined;
  if (!raw) throw new Error('Provide --file <path> or pipe input with --stdin');

  const curve = parseRetentionCurve(raw); // throws RetentionParseError on bad input

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must be set (.env.local)');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const ref = UUID_RE.test(video) ? { yourVideoId: video } : { externalVideoId: video };
  const resolved = await getVideoForRetentionIngest(supabase, ref);
  if (!resolved) throw new Error(`No your_videos row for ${video}. Register/post the video first.`);

  const res = await ingestManualRetention(supabase, {
    yourVideoId: resolved.id,
    curve,
    durationSeconds: resolved.durationSeconds,
    metricsOverride: {
      views: numArg('views'),
      avgViewDurationSeconds: numArg('avd'),
      ctrPct: numArg('ctr'),
      impressions: numArg('impressions'),
    },
  });

  console.log(
    `✓ Upserted ${res.points} retention points for ${resolved.id} @ ${res.snapshotAt} ` +
      `(first-30s retention: ${res.first30sRetention ?? 'n/a'})`,
  );
}

main().catch((e) => {
  console.error('ingest-retention failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
