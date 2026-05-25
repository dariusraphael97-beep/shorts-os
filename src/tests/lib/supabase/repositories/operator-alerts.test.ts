import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createOperatorAlert, listUnresolvedAlerts } from '@/lib/supabase/repositories/operator-alerts';

describe('operator-alerts repo', () => {
  it('createOperatorAlert inserts a row with category + severity + message', async () => {
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'a1' }, error: null }) }) });
    const supabase = { from: vi.fn().mockReturnValue({ insert }) } as unknown as SupabaseClient;
    await createOperatorAlert(supabase, {
      channelId: 'ch1', category: 'format_mix_drift', severity: 'warn', message: 'Mix drift',
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      channel_id: 'ch1', category: 'format_mix_drift', severity: 'warn', message: 'Mix drift',
    }));
  });

  it('listUnresolvedAlerts queries the right table + filters', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: 'a1' }], error: null });
    const inFn = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ in: inFn });
    const select = vi.fn().mockReturnValue({ eq });
    const supabase = { from: vi.fn().mockReturnValue({ select }) } as unknown as SupabaseClient;
    const alerts = await listUnresolvedAlerts(supabase, { channelId: 'ch1' });
    expect(supabase.from).toHaveBeenCalledWith('operator_alerts');
    expect(eq).toHaveBeenCalledWith('channel_id', 'ch1');
    expect(inFn).toHaveBeenCalledWith('status', ['unresolved', 'acknowledged']);
    expect(alerts.length).toBe(1);
  });
});
