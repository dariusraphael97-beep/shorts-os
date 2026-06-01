import { describe, it, expect } from 'vitest';
import { ASSISTANT_TOOL_IDS } from '@/lib/agents/chat/tools';

describe('chat tool registry', () => {
  it('niche_scout exposes only read tools over its domain', () => {
    expect(ASSISTANT_TOOL_IDS.niche_scout).toEqual(
      expect.arrayContaining(['list_week_niches', 'get_niche', 'list_predictions']),
    );
  });
  it('disabled assistants expose no tools', () => {
    expect(ASSISTANT_TOOL_IDS.analyst).toEqual([]);
  });
});
