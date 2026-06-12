import { describe, it, expect } from 'vitest';
import { Bot } from 'lucide-react';
import {
  ASSISTANT_ORDER,
  ASSISTANT_DEFS,
  isAssistantId,
  assistantIcon,
} from '@/lib/assistants/registry';

describe('assistant registry', () => {
  it('defines exactly the 6 product assistants in display order', () => {
    expect(ASSISTANT_ORDER).toEqual([
      'niche_scout',
      'watch_list_curator',
      'generator',
      'video_reviewer',
      'analyst',
      'editor_copilot',
    ]);
    expect(Object.keys(ASSISTANT_DEFS).sort()).toEqual([...ASSISTANT_ORDER].sort());
  });

  it('routes every ingestion job to exactly one assistant', () => {
    const all = Object.values(ASSISTANT_DEFS).flatMap((d) => d.ingestionJobs);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain('performance_sync');
    expect(all).toContain('watch_list_sync');
  });

  it('isAssistantId narrows correctly', () => {
    expect(isAssistantId('niche_scout')).toBe(true);
    expect(isAssistantId('strategist')).toBe(false);
  });

  it('assistantIcon falls back to Bot for unknown names', () => {
    expect(assistantIcon('compass')).toBeDefined();
    expect(assistantIcon('definitely-not-an-icon')).toBe(Bot);
  });

  it('overdue thresholds exist only for cron-driven assistants', () => {
    expect(ASSISTANT_DEFS.niche_scout.maxExpectedGapHours).toBe(13);
    expect(ASSISTANT_DEFS.watch_list_curator.maxExpectedGapHours).toBe(13);
    expect(ASSISTANT_DEFS.analyst.maxExpectedGapHours).toBe(26);
    expect(ASSISTANT_DEFS.generator.maxExpectedGapHours).toBeNull();
    expect(ASSISTANT_DEFS.video_reviewer.maxExpectedGapHours).toBeNull();
    expect(ASSISTANT_DEFS.editor_copilot.maxExpectedGapHours).toBeNull();
  });
});
