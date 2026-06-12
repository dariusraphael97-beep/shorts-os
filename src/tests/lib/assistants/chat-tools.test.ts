import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn() }));

import { buildChatTools } from '@/lib/assistants/chat-tools';

beforeEach(() => vi.clearAllMocks());

const fakeClient = {} as never;

describe('buildChatTools', () => {
  it('gives each enabled agent 2+ read-only tools', () => {
    expect(Object.keys(buildChatTools(fakeClient, 'niche_scout'))).toEqual(['list_top_niches', 'get_niche']);
    expect(Object.keys(buildChatTools(fakeClient, 'watch_list_curator'))).toEqual(['list_watched_channels']);
    expect(Object.keys(buildChatTools(fakeClient, 'generator'))).toEqual(['list_recent_videos', 'list_recent_jobs']);
    expect(Object.keys(buildChatTools(fakeClient, 'video_reviewer'))).toEqual(['list_recent_reviews', 'get_review']);
    expect(Object.keys(buildChatTools(fakeClient, 'analyst'))).toEqual(['list_posted_videos', 'get_video_analytics']);
  });

  it('editor_copilot has no tools', () => {
    expect(Object.keys(buildChatTools(fakeClient, 'editor_copilot'))).toHaveLength(0);
  });
});
