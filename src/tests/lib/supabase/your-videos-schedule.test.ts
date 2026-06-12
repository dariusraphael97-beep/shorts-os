import { describe, it, expect, vi } from 'vitest';
import {
  listScheduledForChannelInRange,
  claimDueScheduled,
} from '@/lib/supabase/repositories/your-videos';

describe('your-videos scheduling helpers', () => {
  it('listScheduledForChannelInRange returns rows in [from,to)', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({
                lt: async () => ({ data: [{ id: 'v1', scheduled_for: '2026-06-01T11:30:00Z' }], error: null }),
              }),
            }),
          }),
        }),
      }),
    } as never;
    const rows = await listScheduledForChannelInRange(supabase, {
      channelId: 'chan-1', fromUtc: new Date('2026-06-01'), toUtc: new Date('2026-06-08'),
    });
    expect(rows).toHaveLength(1);
  });

  it('claimDueScheduled flips scheduled->uploading for due rows, returns claimed rows', async () => {
    const supabase = {
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
        expect(fn).toBe('claim_due_scheduled_uploads');
        expect(args.p_limit).toBe(5);
        return { data: [{ id: 'v1', channel_id: 'chan-1' }], error: null };
      }),
    } as never;
    const claimed = await claimDueScheduled(supabase, { now: new Date(), limit: 5 });
    expect(claimed).toEqual([{ id: 'v1', channel_id: 'chan-1' }]);
  });
});
