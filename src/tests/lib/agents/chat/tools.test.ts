import { describe, it, expect } from 'vitest';
import { ASSISTANT_TOOL_IDS } from '@/lib/agents/chat/tools';

describe('chat tool registry', () => {
  it('niche_scout exposes exactly its read tools', () => {
    expect(ASSISTANT_TOOL_IDS.niche_scout).toEqual(['list_week_niches', 'get_niche', 'list_predictions']);
  });
  it('watch_list_curator exposes exactly its read tools', () => {
    expect(ASSISTANT_TOOL_IDS.watch_list_curator).toEqual(['list_watched_channels']);
  });
  it('generator exposes exactly its read tools', () => {
    expect(ASSISTANT_TOOL_IDS.generator).toEqual(['get_active_run', 'get_video_review']);
  });
  it('video_reviewer exposes exactly its read tools', () => {
    expect(ASSISTANT_TOOL_IDS.video_reviewer).toEqual(['get_video_review']);
  });
  it('disabled assistants expose no tools', () => {
    expect(ASSISTANT_TOOL_IDS.analyst).toEqual([]);
    expect(ASSISTANT_TOOL_IDS.editor_copilot).toEqual([]);
  });
});
