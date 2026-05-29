import { describe, it, expect } from 'vitest';
import { runTikTokCreativeCenter } from '@/lib/ingestion/tiktok-creative-center';

describe('runTikTokCreativeCenter', () => {
  it('returns a disabled skipped result', async () => {
    const result = await runTikTokCreativeCenter();
    expect(result).toEqual({
      ingested: 0, skipped: 0, quotaUnits: 0, status: 'skipped',
      context: { reason: 'tiktok_disabled_pending_chrome_mcp' },
    });
  });
});
