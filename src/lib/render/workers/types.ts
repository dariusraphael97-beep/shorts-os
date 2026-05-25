import 'server-only';
import type { RenderJobRow } from '@/lib/supabase/repositories/render-jobs';

export interface RenderWorker {
  /**
   * Dispatch a claimed job to the underlying execution environment.
   * Returns the invocation id so the dispatcher can record it on the row.
   * Does NOT wait for completion — workers report back via /api/render/complete.
   */
  dispatch(job: RenderJobRow, jobToken: string): Promise<{ invocationId: string }>;
}
