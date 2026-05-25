import { describe, it, expect, vi } from 'vitest';
import { runWatchdog } from '@/lib/render/watchdog';

describe('runWatchdog', () => {
  it('calls reset_stuck_render_jobs and reports count', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: [{ id: 'j1' }, { id: 'j2' }], error: null }) };
    const result = await runWatchdog({ supabase: supabase as never });
    expect(result.resetCount).toBe(2);
    expect(supabase.rpc).toHaveBeenCalledWith('reset_stuck_render_jobs');
  });

  it('returns resetCount=0 when nothing is stuck', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const result = await runWatchdog({ supabase: supabase as never });
    expect(result.resetCount).toBe(0);
  });
});
