// src/lib/assistants/chat-tools.ts
//
// Read-only AI SDK tools per agent, wrapping existing repositories.
// Chat must GROUND its answers in these — no invented numbers (accuracy gate).
import 'server-only';
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssistantId } from '@/lib/assistants/registry';
import {
  listDigestRankedClusters,
  getLatestWeekStart,
  getClusterById,
} from '@/lib/supabase/repositories/niche-clusters';
import { listActiveWatchedChannels } from '@/lib/supabase/repositories/watched-channels';
import { listVideosByStatus } from '@/lib/supabase/repositories/your-videos';
import { listRecentJobs } from '@/lib/supabase/repositories/jobs';
import { listRecentReviews, getVideoReviewByVideoId } from '@/lib/supabase/repositories/video-reviews';
import { getLatestSnapshot } from '@/lib/supabase/repositories/video-analytics';

export function buildChatTools(supabase: SupabaseClient, assistantId: AssistantId): Record<string, Tool> {
  switch (assistantId) {
    case 'niche_scout':
      return {
        list_top_niches: tool({
          description: "This week's digest-ranked niche clusters (falls back to the latest week with data).",
          inputSchema: z.object({}),
          execute: async () => {
            const week = await getLatestWeekStart(supabase);
            if (!week) return { week: null, niches: [] };
            const clusters = await listDigestRankedClusters(supabase, week);
            return {
              week,
              niches: clusters.slice(0, 15).map((c) => ({
                id: c.id,
                topic: c.canonical_topic,
                nicheScore: c.niche_score,
                provenScore: c.proven_score,
                firstMoverScore: c.first_mover_score,
                channelCount: c.channel_count,
                productionFit: c.production_fit,
                discoveryState: c.discovery_state,
              })),
            };
          },
        }),
        get_niche: tool({
          description: 'Full detail for one niche cluster by id.',
          inputSchema: z.object({ id: z.string() }),
          execute: async ({ id }) => (await getClusterById(supabase, id)) ?? { error: 'not found' },
        }),
      };
    case 'watch_list_curator':
      return {
        list_watched_channels: tool({
          description: 'Active channels on the watch-list.',
          inputSchema: z.object({}),
          execute: async () => listActiveWatchedChannels(supabase, 25),
        }),
      };
    case 'generator':
      return {
        list_recent_videos: tool({
          description: 'Recent video drafts and renders (status draft/rendering/rendered).',
          inputSchema: z.object({}),
          execute: async () => {
            const videos = await listVideosByStatus(supabase, ['draft', 'rendering', 'rendered'], 10);
            return videos.map((v) => ({
              id: v.id, title: v.title, status: v.status,
              durationSeconds: v.duration_seconds, updatedAt: v.updated_at,
            }));
          },
        }),
        list_recent_jobs: tool({
          description: 'Recent pipeline jobs (longform + shorts) with status and progress.',
          inputSchema: z.object({}),
          execute: async () => {
            const jobs = await listRecentJobs(supabase, 10);
            return jobs.map((j) => ({
              id: j.id, kind: j.kind, status: j.status,
              currentStep: j.current_step, progressPct: j.progress_pct,
              error: j.error, createdAt: j.created_at,
            }));
          },
        }),
      };
    case 'video_reviewer':
      return {
        list_recent_reviews: tool({
          description: 'Recent video reviews with verdicts.',
          inputSchema: z.object({}),
          execute: async () => listRecentReviews(supabase, 10),
        }),
        get_review: tool({
          description: 'Latest full review (scores, suggestions, strengths) for a video id.',
          inputSchema: z.object({ videoId: z.string() }),
          execute: async ({ videoId }) =>
            (await getVideoReviewByVideoId(supabase, videoId)) ?? { error: 'no review for that video' },
        }),
      };
    case 'analyst':
      return {
        list_posted_videos: tool({
          description: 'Posted videos (id, title, posted_at).',
          inputSchema: z.object({}),
          execute: async () => {
            const videos = await listVideosByStatus(supabase, 'posted', 15);
            return videos.map((v) => ({ id: v.id, title: v.title, postedAt: v.posted_at, url: v.url }));
          },
        }),
        get_video_analytics: tool({
          description: 'Latest analytics snapshot (views, CTR, retention) for a video id.',
          inputSchema: z.object({ videoId: z.string() }),
          execute: async ({ videoId }) =>
            (await getLatestSnapshot(supabase, videoId)) ?? { error: 'no analytics snapshot yet' },
        }),
      };
    case 'editor_copilot':
      return {};
  }
}
