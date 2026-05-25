// scripts/render-worker/lib/callback.ts
//
// Posts the result back to /api/render/complete with the per-job JWT.
export interface CallbackArgs {
  jobId: string;
  jobToken: string;
  sandboxInvocationId: string;
  result: { status: 'succeeded' | 'failed'; output?: Record<string, unknown>; error?: string };
}

export async function postCallback(args: CallbackArgs): Promise<void> {
  const base = process.env.RENDER_CALLBACK_BASE_URL;
  if (!base) throw new Error('RENDER_CALLBACK_BASE_URL must be set');
  const res = await fetch(`${base}/api/render/complete`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${args.jobToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      job_id: args.jobId,
      sandbox_invocation_id: args.sandboxInvocationId,
      result: args.result,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`callback failed ${res.status}: ${text}`);
  }
}
