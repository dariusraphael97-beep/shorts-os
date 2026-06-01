import { describe, it, expect } from 'vitest';
import { getSettingsSchema, validateSettings } from '@/lib/agents/settings/schemas';

describe('assistant settings schemas', () => {
  it('niche_scout accepts a valid taste slider + model', () => {
    const r = validateSettings('niche_scout', { model: 'anthropic/claude-haiku-4-5', proven_vs_firstmover: 0.6, confidence_floor: 0.5 });
    expect(r.success).toBe(true);
  });
  it('rejects out-of-range slider', () => {
    const r = validateSettings('niche_scout', { proven_vs_firstmover: 2 });
    expect(r.success).toBe(false);
  });
  it('unknown assistant returns a passthrough empty schema', () => {
    expect(getSettingsSchema('analyst')).toBeDefined();
  });

  // Extra cases
  it('video_reviewer rejects block_threshold out of range', () => {
    const r = validateSettings('video_reviewer', { block_threshold: 1.5 });
    expect(r.success).toBe(false);
  });
  it('video_reviewer accepts valid block_threshold', () => {
    const r = validateSettings('video_reviewer', { model: 'anthropic/claude-sonnet-4-5', block_threshold: 0.8 });
    expect(r.success).toBe(true);
  });
  it('watch_list_curator rejects non-integer week count', () => {
    const r = validateSettings('watch_list_curator', { evict_after_zero_signal_weeks: 1.5 });
    expect(r.success).toBe(false);
  });
  it('watch_list_curator accepts valid week count', () => {
    const r = validateSettings('watch_list_curator', { evict_after_zero_signal_weeks: 4 });
    expect(r.success).toBe(true);
  });
  it('unknown assistant passthrough accepts arbitrary keys', () => {
    const r = validateSettings('editor_copilot', { some_future_key: true });
    expect(r.success).toBe(true);
  });
});
