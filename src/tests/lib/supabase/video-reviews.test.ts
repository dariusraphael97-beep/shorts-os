import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import {
  insertVideoReview,
  getVideoReviewByVideoId,
  recordReviewFeedback,
} from '@/lib/supabase/repositories/video-reviews';

beforeEach(() => vi.clearAllMocks());

function makeClient(rows: Record<string, unknown>[] | null, error: unknown = null) {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: rows?.[0] ?? null, error }) }) }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: rows?.[0] ?? null, error }),
          order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: rows?.[0] ?? null, error }) }) }),
        }),
      }),
    }),
  } as never;
}

describe('video-reviews repository', () => {
  it('insertVideoReview returns full row', async () => {
    const row = {
      id: 'r1',
      your_video_id: 'v1',
      overall_verdict: 'ship',
      title_score: 0.82,
    };
    const client = makeClient([row]);
    const result = await insertVideoReview(client, {
      yourVideoId: 'v1',
      titleScore: 0.82, titleVerdict: 'pass',
      thumbnailScore: 0.78, thumbnailVerdict: 'pass',
      hookScore: 0.6, hookVerdict: 'needs_work',
      pacingScore: 0.7, pacingVerdict: 'pass',
      descriptionSeoScore: 0.5, descriptionSeoVerdict: 'needs_work',
      audioScore: 0.9, audioVerdict: 'pass',
      visualScore: 0.85, visualVerdict: 'pass',
      overallVerdict: 'ship',
      suggestions: [{ component: 'hook', severity: 'needs_work', suggestion_text: 'tighten the open' }],
      strengths: [{ component: 'audio', what_works_text: 'levels are clean' }],
      model: 'anthropic/claude-sonnet-4-5',
      promptVersion: 'review-v1',
    });
    expect(result.id).toBe('r1');
  });

  it('getVideoReviewByVideoId returns null on PGRST116', async () => {
    const client = makeClient(null, { code: 'PGRST116' });
    const result = await getVideoReviewByVideoId(client, 'missing-video-id');
    expect(result).toBeNull();
  });

  it('recordReviewFeedback writes accepted action', async () => {
    const row = { id: 'f1', video_review_id: 'r1', suggestion_index: 0, action_taken: 'accepted' };
    const client = makeClient([row]);
    const result = await recordReviewFeedback(client, {
      videoReviewId: 'r1',
      suggestionIndex: 0,
      actionTaken: 'accepted',
    });
    expect(result.action_taken).toBe('accepted');
  });
});
