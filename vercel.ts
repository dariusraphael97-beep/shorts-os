// vercel.ts
//
// Vercel project configuration. Replaces vercel.json (per Vercel knowledge update 2026-02-27).
// Plan #4 Phase 1 adds the render-dispatcher + render-watchdog crons alongside the
// pre-existing daily trending/performance scrapers.
import { type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  framework: 'nextjs',
  buildCommand: 'npm run build',
  // Cron jobs registered here; routes implemented in src/app/api/cron/*.
  // Schedules are in UTC (Vercel requirement). Local-time hints below are
  // for the operator in NJ (EST = UTC-5 in winter, EDT = UTC-4 in summer).
  //
  // NOTE: Vercel Hobby plan caps most crons at once-per-day max. The two render
  // crons below run at sub-daily intervals — they require Pro (or Vercel grants
  // an exception). If a deploy fails with "cron interval not allowed on plan",
  // the immediate workaround is to upgrade to Pro before Phase 1's benchmark
  // can run reliably.
  crons: [
    // --- Plan #4 Phase 1 (Plan #4 render pipeline) ---
    { path: '/api/cron/render-dispatcher', schedule: '* * * * *' },  // every minute (60s spec target)
    { path: '/api/cron/render-watchdog',   schedule: '*/5 * * * *' }, // every 5 minutes
    // --- Plan #4 Phase 3 (Reddit clip ingest) ---
    { path: '/api/cron/reddit-clip-discovery', schedule: '*/30 * * * *' },
    // Phase 5 will add: { path: '/api/cron/scheduled-uploader', schedule: '*/15 * * * *' },
    // --- Pre-existing trending + performance scrapers (Plan #1-3) ---
    // performance-sync is currently a stub — Plan #4 Phase 5 will replace the
    // route with a real YouTube Analytics sync (per spec §5). Schedule stays.
    { path: '/api/cron/youtube-trending',  schedule: '0 10 * * *'  }, // 05:00 EST / 06:00 EDT
    { path: '/api/cron/tiktok-trending',   schedule: '30 10 * * *' }, // 05:30 EST / 06:30 EDT
    { path: '/api/cron/reddit-harvest',    schedule: '0 11 * * *'  }, // 06:00 EST / 07:00 EDT
    { path: '/api/cron/wikipedia-harvest', schedule: '30 11 * * *' }, // 06:30 EST / 07:30 EDT
    { path: '/api/cron/performance-sync',  schedule: '0 12 * * *'  }, // 07:00 EST / 08:00 EDT
  ],
};

export default config;
