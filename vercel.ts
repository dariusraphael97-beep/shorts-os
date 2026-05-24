import { type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "npm run build",
  // Cron jobs registered here; routes implemented in src/app/api/cron/*.
  // NOTE: Vercel Hobby plan caps crons at once-per-day max. When upgrading
  // to Pro, restore the original every-6h schedule for trending scrapers:
  //   youtube-trending: '0 */6 * * *'
  //   tiktok-trending:  '30 */6 * * *'
  crons: [
    { path: "/api/cron/youtube-trending", schedule: "0 7 * * *" },
    { path: "/api/cron/tiktok-trending", schedule: "30 7 * * *" },
    { path: "/api/cron/reddit-harvest", schedule: "0 8 * * *" },
    { path: "/api/cron/wikipedia-harvest", schedule: "30 8 * * *" },
    { path: "/api/cron/performance-sync", schedule: "0 9 * * *" },
  ],
};

export default config;
