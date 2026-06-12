// src/lib/assistants/ledger.ts
//
// Server-only fetch layer: gathers ledger rows and feeds the pure derivation.
// Each source is fetched with allSettled + [] fallback so one missing table in
// a lagging environment (e.g. digest_runs before its prod migration) degrades
// to "no events from that source" instead of a 500 across Mission Control.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listRecentRuns } from '@/lib/supabase/repositories/ingestion-runs';
import { listRecentJobs } from '@/lib/supabase/repositories/jobs';
import { listRecentRenderJobs } from '@/lib/supabase/repositories/render-jobs';
import { listDigestRuns } from '@/lib/supabase/repositories/digest-runs';
import { listRecentReviews } from '@/lib/supabase/repositories/video-reviews';
import {
  deriveLiveStatuses,
  eventsFromInputs,
  type ActivityEvent,
  type LedgerInputs,
  type LiveDashboard,
} from '@/lib/assistants/live-status';
import { isAssistantId } from '@/lib/assistants/registry';

async function settle<T>(label: string, promise: Promise<T[]>): Promise<T[]> {
  try {
    return await promise;
  } catch (err) {
    console.warn(`[mission-control] ${label} fetch failed:`, err instanceof Error ? err.message : err);
    return [];
  }
}

async function fetchAwaitingReviewDrafts(supabase: SupabaseClient): Promise<{ id: string; title: string }[]> {
  const { data, error } = await supabase
    .from('your_videos')
    .select('id, title')
    .eq('status', 'rendered')
    .eq('format', 'longform')
    .order('updated_at', { ascending: false })
    .limit(5);
  if (error) throw new Error(`fetchAwaitingReviewDrafts: ${error.message}`);
  return (data ?? []) as { id: string; title: string }[];
}

export async function fetchLedgerInputs(supabase: SupabaseClient): Promise<LedgerInputs> {
  const [ingestionRuns, jobs, renderJobs, digestRuns, reviews, awaitingReviewDrafts] = await Promise.all([
    settle('ingestion_runs', listRecentRuns(supabase, 100)),
    settle('jobs', listRecentJobs(supabase, 20)),
    settle('render_jobs', listRecentRenderJobs(supabase, 20)),
    settle('digest_runs', listDigestRuns(supabase, 10)),
    settle('video_reviews', listRecentReviews(supabase, 20)),
    settle('your_videos(rendered)', fetchAwaitingReviewDrafts(supabase)),
  ]);
  return { ingestionRuns, jobs, renderJobs, digestRuns, reviews, awaitingReviewDrafts, now: new Date() };
}

/** One fetch powers both the card statuses and the cross-agent feed. */
export async function getLiveDashboard(supabase: SupabaseClient): Promise<LiveDashboard> {
  return deriveLiveStatuses(await fetchLedgerInputs(supabase));
}

/**
 * Paginated activity (Mission Control feed + per-agent Activity tab).
 * v1 paginates within the fetched windows (in-memory cursor on `at`); history
 * beyond those windows is intentionally out of scope.
 */
export async function listAssistantActivity(
  supabase: SupabaseClient,
  params: { assistantId?: string; before?: string; limit?: number },
): Promise<{ events: ActivityEvent[]; nextBefore: string | null }> {
  const limit = params.limit ?? 30;
  const inputs = await fetchLedgerInputs(supabase);
  let events = eventsFromInputs(inputs);
  if (params.assistantId && isAssistantId(params.assistantId)) {
    events = events.filter((e) => e.assistantId === params.assistantId);
  }
  if (params.before) {
    events = events.filter((e) => e.at < params.before!);
  }
  const page = events.slice(0, limit);
  const nextBefore = events.length > limit ? page[page.length - 1]?.at ?? null : null;
  return { events: page, nextBefore };
}
