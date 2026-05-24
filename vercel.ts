import { type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "npm run build",
  // Cron jobs registered here; routes implemented in src/app/api/cron/*
  crons: [
    { path: "/api/cron/youtube-trending", schedule: "0 */6 * * *" },
    { path: "/api/cron/tiktok-trending", schedule: "30 */6 * * *" },
    { path: "/api/cron/reddit-harvest", schedule: "0 8 * * *" },
    { path: "/api/cron/wikipedia-harvest", schedule: "30 8 * * *" },
    { path: "/api/cron/performance-sync", schedule: "0 9 * * *" },
  ],
};

export default config;
