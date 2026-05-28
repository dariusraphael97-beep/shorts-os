import { describe, it, expect } from 'vitest';
import {
  listPendingRecommendations,
  applyRecommendation,
  dismissRecommendation,
} from '@/lib/supabase/repositories/schedule-recommendations';

describe('schedule_recommendations repo', () => {
  it('listPendingRecommendations filters by channel_id + status=pending', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: async () => ({
                data: [{ id: 'r1', channel_id: 'c1', status: 'pending' }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as never;
    const rows = await listPendingRecommendations(supabase, 'c1');
    expect(rows).toHaveLength(1);
  });

  it('applyRecommendation copies posting_schedule/format_mix to channel and sets status=applied', async () => {
    const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
    const supabase = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                id: 'r1',
                channel_id: 'c1',
                recommended_posting_schedule: { weekdays: ['08:00'], weekends: ['12:00'] },
                recommended_format_mix: { explainer: 0.7, compilation: 0.3 },
              },
              error: null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async () => { updates.push({ table, patch }); return { error: null }; },
        }),
      }),
    } as never;
    await applyRecommendation(supabase, 'r1');
    const chanPatch = updates.find((u) => u.table === 'channels')!;
    expect((chanPatch.patch.posting_schedule as Record<string, unknown>)).toEqual({ weekdays: ['08:00'], weekends: ['12:00'] });
    expect((chanPatch.patch.target_format_mix as Record<string, unknown>)).toEqual({ explainer: 0.7, compilation: 0.3 });
    const recPatch = updates.find((u) => u.table === 'schedule_recommendations')!;
    expect(recPatch.patch.status).toBe('applied');
    expect(recPatch.patch.applied_at).toBeDefined();
  });

  it('dismissRecommendation sets status=dismissed + dismissed_at', async () => {
    let captured: Record<string, unknown> | null = null;
    const supabase = {
      from: () => ({
        update: (patch: Record<string, unknown>) => ({ eq: async () => { captured = patch; return { error: null }; } }),
      }),
    } as never;
    await dismissRecommendation(supabase, 'r1');
    expect(captured!.status).toBe('dismissed');
    expect(captured!.dismissed_at).toBeDefined();
  });
});
