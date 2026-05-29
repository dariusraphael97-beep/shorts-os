import { describe, it, expect, vi } from 'vitest';
import { runRedditTopicDiscovery } from '@/lib/ingestion/reddit-topic-discovery';
import type { RedditPost } from '@/lib/clients/reddit';

function post(id: string): RedditPost {
  return {
    id, subreddit: 'todayilearned', title: `TIL ${id}`, selftext: 'body', permalink: `/r/x/${id}`,
    url: 'https://x', author: 'u', score: 1234, numComments: 56, createdUtc: 1700000000, upvoteRatio: 0.95,
    flair: null, isSelf: true, isVideo: false,
  };
}

describe('runRedditTopicDiscovery', () => {
  it('upserts a synthetic reddit observation per post', async () => {
    const upserts: Array<{ videoId: string; source: string; viewCount: number; commentCount: number }> = [];
    const client = { getTopPosts: vi.fn(async () => [post('abc')]) };
    const repo = { upsertObservation: vi.fn(async (p: { videoId: string; source: string; viewCount: number; commentCount: number }) => { upserts.push(p); }) };
    const result = await runRedditTopicDiscovery({ client, repo, subreddits: ['todayilearned'] });
    expect(upserts[0]).toMatchObject({ videoId: 'reddit:abc', source: 'reddit_topic', viewCount: 1234, commentCount: 56 });
    expect(result.ingested).toBe(1);
    expect(result.quotaUnits).toBe(0);
  });

  it('marks partial when a subreddit fetch throws', async () => {
    const client = { getTopPosts: vi.fn().mockResolvedValueOnce([post('a')]).mockRejectedValueOnce(new Error('429')) };
    const repo = { upsertObservation: vi.fn(async () => {}) };
    const result = await runRedditTopicDiscovery({ client, repo, subreddits: ['s1', 's2'] });
    expect(result.ingested).toBe(1);
    expect(result.partial).toBe(true);
  });
});
