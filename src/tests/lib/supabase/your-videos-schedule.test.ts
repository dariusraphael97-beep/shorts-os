import { describe, it, expect, vi } from 'vitest';
import {
  scheduleVideo,
  cancelSchedule,
  listScheduledForChannelInRange,
  slotIsOccupied,
  claimDueScheduled,
} from '@/lib/supabase/repositories/your-videos';

describe('your-videos scheduling helpers', () => {
  it('scheduleVideo flips status rendered->scheduled with scheduled_for', async () => {
    let captured: { patch: Record<string, unknown>; eqs: Array<[string, unknown]> } | null = null;
    const supabase = {
      from: (table: string) => {
        if (table !== 'your_videos') throw new Error('wrong table');
        return {
          update: (patch: Record<string, unknown>) => {
            const builder = {
              eqs: [] as Array<[string, unknown]>,
              eq(col: string, val: unknown) { builder.eqs.push([col, val]); return builder; },
              async then(resolve: (v: { error: null; count: number }) => unknown) {
                captured = { patch, eqs: builder.eqs };
                resolve({ error: null, count: 1 });
              },
            };
            return builder;
          },
        };
      },
    } as never;
    const at = new Date('2026-06-01T11:30:00Z');
    const ok = await scheduleVideo(supabase, { videoId: 'v1', scheduledFor: at });
    expect(ok).toBe(true);
    expect(captured!.patch.status).toBe('scheduled');
    expect(captured!.patch.scheduled_for).toBe(at.toISOString());
    expect(captured!.eqs).toEqual([['id', 'v1'], ['status', 'rendered']]);
  });

  it('scheduleVideo returns false on status-race (count=0)', async () => {
    const supabase = {
      from: () => ({
        update: () => ({
          eq() { return this; },
          async then(resolve: (v: { error: null; count: number }) => unknown) {
            resolve({ error: null, count: 0 });
          },
        }),
      }),
    } as never;
    const ok = await scheduleVideo(supabase, { videoId: 'v1', scheduledFor: new Date() });
    expect(ok).toBe(false);
  });

  it('cancelSchedule flips scheduled->rendered + clears scheduled_for', async () => {
    let captured: Record<string, unknown> | null = null;
    const supabase = {
      from: () => ({
        update: (patch: Record<string, unknown>) => ({
          eq() { return this; },
          async then(r: (v: { error: null; count: number }) => unknown) {
            captured = patch; r({ error: null, count: 1 });
          },
        }),
      }),
    } as never;
    await cancelSchedule(supabase, 'v1');
    expect(captured!.scheduled_for).toBeNull();
    expect(captured!.status).toBe('rendered');
  });

  it('slotIsOccupied returns true when any video has that scheduled_for (5-min tolerance)', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () => ({
              gte: () => ({
                lte: async () => ({ data: [{ id: 'v1' }], error: null }),
              }),
            }),
          }),
        }),
      }),
    } as never;
    const result = await slotIsOccupied(supabase, 'chan-1', new Date('2026-06-01T11:30:00Z'));
    expect(result).toBe(true);
  });

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
