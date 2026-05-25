// vercel.ts
//
// Vercel project configuration. Replaces vercel.json (per Vercel knowledge update 2026-02-27).
// Currently defines Plan #4 Phase 1 cron schedules.
import { type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  crons: [
    { path: '/api/cron/render-dispatcher', schedule: '* * * * *' },  // every minute (60s spec target)
    { path: '/api/cron/render-watchdog',   schedule: '*/5 * * * *' }, // every 5 minutes
    // Phase 3 will add: { path: '/api/cron/reddit-clip-discovery', schedule: '*/30 * * * *' },
    // Phase 5 will add: { path: '/api/cron/scheduled-uploader',    schedule: '*/15 * * * *' },
    // Phase 5 will add: { path: '/api/cron/performance-sync',      schedule: '0 6 * * *' },  // daily 6am UTC
  ],
};
