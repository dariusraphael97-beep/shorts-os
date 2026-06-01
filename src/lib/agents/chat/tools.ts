import "server-only";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getLatestWeekStart,
  listDigestRankedClusters,
  getClusterById,
} from "@/lib/supabase/repositories/niche-clusters";
import {
  listPredictionsByCluster,
  listClosedPredictions,
} from "@/lib/supabase/repositories/niche-predictions";
import { listActiveWatchedChannels } from "@/lib/supabase/repositories/watched-channels";
import { getActiveProduceVideoJob } from "@/lib/supabase/repositories/jobs";
import { getVideoReviewByVideoId } from "@/lib/supabase/repositories/video-reviews";

// ---------------------------------------------------------------------------
// Static registry — keep perfectly in sync with getToolsForAssistant below.
// Exported at the top so tests can import it without pulling in execute logic.
// ---------------------------------------------------------------------------
export const ASSISTANT_TOOL_IDS: Record<string, string[]> = {
  niche_scout: ["list_week_niches", "get_niche", "list_predictions"],
  watch_list_curator: ["list_watched_channels"],
  generator: ["get_active_run", "get_video_review"],
  video_reviewer: ["get_video_review"],
  analyst: [],
  editor_copilot: [],
};

// ---------------------------------------------------------------------------
// Tool factory — builds live AI-SDK tool objects bound to a supabase client.
// ---------------------------------------------------------------------------

/** Build the niche-scout read-only tool set. */
function buildNicheScoutTools(supabase: SupabaseClient) {
  return {
    list_week_niches: tool({
      description:
        "List this week's ranked niche clusters from the digest. Returns the most recent week's start date and ranked clusters.",
      inputSchema: z.object({}),
      execute: async () => {
        const week = await getLatestWeekStart(supabase);
        if (!week) return { week: null, niches: [] };
        const niches = await listDigestRankedClusters(supabase, week);
        return { week, niches };
      },
    }),
    get_niche: tool({
      description: "Get a single niche cluster by its UUID.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        return (await getClusterById(supabase, id)) ?? { error: "not_found" };
      },
    }),
    list_predictions: tool({
      description:
        "List niche predictions. If clusterId is provided, filters to that cluster; otherwise returns all closed predictions.",
      inputSchema: z.object({ clusterId: z.string().optional() }),
      execute: async ({ clusterId }) => {
        if (clusterId) {
          return listPredictionsByCluster(supabase, clusterId);
        }
        return listClosedPredictions(supabase);
      },
    }),
  };
}

/** Build the watch-list-curator read-only tool set. */
function buildWatchListCuratorTools(supabase: SupabaseClient) {
  return {
    list_watched_channels: tool({
      description:
        "List actively watched channels, sorted by least recently snapshotted first. Limit defaults to 50, max 200.",
      inputSchema: z.object({
        limit: z.number().int().positive().max(200).optional(),
      }),
      execute: async ({ limit }) => {
        return listActiveWatchedChannels(supabase, limit ?? 50);
      },
    }),
  };
}

/** Build the get_video_review tool (shared by generator + video_reviewer). */
function buildGetVideoReviewTool(supabase: SupabaseClient) {
  return tool({
    description:
      "Get the latest AI review for a given your_video id. Returns the review record or { error: 'no_review' } if none exists.",
    inputSchema: z.object({ videoId: z.string() }),
    execute: async ({ videoId }) => {
      return (await getVideoReviewByVideoId(supabase, videoId)) ?? { error: "no_review" };
    },
  });
}

/** Build the generator read-only tool set. */
function buildGeneratorTools(supabase: SupabaseClient) {
  return {
    get_active_run: tool({
      description:
        "Get the currently active produce-video job, if any. Returns { active: false } when no job is running.",
      inputSchema: z.object({}),
      execute: async () => {
        return (await getActiveProduceVideoJob(supabase)) ?? { active: false };
      },
    }),
    get_video_review: buildGetVideoReviewTool(supabase),
  };
}

/** Build the video-reviewer read-only tool set. */
function buildVideoReviewerTools(supabase: SupabaseClient) {
  return {
    get_video_review: buildGetVideoReviewTool(supabase),
  };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Returns an AI-SDK tools object for the given assistant.
 * Assistants without tools (`analyst`, `editor_copilot`) return `{}`.
 */
export function getToolsForAssistant(
  supabase: SupabaseClient,
  assistantId: string,
): ToolSet {
  switch (assistantId) {
    case "niche_scout":
      return buildNicheScoutTools(supabase);
    case "watch_list_curator":
      return buildWatchListCuratorTools(supabase);
    case "generator":
      return buildGeneratorTools(supabase);
    case "video_reviewer":
      return buildVideoReviewerTools(supabase);
    case "analyst":
    case "editor_copilot":
    default:
      return {};
  }
}
