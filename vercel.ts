import { type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "npm run build",
  // Cron jobs registered here; routes implemented in src/app/api/cron/*.
  // NOTE: Vercel Hobby plan caps crons at once-per-day max. When upgrading
  // to Pro, restore the original every-6h schedule for trending scrapers:
  //   youtube-trending: '0 */6 * * *'
  //   tiktok-trending:  '30 */6 * * *'
  // Schedules below are in UTC (Vercel requirement). Local-time hints are
  // for the operator in NJ (EST = UTC-5 in winter, EDT = UTC-4 in summer).
  crons: [
    { path: "/api/cron/youtube-trending",  schedule: "0 10 * * *"  }, // 05:00 EST / 06:00 EDT
    { path: "/api/cron/tiktok-trending",   schedule: "30 10 * * *" }, // 05:30 EST / 06:30 EDT
    { path: "/api/cron/reddit-harvest",    schedule: "0 11 * * *"  }, // 06:00 EST / 07:00 EDT
    { path: "/api/cron/wikipedia-harvest", schedule: "30 11 * * *" }, // 06:30 EST / 07:30 EDT
    { path: "/api/cron/performance-sync",  schedule: "0 12 * * *"  }, // 07:00 EST / 08:00 EDT
  ],
};

export default config;
